import { forumStage } from "../config/schema";
import { InferInsertModel } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "~~/services/database/config/postgresClient";

type ForumStageData = InferInsertModel<typeof forumStage>;

export async function getAllOriginalIds() {
  const originalIds = await db.query.forumStage.findMany({
    columns: {
      original_id: true,
    },
  });

  return originalIds.map(originalId => originalId.original_id);
}

export async function createForumStage(forumStageData: ForumStageData) {
  const [newForumStage] = await db.insert(forumStage).values(forumStageData).returning();
  return newForumStage;
}

export async function updateForumStageByOriginalId(originalId: string, updates: Partial<ForumStageData>) {
  const [updated] = await db.update(forumStage).set(updates).where(eq(forumStage.original_id, originalId)).returning();
  return updated;
}
