import { PRODUCTION_DATABASE_HOSTNAME, closeDb, getDb } from "./config/postgresClient";
import * as schema from "./config/schema";
import { spawnSync } from "child_process";
import * as dotenv from "dotenv";
import { reset } from "drizzle-seed";
import * as path from "path";
import { join } from "path";

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

// Wipe the database
async function wipe() {
  try {
    if (!process.env.POSTGRES_URL || !process.env.POSTGRES_URL.includes("localhost")) {
      throw new Error("POSTGRES_URL is not set or is not a local database");
    }
    const db = getDb();
    await reset(db, schema);
    console.log("Database reset complete");
  } catch (error) {
    console.error("Error during database reset:", error);
  } finally {
    await closeDb();
    process.exit(0);
  }
}

wipe();
