/**
 * Import all verified AI matches from CSV files into the database
 *
 * This orchestrator script runs both snapshot and tally CSV imports.
 */
import { getMatchingSummary } from "../database/repositories/matching";
import { importSnapshotMatchesFromCsv } from "./import-snapshot-matches-csv";
import { importTallyMatchesFromCsv } from "./import-tally-matches-csv";

async function importAllMatchesFromCsv() {
  console.log("=".repeat(60));
  console.log("IMPORTING ALL VERIFIED MATCHES FROM CSV");
  console.log("=".repeat(60));

  console.log("\n--- SNAPSHOT MATCHES ---\n");
  const snapshotResult = await importSnapshotMatchesFromCsv();

  console.log("\n--- TALLY MATCHES ---\n");
  const tallyResult = await importTallyMatchesFromCsv();

  // Log matching_result summary from DB
  console.log("\n--- MATCHING RESULTS SUMMARY ---\n");
  const summary = await getMatchingSummary();
  for (const row of summary) {
    console.log(`  ${row.source_type} / ${row.status}: ${row.count}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("FINAL SUMMARY");
  console.log("=".repeat(60));
  console.log(
    `\nSnapshot: ${snapshotResult.updated} updated, ${snapshotResult.noMatch} LLM no-match, ${snapshotResult.noMatchSwept} swept`,
  );
  console.log(
    `Tally: ${tallyResult.updated} updated, ${tallyResult.noMatch} LLM no-match, ${tallyResult.noMatchSwept} swept`,
  );
  console.log(`\nTotal errors: ${snapshotResult.errors.length + tallyResult.errors.length}`);

  return { snapshotResult, tallyResult };
}

// Allow running as standalone script
if (require.main === module) {
  importAllMatchesFromCsv()
    .then(() => {
      console.log("\nAll imports completed!");
      process.exit(0);
    })
    .catch(error => {
      console.error("Import failed:", error);
      process.exit(1);
    });
}
