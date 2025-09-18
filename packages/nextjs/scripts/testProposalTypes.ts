#!/usr/bin/env tsx
import {
  mapExecutableCallsToDb,
  mapTallyProposalToDb,
  mapTallyVotesToDb,
} from "~~/services/database/repositories/proposals";
import { TallyProposal } from "~~/types/tally";

// Test data structure to verify types are working
const mockProposal: TallyProposal = {
  id: "test-proposal-id",
  onchainId: "123",
  chainId: "42161",
  status: "ACTIVE",
  metadata: {
    title: "Test Proposal",
    description: "A test proposal for validation",
    eta: "2024-01-01T00:00:00Z",
    ipfsHash: "QmTest123",
    txHash: "0xtest123",
    discourseURL: "https://discourse.example.com/test",
    snapshotURL: "https://snapshot.org/test",
  },
  creator: {
    address: "0x1234567890123456789012345678901234567890",
    name: "Test Creator",
    ens: "test.eth",
  },
  proposer: {
    address: "0x1234567890123456789012345678901234567890",
    name: "Test Proposer",
    ens: "proposer.eth",
  },
  governor: {
    name: "Arbitrum DAO",
    slug: "arbitrum",
  },
  voteStats: [
    { type: "for", votesCount: "1000000", votersCount: 100, percent: 60.5 },
    { type: "against", votesCount: "500000", votersCount: 50, percent: 30.2 },
    { type: "abstain", votesCount: "150000", votersCount: 15, percent: 9.3 },
  ],
  start: {
    number: 12345678,
    timestamp: "2024-01-01T00:00:00Z",
  },
  end: {
    number: 12345778,
    timestamp: "2024-01-02T00:00:00Z",
  },
  createdAt: "2024-01-01T00:00:00Z",
  executableCalls: [
    {
      target: "0x1234567890123456789012345678901234567890",
      value: "0",
      calldata: "0x1234",
    },
  ],
};

function main() {
  console.log("🧪 Testing Proposal Types and Mappings");
  console.log("======================================\n");

  try {
    // Test type mappings
    const proposalData = mapTallyProposalToDb(mockProposal);
    const voteData = mapTallyVotesToDb(mockProposal, "test-proposal-uuid");
    const callsData = mapExecutableCallsToDb(mockProposal, "test-proposal-uuid");

    console.log("✅ Proposal mapping:", {
      title: proposalData.title,
      status: proposalData.overall_status,
      author: proposalData.author_address,
    });

    console.log("✅ Vote data mapping:", {
      for_votes: voteData.for_votes,
      against_votes: voteData.against_votes,
      status: voteData.status,
    });

    console.log("✅ Executable calls mapping:", {
      count: callsData.length,
      firstCall: callsData[0]?.target,
    });

    console.log("\n🎉 All type mappings are working correctly!");
  } catch (error) {
    console.error("❌ Error testing types:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
