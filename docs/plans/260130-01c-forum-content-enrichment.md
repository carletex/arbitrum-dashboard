# Proposal RAG with Forum Content Enrichment – Final Spec (260130-01c)

**Status**: Final Iteration (Carlos-Approved)  
**Date**: 2026-01-30  
**Goal**: Enrich the RAG corpus with forum post bodies and comments, with proper pagination, change detection, and error handling.

---

## Executive Summary

This spec extends the existing Proposal RAG system to fetch and search forum post content (original posts + all comments). Key design decisions:

1. **Storage**: Extend `forum_stage` table with `posts_json` (one array, OP + comments)
2. **Change detection**: Compare `posts_count` + `last_posted_at` (no hashing)
3. **Documents**: Per-post Documents (not mega-documents) with stable IDs
4. **Chunking**: Smart chunking only for posts >512 tokens
5. **Error handling**: `fetch_status`, `fetch_error_log`, retry with backoff

---

## Requirements (Confirmed)

- **Content scope**: Original post + ALL replies (full discussion)
- **Update strategy**: Smart diff via post count + activity timestamp
- **Format**: Cleaned plain text (markdown → text)
- **Data volume**: 100-500 proposals, ~10-30 posts each
- **Storage**: Extend existing `forum_stage` table only
- **Latency target**: <5s for "who suggested X" queries

---

## Data Model

### Database Schema

```typescript
// packages/nextjs/services/database/config/schema.ts
export const forumStage = pgTable("forum_stage", {
  // Existing fields (unchanged)
  id: uuid("id").defaultRandom().primaryKey(),
  original_id: varchar("original_id", { length: 255 }),
  proposal_id: uuid("proposal_id")
    .references(() => proposals.id, { onDelete: "set null" })
    .unique(),
  title: text("title"),
  author_name: varchar("author_name", { length: 255 }),
  url: text("url"),
  message_count: integer("message_count").default(0),
  last_message_at: timestamp("last_message_at"),
  updated_at: timestamp("updated_at").defaultNow(),

  // Content fields
  posts_json: jsonb("posts_json").$type<ForumPost[]>(),
  content_fetched_at: timestamp("content_fetched_at"),
  content_fetch_status: varchar("content_fetch_status", { length: 20 }).default(
    "pending",
  ), // pending | success | failed | partial
  last_fetched_post_count: integer("last_fetched_post_count"),
  fetch_error_log: text("fetch_error_log"),
  fetch_retry_count: integer("fetch_retry_count").default(0),
  next_fetch_attempt: timestamp("next_fetch_attempt"),
});
```

**Field explanations:**

- `posts_json`: Array of all posts (OP is post_number=1, comments are 2+)
- `content_fetch_status`: State machine for operational visibility
- `fetch_retry_count` + `next_fetch_attempt`: Dead letter queue mechanism

### Types

```typescript
// packages/nextjs/services/forum/types.ts

import { z } from "zod";

export const ForumPostSchema = z.object({
  id: z.number(),
  post_number: z.number(),
  author_name: z.string(),
  author_username: z.string(),
  content: z.string().max(50000),
  posted_at: z.string().datetime(),
  reply_to_post_number: z.number().optional(),
  is_deleted: z.boolean().optional(),
});

export const ForumPostsArraySchema = z.array(ForumPostSchema);

export type ForumPost = z.infer<typeof ForumPostSchema>;

// RAG metadata (extends Record for LlamaIndex compatibility)
export type RagNodeMetadata = Record<string, unknown> & {
  proposal_id: string;
  stage: "forum" | "snapshot" | "tally";
  status: string;
  url: string;
  source_id: string;
  post_number?: number;
  author_name?: string;
  author_username?: string;
  content_type?: "original" | "comment";
  posted_at?: string;
  chunk_index?: number;
  total_chunks?: number;
};
```

---

## Content Fetching

### Discourse API Integration

**Endpoints:**

