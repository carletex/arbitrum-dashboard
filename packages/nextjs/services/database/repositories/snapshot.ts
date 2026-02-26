import { snapshotStage } from "../config/schema";
import { InferInsertModel } from "drizzle-orm";
import { eq, isNull } from "drizzle-orm";
import { db } from "~~/services/database/config/postgresClient";

type SnapshotStageData = InferInsertModel<typeof snapshotStage>;

export async function getAllSnapshotStagesForComparison() {
  return db.query.snapshotStage.findMany({
    columns: {
      snapshot_id: true,
      title: true,
      author_name: true,
      status: true,
      voting_start: true,
      voting_end: true,
      options: true,
      url: true,
    },
  });
}

export async function createSnapshotStage(snapshotStageData: SnapshotStageData) {
  const [newSnapshotStage] = await db.insert(snapshotStage).values(snapshotStageData).returning();
  return newSnapshotStage;
}

export async function updateSnapshotStageBySnapshotId(snapshotId: string, updates: Partial<SnapshotStageData>) {
  const [updated] = await db
    .update(snapshotStage)
    .set(updates)
    .where(eq(snapshotStage.snapshot_id, snapshotId))
    .returning();
  return updated;
}

export async function getAllSnapshotStagesWithoutProposal() {
  return await db.query.snapshotStage.findMany({
    where: isNull(snapshotStage.proposal_id),
  });
}

export async function getAllSnapshotStages() {
  return await db.query.snapshotStage.findMany();
}

export async function getSnapshotStageBySnapshotId(snapshotId: string) {
  return await db.query.snapshotStage.findFirst({
    where: eq(snapshotStage.snapshot_id, snapshotId),
  });
}

export async function updateSnapshotProposalId(snapshotStageId: string, proposalId: string) {
  const [updated] = await db
    .update(snapshotStage)
    .set({ proposal_id: proposalId, updated_at: new Date() })
    .where(eq(snapshotStage.id, snapshotStageId))
    .returning();
  return updated;
}
