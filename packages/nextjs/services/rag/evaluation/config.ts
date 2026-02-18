// Evaluation Pipeline Configuration

export const EVAL_CONFIG = {
  /** Minimum correctness score to pass (1-5 scale) */
  correctnessThreshold: Number(process.env.EVAL_CORRECTNESS_THRESHOLD) || 4.0,

  /** Max concurrent query evaluations (keep low to avoid rate limits) */
  maxConcurrency: Number(process.env.EVAL_CONCURRENCY) || 1,

  /** Top-K for retrieval evaluation (can be higher than RAG query topK to test recall) */
  retrievalTopK: Number(process.env.EVAL_RETRIEVAL_TOP_K) || 15,

  /** Timeout per query in milliseconds */
  queryTimeoutMs: Number(process.env.EVAL_QUERY_TIMEOUT_MS) || 60000,
} as const;