- `GET /t/{topic_id}.json` - Topic + first 20 posts
- `GET /t/{topic_id}/posts.json?post_ids[]={id1}&post_ids[]={id2}...` - Specific posts

**Rate limits:**

- Anonymous: 60 req/min
- Registered: 600 req/min
- Our target: 10 req/sec (100ms delay, safely under limit)

### Implementation

```typescript
// packages/nextjs/services/forum/content.ts

const FORUM_URL = "https://forum.arbitrum.foundation";
const REQUEST_DELAY = 100; // 10 req/sec
const BATCH_SIZE = 20; // Discourse max
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const MAX_FETCH_RETRIES = 5; // For dead letter tracking

// Zod schemas for API validation
const DiscoursePostSchema = z.object({
  id: z.number(),
  post_number: z.number(),
  username: z.string(),
  name: z.string().nullable(),
  raw: z.string(),
  cooked: z.string(),
  created_at: z.string(),
  updated_at: z.string().optional(),
  reply_to_post_number: z.number().nullable(),
});

const DiscourseTopicSchema = z.object({
  id: z.number(),
  title: z.string(),
  posts_count: z.number(),
  last_posted_at: z.string(),
  post_stream: z.object({
    posts: z.array(DiscoursePostSchema),
    stream: z.array(z.number()),
  }),
});

export type FetchContentResult = {
  posts: ForumPost[];
  topic: z.infer<typeof DiscourseTopicSchema>;
  fetchedCount: number;
  failedBatches: number;
};

export async function fetchTopicContent(
  topicId: number,
  options?: { skipShortComments?: boolean },
): Promise<FetchContentResult> {
  const result: FetchContentResult = {
    posts: [],
    topic: null as any,
    fetchedCount: 0,
    failedBatches: 0,
  };

  try {
    // 1. Fetch topic + first batch
    const topicRes = await fetchWithRetry(
      `${FORUM_URL}/t/${topicId}.json`,
      MAX_RETRIES,
    );

    if (!topicRes.ok) {
      throw new Error(`HTTP ${topicRes.status}`);
    }

    const rawData = await topicRes.json();
    const topicData = DiscourseTopicSchema.parse(rawData);
    result.topic = topicData;

    let allPosts = [...topicData.post_stream.posts];
    const stream = topicData.post_stream.stream;

    // 2. Fetch remaining posts in batches
    const remainingIds = stream.slice(allPosts.length);

    for (let i = 0; i < remainingIds.length; i += BATCH_SIZE) {
      const batch = remainingIds.slice(i, i + BATCH_SIZE);
      const idsParam = batch.map((id) => `post_ids[]=${id}`).join("&");

      try {
        const batchRes = await fetchWithRetry(
          `${FORUM_URL}/t/${topicId}/posts.json?${idsParam}`,
          MAX_RETRIES,
        );

        if (batchRes.ok) {
          const batchData = await batchRes.json();
          allPosts.push(...batchData.post_stream.posts);
        } else {
          console.warn(`Batch failed: HTTP ${batchRes.status}`);
          result.failedBatches++;
        }
      } catch (error) {
        console.error(`Batch error:`, error);
        result.failedBatches++;
      }

      await sleep(REQUEST_DELAY);
    }

    // 3. Clean and transform
    result.posts = await Promise.all(
      allPosts
        .filter((post) => {
          // Skip short comments to reduce noise
          if (options?.skipShortComments && post.post_number > 1) {
            return post.raw.length >= 50;
          }
          return true;
        })
        .map(async (post) => ({
          id: post.id,
          post_number: post.post_number,
          author_name: post.name || post.username,
          author_username: post.username,
          content: await cleanForumContent(post.raw),
          posted_at: post.created_at,
          reply_to_post_number: post.reply_to_post_number || undefined,
        })),
    );

    result.fetchedCount = result.posts.length;
    return result;
  } catch (error) {
    throw new Error(
      `Failed to fetch topic ${topicId}: ${error instanceof Error ? error.message : "Unknown"}`,
    );
  }
}

async function fetchWithRetry(
  url: string,
  maxRetries: number,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url);

      // Handle rate limit (429) with exponential backoff
      if (res.status === 429) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(
          `Rate limited, retry ${attempt}/${maxRetries} in ${delay}ms`,
        );
        await sleep(delay);
        continue;
      }

      return res;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError || new Error(`Failed after ${maxRetries} retries`);
}
```

