/**
 * CLI script for manual ingestion.
 * Can be run outside of Next.js runtime.
 *
 * Usage:
 *   yarn rag:ingest          # Incremental ingestion
 *   yarn rag:ingest --clear  # Clear and re-ingest all
 */
import { closeVectorStore, runIngestion } from "./index";
import * as dotenv from "dotenv";
import { closeDb } from "~~/services/database/config/postgresClient";

dotenv.config({ path: ".env.development" }); // load base env
dotenv.config({ path: ".env.local", override: true }); // override with local values if present

async function main() {
  const args = process.argv.slice(2);
  const clearFirst = args.includes("--clear");

  console.log("=".repeat(50));
  console.log("RAG Ingestion CLI");
  console.log("=".repeat(50));

  if (clearFirst) {
    console.log("⚠️  Clear mode enabled - will remove existing vectors");
  }

  console.log("");

  try {
    const result = await runIngestion({ clearFirst });

    console.log("");
    console.log("=".repeat(50));

    if (result.success) {
      console.log("✅ Ingestion completed successfully");
      console.log("");
      console.log("Statistics:");
      console.log(`  - Total documents: ${result.totalDocuments}`);
      console.log(`  - New nodes: ${result.newNodes}`);
      console.log(`  - Updated nodes: ${result.updatedNodes}`);
      console.log(`  - Skipped nodes: ${result.skippedNodes}`);

      if (result.errors.length > 0) {
        console.log("");
        console.log("Warnings:");
        result.errors.forEach(e => console.log(`  ⚠️  ${e}`));
      }
    } else {
      console.log("❌ Ingestion failed");
      console.log("");
      console.log("Errors:");
      result.errors.forEach(e => console.log(`  - ${e}`));
      process.exit(1);
    }
  } catch (error) {
    console.error("Fatal error during ingestion:", error);
    process.exit(1);
  } finally {
    // Clean up connections
    await closeVectorStore();
    await closeDb();
  }
}

main();
