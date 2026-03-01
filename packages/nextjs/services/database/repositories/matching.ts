import { matchingResult, proposals, snapshotStage, tallyStage } from "../config/schema";
import { InferInsertModel, and, desc, eq, sql } from "drizzle-orm";
import { db } from "~~/services/database/config/postgresClient";

type MatchingResultInsert = InferInsertModel<typeof matchingResult>;

export async function upsertMatchingResult(data: Omit<MatchingResultInsert, "id" | "created_at" | "updated_at">) {
  const [result] = await db
    .insert(matchingResult)
    .values(data)
    .onConflictDoUpdate({
      target: [matchingResult.source_type, matchingResult.source_stage_id],
      set: {
        proposal_id: data.proposal_id ?? null,
        status: data.status,
        method: data.method,
        confidence: data.confidence ?? null,
        reasoning: data.reasoning ?? null,
        source_title: data.source_title ?? null,
        source_url: data.source_url ?? null,
        matched_forum_url: data.matched_forum_url ?? null,
        updated_at: new Date(),
      },
    })
    .returning();
  return result;
}

export async function getUnprocessedSnapshotStages() {
  return await db
    .select({ snapshotStage })
    .from(snapshotStage)
    .leftJoin(
      matchingResult,
      and(eq(matchingResult.source_type, "snapshot"), eq(matchingResult.source_stage_id, snapshotStage.id)),
    )
    .where(sql`${matchingResult.id} IS NULL`);
}

export async function getUnprocessedTallyStages() {
  return await db
    .select({ tallyStage })
    .from(tallyStage)
    .leftJoin(
      matchingResult,
      and(eq(matchingResult.source_type, "tally"), eq(matchingResult.source_stage_id, tallyStage.id)),
    )
    .where(sql`${matchingResult.id} IS NULL`);
}

export async function getMatchingResultsBySourceType(sourceType: "snapshot" | "tally") {
  return await db.query.matchingResult.findMany({
    where: eq(matchingResult.source_type, sourceType),
  });
}

export async function getAllMatchingResults() {
  return await db
    .select({
      id: matchingResult.id,
      source_type: matchingResult.source_type,
      source_stage_id: matchingResult.source_stage_id,
      proposal_id: matchingResult.proposal_id,
      status: matchingResult.status,
      method: matchingResult.method,
      confidence: matchingResult.confidence,
      reasoning: matchingResult.reasoning,
      source_title: matchingResult.source_title,
      source_url: matchingResult.source_url,
      matched_forum_url: matchingResult.matched_forum_url,
      created_at: matchingResult.created_at,
      updated_at: matchingResult.updated_at,
      proposal_title: proposals.title,
    })
    .from(matchingResult)
    .leftJoin(proposals, eq(matchingResult.proposal_id, proposals.id))
    .orderBy(desc(matchingResult.updated_at));
}

export async function getMatchingSummary() {
  const rows = await db
    .select({
      source_type: matchingResult.source_type,
      status: matchingResult.status,
      count: sql<number>`count(*)::int`,
    })
    .from(matchingResult)
    .groupBy(matchingResult.source_type, matchingResult.status);

  return rows;
}
