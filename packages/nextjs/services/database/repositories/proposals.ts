import { eq } from "drizzle-orm";
import { db } from "~~/services/database/config/postgresClient";
import { executableCalls, proposalEvents, proposals, tallyVotes } from "~~/services/database/config/schema";
import { TallyProposal, TallyProposalEvent } from "~~/types/tally";

export async function getAllProposals() {
  return await db.query.proposals.findMany();
}

export async function findExistingProposal(tallyProposalId: string, onchainId: string) {
  return await db.query.proposals.findFirst({
    where: (proposals, { eq, or }) =>
      or(
        eq(proposals.id, tallyProposalId),
        eq(proposals.author_address, onchainId), // Note: This needs adjustment based on actual logic
      ),
    with: {
      tallyVote: true,
      executableCalls: true,
    },
  });
}

export async function findProposalByTallyId(tallyProposalId: string) {
  const result = await db
    .select({
      proposal: proposals,
      tallyVote: tallyVotes,
    })
    .from(proposals)
    .leftJoin(tallyVotes, eq(proposals.id, tallyVotes.proposal_id))
    .where(eq(tallyVotes.tally_proposal_id, tallyProposalId))
    .limit(1);

  return result[0] || null;
}

export async function createProposal(proposalData: typeof proposals.$inferInsert) {
  const [newProposal] = await db.insert(proposals).values(proposalData).returning();
  return newProposal;
}

export async function createTallyVote(voteData: typeof tallyVotes.$inferInsert) {
  const [newVote] = await db.insert(tallyVotes).values(voteData).returning();
  return newVote;
}

export async function updateTallyVoteStatus(proposalId: string, status: string) {
  await db
    .update(tallyVotes)
    .set({
      status,
      last_activity: new Date(),
    })
    .where(eq(tallyVotes.proposal_id, proposalId));
}

export async function createExecutableCalls(callsData: Array<typeof executableCalls.$inferInsert>) {
  if (callsData.length === 0) return [];
  return await db.insert(executableCalls).values(callsData).returning();
}

