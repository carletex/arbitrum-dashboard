// Ingestion Pipeline - Ingest proposals into vector store
import { RAG_CONFIG, validateRagConfig } from "./config";
import { createDocumentsFromForumStage, createDocumentsFromProposal } from "./documentBuilder";
import { cleanupEncoder, estimateTokens } from "./tokens";
import { IngestionResult, ProposalWithForumContent, ProposalWithStages } from "./types";
import { getVectorStore, initializeVectorStore } from "./vectorStore";
import { OpenAI, OpenAIEmbedding } from "@llamaindex/openai";
import {
  Document,
  SentenceSplitter,
  Settings,
  TextNode,
  VectorStoreIndex,
  storageContextFromDefaults,
} from "llamaindex";
import { db } from "~~/services/database/config/postgresClient";
import { forumStage, snapshotStage, tallyStage } from "~~/services/database/config/schema";
import { ForumPostsArraySchema } from "~~/services/forum/types";

// Chunking configuration
const CHUNK_SIZE = 512; // tokens
const CHUNK_OVERLAP = 50; // tokens

/**
 * Fetch all proposals with their stage data from the database.
 * Performs manual joins since relations aren't defined in schema.
 */
async function fetchProposalsWithStages(): Promise<ProposalWithStages[]> {
  const proposalRows = await db.query.proposals.findMany();

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
 * Fetch proposals with forum content (posts_json) for RAG ingestion.
 */
async function fetchProposalsWithForumContent(): Promise<ProposalWithForumContent[]> {
  const proposalRows = await db.query.proposals.findMany();
  const forumRows = await db.select().from(forumStage);

  const results: ProposalWithForumContent[] = [];

  for (const proposal of proposalRows) {
    const forum = forumRows.find(f => f.proposal_id === proposal.id);

    // Skip if no forum stage or no posts
    if (!forum || !forum.posts_json) continue;

    // Validate posts_json
    const validation = ForumPostsArraySchema.safeParse(forum.posts_json);
    if (!validation.success) {
      console.warn(`Invalid posts_json for proposal ${proposal.id}`);
      continue;
    }

    // Skip if no posts or fetch failed
    if (validation.data.length === 0 || forum.content_fetch_status === "failed") continue;

    results.push({
      id: proposal.id,
      title: proposal.title,
      author_name: proposal.author_name,
      category: proposal.category,
      created_at: proposal.created_at,
      forum: {
        id: forum.id,
        original_id: forum.original_id,
        title: forum.title,
        author_name: forum.author_name,
        url: forum.url,
        message_count: forum.message_count,
        last_message_at: forum.last_message_at,
        posts: validation.data,
      },
    });
  }

  return results;
}

/**
 * Configure LlamaIndex Settings with OpenAI models.
 */
function configureSettings(): void {
  Settings.llm = new OpenAI({
    model: RAG_CONFIG.chatModel,
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 1, // gpt-5-mini only supports temperature=1
  });

  Settings.embedModel = new OpenAIEmbedding({
    model: RAG_CONFIG.embeddingModel,
    apiKey: process.env.OPENAI_API_KEY,
    dimensions: RAG_CONFIG.embeddingDimensions,
  });
}

/**
 * Chunk forum documents using SentenceSplitter.
 * Only chunks posts that exceed the token threshold.
 * Returns TextNode[] ready for vector store insertion.
 */
async function chunkForumDocuments(documents: Document[]): Promise<TextNode[]> {
  const splitter = new SentenceSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  const allNodes: TextNode[] = [];

  for (const doc of documents) {
    const tokenCount = estimateTokens(doc.text);
    const nodes = await splitter.getNodesFromDocuments([doc]);

    // Add chunk metadata for multi-chunk posts
    if (tokenCount > CHUNK_SIZE && nodes.length > 1) {
      for (let idx = 0; idx < nodes.length; idx++) {
        nodes[idx].metadata.chunk_index = idx;
        nodes[idx].metadata.total_chunks = nodes.length;
      }
    }

    allNodes.push(...nodes);
  }

  return allNodes;
}

/**
 * Run the ingestion pipeline.
 * Fetches proposals, builds documents (metadata + forum content), chunks them, and stores embeddings.
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

    // ========== PHASE 1: Proposal Metadata Documents ==========
    console.log("\n=== Phase 1: Proposal Metadata ===");
    const proposalsWithStages = await fetchProposalsWithStages();
    console.log(`Found ${proposalsWithStages.length} proposals`);

    const metadataDocuments: Document[] = [];
    for (const proposal of proposalsWithStages) {
      try {
        const docs = createDocumentsFromProposal(proposal);
        metadataDocuments.push(...docs);
      } catch (error) {
        const errorMsg = `Error building metadata document for proposal ${proposal.id}: ${error instanceof Error ? error.message : "Unknown"}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }
    console.log(`Built ${metadataDocuments.length} metadata documents`);

    // ========== PHASE 2: Forum Content Documents ==========
    console.log("\n=== Phase 2: Forum Content ===");
    const proposalsWithContent = await fetchProposalsWithForumContent();
    console.log(`Found ${proposalsWithContent.length} proposals with forum content`);

    const forumDocuments: Document[] = [];
    let totalPosts = 0;
    for (const proposal of proposalsWithContent) {
      try {
        const docs = createDocumentsFromForumStage(proposal);
        forumDocuments.push(...docs);
        totalPosts += proposal.forum.posts.length;
      } catch (error) {
        const errorMsg = `Error building forum documents for proposal ${proposal.id}: ${error instanceof Error ? error.message : "Unknown"}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }
    console.log(`Built ${forumDocuments.length} forum documents from ${totalPosts} posts`);

    // ========== PHASE 3: Chunk Forum Content ==========
    console.log("\n=== Phase 3: Chunking ===");
    let forumNodes: TextNode[] = [];
    if (forumDocuments.length > 0) {
      console.log(
        `Chunking ${forumDocuments.length} forum documents (chunk_size=${CHUNK_SIZE}, overlap=${CHUNK_OVERLAP})...`,
      );
      forumNodes = await chunkForumDocuments(forumDocuments);
      console.log(`Created ${forumNodes.length} chunks from forum content`);
    } else {
      console.log("No forum documents to chunk");
    }

    // ========== PHASE 4: Ingest All Documents ==========
    console.log("\n=== Phase 4: Ingestion ===");

    result.totalDocuments = metadataDocuments.length + forumDocuments.length;

    if (metadataDocuments.length === 0 && forumNodes.length === 0) {
      result.success = true;
      result.errors.push("No documents to ingest");
      return result;
    }

    // Create storage context with vector store
    const storageContext = await storageContextFromDefaults({
      vectorStore,
    });

    // Ingest metadata documents (these are small, no chunking needed)
    if (metadataDocuments.length > 0) {
      console.log(`Ingesting ${metadataDocuments.length} metadata documents...`);
      await VectorStoreIndex.fromDocuments(metadataDocuments, { storageContext });
    }

    // Ingest chunked forum nodes - need to embed them first
    if (forumNodes.length > 0) {
      console.log(`Embedding ${forumNodes.length} forum content chunks...`);

      // Generate embeddings for all forum nodes
      const embedModel = Settings.embedModel;
      const batchSize = 100; // Process in batches to avoid memory issues

      for (let i = 0; i < forumNodes.length; i += batchSize) {
        const batch = forumNodes.slice(i, i + batchSize);
        const texts = batch.map(node => node.getContent(undefined));

        // Filter out empty or whitespace-only texts (OpenAI API requirement)
        const validIndices: number[] = [];
        const validTexts: string[] = [];

        for (let j = 0; j < texts.length; j++) {
          const text = texts[j]?.trim();
          if (text && text.length > 0) {
            validIndices.push(j);
            validTexts.push(texts[j]);
          } else {
            console.warn(`Skipping empty content for node at index ${i + j}`);
          }
        }

        // Only embed if we have valid texts
        if (validTexts.length > 0) {
          const embeddings = await embedModel.getTextEmbeddingsBatch(validTexts);

          // Assign embeddings back to their corresponding nodes
          for (let k = 0; k < validIndices.length; k++) {
            batch[validIndices[k]].embedding = embeddings[k];
          }
        }

        // Progress indicator
        const progress = Math.min(i + batchSize, forumNodes.length);
        process.stdout.write(`\r  Embedded ${progress}/${forumNodes.length} chunks`);
      }
      console.log(""); // New line after progress

      // Filter out nodes without embeddings before ingesting
      const validNodes = forumNodes.filter(node => node.embedding && node.embedding.length > 0);

      if (validNodes.length < forumNodes.length) {
        console.warn(`Skipped ${forumNodes.length - validNodes.length} nodes with empty content`);
      }

      console.log(`Ingesting ${validNodes.length} forum content chunks...`);

      // Batch insert to avoid PostgreSQL parameter limits
      // Each node has ~1540 params (embedding dimensions + metadata)
      // PostgreSQL limit is 65535 params, so we use batches of 40 nodes
      const insertBatchSize = 40;

      for (let i = 0; i < validNodes.length; i += insertBatchSize) {
        const batch = validNodes.slice(i, i + insertBatchSize);
        await vectorStore.add(batch);

        // Progress indicator
        const progress = Math.min(i + insertBatchSize, validNodes.length);
        process.stdout.write(`\r  Ingested ${progress}/${validNodes.length} chunks`);
      }
      console.log(""); // New line after progress
    }

    result.newNodes = metadataDocuments.length + forumNodes.length;
    result.success = true;

    console.log(`\n✓ Ingestion complete!`);
    console.log(`  - Metadata documents: ${metadataDocuments.length}`);
    console.log(`  - Forum posts: ${forumDocuments.length}`);
    console.log(`  - Forum chunks: ${forumNodes.length}`);
    console.log(`  - Total nodes indexed: ${result.newNodes}`);

    return result;
  } catch (error) {
    const errorMsg = `Ingestion failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    console.error(errorMsg);
    result.errors.push(errorMsg);
    return result;
  } finally {
    // Cleanup encoder to free memory
    cleanupEncoder();
  }
}

/**
 * Ingest forum documents for a single proposal with smart chunking.
 * Only chunks posts that exceed the token threshold.
 */
export async function ingestForumDocuments(
  proposal: ProposalWithForumContent,
): Promise<{ created: number; chunks: number }> {
  const result = { created: 0, chunks: 0 };

  if (!proposal.forum?.posts?.length) {
    return result;
  }

  // Ensure settings are configured
  configureSettings();

  // Create documents using the helper
  const documents = createDocumentsFromForumStage(proposal);
  if (documents.length === 0) return result;

  const nodes = await chunkForumDocuments(documents);

  // Store in vector store
  if (nodes.length > 0) {
    const vectorStore = getVectorStore();
    await vectorStore.add(nodes);
  }

  result.created = documents.length;
  result.chunks = nodes.length;

  // Cleanup encoder to free memory
  cleanupEncoder();

  return result;
}

// Export for use in API routes
export { fetchProposalsWithStages, fetchProposalsWithForumContent };
