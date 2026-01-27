import {
  createForumStage,
  getAllForumStagesForComparison,
  updateForumStageByOriginalId,
} from "~~/services/database/repositories/forum";
import { createProposal } from "~~/services/database/repositories/proposals";
import { ForumPostsAPIResponseData, ForumUser, Topic } from "~~/services/forum/types";

const FORUM_URL = "https://forum.arbitrum.foundation";
const MAX_PAGES = 100;
const REQUEST_DELAY = 500;

/**
 * Sleep for a specified number of milliseconds
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Build the forum post URL from a topic
 */
const buildPostUrl = (topic: Topic): string => {
  return `${FORUM_URL}/t/${topic.slug}/${topic.id}`;
};

/**
 * Get the author name from a topic and users map
 */
const getAuthorName = (topic: Topic, users: Record<number, ForumUser>): string | undefined => {
  const originalPosterId = topic.posters[0].user_id;
  return users[originalPosterId]?.name || users[originalPosterId]?.username;
};

/**
 * Fetch forum posts from the forum API
 */
const fetchForumPostsFromAPI = async (page: number): Promise<ForumPostsAPIResponseData> => {
  const response = await fetch(`${FORUM_URL}/c/proposals/7.json?page=${page}`);
  const data: ForumPostsAPIResponseData = await response.json();
  return data;
};

/**
 * Transform users array into a map by user ID
 */
const mapUsersByID = (users: ForumUser[]): Record<number, ForumUser> => {
  return (
    users?.reduce(
      (acc, user) => {
        acc[user.id] = user;
        return acc;
      },
      {} as Record<number, ForumUser>,
    ) ?? {}
  );
};

/**
 * Create a new proposal and forum stage for a topic
 */
const createProposalAndForumStage = async (topic: Topic, users: Record<number, ForumUser>) => {
  const authorName = getAuthorName(topic, users);
  const postUrl = buildPostUrl(topic);

  // Create proposal
  const proposal = await createProposal({
    title: topic.fancy_title || topic.title,
    author_name: authorName ?? undefined,
    // ToDo: category
  });
  console.log("Created proposal:", proposal.title);

  // Create forum stage
  const forumStage = await createForumStage({
    proposal_id: proposal.id,
    original_id: topic.id.toString(),
    title: topic.fancy_title || topic.title,
    author_name: authorName ?? undefined,
    message_count: topic.posts_count,
    last_message_at: new Date(topic.last_posted_at),
    updated_at: new Date(),
    url: postUrl,
  });
  console.log("Created forum stage:", forumStage.title);
};

type ExistingForumStage = {
  original_id: string | null;
  title: string | null;
  message_count: number | null;
  last_message_at: Date | null;
  url: string | null;
};

/**
 * Check if the topic data has changed compared to the existing forum stage
 */
const hasChanges = (existing: ExistingForumStage, topic: Topic): boolean => {
  const newTitle = topic.fancy_title || topic.title;
  const newUrl = buildPostUrl(topic);
  const newLastMessageAt = new Date(topic.last_posted_at).getTime();
  const existingLastMessageAt = existing.last_message_at?.getTime() ?? 0;

  return (
    existing.title !== newTitle ||
    existing.message_count !== topic.posts_count ||
    existingLastMessageAt !== newLastMessageAt ||
    existing.url !== newUrl
  );
};

/**
 * Update an existing forum stage with latest activity data
 */
const updateForumStage = async (topic: Topic) => {
  const postUrl = buildPostUrl(topic);

  const forumStage = await updateForumStageByOriginalId(topic.id.toString(), {
    title: topic.fancy_title || topic.title,
    message_count: topic.posts_count,
    last_message_at: new Date(topic.last_posted_at),
    updated_at: new Date(),
    url: postUrl,
  });
  console.log("Updated forum stage:", forumStage.title);
};

/**
 * Main function to import forum posts into the database
 */
export async function importForumPosts() {
  try {
    const existingForumStages = await getAllForumStagesForComparison();
    const forumStageMap = new Map(
      existingForumStages
        .filter(forumStage => forumStage.original_id)
        .map(validForumStage => [validForumStage.original_id, validForumStage]),
    );

    // Iterate over all the API pages
    for (let page = 0; page <= MAX_PAGES; page++) {
      console.log(`\nFetching page ${page}...`);
      const data = await fetchForumPostsFromAPI(page);
      const users = mapUsersByID(data.users);
      const topics = data.topic_list?.topics ?? [];

      console.log(`Processing ${topics.length} topics from page ${page}`);

      if (topics.length === 0) {
        console.log("No more topics to process, finishing...");
        break;
      }

      for (const topic of topics) {
        const existing = forumStageMap.get(topic.id.toString());

        if (!existing) {
          await createProposalAndForumStage(topic, users);
        } else if (hasChanges(existing, topic)) {
          await updateForumStage(topic);
        }
      }

      await sleep(REQUEST_DELAY);
    }

    console.log("Forum posts imported successfully");
  } catch (error) {
    console.error("Error in importForumPosts:", error);
    throw error;
  }
}
