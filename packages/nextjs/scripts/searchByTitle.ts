#!/usr/bin/env tsx
import * as dotenv from "dotenv";
import * as path from "path";
import { db } from "~~/services/database/config/postgresClient";
import { ARBITRUM_GOVERNORS, createTallyApiService } from "~~/services/tally/api";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env.development") });

async function searchByTitle() {
  try {
    const searchTitle = "Remove Cost Cap";
    console.log(`🔍 Searching for proposals containing: "${searchTitle}"`);
    console.log("=".repeat(80));

    const tallyApi = createTallyApiService();

    for (const [label, governorId] of Object.entries(ARBITRUM_GOVERNORS)) {
      console.log(`\n🏛️  Governor ${label}: ${governorId}`);
      let cursor: string | null = null;
      let pageCount = 0;

      while (pageCount < 5) {
        pageCount++;
        const response = await tallyApi.fetchProposalsByGovernor(governorId, cursor || undefined, 10);
        const proposals = response.data.proposals.nodes;

        for (const proposal of proposals) {
          if (proposal.metadata.title.toLowerCase().includes(searchTitle.toLowerCase())) {
            const prevRaw: any = (proposal as any).metadata?.previousEnd;
            const etaRaw: any = (proposal as any).metadata?.eta;
            console.log(`\n🎯 MATCH: ${proposal.metadata.title}`);
            console.log({
              id: proposal.id,
              onchainId: proposal.onchainId,
              previousEnd: prevRaw,
              previousEndType: typeof prevRaw,
              eta: etaRaw,
              etaType: typeof etaRaw,
            });
          }
        }

        if (proposals.length < 10 || !response.data.proposals.pageInfo.lastCursor) break;
        cursor = response.data.proposals.pageInfo.lastCursor;
      }
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await db.close();
  }
}

searchByTitle();