### Content Cleaning

```typescript
// packages/nextjs/services/forum/content.ts

import removeMarkdown from "remove-markdown";

const MAX_CONTENT_LENGTH = 50000;
const TRUNCATION_MARKER = "\n\n[... content truncated]";

async function cleanForumContent(rawMarkdown: string): Promise<string> {
  // 1. Remove Discourse-specific syntax
  let cleaned = rawMarkdown
    // Remove quotes (including nested)
    .replace(/\[quote=[^\]]*\][\s\S]*?\[\/quote\]/g, " ")
    // Remove polls
    .replace(/\[poll[^\]]*\][\s\S]*?\[\/poll\]/g, "[poll]")
    // Remove oneboxes
    .replace(/\[https?:\/\/[^\]]+\]/g, "[link]")
    // Remove spoilers
    .replace(/\[spoiler\][\s\S]*?\[\/spoiler\]/g, "[spoiler]")
    // Remove details
    .replace(/\[details=[^\]]*\][\s\S]*?\[\/details\]/g, "[details]");

  // 2. Convert markdown to plain text
  let text = removeMarkdown(cleaned, {
    stripListLeaders: true,
    listUnicodeChar: "",
    gfm: true,
  });

  // 3. Clean up whitespace
  text = text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+/g, " ")
    .trim();

  // 4. Enforce length limit
  if (text.length > MAX_CONTENT_LENGTH) {
    text = text.substring(0, MAX_CONTENT_LENGTH) + TRUNCATION_MARKER;
  }

  return text;
}
```

**Why `remove-markdown`:**

- Lightweight, battle-tested library
- Handles GFM (tables, strikethrough, etc.)
- No AST overhead, just regex-based cleanup
- Simpler than unified/remark ecosystem for this use case

---

## Import Integration

### Smart Change Detection

```typescript
// packages/nextjs/services/forum/import.ts

export async function maybeUpdateForumContent(
  forumStage: ForumStage,
  topic: Topic,
): Promise<boolean> {
  // Never fetched - definitely need to fetch
  if (!forumStage.content_fetched_at) {
    return true;
  }

  // Check if new posts were added
  if (topic.posts_count !== forumStage.last_fetched_post_count) {
    return true;
  }

  // Check if there's been activity (new posts or edits)
  const lastFetched = new Date(forumStage.content_fetched_at).getTime();
  const lastActivity = new Date(topic.last_posted_at).getTime();

  if (lastActivity > lastFetched) {
    return true; // Could be edits or deleted posts
  }

  // Debounce: Don't refetch within 1 hour if previous fetch succeeded
  const hoursSinceFetch = (Date.now() - lastFetched) / (1000 * 60 * 60);
  if (hoursSinceFetch < 1 && forumStage.content_fetch_status === "success") {
    return false;
  }

  return false;
}
```

### Dead Letter Queue Logic

