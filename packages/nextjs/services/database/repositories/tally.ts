import { tallyStage } from "../config/schema";
import { InferInsertModel } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "~~/services/database/config/postgresClient";

type TallyStageData = InferInsertModel<typeof tallyStage>;

export async function getAllTallyProposalIds() {
  const tallyIds = await db.query.tallyStage.findMany({
    columns: {
      tally_proposal_id: true,
    },
  });

  return tallyIds.map(item => item.tally_proposal_id).filter((id): id is string => id !== null);
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
