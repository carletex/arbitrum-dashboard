// Evaluation Runner - Orchestrates all evaluation steps
//
// For each test query, sequentially:
// 1. Call queryRag() to get the RAG answer + citations
// 2. Call retriever directly to get full-text contexts + retrieval metrics
// 3. Call evaluateFaithfulness() with full contexts
// 4. Call evaluateRelevancy() with full contexts
// 5. Call evaluateCorrectness() if reference answer exists
import { RAG_CONFIG } from "../config";
import { queryRag } from "../retrieval";
import { EVAL_CONFIG } from "./config";
import { evaluateCorrectness, evaluateFaithfulness, evaluateRelevancy } from "./evaluators";
import { evaluateRetrieval } from "./retrievalMetrics";
import { TEST_QUERIES } from "./testQueries";
import { EvalReport, EvalRunOptions, EvalSummary, QueryEvalResult } from "./types";

/**
 * Run the full evaluation pipeline.
 */
export async function runEvaluation(options: EvalRunOptions): Promise<EvalReport> {
  const startTime = Date.now();

  // Filter test queries
  let queries = [...TEST_QUERIES];

  if (options.filterIds && options.filterIds.length > 0) {
    const idSet = new Set(options.filterIds);
    queries = queries.filter(q => idSet.has(q.id));
  }

  if (options.filterTags && options.filterTags.length > 0) {
    const tagSet = new Set(options.filterTags);
    queries = queries.filter(q => q.tags?.some(t => tagSet.has(t)));
  }

  console.log(`\nRunning evaluation on ${queries.length} queries...`);
  if (options.retrievalOnly) console.log("  Mode: retrieval-only (no LLM judge calls)");
  if (options.skipCorrectness) console.log("  Mode: skipping correctness evaluator");
  console.log("");

  const results: QueryEvalResult[] = [];

  for (let i = 0; i < queries.length; i++) {
    const testQuery = queries[i];
    const queryStart = Date.now();

    console.log(`[${i + 1}/${queries.length}] ${testQuery.id}: ${testQuery.query.slice(0, 60)}...`);

    try {
      const result = await evaluateSingleQuery(testQuery, options);
      results.push(result);

      const status = result.error ? "ERROR" : "OK";
      console.log(`  ${status} (${result.durationMs}ms)`);
    } catch (error) {
      const durationMs = Date.now() - queryStart;
      const errorMsg = error instanceof Error ? error.message : String(error);

      console.log(`  ERROR: ${errorMsg}`);

      results.push({
        queryId: testQuery.id,
        query: testQuery.query,
        answer: "",
        citations: [],
        retrieval: { hit: false, reciprocalRank: 0, retrievedProposalIds: [] },
        durationMs,
        error: errorMsg,
      });
    }
  }

  const totalDurationMs = Date.now() - startTime;
  const summary = computeSummary(results, totalDurationMs, options);

  // Try to get git commit hash
  let gitCommit: string | undefined;
  try {
    const { execSync } = await import("child_process");
    gitCommit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    // Not in a git repo or git not available
  }

  return {
    timestamp: new Date().toISOString(),
    gitCommit,
    ragConfig: {
      chatModel: RAG_CONFIG.chatModel,
      embeddingModel: RAG_CONFIG.embeddingModel,
      topK: options.topK ?? RAG_CONFIG.defaultTopK,
      chunkSize: RAG_CONFIG.chunkSize,
    },
    options,
    summary,
    results,
  };
}

/**
 * Evaluate a single test query through all pipeline stages.
 */