```typescript
export async function importForumPosts() {
  const existingIds = await getAllOriginalIds();

  for (let page = 0; page <= MAX_PAGES; page++) {
    const data = await fetchForumPostsFromAPI(page);
    const topics = data.topic_list?.topics ?? [];

    if (topics.length === 0) break;

    for (const topic of topics) {
      const isNew = !existingIds.includes(topic.id.toString());

      if (isNew) {
        const forumStage = await createProposalAndForumStage(topic, users);
        await fetchAndStoreForumContent(forumStage.id, topic.id);
      } else {
        const forumStage = await getForumStageByOriginalId(topic.id.toString());
        if (!forumStage) continue;

        // Check if we should skip due to dead letter
        if (forumStage.content_fetch_status === "failed") {
          const retryCount = forumStage.fetch_retry_count || 0;
          const nextAttempt = forumStage.next_fetch_attempt;

          if (retryCount >= MAX_FETCH_RETRIES) {
            console.log(`Skipping ${topic.id} - max retries exceeded`);
            continue;
          }

          if (nextAttempt && new Date() < new Date(nextAttempt)) {
            console.log(`Skipping ${topic.id} - waiting for backoff`);
            continue;
          }
        }

        const needsUpdate = await maybeUpdateForumContent(forumStage, topic);
        if (needsUpdate) {
          await fetchAndStoreForumContent(forumStage.id, topic.id, retryCount);
        }
      }
    }

    await sleep(REQUEST_DELAY);
  }
}

async function fetchAndStoreForumContent(
  forumStageId: string,
  topicId: number,
  existingRetryCount: number = 0,
): Promise<void> {
  try {
    const result = await fetchTopicContent(topicId, {
      skipShortComments: true,
    });

    await updateForumContent(forumStageId, {
      posts_json: result.posts,
      content_fetched_at: new Date(),
      content_fetch_status: result.failedBatches > 0 ? "partial" : "success",
      last_fetched_post_count: result.fetchedCount,
      fetch_error_log:
        result.failedBatches > 0
          ? `Failed ${result.failedBatches} batches`
          : null,
      fetch_retry_count: 0, // Reset on success
      next_fetch_attempt: null,
    });

    console.log(`✓ Topic ${topicId}: ${result.fetchedCount} posts`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    const newRetryCount = existingRetryCount + 1;

    // Exponential backoff: 5min, 10min, 20min, 40min, 80min
    const backoffMinutes = 5 * Math.pow(2, existingRetryCount);
    const nextAttempt = new Date(Date.now() + backoffMinutes * 60 * 1000);

    await updateForumContent(forumStageId, {
      content_fetch_status: "failed",
      fetch_error_log: errorMsg,
      fetch_retry_count: newRetryCount,
      next_fetch_attempt: nextAttempt,
    });

    console.error(
      `✗ Topic ${topicId}: ${errorMsg} (retry ${newRetryCount}/${MAX_FETCH_RETRIES})`,
    );
    // Don't throw - allow import to continue
  }
}
```

### Repository Functions

```typescript
// packages/nextjs/services/database/repositories/forum.ts

type ForumContentUpdate = {
  posts_json: ForumPost[];
  content_fetched_at: Date;
  content_fetch_status: "pending" | "success" | "failed" | "partial";
  last_fetched_post_count: number;
  fetch_error_log: string | null;
  fetch_retry_count: number;
  next_fetch_attempt: Date | null;
};

export async function updateForumContent(
  forumStageId: string,
  content: ForumContentUpdate,
): Promise<void> {
  await db
    .update(forumStage)
    .set({
      posts_json: content.posts_json,
      content_fetched_at: content.content_fetched_at,
      content_fetch_status: content.content_fetch_status,
      last_fetched_post_count: content.last_fetched_post_count,
      fetch_error_log: content.fetch_error_log,
      fetch_retry_count: content.fetch_retry_count,
      next_fetch_attempt: content.next_fetch_attempt,
      updated_at: new Date(),
    })
    .where(eq(forumStage.id, forumStageId));
}

export async function getForumStageWithContent(
  proposalId: string,
): Promise<ForumStageWithContent | null> {
  const result = await db.query.forumStage.findFirst({
    where: eq(forumStage.proposal_id, proposalId),
  });

  if (!result) return null;

  // Validate posts_json with error logging
  let posts: ForumPost[] = [];
  if (result.posts_json) {
    const validation = ForumPostsArraySchema.safeParse(result.posts_json);
    if (validation.success) {
      posts = validation.data;
    } else {
      console.error(
        `Invalid posts_json for proposal ${proposalId}:`,
        validation.error.flatten(),
      );
    }
  }

  return {
    ...result,
    posts,
  };
}
```

