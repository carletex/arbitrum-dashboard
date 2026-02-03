import { tallyStage } from "../config/schema";
import { InferInsertModel } from "drizzle-orm";
import { eq, isNull } from "drizzle-orm";
import { db } from "~~/services/database/config/postgresClient";

type TallyStageData = InferInsertModel<typeof tallyStage>;

export async function getAllTallyStagesForComparison() {
  return db.query.tallyStage.findMany({
    columns: {
      tally_proposal_id: true,
      title: true,
      author_name: true,
      url: true,
      onchain_id: true,
      status: true,
      substatus: true,
      substatus_deadline: true,
      start_timestamp: true,
      end_timestamp: true,
      options: true,
      last_activity: true,
    },
  });
}

export async function createTallyStage(tallyStageData: TallyStageData) {
  const [newTallyStage] = await db.insert(tallyStage).values(tallyStageData).returning();
  return newTallyStage;
}

export async function updateTallyStageByTallyProposalId(tallyProposalId: string, updates: Partial<TallyStageData>) {
  const [updated] = await db
    .update(tallyStage)
    .set(updates)
    .where(eq(tallyStage.tally_proposal_id, tallyProposalId))
    .returning();
  return updated;
}

export async function getAllTallyStagesWithoutProposal() {
  return await db.query.tallyStage.findMany({
    where: isNull(tallyStage.proposal_id),
  });
}

export async function getAllTallyStages() {
  return await db.query.tallyStage.findMany();
}

export async function getTallyStageByTallyProposalId(tallyProposalId: string) {
  return await db.query.tallyStage.findFirst({
    where: eq(tallyStage.tally_proposal_id, tallyProposalId),
  });
}

export async function getTallyStageById(id: string) {
  return await db.query.tallyStage.findFirst({
    where: eq(tallyStage.id, id),
  });
}

export async function updateTallyProposalId(tallyStageId: string, proposalId: string) {
  const [updated] = await db
    .update(tallyStage)
    .set({ proposal_id: proposalId, updated_at: new Date() })
    .where(eq(tallyStage.id, tallyStageId))
    .returning();
  return updated;
}

export async function getTallyStageByProposalId(proposalId: string) {
  return await db.query.tallyStage.findFirst({
    where: eq(tallyStage.proposal_id, proposalId),
  });
}
