import { fetchTopicContent } from "./content";
import { FORUM_CATEGORY_PATH, FORUM_URL, httpsGet, sleep } from "./http";
import { ForumPostsAPIResponseData, ForumUser, Topic } from "./types";
import { InferSelectModel } from "drizzle-orm";
import { forumStage } from "~~/services/database/config/schema";
import {
  createForumStage,
  getAllOriginalIds,
  getForumStageByOriginalId,
  updateForumContent,
  updateForumStageByOriginalId,
} from "~~/services/database/repositories/forum";
import { createProposal } from "~~/services/database/repositories/proposals";

// Configuration
const MAX_PAGES = 100;
const REQUEST_DELAY = 500;
const MAX_FETCH_RETRIES = 5;
const BACKOFF_BASE_MINUTES = 5;

type ForumStage = InferSelectModel<typeof forumStage>;

export type ImportSummary = {
  pagesFetched: number;
  topicsSeen: number;
  newTopics: number;
  existingTopics: number;
  proposalsCreated: number;
  forumStagesCreated: number;
  forumStagesUpdated: number;
  forumStagesMissing: number;
  contentFetchSuccess: number;
  contentFetchPartial: number;
  contentFetchFailed: number;
  stoppedOnPage: number | null;
  stoppedReason: string | null;
};

type ContentFetchResult = {
  status: "success" | "partial" | "failed";
  fetchedCount: number;
};

/**
 * Build the forum post URL from a topic
 */
function buildPostUrl(topic: Topic): string {
  return `${FORUM_URL}/t/${topic.slug}/${topic.id}`;
}

/**
 * Get the author name from a topic and users map
 */
function getAuthorName(topic: Topic, users: Record<number, ForumUser>): string | undefined {
  const originalPosterId = topic.posters[0]?.user_id;
  if (!originalPosterId) return undefined;
  const user = users[originalPosterId];
  return user?.name || user?.username;
}

/**
 * Fetch forum posts from the forum API using IPv4-forced HTTPS.
 */
async function fetchForumPostsFromAPI(page: number): Promise<ForumPostsAPIResponseData> {
  const url = `${FORUM_URL}${FORUM_CATEGORY_PATH}?page=${page}`;
  return httpsGet<ForumPostsAPIResponseData>(url, { timeout: 30000 });
}

/**
 * Transform users array into a map by user ID
 */
function mapUsersByID(users: ForumUser[]): Record<number, ForumUser> {
  if (!users) return {};
  return users.reduce(
    (acc, user) => {
      acc[user.id] = user;
      return acc;
    },
    {} as Record<number, ForumUser>,
  );
}

/**
 * Update an existing forum stage with latest activity data
 */
async function updateForumStage(topic: Topic): Promise<void> {
  const postUrl = buildPostUrl(topic);

  const updated = await updateForumStageByOriginalId(topic.id.toString(), {
    title: topic.fancy_title || topic.title,
    message_count: topic.posts_count,
    last_message_at: new Date(topic.last_posted_at),
    updated_at: new Date(),
    url: postUrl,
  });

  if (updated) {
    console.log("Updated forum stage:", updated.title);
  }
}

/**
 * Determine if forum content needs to be updated based on post count and activity timestamp.
 * Returns true if content should be fetched.
 */
export function shouldUpdateForumContent(forumStageData: ForumStage, topic: Topic): boolean {
  // Never fetched - definitely need to fetch
  if (!forumStageData.content_fetched_at) {
    return true;
  }

  // Check if new posts were added
  if (topic.posts_count !== forumStageData.last_fetched_post_count) {
    return true;
  }

  // Check if there's been activity (edits or deleted posts)
  const lastFetched = new Date(forumStageData.content_fetched_at).getTime();
  const lastActivity = new Date(topic.last_posted_at).getTime();

  if (lastActivity > lastFetched) {
    return true;
  }

  // Debounce: Don't refetch within 1 hour if previous fetch succeeded
  if (forumStageData.content_fetch_status === "success") {
    const hoursSinceFetch = (Date.now() - lastFetched) / (1000 * 60 * 60);
    if (hoursSinceFetch < 1) {
      return false;
    }
  }

  return false;
}

/**
 * Fetch and store forum content for a specific topic.
 * Handles retries with exponential backoff.
 */
async function fetchAndStoreForumContent(
  forumStageId: string,
  topicId: number,
  existingRetryCount: number = 0,
): Promise<ContentFetchResult> {
  try {
    const result = await fetchTopicContent(topicId);
    const status: ContentFetchResult["status"] = result.failedBatches > 0 ? "partial" : "success";

    await updateForumContent(forumStageId, {
      posts_json: result.posts,
      content_fetched_at: new Date(),
      content_fetch_status: status,
      last_fetched_post_count: result.fetchedCount,
      fetch_error_log: result.failedBatches > 0 ? `Failed ${result.failedBatches} batches` : null,
      fetch_retry_count: 0, // Reset on success
      next_fetch_attempt: null,
    });

    console.log(`✓ Topic ${topicId}: ${result.fetchedCount} posts`);
    return { status, fetchedCount: result.fetchedCount };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    const newRetryCount = existingRetryCount + 1;

    // Exponential backoff: 5min, 10min, 20min, 40min, 80min
    const backoffMinutes = BACKOFF_BASE_MINUTES * Math.pow(2, existingRetryCount);
    const nextAttempt = new Date(Date.now() + backoffMinutes * 60 * 1000);

    await updateForumContent(forumStageId, {
      posts_json: [],
      content_fetched_at: new Date(),
      content_fetch_status: "failed",
      last_fetched_post_count: 0,
      fetch_error_log: errorMsg,
      fetch_retry_count: newRetryCount,
      next_fetch_attempt: nextAttempt,
    });

    console.error(`✗ Topic ${topicId}: ${errorMsg} (retry ${newRetryCount}/${MAX_FETCH_RETRIES})`);
    return { status: "failed", fetchedCount: 0 };
  }
}

