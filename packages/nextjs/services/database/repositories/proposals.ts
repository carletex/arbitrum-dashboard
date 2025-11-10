import { proposals } from "../config/schema";
import { InferInsertModel } from "drizzle-orm";
import { db } from "~~/services/database/config/postgresClient";

type ProposalData = InferInsertModel<typeof proposals>;

export async function getAllProposals() {
  return await db.query.proposals.findMany();
}

export async function createProposal(proposalData: ProposalData) {
  const [newProposal] = await db.insert(proposals).values(proposalData).returning();
  return newProposal;
}
