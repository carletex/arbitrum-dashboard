// Report Formatting - Console output and JSON file export
import { EvalReport, QueryEvalResult } from "./types";
import { writeFile } from "fs/promises";

/**
 * Print the evaluation report to the console.
 * Shows a summary table followed by per-query details (failures sorted first).
 */
export function printReport(report: EvalReport): void {
  const { summary, results } = report;

  console.log("");
  console.log("=".repeat(60));
  console.log("  RAG Evaluation Report");
  console.log("=".repeat(60));
  console.log("");

  // Metadata
  console.log(`  Timestamp:    ${report.timestamp}`);
  if (report.gitCommit) console.log(`  Git commit:   ${report.gitCommit}`);
  console.log(`  Chat model:   ${report.ragConfig.chatModel}`);
  console.log(`  Embed model:  ${report.ragConfig.embeddingModel}`);
  console.log(`  Top-K:        ${report.ragConfig.topK}`);
  console.log("");

  // Summary table
  console.log("-".repeat(60));
  console.log("  SUMMARY");
  console.log("-".repeat(60));
  console.log(`  Queries:       ${summary.successfulQueries}/${summary.totalQueries} successful`);
  console.log(`  Total time:    ${(summary.totalDurationMs / 1000).toFixed(1)}s`);
  console.log("");

  // Retrieval metrics
  console.log("  Retrieval:");
  console.log(`    Hit Rate:    ${formatPercent(summary.hitRate)}`);
  console.log(`    MRR:         ${summary.mrr.toFixed(3)}`);

  // LLM evaluator metrics
  if (summary.avgFaithfulness !== undefined) {
    console.log("");
    console.log("  LLM Judges:");
    console.log(
      `    Faithfulness:  avg=${summary.avgFaithfulness.toFixed(2)}  pass=${formatPercent(summary.faithfulnessPassRate!)}`,
    );
    console.log(
      `    Relevancy:     avg=${summary.avgRelevancy?.toFixed(2) ?? "N/A"}  pass=${formatPercent(summary.relevancyPassRate!)}`,
    );
    if (summary.avgCorrectness !== undefined) {
      console.log(
        `    Correctness:   avg=${summary.avgCorrectness.toFixed(2)}/5  pass=${formatPercent(summary.correctnessPassRate!)}`,
      );
    }
  }

  if (summary.estimatedCostUsd > 0) {
    console.log("");
    console.log(`  Est. cost:     $${summary.estimatedCostUsd.toFixed(3)}`);
  }

  // Per-query details (failures first)
  console.log("");
  console.log("-".repeat(60));
  console.log("  PER-QUERY DETAILS");
  console.log("-".repeat(60));

  const sorted = [...results].sort((a, b) => {
    // Errors first, then failures, then passes
    if (a.error && !b.error) return -1;
    if (!a.error && b.error) return 1;
    const aFail = hasFailure(a);
    const bFail = hasFailure(b);
    if (aFail && !bFail) return -1;
    if (!aFail && bFail) return 1;
    return 0;
  });

  for (const result of sorted) {
    console.log("");
    const status = result.error ? "ERROR" : hasFailure(result) ? "FAIL" : "PASS";
    const icon = result.error ? "  [ERROR]" : hasFailure(result) ? "  [FAIL]" : "  [PASS]";
    console.log(`${icon} ${result.queryId}: ${result.query.slice(0, 55)}...`);
    console.log(`         Duration: ${result.durationMs}ms | Status: ${status}`);

    if (result.error) {
      console.log(`         Error: ${result.error}`);
      continue;
    }

    // Retrieval info
    const retrievedIds = result.retrieval.retrievedProposalIds.slice(0, 5).join(", ") || "(none)";
    console.log(
      `         Hit: ${result.retrieval.hit ? "YES" : "NO"} | RR: ${result.retrieval.reciprocalRank.toFixed(3)} | Retrieved: [${retrievedIds}]`,
    );

    // Evaluator scores
    if (result.faithfulness) {
      console.log(
        `         Faithfulness: ${result.faithfulness.passing ? "PASS" : "FAIL"} (${result.faithfulness.score})`,
      );
    }
    if (result.relevancy) {
      console.log(`         Relevancy:    ${result.relevancy.passing ? "PASS" : "FAIL"} (${result.relevancy.score})`);
    }
    if (result.correctness) {
      console.log(
        `         Correctness:  ${result.correctness.passing ? "PASS" : "FAIL"} (${result.correctness.score}/5)`,
      );
    }

    // Show answer preview
    if (result.answer && result.answer !== "(retrieval-only mode)") {
      console.log(`         Answer: ${result.answer.slice(0, 100)}...`);
    }
  }

  console.log("");
  console.log("=".repeat(60));
}

/**
 * Save the full evaluation report as JSON.
 */
export async function saveReport(report: EvalReport, outputPath: string): Promise<void> {
  const json = JSON.stringify(report, null, 2);
  await writeFile(outputPath, json, "utf-8");
  console.log(`\nReport saved to: ${outputPath}`);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function hasFailure(result: QueryEvalResult): boolean {
  if (result.faithfulness && !result.faithfulness.passing) return true;
  if (result.relevancy && !result.relevancy.passing) return true;
  if (result.correctness && !result.correctness.passing) return true;
  return false;
}