/**
 * Create a new proposal and forum stage for a topic, then fetch content.
 */
async function createProposalAndForumStageWithContent(
  topic: Topic,
  users: Record<number, ForumUser>,
): Promise<ContentFetchResult> {
  const authorName = getAuthorName(topic, users);
  const postUrl = buildPostUrl(topic);

  // Create proposal
  const proposal = await createProposal({
    title: topic.fancy_title || topic.title,
    author_name: authorName,
  });
  console.log("Created proposal:", proposal.title);

  // Create forum stage
  const newForumStage = await createForumStage({
    proposal_id: proposal.id,
    original_id: topic.id.toString(),
    title: topic.fancy_title || topic.title,
    author_name: authorName,
    message_count: topic.posts_count,
    last_message_at: new Date(topic.last_posted_at),
    updated_at: new Date(),
    url: postUrl,
    content_fetch_status: "pending",
  });
  console.log("Created forum stage:", newForumStage.title);

  // Fetch content immediately
  return await fetchAndStoreForumContent(newForumStage.id, topic.id);
}

/**
 * Check if a failed topic should be skipped based on retry count and backoff schedule.
 */
function shouldSkipFailedTopic(forumStageData: ForumStage): boolean {
  if (forumStageData.content_fetch_status !== "failed") {
    return false;
  }

  const retryCount = forumStageData.fetch_retry_count || 0;
  if (retryCount >= MAX_FETCH_RETRIES) {
    return true; // Dead-lettered
  }

  const nextAttempt = forumStageData.next_fetch_attempt;
  if (nextAttempt && new Date() < new Date(nextAttempt)) {
    return true; // Still in backoff window
  }

  return false;
}

/**
 * Main function to import forum posts into the database.
 * Fetches topics from the forum API, creates proposals and forum stages,
 * and fetches content for each topic.
 */
export async function importForumPosts(options?: { maxPages?: number }): Promise<ImportSummary> {
  const summary: ImportSummary = {
    pagesFetched: 0,
    topicsSeen: 0,
    newTopics: 0,
    existingTopics: 0,
    proposalsCreated: 0,
    forumStagesCreated: 0,
    forumStagesUpdated: 0,
    forumStagesMissing: 0,
    contentFetchSuccess: 0,
    contentFetchPartial: 0,
    contentFetchFailed: 0,
    stoppedOnPage: null,
    stoppedReason: null,
  };

  const existingForumsOriginalIds = new Set(await getAllOriginalIds());
  const maxPages = Number.isFinite(options?.maxPages) ? (options?.maxPages as number) : MAX_PAGES;

  const trackContentResult = (result: ContentFetchResult) => {
    switch (result.status) {
      case "success":
        summary.contentFetchSuccess++;
        break;
      case "partial":
        summary.contentFetchPartial++;
        break;
      case "failed":
        summary.contentFetchFailed++;
        break;
    }
  };

  // Iterate over all the API pages
  for (let page = 0; page <= maxPages; page++) {
    console.log(`\nFetching page ${page}...`);

    let data: ForumPostsAPIResponseData;
    try {
      data = await fetchForumPostsFromAPI(page);
    } catch (error) {
      console.error(`Forum API fetch failed for page ${page}:`, error);
      if (page === 0) {
        throw new Error(`Forum API fetch failed on page 0: ${error instanceof Error ? error.message : "Unknown"}`);
      }
      summary.stoppedOnPage = page;
      summary.stoppedReason = "page_fetch_failed";
      break;
    }

    summary.pagesFetched++;
    const users = mapUsersByID(data.users);
    const topics = data.topic_list?.topics ?? [];

    console.log(`Processing ${topics.length} topics from page ${page}`);

    if (topics.length === 0) {
      if (page === 0) {
        throw new Error("Forum API returned zero topics on page 0");
      }
      console.log("No more topics to process, finishing...");
      summary.stoppedOnPage = page;
      summary.stoppedReason = "no_more_topics";
      break;
    }

    for (const topic of topics) {
      summary.topicsSeen++;
      const isNewTopic = !existingForumsOriginalIds.has(topic.id.toString());

      if (isNewTopic) {
        summary.newTopics++;
        const contentResult = await createProposalAndForumStageWithContent(topic, users);
        summary.proposalsCreated++;
        summary.forumStagesCreated++;
        trackContentResult(contentResult);
      } else {
        summary.existingTopics++;

        // Update existing forum stage metadata
        await updateForumStage(topic);
        summary.forumStagesUpdated++;

        // Check if we need to fetch/update content
        const existingForumStage = await getForumStageByOriginalId(topic.id.toString());
        if (!existingForumStage) {
          summary.forumStagesMissing++;
          continue;
        }

        // Check if we should skip due to dead letter or backoff
        if (shouldSkipFailedTopic(existingForumStage)) {
          const reason =
            (existingForumStage.fetch_retry_count || 0) >= MAX_FETCH_RETRIES ? "max retries exceeded" : "backoff";
          console.log(`Skipping ${topic.id} - ${reason}`);
          continue;
        }

        // Check if content needs updating
        if (shouldUpdateForumContent(existingForumStage, topic)) {
          const contentResult = await fetchAndStoreForumContent(
            existingForumStage.id,
            topic.id,
            existingForumStage.fetch_retry_count || 0,
          );
          trackContentResult(contentResult);
        }
      }
    }

    await sleep(REQUEST_DELAY);
  }

  console.log("Forum posts imported successfully");
  return summary;
}
