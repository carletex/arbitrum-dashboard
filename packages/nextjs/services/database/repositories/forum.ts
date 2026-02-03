import { forumStage } from "../config/schema";
import { eq } from "drizzle-orm";
import { InferInsertModel } from "drizzle-orm";
import { db } from "~~/services/database/config/postgresClient";
import { ForumPost, ForumPostsArraySchema } from "~~/services/forum/types";

type ForumStageData = InferInsertModel<typeof forumStage>;

export type ForumContentUpdate = {
  posts_json: ForumPost[];
  content_fetched_at: Date;
  content_fetch_status: "pending" | "success" | "failed" | "partial";
  last_fetched_post_count: number;
  fetch_error_log: string | null;
  fetch_retry_count: number;
  next_fetch_attempt: Date | null;
};

export type ForumStageWithContent = ForumStageData & {
  posts: ForumPost[];
};

/**
 * Get all original IDs from forum stages.
 * Filters out null values and returns only valid string IDs.
 */
export async function getAllOriginalIds(): Promise<string[]> {
  const results = await db.query.forumStage.findMany({
    columns: {
      original_id: true,
    },
  });

  return results.map(r => r.original_id).filter((id): id is string => id !== null);
}

export async function createForumStage(forumStageData: ForumStageData) {
  const [newForumStage] = await db.insert(forumStage).values(forumStageData).returning();
  return newForumStage;
}

export async function updateForumStageByOriginalId(originalId: string, updates: Partial<ForumStageData>) {
  const [updated] = await db.update(forumStage).set(updates).where(eq(forumStage.original_id, originalId)).returning();
  return updated;
}

export async function getForumStageByOriginalId(originalId: string) {
  return await db.query.forumStage.findFirst({
    where: eq(forumStage.original_id, originalId),
  });
}

/**
 * Update forum content for a specific forum stage.
 * Sets posts_json, fetch status, and retry metadata.
 */
export async function updateForumContent(forumStageId: string, content: ForumContentUpdate): Promise<void> {
  await db
    .update(forumStage)
    .set({
      posts_json: content.posts_json,
      content_fetched_at: content.content_fetched_at,
      content_fetch_status: content.content_fetch_status,
      last_fetched_post_count: content.last_fetched_post_count,
      fetch_error_log: content.fetch_error_log,
      fetch_retry_count: content.fetch_retry_count,
      next_fetch_attempt: content.next_fetch_attempt,
      updated_at: new Date(),
    })
    .where(eq(forumStage.id, forumStageId));
}

/**
 * Get forum stage with validated posts content for a proposal.
 * Validates posts_json against schema and logs validation errors.
 */
export async function getForumStageWithContent(proposalId: string): Promise<ForumStageWithContent | null> {
  const result = await db.query.forumStage.findFirst({
    where: eq(forumStage.proposal_id, proposalId),
  });

  if (!result) return null;

  // Validate posts_json with error logging
  let posts: ForumPost[] = [];
  if (result.posts_json) {
    const validation = ForumPostsArraySchema.safeParse(result.posts_json);
    if (validation.success) {
      posts = validation.data;
    } else {
      console.error(`Invalid posts_json for proposal ${proposalId}:`, validation.error.flatten());
    }
  }

  return {
    ...result,
    posts,
  };
}
