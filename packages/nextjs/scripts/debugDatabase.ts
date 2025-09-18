#!/usr/bin/env tsx
import * as dotenv from "dotenv";
import * as path from "path";
import { db } from "~~/services/database/config/postgresClient";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env.development") });

async function debugDatabase() {
  try {
    console.log("🔍 Database Analysis");
    console.log("=".repeat(50));

    // Count proposals
    const proposalCount = await db.query.proposals.findMany();
    console.log(`📊 Total proposals in database: ${proposalCount.length}`);

    // Count tally_votes
    const tallyVoteCount = await db.query.tallyVotes.findMany();
    console.log(`📊 Total tally_votes in database: ${tallyVoteCount.length}`);

    console.log("\n🔍 First 10 proposals (key fields):");
    const firstProposals = proposalCount.slice(0, 10);
    for (const p of firstProposals) {
      console.log({
        id: p.id,
        title: p.title,
        timelock_chain_id: (p as any).timelock_chain_id,
        requires_l1_execution: (p as any).requires_l1_execution,
        execution_chain_id: (p as any).execution_chain_id,
        queued_at: (p as any).queued_at,
        executed_at: (p as any).executed_at,
      });
    }

    console.log("\n🔍 First 10 tally_votes:");
    const firstVotes = tallyVoteCount.slice(0, 10);
    for (const vote of firstVotes) {
      console.log(`- ${vote.tally_proposal_id}: ${vote.status}`);
    }

    // Find proposals without tally_votes
    console.log("\n🔍 Finding proposals without tally_votes...");
    const proposalsWithoutVotes = [];

    for (const proposal of proposalCount) {
      const hasVote = tallyVoteCount.find(vote => vote.proposal_id === proposal.id);
      if (!hasVote) {
        proposalsWithoutVotes.push(proposal);
      }
    }

    console.log(`📊 Proposals without tally_votes: ${proposalsWithoutVotes.length}`);

    if (proposalsWithoutVotes.length > 0) {
      console.log("\n🔍 First 5 proposals without votes:");
      for (const proposal of proposalsWithoutVotes.slice(0, 5)) {
        console.log(`- ${proposal.id}: ${proposal.title} (created: ${proposal.created_at})`);
      }
    }

    // Check for specific proposal in database
    const targetId = "97685288731263391833044854304895851471157040105038894699042975271050068874277";
    console.log(`\n🔍 Searching for target proposal ID in database: ${targetId}`);

    const foundProposal = proposalCount.find(p => p.id === targetId);
    if (foundProposal) {
      console.log("✅ Found in proposals table:", foundProposal.title);
      console.log({
        timelock_chain_id: (foundProposal as any).timelock_chain_id,
        requires_l1_execution: (foundProposal as any).requires_l1_execution,
        execution_chain_id: (foundProposal as any).execution_chain_id,
        queued_at: (foundProposal as any).queued_at,
        executed_at: (foundProposal as any).executed_at,
      });
    } else {
      console.log("❌ NOT found in proposals table");
    }

    const foundVote = tallyVoteCount.find(v => v.tally_proposal_id === targetId);
    if (foundVote) {
      console.log("✅ Found in tally_votes table");
    } else {
      console.log("❌ NOT found in tally_votes table");
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await db.close();
  }
}

debugDatabase();
