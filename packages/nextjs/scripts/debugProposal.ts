#!/usr/bin/env tsx
import * as dotenv from "dotenv";
import * as path from "path";
import { db } from "~~/services/database/config/postgresClient";
import { ARBITRUM_GOVERNORS, createTallyApiService } from "~~/services/tally/api";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env.development") });

const TARGET_PROPOSAL_ID = "97685288731263391833044854304895851471157040105038894699042975271050068874277";

async function debugProposal() {
  try {
    console.log("🔍 Searching for proposal:", TARGET_PROPOSAL_ID);
    console.log("Title: [CONSTITUTIONAL] Remove Cost Cap, Update Executors, Disable Legacy USDT Bridge");
    console.log("=".repeat(80));

    const tallyApi = createTallyApiService();

    // First try direct fetch by proposal ID
    const direct = await tallyApi.fetchProposalById(TARGET_PROPOSAL_ID);
    if (direct) {
      console.log("\n🎯 FOUND THE PROPOSAL via direct lookup!");
      console.log({
        id: direct.id,
        title: direct.metadata.title,
        status: direct.status,
        onchainId: direct.onchainId,
        createdAt: direct.createdAt,
        governor: direct.governor?.slug,
      });
      const events = direct.events || [];
      console.log(`\n📜 Events (${events.length}):`);
      for (const e of events) {
        console.log({
          type: e.type,
          createdAt: e.createdAt,
          blockNumber: e.block?.number,
          blockTimestamp: e.block?.timestamp,
          txHash: e.txHash,
          chainId: e.chainId,
        });
      }
      return;
    }

    // Fallback: Search through pages across both governors to find the proposal
    let found = false;
    const titleNeedle = "remove cost cap";
    for (const [label, governorId] of Object.entries(ARBITRUM_GOVERNORS)) {
      console.log(`\n🏛️  Searching governor (${label}): ${governorId}`);
      let cursor: string | null = null;
      let pageCount = 0;
      while (!found && pageCount < 15) {
        // Limit pages per governor
        pageCount++;
        console.log(`\n📄 Checking page ${pageCount}...`);

        // Basic backoff to avoid 429s
        try {
          const response = await tallyApi.fetchProposalsByGovernor(governorId, cursor || undefined);
          const proposals = response.data.proposals.nodes;

          console.log(`Found ${proposals.length} proposals on this page`);

          for (const proposal of proposals) {
            console.log(`- ${proposal.id}: ${proposal.metadata.title.substring(0, 60)}...`);
            if (proposal.id === TARGET_PROPOSAL_ID) {
              console.log("\n🎯 FOUND THE PROPOSAL!");
              console.log("Full details:");
              console.log({
                id: proposal.id,
                title: proposal.metadata.title,
                status: proposal.status,
                onchainId: proposal.onchainId,
                createdAt: proposal.createdAt,
                governor: label,
              });
              const events = (proposal as any).events || [];
              console.log(`\n📜 Events (${events.length}):`);
              for (const e of events) {
                console.log({
                  type: e.type,
                  createdAt: e.createdAt,
                  blockNumber: e.block?.number,
                  blockTimestamp: e.block?.timestamp,
                  txHash: e.txHash,
                  chainId: e.chainId,
                });
              }
              found = true;
              break;
            }
            if (proposal.metadata.title.toLowerCase().includes(titleNeedle)) {
              console.log("\n🔎 TITLE MATCH FOUND");
              console.log({
                id: proposal.id,
                title: proposal.metadata.title,
                status: proposal.status,
                onchainId: proposal.onchainId,
                createdAt: proposal.createdAt,
                governor: label,
              });
            }
          }

          if (found) break;

          if (proposals.length < 10 || !response.data.proposals.pageInfo.lastCursor) {
            console.log("\n🔚 Reached end of proposals for this governor");
            break;
          }
          cursor = response.data.proposals.pageInfo.lastCursor;
        } catch (e: any) {
          const msg = String(e?.message || e);
          if (msg.includes("429")) {
            console.log("⚠️  Rate limited, waiting 1s before retry...");
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          throw e;
        }
      }
      if (found) break;
    }

    if (!found) {
      console.log("\n❌ Proposal NOT FOUND in Tally API");
      console.log("This could mean:");
      console.log("1. The proposal ID is incorrect");
      console.log("2. The proposal is not in the Arbitrum governor we're querying (checked CURRENT and LEGACY)");
      console.log("3. The proposal is beyond the pages we checked");
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await db.close();
  }
}

debugProposal();
