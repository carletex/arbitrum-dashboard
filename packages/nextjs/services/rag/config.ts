// RAG Configuration

// Environment variable defaults
export const RAG_CONFIG = {
  // OpenAI models
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
  chatModel: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",

  // Embedding dimensions for text-embedding-3-small
  embeddingDimensions: 1536,

  // Query defaults
  defaultTopK: Number(process.env.RAG_TOP_K) || 5,
  maxTopK: 20,

  // Timeouts
  timeoutMs: Number(process.env.RAG_TIMEOUT_MS) || 30000,

  // Vector store table name (managed by LlamaIndex)
  vectorTableName: "llamaindex_proposal_vectors",

  // Chunk settings
  chunkSize: 512,
  chunkOverlap: 50,
} as const;

// Validate required environment variables
export function validateRagConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!process.env.OPENAI_API_KEY) {
    errors.push("OPENAI_API_KEY is required");
  }

  if (!process.env.POSTGRES_URL) {
    errors.push("POSTGRES_URL is required for vector store");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
