import { db } from "~~/services/database/config/postgresClient";

export async function getAllProposals() {
  return await db.query.proposals.findMany();
}
