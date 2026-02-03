// Document Builder - Creates canonical documents from proposals
import { ProposalWithForumContent, ProposalWithStages, RagNodeMetadata } from "./types";
import { createHash } from "crypto";
import { Document } from "llamaindex";

/**
 * Build a canonical document text from a proposal with its stages.
 * Following the plan: Title, author, category + stage metadata + URLs (no body in v1).
 */
export function buildProposalDocumentText(proposal: ProposalWithStages): string {
  const lines: string[] = [];

  // Proposal header
  lines.push(`# ${proposal.title}`);
  lines.push("");

  if (proposal.author_name) {
    lines.push(`**Author:** ${proposal.author_name}`);
  }
  if (proposal.category) {
    lines.push(`**Category:** ${proposal.category}`);
  }
  if (proposal.created_at) {
    lines.push(`**Created:** ${proposal.created_at.toISOString().split("T")[0]}`);
  }
  lines.push("");

  // Forum stage metadata
  if (proposal.forum) {
    lines.push("## Forum Discussion");
    if (proposal.forum.title) {
      lines.push(`**Title:** ${proposal.forum.title}`);
    }
    if (proposal.forum.author_name) {
      lines.push(`**Forum Author:** ${proposal.forum.author_name}`);
    }
    if (proposal.forum.url) {
      lines.push(`**Forum URL:** ${proposal.forum.url}`);
    }
    if (proposal.forum.message_count) {
      lines.push(`**Messages:** ${proposal.forum.message_count}`);
    }
    if (proposal.forum.last_message_at) {
      lines.push(`**Last Activity:** ${proposal.forum.last_message_at.toISOString().split("T")[0]}`);
    }
    lines.push("");
  }

  // Snapshot stage metadata
  if (proposal.snapshot) {
    lines.push("## Snapshot Vote");
    if (proposal.snapshot.title) {
      lines.push(`**Title:** ${proposal.snapshot.title}`);
    }
    if (proposal.snapshot.author_name) {
      lines.push(`**Snapshot Author:** ${proposal.snapshot.author_name}`);
    }
    if (proposal.snapshot.url) {
      lines.push(`**Snapshot URL:** ${proposal.snapshot.url}`);
    }
    if (proposal.snapshot.status) {
      lines.push(`**Status:** ${proposal.snapshot.status}`);
    }
    if (proposal.snapshot.voting_start) {
      lines.push(`**Voting Start:** ${proposal.snapshot.voting_start.toISOString().split("T")[0]}`);
    }
    if (proposal.snapshot.voting_end) {
      lines.push(`**Voting End:** ${proposal.snapshot.voting_end.toISOString().split("T")[0]}`);
    }
    if (proposal.snapshot.options && Array.isArray(proposal.snapshot.options)) {
      lines.push(`**Options:** ${proposal.snapshot.options.join(", ")}`);
    }
    lines.push("");
  }

  // Tally stage metadata
  if (proposal.tally) {
    lines.push("## Tally On-chain Vote");
    if (proposal.tally.title) {
      lines.push(`**Title:** ${proposal.tally.title}`);
    }
    if (proposal.tally.author_name) {
      lines.push(`**Tally Author:** ${proposal.tally.author_name}`);
    }
    if (proposal.tally.url) {
      lines.push(`**Tally URL:** ${proposal.tally.url}`);
    }
    if (proposal.tally.onchain_id) {
      lines.push(`**On-chain ID:** ${proposal.tally.onchain_id}`);
    }
    if (proposal.tally.status) {
      lines.push(`**Status:** ${proposal.tally.status}`);
    }
    if (proposal.tally.substatus) {
      lines.push(`**Substatus:** ${proposal.tally.substatus}`);
    }
    if (proposal.tally.substatus_deadline) {
      lines.push(`**Deadline:** ${proposal.tally.substatus_deadline.toISOString().split("T")[0]}`);
    }
    if (proposal.tally.start_timestamp) {
      lines.push(`**Start:** ${proposal.tally.start_timestamp.toISOString().split("T")[0]}`);
    }
    if (proposal.tally.end_timestamp) {
      lines.push(`**End:** ${proposal.tally.end_timestamp.toISOString().split("T")[0]}`);
    }
    if (proposal.tally.options && Array.isArray(proposal.tally.options)) {
      lines.push(`**Options:** ${proposal.tally.options.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Compute a content hash for idempotency checking.
 * Returns first 16 chars of SHA256 hash.
 */
export function computeContentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/**
 * Generate a deterministic node ID.
 * Format: ${proposal_id}__${stage}__${post_number}
 * Uses double underscore separator (unlikely in UUIDs).
 */
export function generateNodeId(proposalId: string, stage: string, postNumber: number): string {
  return `${proposalId}__${stage}__${postNumber}`;
}

/**
 * Create LlamaIndex Document from a proposal with stages.
 * Creates one document per stage that has data.
 */
export function createDocumentsFromProposal(proposal: ProposalWithStages): Document[] {
  const documents: Document[] = [];
  const baseText = buildProposalDocumentText(proposal);

  // Process forum stage
  if (proposal.forum) {
    const contentHash = computeContentHash(baseText + "forum");
    const metadata: RagNodeMetadata = {
      proposal_id: proposal.id,
      stage: "forum",
      status: "",
      url: proposal.forum.url || "",
      source_id: proposal.forum.original_id || "",
      chunk_index: 0,
      content_hash: contentHash,
    };

    documents.push(
      new Document({
        text: baseText,
        id_: generateNodeId(proposal.id, "forum", 0),
        metadata,
      }),
    );
  }

  // Process snapshot stage
  if (proposal.snapshot) {
    const contentHash = computeContentHash(baseText + "snapshot");
    const metadata: RagNodeMetadata = {
      proposal_id: proposal.id,
      stage: "snapshot",
      status: (proposal.snapshot.status || "").toLowerCase(),
      url: proposal.snapshot.url || "",
      source_id: proposal.snapshot.snapshot_id || "",
      chunk_index: 0,
      content_hash: contentHash,
    };

    documents.push(
      new Document({
        text: baseText,
        id_: generateNodeId(proposal.id, "snapshot", 0),
        metadata,
      }),
    );
  }

  // Process tally stage
  if (proposal.tally) {
    const contentHash = computeContentHash(baseText + "tally");
    const metadata: RagNodeMetadata = {
      proposal_id: proposal.id,
      stage: "tally",
      status: (proposal.tally.status || "").toLowerCase(),
      url: proposal.tally.url || "",
      source_id: proposal.tally.tally_proposal_id || "",
      chunk_index: 0,
      content_hash: contentHash,
    };

    documents.push(
      new Document({
        text: baseText,
        id_: generateNodeId(proposal.id, "tally", 0),
        metadata,
      }),
    );
  }

  // If no stages have data, create a single document with minimal info
  if (documents.length === 0) {
    const contentHash = computeContentHash(baseText);
    const metadata: RagNodeMetadata = {
      proposal_id: proposal.id,
      stage: "forum",
      status: "",
      url: "",
      source_id: "",
      chunk_index: 0,
      content_hash: contentHash,
    };

    documents.push(
      new Document({
        text: baseText,
        id_: generateNodeId(proposal.id, "forum", 0),
        metadata,
      }),
    );
  }

  return documents;
}

/**
 * Create LlamaIndex Documents from forum posts for a proposal.
 * Creates one document per post (not mega-documents) with stable IDs.
 */
export function createDocumentsFromForumStage(proposal: ProposalWithForumContent): Document[] {
  const documents: Document[] = [];

  if (!proposal.forum?.posts || proposal.forum.posts.length === 0) {
    return documents;
  }

  for (const post of proposal.forum.posts) {
    // Skip deleted posts
    if (post.is_deleted) continue;

    // Skip posts with empty or whitespace-only content
    const content = post.content?.trim();
    if (!content || content.length === 0) {
      console.warn(`Skipping empty content for post ${post.post_number} in proposal ${proposal.id}`);
      continue;
    }

    const metadata: RagNodeMetadata = {
      proposal_id: proposal.id,
      stage: "forum",
      status: "",
      url: `${proposal.forum.url}/${post.post_number}`,
      source_id: proposal.forum.original_id || "",
      post_number: post.post_number,
      author_name: post.author_name,
      author_username: post.author_username,
      content_type: post.post_number === 1 ? "original" : "comment",
      posted_at: post.posted_at,
      reply_to_post_number: post.reply_to_post_number,
    };

    documents.push(
      new Document({
        id_: generateNodeId(proposal.id, "forum", post.post_number),
        text: content,
        metadata,
      }),
    );
  }

  return documents;
}