---

## RAG Integration

### Per-Post Document Creation

```typescript
// packages/nextjs/services/rag/documentBuilder.ts

export function createDocumentsFromForumStage(
  proposal: ProposalWithForumContent,
): Document[] {
  const documents: Document[] = [];

  if (!proposal.forum?.posts || proposal.forum.posts.length === 0) {
    return documents;
  }

  for (const post of proposal.forum.posts) {
    if (post.is_deleted) continue;

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
    };

    documents.push(
      new Document({
        id_: generateNodeId(proposal.id, "forum", post.post_number),
        text: post.content,
        metadata,
      }),
    );
  }

  return documents;
}

// Use double underscore separator (unlikely in UUIDs)
export function generateNodeId(
  proposalId: string,
  stage: string,
  postNumber: number,
): string {
  return `${proposalId}__${stage}__${postNumber}`;
}
```

### Token Estimation (Accurate)

```typescript
// packages/nextjs/services/rag/tokens.ts

import { encoding_for_model } from "tiktoken";

let encoder: ReturnType<typeof encoding_for_model> | null = null;

function getEncoder() {
  if (!encoder) {
    encoder = encoding_for_model("text-embedding-3-small");
  }
  return encoder;
}

export function estimateTokens(text: string): number {
  return getEncoder().encode(text).length;
}

export function cleanupEncoder(): void {
  encoder?.free();
  encoder = null;
}
```

### Smart Ingestion with Chunking

```typescript
// packages/nextjs/services/rag/ingestion.ts

import { SentenceSplitter, TextNode } from "llamaindex";
import {
  createDocumentsFromForumStage,
  generateNodeId,
} from "./documentBuilder";
import { estimateTokens, cleanupEncoder } from "./tokens";

const CHUNK_SIZE = 512; // tokens
const CHUNK_OVERLAP = 50; // tokens

export async function ingestForumDocuments(
  proposal: ProposalWithForumContent,
): Promise<{ created: number; chunks: number }> {
  const result = { created: 0, chunks: 0 };

  if (!proposal.forum?.posts?.length) {
    return result;
  }

  // Create documents using the helper
  const documents = createDocumentsFromForumStage(proposal);
  if (documents.length === 0) return result;

  const splitter = new SentenceSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  const nodes: TextNode[] = [];

  for (const doc of documents) {
    const tokenCount = estimateTokens(doc.text);
    const docNodes = await splitter.getNodesFromDocuments([doc]);

    // Add chunk metadata only for multi-chunk posts
    if (tokenCount > CHUNK_SIZE && docNodes.length > 1) {
      docNodes.forEach((node, idx) => {
        node.metadata.chunk_index = idx;
        node.metadata.total_chunks = docNodes.length;
      });
    }

    nodes.push(...docNodes);
    result.chunks += docNodes.length;
    result.created++;
  }

  // Store in vector store
  if (nodes.length > 0) {
    const vectorStore = getVectorStore();
    await vectorStore.add(nodes);
  }

  return result;
}
```

---

## Implementation Plan

### Phase 1: Database & Dependencies (2 hours)

- [ ] Migration: Add 6 new columns to `forum_stage`
- [ ] Install: `zod`, `tiktoken`, `remove-markdown`
- [ ] Update types: `ForumPost`, `RagNodeMetadata`
- [ ] Add repository functions with validation logging

### Phase 2: Content Fetching (3 hours)

- [ ] Implement `fetchTopicContent()` with pagination
- [ ] Add retry logic with exponential backoff
- [ ] Implement `cleanForumContent()` using `remove-markdown`
- [ ] Add Zod validation for API responses
- [ ] Test with 150+ post topic

### Phase 3: Import & Error Handling (2 hours)

- [ ] Implement `maybeUpdateForumContent()` with edit detection
- [ ] Add dead letter queue logic (retry count, backoff)
- [ ] Integrate into `importForumPosts()` flow
- [ ] Add CLI command for content backfill

