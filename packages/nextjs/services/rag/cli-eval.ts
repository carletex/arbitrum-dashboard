/**
 * CLI script for running RAG evaluation pipeline.
 * Can be run outside of Next.js runtime.
 *
 * Reports are always saved to evaluation-reports/ directory.
 *
 * Usage:
 *   yarn rag:eval                           # Full evaluation → evaluation-reports/eval-2026-02-12T10-30-00.json
 *   yarn rag:eval --retrieval-only          # Only retrieval metrics (no LLM cost)
 *   yarn rag:eval --skip-correctness        # Skip CorrectnessEvaluator
 *   yarn rag:eval --output baseline.json    # Save as evaluation-reports/baseline.json
 *   yarn rag:eval --tags status,factual     # Run only tagged queries
 *   yarn rag:eval --ids query-001           # Run specific queries
 *   yarn rag:eval --top-k 10               # Override retrieval TopK
 */
import { printReport, runEvaluation, saveReport } from "./evaluation";
import { EvalRunOptions } from "./evaluation/types";
import { closeVectorStore } from "./index";
import * as dotenv from "dotenv";
import { mkdirSync } from "fs";
import { resolve } from "path";
import { closeDb } from "~~/services/database/config/postgresClient";

dotenv.config({ path: ".env.development" }); // load base env
dotenv.config({ path: ".env.local", override: true }); // override with local values if present

/** Directory where all evaluation reports are saved */
const REPORTS_DIR = resolve(__dirname, "../../evaluation-reports");

function parseArgs(argv: string[]): EvalRunOptions {
  const options: EvalRunOptions = {
    retrievalOnly: false,
    skipCorrectness: false,
  };

  let userOutput: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--retrieval-only":
        options.retrievalOnly = true;
        break;
      case "--skip-correctness":
        options.skipCorrectness = true;
        break;
      case "--output":
        userOutput = argv[++i];
        break;
      case "--tags":
        options.filterTags = argv[++i]?.split(",").map(t => t.trim());
        break;
      case "--ids":
        options.filterIds = argv[++i]?.split(",").map(t => t.trim());
        break;
      case "--top-k":
        options.topK = Number(argv[++i]);
        break;
    }
  }

  // Always save to evaluation-reports/ — use provided name or generate a timestamped one
  const filename = userOutput || `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  options.outputPath = resolve(REPORTS_DIR, filename);

  return options;
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Ensure the reports directory exists
  mkdirSync(REPORTS_DIR, { recursive: true });

  console.log("=".repeat(60));
  console.log("  RAG Evaluation Pipeline");
  console.log("=".repeat(60));

  try {
    const report = await runEvaluation(options);

    printReport(report);

    await saveReport(report, options.outputPath!);

    if (report.summary.successfulQueries < report.summary.totalQueries) {
      console.log(`\n⚠️  ${report.summary.totalQueries - report.summary.successfulQueries} queries had errors`);
    }
  } catch (error) {
    console.error("Fatal error during evaluation:", error);
    process.exit(1);
  } finally {
    // Clean up connections
    await closeVectorStore();
    await closeDb();

    // Force exit because PGVectorStore may keep internal connections open
    process.exit(0);
  }
}

main();
