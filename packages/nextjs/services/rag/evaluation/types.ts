// Evaluation Pipeline Types

/** A test case for evaluating RAG quality */
export type EvalTestQuery = {
  id: string;
  query: string;
  /** Proposal IDs that should appear in retrieved results */
  expectedProposalIds: string[];
  /** Optional reference answer for correctness evaluation */
  referenceAnswer?: string;
  /** Tags for filtering test queries (e.g. "status", "factual", "cross-stage") */
  tags?: string[];
};

/** Normalized result from any LlamaIndex evaluator */
export type LLMEvalResult = {
  score: number;
  passing: boolean;
  feedback: string;
};

/** Per-query retrieval metrics */
export type RetrievalResult = {
  /** Whether any expected proposal ID was in the top-K results */
  hit: boolean;
  /** 1/rank of the first expected proposal ID found (0 if not found) */
  reciprocalRank: number;
  /** Proposal IDs actually retrieved */
  retrievedProposalIds: string[];
};

/** Full evaluation result for a single test query */
export type QueryEvalResult = {
  queryId: string;
  query: string;
  /** RAG-generated answer */
  answer: string;
  citations: { proposal_id: string; stage: string; url: string }[];
  /** LLM evaluator results (absent if retrieval-only mode) */
  faithfulness?: LLMEvalResult;
  relevancy?: LLMEvalResult;
  correctness?: LLMEvalResult;
  /** Retrieval quality metrics */
  retrieval: RetrievalResult;
  /** Wall-clock time in milliseconds */
  durationMs: number;
  /** Error message if the query failed */
  error?: string;
};

/** Aggregate metrics across all test queries */
export type EvalSummary = {
  totalQueries: number;
  successfulQueries: number;
  /** Average faithfulness score (0-1) */
  avgFaithfulness?: number;
  /** Average relevancy score (0-1) */
  avgRelevancy?: number;
  /** Average correctness score (1-5) */
  avgCorrectness?: number;
  /** Pass rates */
  faithfulnessPassRate?: number;
  relevancyPassRate?: number;
  correctnessPassRate?: number;
  /** Retrieval metrics */
  hitRate: number;
  mrr: number;
  /** Estimated OpenAI API cost in USD */
  estimatedCostUsd: number;
  /** Total wall-clock time in milliseconds */
  totalDurationMs: number;
};

/** Top-level evaluation report */
export type EvalReport = {
  timestamp: string;
  gitCommit?: string;
  ragConfig: {
    chatModel: string;
    embeddingModel: string;
    topK: number;
    chunkSize: number;
  };
  options: EvalRunOptions;
  summary: EvalSummary;
  results: QueryEvalResult[];
};

/** CLI flags for configuring an evaluation run */
export type EvalRunOptions = {
  /** Only compute retrieval metrics (no LLM judge calls) */
  retrievalOnly: boolean;
  /** Skip the CorrectnessEvaluator */
  skipCorrectness: boolean;
  /** Path to save JSON report */
  outputPath?: string;
  /** Only run queries matching these tags */
  filterTags?: string[];
  /** Only run queries matching these IDs */
  filterIds?: string[];
  /** Override retrieval top-K */
  topK?: number;
};
