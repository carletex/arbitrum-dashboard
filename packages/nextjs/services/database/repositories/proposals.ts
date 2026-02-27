import { proposals } from "../config/schema";
import { InferInsertModel } from "drizzle-orm";
import { db } from "~~/services/database/config/postgresClient";
import {
  type SnapshotOptions,
  type TallyOptions,
  extractTallyVotes,
  mapTallyStatus,
  resolveSnapshotResult,
  timeAgo,
} from "~~/utils/proposalTransforms";

type ProposalData = InferInsertModel<typeof proposals>;

export async function getAllProposals() {
  return await db.query.proposals.findMany();
}

export async function createProposal(proposalData: ProposalData) {
  const [newProposal] = await db.insert(proposals).values(proposalData).returning();
  return newProposal;
}

export type VotingStageItem = {
  id: string;
  status: string | null;
  displayStatus: string | null;
  lastUpdate: string | null;
  link: string | null;
  title: string | null;
  votes?: { for: string; against: string; total: string };
};

// Strip "Pending execution (...)" wrapper for compact badge display
function formatDisplayStatus(status: string | null): string | null {
  if (!status) return null;
  if (status.startsWith("Pending execution")) return status.replace("Pending execution (", "").replace(")", "");
  return status;
}

export async function getDashboardProposals() {
  const rows = await db.query.proposals.findMany({
    with: {
      forumStages: {
        orderBy: (forumStage, { desc }) => [desc(forumStage.last_message_at)],
        limit: 1,
      },
      snapshotStages: {
        orderBy: (snapshotStage, { desc }) => [desc(snapshotStage.updated_at)],
      },
      tallyStages: {
        orderBy: (tallyStage, { desc }) => [desc(tallyStage.updated_at)],
      },
    },
    orderBy: (proposals, { desc }) => [desc(proposals.updated_at)],
  });

  return rows.map(row => {
    const forum = row.forumStages[0] ?? null;
    const snapshot = row.snapshotStages[0] ?? null;
    const tally = row.tallyStages[0] ?? null;

    const snapshotOptions = snapshot?.options as SnapshotOptions | null;
    const tallyOptions = tally?.options as TallyOptions | null;

    // Map older snapshot stages (skip index 0, which is the latest)
    const snapshotHistory: VotingStageItem[] = row.snapshotStages.slice(1).map(s => {
      const opts = s.options as SnapshotOptions | null;
      const status = resolveSnapshotResult(s.status ?? null, opts);
      return {
        id: s.id,
        status,
        displayStatus: status,
        lastUpdate: timeAgo(s.voting_end ?? s.voting_start ?? null),
        link: s.url ?? null,
        title: s.title ?? null,
      };
    });

    // Map older tally stages (skip index 0, which is the latest)
    const tallyHistory: VotingStageItem[] = row.tallyStages.slice(1).map(t => {
      const opts = t.options as TallyOptions | null;
      const status = mapTallyStatus(t.status ?? null, t.substatus ?? null);
      return {
        id: t.id,
        status,
        displayStatus: formatDisplayStatus(status),
        lastUpdate: timeAgo(t.last_activity ?? t.updated_at ?? null),
        link: t.url ?? null,
        title: t.title ?? null,
        votes: extractTallyVotes(opts),
      };
    });

    return {
      id: row.id,
      title: row.title,
      forumLink: forum?.url ?? null,
      snapshotLink: snapshot?.url ?? null,
      tallyLink: tally?.url ?? null,
      forumStatus: forum ? (snapshot || tally ? "Completed" : "Active Discussion") : null,
      snapshotStatus: resolveSnapshotResult(snapshot?.status ?? null, snapshotOptions),
      tallyStatus: mapTallyStatus(tally?.status ?? null, tally?.substatus ?? null),
      tallyDisplayStatus: formatDisplayStatus(mapTallyStatus(tally?.status ?? null, tally?.substatus ?? null)),
      forumLastUpdate: timeAgo(forum?.last_message_at ?? null),
      snapshotLastUpdate: timeAgo(snapshot?.voting_end ?? snapshot?.voting_start ?? null),
      tallyLastUpdate: timeAgo(tally?.last_activity ?? tally?.updated_at ?? null),
      category: row.category ?? "Uncategorized",
      author: row.author_name ?? "Unknown",
      votes: extractTallyVotes(tallyOptions),
      snapshotHistory,
      tallyHistory,
    };
  });
}

export type DashboardProposal = Awaited<ReturnType<typeof getDashboardProposals>>[number];