export function mapTallyProposalToDb(proposal: TallyProposal) {
  const parseFlexibleTimestamp = (value: unknown): Date | null => {
    if (value === undefined || value === null) return null;
    if (typeof value === "number") {
      if (value === 0) return null;
      const millis = value > 1e12 ? value : value * 1000;
      const d = new Date(millis);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return null;
      if (/^\d+$/.test(trimmed)) {
        const num = Number(trimmed);
        if (num === 0) return null;
        const millis = num > 1e12 ? num : num * 1000;
        const d = new Date(millis);
        return isNaN(d.getTime()) ? null : d;
      }
      const d = new Date(trimmed);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  };

  const timelockChainId = (() => {
    const tl = (proposal.metadata?.timelockId || proposal.governor?.timelockId) as string | undefined;
    if (!tl) return null;
    const parts = tl.split(":");
    return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : null;
  })();

  return {
    title: proposal.metadata.title,
    description: proposal.metadata.description,
    author_address: proposal.creator.address,
    author_name: proposal.creator.name || null,
    author_ens: proposal.creator.ens || null,
    proposer_address: proposal.proposer?.address || null,
    proposer_name: proposal.proposer?.name || null,
    proposer_ens: proposal.proposer?.ens || null,
    overall_status: proposal.status,
    governor_name: proposal.governor.name,
    governor_slug: proposal.governor.slug,
    start_block_number: proposal.start?.number || null,
    start_timestamp: parseFlexibleTimestamp(proposal.start?.timestamp),
    end_block_number: proposal.end?.number || null,
    end_timestamp: parseFlexibleTimestamp(proposal.end?.timestamp),
    created_at: new Date(proposal.createdAt),
    eta: parseFlexibleTimestamp(proposal.metadata.eta),
    ipfs_hash: proposal.metadata.ipfsHash || null,
    tx_hash: proposal.metadata.txHash || null,
    discourse_url: proposal.metadata.discourseURL || null,
    snapshot_url: proposal.metadata.snapshotURL || null,
    timelock_id: proposal.metadata.timelockId || null,
    timelock_chain_id: timelockChainId,
    previous_end: parseFlexibleTimestamp(proposal.metadata.previousEnd),
    chain_id: proposal.chainId,
  };
}

export async function updateProposalTimestamps(proposalId: string, proposal: TallyProposal) {
  const parseFlexibleTimestamp = (value: unknown): Date | null => {
    if (value === undefined || value === null) return null;
    if (typeof value === "number") {
      if (value === 0) return null;
      const millis = value > 1e12 ? value : value * 1000;
      const d = new Date(millis);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return null;
      if (/^\d+$/.test(trimmed)) {
        const num = Number(trimmed);
        if (num === 0) return null;
        const millis = num > 1e12 ? num : num * 1000;
        const d = new Date(millis);
        return isNaN(d.getTime()) ? null : d;
      }
      const d = new Date(trimmed);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  };

  await db
    .update(proposals)
    .set({
      start_timestamp: parseFlexibleTimestamp(proposal.start?.timestamp),
      end_timestamp: parseFlexibleTimestamp(proposal.end?.timestamp),
      eta: parseFlexibleTimestamp(proposal.metadata.eta),
      previous_end: parseFlexibleTimestamp(proposal.metadata.previousEnd),
      last_activity: new Date(),
    })
    .where(eq(proposals.id, proposalId));
}

export function mapTallyVotesToDb(proposal: TallyProposal, proposalId: string) {
  const voteStatsMap = proposal.voteStats.reduce(
    (acc, stat) => {
      acc[stat.type] = stat;
      return acc;
    },
    {} as Record<string, (typeof proposal.voteStats)[0]>,
  );

  return {
    proposal_id: proposalId,
    tally_proposal_id: proposal.id,
    onchain_id: proposal.onchainId,
    status: proposal.status,
    for_votes: voteStatsMap.for?.votesCount || "0",
    against_votes: voteStatsMap.against?.votesCount || "0",
    abstain_votes: voteStatsMap.abstain?.votesCount || "0",
    pending_for_votes: voteStatsMap.pendingfor?.votesCount || "0",
    pending_against_votes: voteStatsMap.pendingagainst?.votesCount || "0",
    pending_abstain_votes: voteStatsMap.pendingabstain?.votesCount || "0",
    for_voters_count: voteStatsMap.for?.votersCount || 0,
    against_voters_count: voteStatsMap.against?.votersCount || 0,
    abstain_voters_count: voteStatsMap.abstain?.votersCount || 0,
    for_percent: voteStatsMap.for?.percent?.toString() || "0",
    against_percent: voteStatsMap.against?.percent?.toString() || "0",
    abstain_percent: voteStatsMap.abstain?.percent?.toString() || "0",
  };
}

export function mapExecutableCallsToDb(proposal: TallyProposal, proposalId: string) {
  return proposal.executableCalls.map(call => ({
    proposal_id: proposalId,
    target: call.target,
    value: call.value,
    calldata: call.calldata,
  }));
}

export function mapProposalEventsToDb(proposal: TallyProposal, proposalId: string) {
  const events = (proposal.events || []) as TallyProposalEvent[];
  return events.map(e => ({
    proposal_id: proposalId,
    type: e.type,
    chain_id: e.chainId,
    block_number: e.block?.number || null,
    block_timestamp: e.block?.timestamp ? new Date(e.block.timestamp) : null,
    created_at: e.createdAt ? new Date(e.createdAt) : null,
    tx_hash: e.txHash || null,
    raw: e as unknown as object,
  }));
}

export async function upsertProposalEvents(eventsData: Array<typeof proposalEvents.$inferInsert>) {
  if (eventsData.length === 0) return [];
  // Best-effort de-dup using (proposal_id, type, chain_id, tx_hash, created_at)
  const inserts: Array<typeof proposalEvents.$inferInsert> = [];
  for (const e of eventsData) {
    const exists = await db.query.proposalEvents.findFirst({
      where: (pe, { and, eq }) =>
        and(
          eq(pe.proposal_id, e.proposal_id!),
          eq(pe.type, e.type!),
          eq(pe.chain_id, e.chain_id!),
          e.tx_hash ? eq(pe.tx_hash, e.tx_hash) : eq(pe.tx_hash, null as any),
        ),
    });
    if (!exists) inserts.push(e);
  }
  if (inserts.length === 0) return [];
  return await db.insert(proposalEvents).values(inserts).returning();
}

export function deriveExecutionInfoFromProposal(proposal: TallyProposal) {
  const tl = proposal.metadata?.timelockId as string | undefined;
  const events = (proposal.events || []) as TallyProposalEvent[];

  // Prediction from timelock chain
  let requiresL1Execution: boolean | null = null;
  let executionChainId: string | null = null;
  let queuedAt: Date | null = null;
  let executedAt: Date | null = null;
  let waitingL2toL1: boolean | null = null;
  let l2MessageAvailableAt: Date | null = null;

  if (tl) {
    if (tl.startsWith("eip155:1:")) requiresL1Execution = true;
    else if (tl.startsWith("eip155:42161:")) requiresL1Execution = false;
  }

  // Authoritative from events if present
  for (const e of events) {
    if (e.type === "queued") {
      queuedAt = e.block?.timestamp ? new Date(e.block.timestamp) : e.createdAt ? new Date(e.createdAt) : queuedAt;
      executionChainId = e.chainId || executionChainId;
    } else if (e.type === "executed" || e.type === "crosschainexecuted") {
      executedAt = e.block?.timestamp ? new Date(e.block.timestamp) : e.createdAt ? new Date(e.createdAt) : executedAt;
      executionChainId = e.chainId || executionChainId;
    }
  }

  if (executionChainId) {
    requiresL1Execution = executionChainId === "eip155:1";
  }

  // Detect L2->L1 message waiting window
  const l2Executed = events.find(e => e.type === "executed" && e.chainId === "eip155:42161");
  const hasL1QueuedOrExecuted = events.some(
    e => (e.type === "queued" || e.type === "executed") && e.chainId === "eip155:1",
  );
  if (l2Executed && !hasL1QueuedOrExecuted) {
    waitingL2toL1 = true;
    const l2ExecTime = l2Executed.block?.timestamp || l2Executed.createdAt;
    if (l2ExecTime) {
      const base = new Date(l2ExecTime).getTime();
      l2MessageAvailableAt = new Date(base + 7 * 24 * 60 * 60 * 1000);
    }
    // Heuristic: once L2 executed and no L1 yet, expect an L1 execution step
    if (requiresL1Execution === null) {
      requiresL1Execution = true;
    }
  } else {
    waitingL2toL1 = false;
  }

  return {
    requires_l1_execution: requiresL1Execution,
    execution_chain_id: executionChainId,
    queued_at: queuedAt,
    executed_at: executedAt,
    waiting_l2_to_l1: waitingL2toL1,
    l2_message_available_at: l2MessageAvailableAt,
  } as Partial<typeof proposals.$inferInsert>;
}

export async function updateProposalDerivedInfo(
  proposalId: string,
  info: ReturnType<typeof deriveExecutionInfoFromProposal>,
) {
  await db
    .update(proposals)
    .set({
      requires_l1_execution: info.requires_l1_execution ?? null,
      execution_chain_id: info.execution_chain_id ?? null,
      queued_at: info.queued_at ?? null,
      executed_at: info.executed_at ?? null,
      waiting_l2_to_l1: info.waiting_l2_to_l1 ?? null,
      l2_message_available_at: info.l2_message_available_at ?? null,
      last_activity: new Date(),
    })
    .where(eq(proposals.id, proposalId));
}
