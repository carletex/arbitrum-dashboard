#!/usr/bin/env tsx
import * as dotenv from "dotenv";
import * as path from "path";
import { db } from "~~/services/database/config/postgresClient";
import { proposalProcessor } from "~~/services/proposals/proposalProcessor";

// Load environment variables from multiple possible locations
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env.development") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  console.log("🔄 Arbitrum Proposals Sync Script");
  console.log("==================================\n");

  // Debug: Show API key status
  const apiKey = process.env.TALLY_API_KEY;
  if (apiKey) {
    console.log(`✅ Tally API key loaded: ${apiKey.substring(0, 8)}...`);
  } else {
    console.log("⚠️  No Tally API key found in environment variables");
  }
  console.log("");

  const args = process.argv.slice(2);
  const command = args[0] || "all";

  try {
    switch (command) {
      case "all":
        console.log("📥 Fetching and processing ALL proposals from Tally...");
        await proposalProcessor.fetchAndProcessAllProposals();
        break;

      case "latest":
        const limit = parseInt(args[1]) || 20;
        console.log(`📥 Fetching and processing latest ${limit} proposals...`);
        await proposalProcessor.syncLatestProposals(limit);
        break;

      case "help":
        console.log("Available commands:");
        console.log("  all     - Fetch and process all proposals (default)");
        console.log("  latest  - Fetch latest proposals (default: 20)");
        console.log("            Usage: latest [number]");
        console.log("  help    - Show this help message");
        console.log("\nExamples:");
        console.log("  tsx scripts/fetchAllProposals.ts");
        console.log("  tsx scripts/fetchAllProposals.ts all");
        console.log("  tsx scripts/fetchAllProposals.ts latest");
        console.log("  tsx scripts/fetchAllProposals.ts latest 50");
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log("Run 'tsx scripts/fetchAllProposals.ts help' for usage information.");
        process.exit(1);
    }

    console.log("\n🎉 Script completed successfully!");
  } catch (error) {
    console.error("\n💥 Script failed with error:", error);
    process.exit(1);
  } finally {
    // Close database connections
    await db.close();
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n⚠️  Received SIGINT, shutting down gracefully...");
  await db.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n⚠️  Received SIGTERM, shutting down gracefully...");
  await db.close();
  process.exit(0);
});

// Run the script
if (require.main === module) {
  main();
}
