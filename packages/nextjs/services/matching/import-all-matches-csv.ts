/**
 * Import all verified AI matches from CSV files into the database
 *
 * This orchestrator script runs both snapshot and tally CSV imports.
 * Use --dry-run to preview changes without applying them.
 */
import { importSnapshotMatchesFromCsv } from "./import-snapshot-matches-csv";
import { importTallyMatchesFromCsv } from "./import-tally-matches-csv";

async function importAllMatchesFromCsv(dryRun: boolean = false) {
  console.log("=".repeat(60));
  console.log("IMPORTING ALL VERIFIED MATCHES FROM CSV");
  console.log(dryRun ? "(DRY RUN - no changes will be made)" : "(LIVE RUN)");
  console.log("=".repeat(60));

  console.log("\n--- SNAPSHOT MATCHES ---\n");
  const snapshotResult = await importSnapshotMatchesFromCsv(dryRun);

  console.log("\n--- TALLY MATCHES ---\n");
  const tallyResult = await importTallyMatchesFromCsv(dryRun);

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
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  importAllMatchesFromCsv(dryRun)
    .then(() => {
      console.log("\nAll imports completed!");
      process.exit(0);
    })
    .catch(error => {
      console.error("Import failed:", error);
      process.exit(1);
    });
}
