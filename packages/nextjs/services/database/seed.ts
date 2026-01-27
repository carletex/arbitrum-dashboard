import { PRODUCTION_DATABASE_HOSTNAME } from "./config/postgresClient";
import { forumStage, proposals, snapshotStage, tallyStage, users } from "./config/schema";
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

async function seed() {
  const client = new Client({
    connectionString: process.env.POSTGRES_URL,
  });
  await client.connect();
  const db = drizzle(client, {
    schema: { proposals, forumStage, snapshotStage, tallyStage, users },
    casing: "snake_case",
  });

  try {
    // Create 3 proposals at different stages
    const [proposal1, proposal2, proposal3] = await db
      .insert(proposals)
      .values([
        {
          title: "Update Security Council Process",
          author_name: "Security Council",
          category: "Constitutional",
        },
        {
          title: "Gaming Catalyst Program",
          author_name: "Gaming DAO",
          category: "Treasury",
        },
        {
          title: "Ecosystem Growth Initiative",
          author_name: "Ecosystem Team",
          category: "Non-Constitutional",
        },
      ])
      .returning();

    // Proposal 1: forum + snapshot + tally
    await db.insert(forumStage).values({
      proposal_id: proposal1.id,
      original_id: "123",
      title: proposal1.title,
      author_name: proposal1.author_name,
      url: "https://forum.example.com/t/update-security-council",
      message_count: 42,
      last_message_at: new Date("2024-01-15"),
    });

    await db.insert(snapshotStage).values({
      proposal_id: proposal1.id,
      snapshot_id: "snap-001",
      title: proposal1.title,
      author_name: proposal1.author_name,
      url: "https://snapshot.org/#/arbitrumfoundation.eth/proposal/0x123",
      status: "passed",
      voting_start: new Date("2024-01-20"),
      voting_end: new Date("2024-01-27"),
      options: [
        { optionId: "1", label: "For", votes: "1000000", voters: 150 },
        { optionId: "2", label: "Against", votes: "50000", voters: 20 },
      ] as unknown as object,
    });

    await db.insert(tallyStage).values({
      proposal_id: proposal1.id,
      tally_proposal_id: "tally-001",
      title: proposal1.title,
      author_name: proposal1.author_name,
      url: "https://www.tally.xyz/gov/arbitrum/proposal/1",
      status: "executed",
      start_timestamp: new Date("2024-01-28"),
      end_timestamp: new Date("2024-02-04"),
      options: [
        { optionId: 1, label: "For", votes: "2000000", voters: 200 },
        { optionId: 0, label: "Against", votes: "100000", voters: 30 },
      ] as unknown as object,
    });

    // Proposal 2: forum + snapshot only
    await db.insert(forumStage).values({
      proposal_id: proposal2.id,
      original_id: "456",
      title: proposal2.title,
      author_name: proposal2.author_name,
      url: "https://forum.example.com/t/gaming-catalyst",
      message_count: 15,
      last_message_at: new Date("2024-02-10"),
    });

    await db.insert(snapshotStage).values({
      proposal_id: proposal2.id,
      snapshot_id: "snap-002",
      title: proposal2.title,
      author_name: proposal2.author_name,
      url: "https://snapshot.org/#/arbitrumfoundation.eth/proposal/0x456",
      status: "active",
      voting_start: new Date("2024-02-15"),
      voting_end: new Date("2024-02-22"),
      options: [
        { optionId: "1", label: "For", votes: "500000", voters: 75 },
        { optionId: "2", label: "Against", votes: "300000", voters: 45 },
      ] as unknown as object,
    });

    // Proposal 3: forum only
    await db.insert(forumStage).values({
      proposal_id: proposal3.id,
      original_id: "789",
      title: proposal3.title,
      author_name: proposal3.author_name,
      url: "https://forum.example.com/t/ecosystem-growth",
      message_count: 8,
      last_message_at: new Date("2024-02-18"),
    });

    // Seed admin users
    const adminAddresses = [
      "0x55b9CB0bCf56057010b9c471e7D42d60e1111EEa", // shiv
      "0x24a81Ca18B220388563fBD751ac0b911a17a3Bc3", // deployer carletex
    ];

    for (const address of adminAddresses) {
      await db
        .insert(users)
        .values({
          address: address.toLowerCase(),
          isAdmin: true,
        })
        .onConflictDoNothing();
    }
    console.log(`✅ Seeded ${adminAddresses.length} admin user(s)`);

    console.log("✅ Database seeded successfully");
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
