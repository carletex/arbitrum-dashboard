import { PRODUCTION_DATABASE_HOSTNAME } from "./config/postgresClient";
import { proposals } from "./config/schema";
import { spawnSync } from "child_process";
import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import * as path from "path";
import { join } from "path";
import { Client } from "pg";

dotenv.config({ path: path.resolve(__dirname, "../../.env.development") });

if (process.env.POSTGRES_URL?.includes(PRODUCTION_DATABASE_HOSTNAME)) {
  process.stdout.write("\n⚠️ You are pointing to the production database. Are you sure you want to proceed? (y/N): ");

  const result = spawnSync("tsx", [join(__dirname, "../../utils/prompt-confirm.ts")], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    console.log("Aborted.");
    process.exit(1);
  }
}

const proposalsData = [
  {
    title: "Test Proposal 1",
    author_address: "0x1234567890123456789012345678901234567890",
    overall_status: "ACTIVE",
    created_at: new Date(),
    chain_id: "42161",
  },
  {
    title: "Test Proposal 2",
    author_address: "0x2234567890123456789012345678901234567890",
    overall_status: "EXECUTED",
    created_at: new Date(),
    chain_id: "42161",
  },
  {
    title: "Test Proposal 3",
    author_address: "0x3234567890123456789012345678901234567890",
    overall_status: "DEFEATED",
    created_at: new Date(),
    chain_id: "42161",
  },
];

async function seed() {
  const client = new Client({
    connectionString: process.env.POSTGRES_URL,
  });
  await client.connect();
  const db = drizzle(client, {
    schema: { proposals },
    casing: "snake_case",
  });

  try {
    await db.insert(proposals).values(proposalsData);

    console.log("Database seeded successfully");
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  } finally {
    await client.end();
  }
}
seed().catch(error => {
  console.error("Error in seed script:", error);
  process.exit(1);
});
