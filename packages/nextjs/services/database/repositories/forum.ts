import { forumStage } from "../config/schema";
import { InferInsertModel } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "~~/services/database/config/postgresClient";

type ForumStageData = InferInsertModel<typeof forumStage>;

export async function getAllForumStagesForComparison() {
  return db.query.forumStage.findMany({
    columns: {
      original_id: true,
      title: true,
      message_count: true,
      last_message_at: true,
      url: true,
    },
  });
}

export async function createForumStage(forumStageData: ForumStageData) {
  const [newForumStage] = await db.insert(forumStage).values(forumStageData).returning();
  return newForumStage;
}

export async function updateForumStageByOriginalId(originalId: string, updates: Partial<ForumStageData>) {
  const [updated] = await db.update(forumStage).set(updates).where(eq(forumStage.original_id, originalId)).returning();
  return updated;
}

export async function getAllForumStages() {
  return await db.query.forumStage.findMany();
}

export async function getForumStageByOriginalId(originalId: string) {
  return await db.query.forumStage.findFirst({
    where: eq(forumStage.original_id, originalId),
  });
}
