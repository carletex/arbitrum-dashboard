// Retrieval Metrics - Hit Rate & MRR computation
//
// Uses the LlamaIndex retriever directly (not queryRag) to get ranked nodes
// and measure whether expected proposal IDs appear in the results.
import { RAG_CONFIG, validateRagConfig } from "../config";
import { RagNodeMetadata } from "../types";
import { getVectorStore, initializeVectorStore } from "../vectorStore";
import { EVAL_CONFIG } from "./config";
import { EvalTestQuery, RetrievalResult } from "./types";
import { OpenAI, OpenAIEmbedding } from "@llamaindex/openai";
import { MetadataMode, Settings, VectorStoreIndex } from "llamaindex";

/**
 * Configure LlamaIndex Settings (duplicated from retrieval.ts, consistent
 * with the existing pattern where both retrieval.ts and ingestion.ts
 * each call their own configureSettings).
 */
function configureSettings(): void {
  Settings.llm = new OpenAI({
    model: RAG_CONFIG.chatModel,
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 1,
  });

  Settings.embedModel = new OpenAIEmbedding({
    model: RAG_CONFIG.embeddingModel,
    apiKey: process.env.OPENAI_API_KEY,
    dimensions: RAG_CONFIG.embeddingDimensions,
  });
}

/**
 * Retrieve nodes for a query and return full-text contexts plus retrieval metrics.
 *
 * Returns both the RetrievalResult (hit/MRR) and the raw context strings
 * needed by the LLM evaluators.
 */
export async function evaluateRetrieval(
  testQuery: EvalTestQuery,
  topK?: number,
): Promise<{ retrieval: RetrievalResult; contexts: string[] }> {
  const configValidation = validateRagConfig();
  if (!configValidation.valid) {
    throw new Error(`Configuration errors: ${configValidation.errors.join(", ")}`);
  }

  configureSettings();
  await initializeVectorStore();
  const vectorStore = getVectorStore();

  const index = await VectorStoreIndex.fromVectorStore(vectorStore);
  const retriever = index.asRetriever({
    similarityTopK: topK ?? EVAL_CONFIG.retrievalTopK,
  });

  const nodes = await retriever.retrieve(testQuery.query);

  // Extract proposal IDs in rank order
  const retrievedProposalIds: string[] = [];
  const seen = new Set<string>();
  for (const nodeWithScore of nodes) {
    const metadata = nodeWithScore.node.metadata as RagNodeMetadata;
    const pid = metadata.proposal_id;
    if (pid && !seen.has(pid)) {
      seen.add(pid);
      retrievedProposalIds.push(pid);
    }
  }

  // Extract full-text contexts for evaluator input
  const contexts = nodes.map(n =>
    typeof n.node.getContent === "function" ? n.node.getContent(MetadataMode.NONE) : String(n.node),
  );

  // Compute hit and reciprocal rank
  const expectedSet = new Set(testQuery.expectedProposalIds);
  let hit = false;
  let reciprocalRank = 0;

  if (expectedSet.size > 0) {
    for (let i = 0; i < retrievedProposalIds.length; i++) {
      if (expectedSet.has(retrievedProposalIds[i])) {
        hit = true;
        reciprocalRank = 1 / (i + 1);
        break;
      }
    }
  }

  return {
    retrieval: { hit, reciprocalRank, retrievedProposalIds },
    contexts,
  };
}

/**
 * Compute aggregate Hit Rate and MRR across multiple retrieval results.
 */
export function computeAggregateRetrieval(results: RetrievalResult[]): { hitRate: number; mrr: number } {
  if (results.length === 0) return { hitRate: 0, mrr: 0 };

  // Only count queries that have expected IDs (skip those with empty expectations)
  const withExpectations = results.filter((_, i) => i >= 0); // include all for now
  const hits = withExpectations.filter(r => r.hit).length;
  const totalRR = withExpectations.reduce((sum, r) => sum + r.reciprocalRank, 0);

  return {
    hitRate: hits / withExpectations.length,
    mrr: totalRR / withExpectations.length,
  };
}