### Phase 4: RAG Integration (3 hours)

- [ ] Implement `createDocumentsFromForumStage()`
- [ ] Add accurate token estimation with `tiktoken`
- [ ] Implement smart chunking in `ingestForumDocuments()`
- [ ] Update node ID generation (double underscore separator)
- [ ] Test ingestion pipeline end-to-end

### Phase 5: Testing (2 hours)

- [ ] Test pagination: 200+ comment topic
- [ ] Test change detection: new post, edit, delete
- [ ] Test error handling: network failure, 429 rate limit
- [ ] Test "who suggested X" queries
- [ ] Performance test: 500 proposals ingestion time
- [ ] Cleanup encoder memory leaks

---

## Testing Strategy

### Test Queries

```
"Which delegate suggested the 6-month vesting period?"
"What concerns did Alice raise about the treasury?"
"Who was in favor of increasing the quorum?"
"Summarize the debate about token lockup"
```

### Expected Results

- [ ] Cites specific comment authors
- [ ] Links to specific post number (not just topic)
- [ ] Handles deleted posts gracefully
- [ ] Filters out short comments (<50 chars)
- [ ] Properly chunks and retrieves long posts

### Edge Cases

- [ ] Topic with 0 comments (just OP)
- [ ] Topic with 200+ comments (pagination stress)
- [ ] Edited post (change detection catches it)
- [ ] Deleted post (soft delete, excluded from RAG)
- [ ] Network timeout (retry logic works)
- [ ] Rate limit 429 (backoff works)
- [ ] Invalid API response (Zod validation fails gracefully)

---

## Metrics & Monitoring

**Key metrics to track:**

- `forum_content_fetch_success_rate` > 95%
- `forum_content_fetch_duration_ms` per topic
- `forum_posts_per_topic` (avg/median)
- `rag_chunks_per_proposal` after chunking
- `openai_embedding_cost_usd` for ingestion
- `rag_query_latency_ms` for "who" questions

**Alerts:**

- `content_fetch_status = 'failed'` with `fetch_retry_count >= 5`
- `forum_content_fetch_success_rate < 90%`
- `rag_query_latency_ms > 5000` (5 seconds)

---

## Files to Modify

| File                                      | Changes                             |
| ----------------------------------------- | ----------------------------------- |
| `services/database/config/schema.ts`      | Add 6 columns to `forum_stage`      |
| `services/forum/types.ts`                 | Add `ForumPost` type + Zod schema   |
| `services/forum/content.ts`               | **NEW**: Content fetching, cleaning |
| `services/forum/import.ts`                | Smart updates, dead letter handling |
| `services/database/repositories/forum.ts` | Content CRUD with validation        |
| `services/rag/documentBuilder.ts`         | Per-post document creation          |
| `services/rag/tokens.ts`                  | **NEW**: Accurate token estimation  |
| `services/rag/ingestion.ts`               | Smart chunking using token count    |
| `services/rag/types.ts`                   | Extend `RagNodeMetadata`            |

---

## Summary of Changes from v2

**Fixes from Carlos's feedback:**

1. ✓ Token estimation: Now uses `tiktoken` for accuracy
2. ✓ Code duplication: `ingestForumDocuments()` uses `createDocumentsFromForumStage()`
3. ✓ Change detection: Now checks `last_posted_at` to catch edits
4. ✓ Type safety: `RagNodeMetadata` extends `Record<string, unknown>` (no lying)
5. ✓ Validation logging: Errors logged instead of silent failure
6. ✓ Node ID separator: Changed from `:` to `__`
7. ✓ Content cleaning: Switched to `remove-markdown` (simpler)
8. ✓ Dead letter queue: Added `fetch_retry_count` + `next_fetch_attempt`

**Dependencies added:**

- `zod` - Runtime validation
- `tiktoken` - Accurate token counting
- `remove-markdown` - Simple markdown → text
