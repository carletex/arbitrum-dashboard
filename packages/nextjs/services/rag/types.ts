// RAG Service Types

export type ProposalStage = "forum" | "snapshot" | "tally";

// Metadata schema for each node in the vector store
export interface RagNodeMetadata {
  proposal_id: string;
  stage: ProposalStage;
  status: string;
  url: string;
  source_id: string; // snapshot_id or forum original_id
  chunk_index: number;
  content_hash: string;
}

// Input for RAG queries
export interface RagQueryInput {
  query: string;
  filters?: {
    stage?: ProposalStage[];
    status?: string[];
  };
  topK?: number;
}

// Citation returned with answers
export interface RagCitation {
  proposal_id: string;
  stage: ProposalStage;
  url: string;
  snippet: string;
  title?: string;
}

// Output from RAG queries
export interface RagQueryOutput {
  answer: string;
  citations: RagCitation[];
}

// Ingestion result
export interface IngestionResult {
  success: boolean;
  totalDocuments: number;
  newNodes: number;
  updatedNodes: number;
  skippedNodes: number;
  errors: string[];
}

// Proposal with all stages for document building
export interface ProposalWithStages {
  id: string;
  title: string;
  author_name: string | null;
  category: string | null;
  created_at: Date | null;
  forum?: {
    id: string;
    original_id: string | null;
    title: string | null;
    author_name: string | null;
    url: string | null;
    message_count: number | null;
    last_message_at: Date | null;
  } | null;
  snapshot?: {
    id: string;
    snapshot_id: string | null;
    title: string | null;
    author_name: string | null;
    url: string | null;
    status: string | null;
    voting_start: Date | null;
    voting_end: Date | null;
    options: unknown;
  } | null;
  tally?: {
    id: string;
    tally_proposal_id: string | null;
    title: string | null;
    author_name: string | null;
    url: string | null;
    onchain_id: string | null;
    status: string | null;
    substatus: string | null;
    substatus_deadline: Date | null;
    start_timestamp: Date | null;
    end_timestamp: Date | null;
    options: unknown;
  } | null;
}

// Allowed status values for filtering
export const ALLOWED_STATUSES = [
  "active",
  "closed",
  "pending",
  "executed",
  "defeated",
  "queued",
  "canceled",
  "expired",
] as const;

export type AllowedStatus = (typeof ALLOWED_STATUSES)[number];
