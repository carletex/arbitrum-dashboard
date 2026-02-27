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

export async function getDashboardProposals() {
  const rows = await db.query.proposals.findMany({
    with: {
      forumStages: {
        orderBy: (forumStage, { desc }) => [desc(forumStage.last_message_at)],
        limit: 1,
      },
      snapshotStages: {
        orderBy: (snapshotStage, { desc }) => [desc(snapshotStage.updated_at)],
        limit: 1,
      },
      tallyStages: {
        orderBy: (tallyStage, { desc }) => [desc(tallyStage.updated_at)],
        limit: 1,
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

    return {
      id: row.id,
      title: row.title,
      forumLink: forum?.url ?? null,
      snapshotLink: snapshot?.url ?? null,
      tallyLink: tally?.url ?? null,
      forumStatus: forum ? (snapshot || tally ? "Completed" : "Active Discussion") : null,
      snapshotStatus: resolveSnapshotResult(snapshot?.status ?? null, snapshotOptions),
      tallyStatus: mapTallyStatus(tally?.status ?? null, tally?.substatus ?? null),
      forumLastUpdate: timeAgo(forum?.last_message_at ?? null),
      snapshotLastUpdate: timeAgo(snapshot?.voting_end ?? snapshot?.voting_start ?? null),
      tallyLastUpdate: timeAgo(tally?.last_activity ?? tally?.updated_at ?? null),
      category: row.category ?? "Uncategorized",
      author: row.author_name ?? "Unknown",
      votes: extractTallyVotes(tallyOptions),
    };
  });
}

export type DashboardProposal = Awaited<ReturnType<typeof getDashboardProposals>>[number];