async function evaluateSingleQuery(
  testQuery: (typeof TEST_QUERIES)[number],
  options: EvalRunOptions,
): Promise<QueryEvalResult> {
  const queryStart = Date.now();
  const topK = options.topK ?? EVAL_CONFIG.retrievalTopK;

  // Step 1: Get retrieval metrics + full-text contexts
  const { retrieval, contexts } = await evaluateRetrieval(testQuery, topK);

  // In retrieval-only mode, skip RAG query and LLM evaluators
  if (options.retrievalOnly) {
    return {
      queryId: testQuery.id,
      query: testQuery.query,
      answer: "(retrieval-only mode)",
      citations: [],
      retrieval,
      durationMs: Date.now() - queryStart,
    };
  }

  // Step 2: Get the RAG answer
  const timeout = EVAL_CONFIG.queryTimeoutMs;
  const ragPromise = queryRag({ query: testQuery.query, topK });
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Query timed out")), timeout);
  });

  const ragOutput = await Promise.race([ragPromise, timeoutPromise]);

  const citations = ragOutput.citations.map(c => ({
    proposal_id: c.proposal_id,
    stage: c.stage,
    url: c.url,
  }));

  // Step 3: LLM evaluators (need full-text contexts, not 200-char snippets)
  const faithfulness = await evaluateFaithfulness(testQuery.query, ragOutput.answer, contexts);
  console.log(`    Faithfulness: ${faithfulness.passing ? "PASS" : "FAIL"} (${faithfulness.score})`);

  const relevancy = await evaluateRelevancy(testQuery.query, ragOutput.answer, contexts);
  console.log(`    Relevancy:    ${relevancy.passing ? "PASS" : "FAIL"} (${relevancy.score})`);

  // Step 4: Correctness (only if reference answer exists and not skipped)
  let correctness;
  if (!options.skipCorrectness && testQuery.referenceAnswer) {
    correctness = await evaluateCorrectness(testQuery.query, ragOutput.answer, testQuery.referenceAnswer);
    console.log(`    Correctness:  ${correctness.passing ? "PASS" : "FAIL"} (${correctness.score}/5)`);
  }

  return {
    queryId: testQuery.id,
    query: testQuery.query,
    answer: ragOutput.answer,
    citations,
    faithfulness,
    relevancy,
    correctness,
    retrieval,
    durationMs: Date.now() - queryStart,
  };
}

/**
 * Compute aggregate summary from per-query results.
 */
function computeSummary(results: QueryEvalResult[], totalDurationMs: number, options: EvalRunOptions): EvalSummary {
  const successful = results.filter(r => !r.error);

  const summary: EvalSummary = {
    totalQueries: results.length,
    successfulQueries: successful.length,
    hitRate: 0,
    mrr: 0,
    estimatedCostUsd: 0,
    totalDurationMs,
  };

  // Retrieval metrics
  if (successful.length > 0) {
    const hits = successful.filter(r => r.retrieval.hit).length;
    const totalRR = successful.reduce((sum, r) => sum + r.retrieval.reciprocalRank, 0);
    summary.hitRate = hits / successful.length;
    summary.mrr = totalRR / successful.length;
  }

  // LLM evaluator metrics (only in non-retrieval-only mode)
  if (!options.retrievalOnly) {
    const withFaithfulness = successful.filter(r => r.faithfulness);
    if (withFaithfulness.length > 0) {
      summary.avgFaithfulness =
        withFaithfulness.reduce((s, r) => s + r.faithfulness!.score, 0) / withFaithfulness.length;
      summary.faithfulnessPassRate =
        withFaithfulness.filter(r => r.faithfulness!.passing).length / withFaithfulness.length;
    }

    const withRelevancy = successful.filter(r => r.relevancy);
    if (withRelevancy.length > 0) {
      summary.avgRelevancy = withRelevancy.reduce((s, r) => s + r.relevancy!.score, 0) / withRelevancy.length;
      summary.relevancyPassRate = withRelevancy.filter(r => r.relevancy!.passing).length / withRelevancy.length;
    }

    const withCorrectness = successful.filter(r => r.correctness);
    if (withCorrectness.length > 0) {
      summary.avgCorrectness = withCorrectness.reduce((s, r) => s + r.correctness!.score, 0) / withCorrectness.length;
      summary.correctnessPassRate = withCorrectness.filter(r => r.correctness!.passing).length / withCorrectness.length;
    }

    // Rough cost estimate: ~$0.01 per LLM judge call (gpt-5-mini pricing)
    const llmCalls = withFaithfulness.length + withRelevancy.length + withCorrectness.length;
    summary.estimatedCostUsd = llmCalls * 0.01;
  }

  return summary;
}
