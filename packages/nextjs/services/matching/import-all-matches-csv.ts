/**
 * Import all verified AI matches from CSV files into the database
 *
 * This orchestrator script runs both snapshot and tally CSV imports.
 */
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

  console.log("\n" + "=".repeat(60));
  console.log("FINAL SUMMARY");
  console.log("=".repeat(60));
  console.log(`\nSnapshot: ${snapshotResult.updated} updated, ${snapshotResult.notFound} not found`);
  console.log(`Tally: ${tallyResult.updated} updated, ${tallyResult.notFound} not found`);
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
