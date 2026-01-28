// RAG Service - Main exports

export { RAG_CONFIG, validateRagConfig } from "./config";
export {
  createDocumentsFromProposal,
  buildProposalDocumentText,
  computeContentHash,
  generateNodeId,
} from "./documentBuilder";
export { runIngestion, fetchProposalsWithStages } from "./ingestion";
export { queryRag, searchSimilar } from "./retrieval";
export { getVectorStore, initializeVectorStore, clearVectorStore, closeVectorStore } from "./vectorStore";
export type {
  RagQueryInput,
  RagQueryOutput,
  RagCitation,
  IngestionResult,
  ProposalWithStages,
  ProposalStage,
  RagNodeMetadata,
  AllowedStatus,
} from "./types";
export { ALLOWED_STATUSES } from "./types";
