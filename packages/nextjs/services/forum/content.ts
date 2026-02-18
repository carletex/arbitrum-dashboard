import { FORUM_URL, httpsGet, sleep } from "./http";
import { DiscoursePostSchema, DiscourseTopicSchema, FetchContentResult, ForumPost } from "./types";
import removeMarkdown from "remove-markdown";
import { z } from "zod";

const REQUEST_DELAY = 100; // 10 req/sec
const BATCH_SIZE = 20; // Discourse max
const MAX_CONTENT_LENGTH = 50000;
const TRUNCATION_MARKER = "\n\n[... content truncated]";

/**
 * Clean forum content by removing Discourse-specific syntax and converting markdown to plain text.
 * Synchronous operation - no async work needed.
 */
function cleanForumContent(rawMarkdown: string): string {
  // 1. Remove Discourse-specific syntax
  const cleaned = rawMarkdown
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
    useImgAltText: true,
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

type FetchTopicOptions = {
  skipShortComments?: boolean;
};

// Type for batch response
type BatchPostsResponse = {
  post_stream?: {
    posts?: unknown[];
  };
};

/**
 * Fetch all posts content from a forum topic including original post and all comments.
 * Returns structured result with posts, topic metadata, and error tracking.
 * Uses IPv4-forced HTTPS to avoid timeout issues.
 */
export async function fetchTopicContent(topicId: number, options?: FetchTopicOptions): Promise<FetchContentResult> {
  // 1. Fetch topic + first batch (include_raw=true to get markdown content)
  const rawData = await httpsGet(`${FORUM_URL}/t/${topicId}.json?include_raw=true`);
  const topic = DiscourseTopicSchema.parse(rawData);

  const result: FetchContentResult = {
    posts: [],
    topic,
    fetchedCount: 0,
    failedBatches: 0,
  };

  const allPosts = [...topic.post_stream.posts];
  const stream = topic.post_stream.stream;

  // 2. Fetch remaining posts in batches
  const remainingIds = stream.slice(allPosts.length);

  for (let i = 0; i < remainingIds.length; i += BATCH_SIZE) {
    const batch = remainingIds.slice(i, i + BATCH_SIZE);
    const idsParam = batch.map(id => `post_ids[]=${id}`).join("&");

    try {
      const batchData = await httpsGet<BatchPostsResponse>(
        `${FORUM_URL}/t/${topicId}/posts.json?${idsParam}&include_raw=true`,
      );
      const posts = z.array(DiscoursePostSchema).safeParse(batchData.post_stream?.posts);
      if (posts.success) {
        allPosts.push(...posts.data);
      } else {
        console.warn(`Batch validation failed for topic ${topicId}`);
        result.failedBatches++;
      }
    } catch (error) {
      console.error(`Batch error for topic ${topicId}:`, error);
      result.failedBatches++;
    }

    await sleep(REQUEST_DELAY);
  }

  // 3. Clean and transform posts
  const transformedPosts: ForumPost[] = [];

  for (const post of allPosts) {
    // Skip short comments if requested
    if (options?.skipShortComments && post.post_number > 1 && post.raw.length < 50) {
      continue;
    }

    transformedPosts.push({
      id: post.id,
      post_number: post.post_number,
      author_name: post.name || post.username,
      author_username: post.username,
      content: cleanForumContent(post.raw),
      posted_at: post.created_at,
      reply_to_post_number: post.reply_to_post_number || undefined,
    });
  }

  result.posts = transformedPosts;
  result.fetchedCount = transformedPosts.length;

  return result;
}
