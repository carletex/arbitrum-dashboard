// Ingestion Pipeline - Ingest proposals into vector store
import { RAG_CONFIG, validateRagConfig } from "./config";
import { createDocumentsFromProposal } from "./documentBuilder";
import { IngestionResult, ProposalWithStages } from "./types";
import { getVectorStore, initializeVectorStore } from "./vectorStore";
import { OpenAI, OpenAIEmbedding } from "@llamaindex/openai";
import { Document, Settings, VectorStoreIndex, storageContextFromDefaults } from "llamaindex";
import { db } from "~~/services/database/config/postgresClient";
import { forumStage, snapshotStage, tallyStage } from "~~/services/database/config/schema";

/**
 * Fetch all proposals with their stage data from the database.
 */
async function fetchProposalsWithStages(): Promise<ProposalWithStages[]> {
  const proposalRows = await db.query.proposals.findMany({
    with: {
      // Note: We need to use raw SQL since we don't have relations defined
      // TODO: maybe we do have relation setup.
    },
  });

  // Fetch stages separately and join manually
  const forumRows = await db.select().from(forumStage);
  const snapshotRows = await db.select().from(snapshotStage);
  const tallyRows = await db.select().from(tallyStage);

  // Create lookup maps
  const forumMap = new Map(forumRows.filter(f => f.proposal_id).map(f => [f.proposal_id!, f]));
  const snapshotMap = new Map(snapshotRows.filter(s => s.proposal_id).map(s => [s.proposal_id!, s]));
  const tallyMap = new Map(tallyRows.filter(t => t.proposal_id).map(t => [t.proposal_id!, t]));

  // Join proposals with stages
  return proposalRows.map(proposal => ({
    id: proposal.id,
    title: proposal.title,
    author_name: proposal.author_name,
    category: proposal.category,
    created_at: proposal.created_at,
    forum: forumMap.get(proposal.id) || null,
    snapshot: snapshotMap.get(proposal.id) || null,
    tally: tallyMap.get(proposal.id) || null,
  }));
}

/**
 * Configure LlamaIndex Settings with OpenAI models.
 */
function configureSettings(): void {
  Settings.llm = new OpenAI({
    model: RAG_CONFIG.chatModel,
    apiKey: process.env.OPENAI_API_KEY,
  });

  Settings.embedModel = new OpenAIEmbedding({
    model: RAG_CONFIG.embeddingModel,
    apiKey: process.env.OPENAI_API_KEY,
    dimensions: RAG_CONFIG.embeddingDimensions,
  });
}

/**
 * Run the ingestion pipeline.
 * Fetches proposals, builds documents, and stores embeddings.
 */
export async function runIngestion(options?: { clearFirst?: boolean }): Promise<IngestionResult> {
  const result: IngestionResult = {
    success: false,
    totalDocuments: 0,
    newNodes: 0,
    updatedNodes: 0,
    skippedNodes: 0,
    errors: [],
  };

  try {
    // Validate configuration
    const configValidation = validateRagConfig();
    if (!configValidation.valid) {
      result.errors = configValidation.errors;
      return result;
    }

    // Configure LlamaIndex
    configureSettings();

    // Initialize vector store
    await initializeVectorStore();

    const vectorStore = getVectorStore();

    // Optionally clear existing data
    if (options?.clearFirst) {
      await vectorStore.clearCollection();
      console.log("Cleared existing vector data");
    }

    // Fetch proposals
    console.log("Fetching proposals with stages...");
    const proposalsWithStages = await fetchProposalsWithStages();
    console.log(`Found ${proposalsWithStages.length} proposals`);

    if (proposalsWithStages.length === 0) {
      result.success = true;
      result.errors.push("No proposals found to ingest");
      return result;
    }

    // Build documents
    console.log("Building documents...");
    const allDocuments: Document[] = [];

    for (const proposal of proposalsWithStages) {
      try {
        const docs = createDocumentsFromProposal(proposal);
        allDocuments.push(...docs);
      } catch (error) {
        const errorMsg = `Error building document for proposal ${proposal.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    result.totalDocuments = allDocuments.length;
    console.log(`Built ${allDocuments.length} documents`);

    if (allDocuments.length === 0) {
      result.success = true;
      result.errors.push("No documents created from proposals");
      return result;
    }

    // Create storage context with vector store
    const storageContext = await storageContextFromDefaults({
      vectorStore,
    });

    // Build index and ingest documents
    console.log("Ingesting documents into vector store...");
    await VectorStoreIndex.fromDocuments(allDocuments, {
      storageContext,
    });

    // Count as new nodes (LlamaIndex handles deduplication internally)
    result.newNodes = allDocuments.length;
    result.success = true;

    console.log(`Ingestion complete: ${result.newNodes} documents indexed`);

    return result;
  } catch (error) {
    const errorMsg = `Ingestion failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    console.error(errorMsg);
    result.errors.push(errorMsg);
    return result;
  }
}

// Export for use in API routes
export { fetchProposalsWithStages };
