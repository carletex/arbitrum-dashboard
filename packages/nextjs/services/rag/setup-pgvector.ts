/**
 * Setup script for pgvector extension.
 * Run this once to enable the vector extension in PostgreSQL.
 *
 * Usage: yarn rag:setup
 */
import * as dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: ".env.development" });

async function setupPgVector() {
  const postgresUrl = process.env.POSTGRES_URL;

  if (!postgresUrl) {
    console.error("POSTGRES_URL environment variable is required");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: postgresUrl });

  try {
    console.log("Enabling pgvector extension...");

    // Enable the vector extension
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");

    console.log("✅ pgvector extension enabled successfully");

    // Check if extension is installed
    const result = await pool.query(`
      SELECT extname, extversion 
      FROM pg_extension 
      WHERE extname = 'vector'
    `);

    if (result.rows.length > 0) {
      console.log(`   Version: ${result.rows[0].extversion}`);
    }

    // Run ANALYZE for better query planning (if tables exist)
    console.log("Running ANALYZE for query optimization...");
    await pool.query("ANALYZE");
    console.log("✅ ANALYZE complete");
  } catch (error) {
    console.error("Error setting up pgvector:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }

  console.log("\n🎉 pgvector setup complete!");
  console.log("You can now run ingestion with: yarn rag:ingest");
}

setupPgVector();
