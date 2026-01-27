import { snapshotStage } from "../config/schema";
import { InferInsertModel } from "drizzle-orm";
import { eq } from "drizzle-orm";
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
