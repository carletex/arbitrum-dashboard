// Vector Store Configuration using LlamaIndex PGVectorStore
import { RAG_CONFIG } from "./config";
import { PGVectorStore } from "@llamaindex/postgres";

// Parse connection string to get individual parameters
function parseConnectionString(connString: string) {
  const url = new URL(connString);
  return {
    host: url.hostname,
    port: parseInt(url.port) || 5432,
    database: url.pathname.slice(1), // Remove leading "/"
    user: url.username,
    password: url.password,
    ssl: connString.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  };
}

let vectorStoreInstance: PGVectorStore | null = null;

/**
 * Get or create the PGVectorStore instance.
 * Uses connection pooling for efficiency.
 */
export function getVectorStore(): PGVectorStore {
  if (vectorStoreInstance) {
    return vectorStoreInstance;
  }

  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) {
    throw new Error("POSTGRES_URL environment variable is required");
  }

  const clientConfig = parseConnectionString(postgresUrl);

  vectorStoreInstance = new PGVectorStore({
    clientConfig,
    dimensions: RAG_CONFIG.embeddingDimensions,
    tableName: RAG_CONFIG.vectorTableName,
  });

  return vectorStoreInstance;
}

/**
 * Initialize the vector store - creates tables and indexes if needed.
 * Should be called before first use.
 */
export async function initializeVectorStore(): Promise<void> {
  const vectorStore = getVectorStore();

  // Set a collection name for this use case
  vectorStore.setCollection("arbitrum-proposals");

  console.log("Vector store initialized with collection: arbitrum-proposals");
}

/**
 * Clear all vectors from the store.
 * Useful for full re-ingestion.
 */
export async function clearVectorStore(): Promise<void> {
  const vectorStore = getVectorStore();
  await vectorStore.clearCollection();
  console.log("Vector store collection cleared");
}

/**
 * Close the vector store connection.
 */
export async function closeVectorStore(): Promise<void> {
  if (vectorStoreInstance) {
    // PGVectorStore doesn't expose a close method, but we reset the instance
    vectorStoreInstance = null;
  }
}
