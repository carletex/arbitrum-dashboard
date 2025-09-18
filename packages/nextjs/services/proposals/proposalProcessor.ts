import {
  createExecutableCalls,
  createProposal,
  createTallyVote,
  deriveExecutionInfoFromProposal,
  findProposalByTallyId,
  mapExecutableCallsToDb,
  mapProposalEventsToDb,
  mapTallyProposalToDb,
  mapTallyVotesToDb,
  updateProposalDerivedInfo,
  updateProposalTimestamps,
  updateTallyVoteStatus,
  upsertProposalEvents,
} from "~~/services/database/repositories/proposals";
import { createTallyApiService } from "~~/services/tally/api";
import { TallyProposal } from "~~/types/tally";

export class ProposalProcessor {
  private static readonly TARGET_PROPOSAL_IDENTIFIER =
    "97685288731263391833044854304895851471157040105038894699042975271050068874277";

  private logProposalEvents(proposal: TallyProposal, context?: string): void {
    const target = ProposalProcessor.TARGET_PROPOSAL_IDENTIFIER;
    if (proposal.onchainId !== target && proposal.id !== target) return;
    const events = proposal.events || [];
    console.log(`\n📜 Events (${events.length})${context ? ` [${context}]` : ""} for: ${proposal.metadata.title}`);
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
  }

  async processProposal(proposal: TallyProposal): Promise<void> {
    try {
      console.log(`Processing proposal: ${proposal.metadata.title} (ID: ${proposal.id})`);

      // Check if proposal exists in database
      const existingProposal = await findProposalByTallyId(proposal.id);

      if (!existingProposal) {
        console.log(`Creating new proposal: ${proposal.id}`);

        // Create new proposal record
        const proposalData = mapTallyProposalToDb(proposal);
        const newProposal = await createProposal(proposalData);

        // Create tally_votes record
        const voteData = mapTallyVotesToDb(proposal, newProposal.id);
        await createTallyVote(voteData);

        // Create executable calls if they exist
        if (proposal.executableCalls?.length > 0) {
          const callsData = mapExecutableCallsToDb(proposal, newProposal.id);
          await createExecutableCalls(callsData);
        }

        // Ingest events
        const eventsData = mapProposalEventsToDb(proposal, newProposal.id);
        await upsertProposalEvents(eventsData);

        // Update derived execution info
        const derived = deriveExecutionInfoFromProposal(proposal);
        await updateProposalDerivedInfo(newProposal.id, derived);

        console.log(`✅ Created new proposal: ${proposal.metadata.title}`);
        this.logProposalEvents(proposal, "created");
      } else {
        console.log(`Updating existing proposal: ${proposal.id}`);

        // Update existing proposal status if it has changed
        if (existingProposal.tallyVote?.status !== proposal.status) {
          await updateTallyVoteStatus(existingProposal.proposal.id, proposal.status);
          console.log(`✅ Updated status for proposal: ${proposal.metadata.title}`);
          this.logProposalEvents(proposal, "updated");
        } else {
          console.log(`⏭️  No status change for proposal: ${proposal.metadata.title}`);
        }

        // Always refresh timestamps/eta/previous_end to fix any prior parsing issues
        await updateProposalTimestamps(existingProposal.proposal.id, proposal);
        console.log(`🕒 Refreshed timestamps for proposal: ${proposal.metadata.title}`);

        // Ingest/merge events and update derived info
        const eventsData = mapProposalEventsToDb(proposal, existingProposal.proposal.id);
        await upsertProposalEvents(eventsData);
        const derived = deriveExecutionInfoFromProposal(proposal);
        await updateProposalDerivedInfo(existingProposal.proposal.id, derived);
      }
    } catch (error) {
      console.error(`❌ Error processing proposal ${proposal.id}:`, error);
      throw error;
    }
  }

  async processAllProposals(proposals: TallyProposal[]): Promise<void> {
    console.log(`\n🔄 Starting to process ${proposals.length} proposals...`);
    let processed = 0;
    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const proposal of proposals) {
      try {
        const existingProposal = await findProposalByTallyId(proposal.id);

        if (!existingProposal) {
          await this.processProposal(proposal);
          created++;
        } else if (existingProposal.tallyVote?.status !== proposal.status) {
          await this.processProposal(proposal);
          updated++;
        } else {
          // Even if no change, log events so we can inspect what we receive
          this.logProposalEvents(proposal, "no-change");
        }

        processed++;

        // Log progress every 5 proposals
        if (processed % 5 === 0) {
          console.log(`Progress: ${processed}/${proposals.length} processed`);
        }
      } catch (error) {
        console.error(`Error processing proposal ${proposal.id}:`, error);
        errors++;
      }
    }

    console.log(`\n✅ Processing complete!`);
    console.log(`📊 Summary:`);
    console.log(`   • Total processed: ${processed}`);
    console.log(`   • New proposals created: ${created}`);
    console.log(`   • Proposals updated: ${updated}`);
    console.log(`   • Errors: ${errors}`);
  }

  async fetchAndProcessAllProposals(): Promise<void> {
    try {
      console.log("🚀 Starting full proposal sync...");

      // Create API service with current environment variables
      const tallyApi = createTallyApiService();

      // Fetch all proposals from Tally API
      const allProposals = await tallyApi.fetchAllProposals();

      // Process and store them in the database
      await this.processAllProposals(allProposals);

      console.log("🎉 Full proposal sync completed successfully!");
    } catch (error) {
      console.error("💥 Error in full proposal sync:", error);
      throw error;
    }
  }

  async syncLatestProposals(limit = 20): Promise<void> {
    try {
      console.log(`🔄 Syncing latest ${limit} proposals...`);

      // Create API service with current environment variables
      const tallyApi = createTallyApiService();

      // Fetch just the first page of proposals (latest ones)
      const response = await tallyApi.fetchProposals();
      const latestProposals = response.data.proposals.nodes.slice(0, limit);

      await this.processAllProposals(latestProposals);

      console.log("✅ Latest proposals sync completed!");
    } catch (error) {
      console.error("❌ Error in latest proposals sync:", error);
      throw error;
    }
  }
}

export const proposalProcessor = new ProposalProcessor();
