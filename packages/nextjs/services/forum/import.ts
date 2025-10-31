import {
  createForumStage,
  getAllOriginalIds,
  updateForumStageByOriginalId,
} from "~~/services/database/repositories/forum";
import { createProposal } from "~~/services/database/repositories/proposals";
import { ForumPostsAPIResponseData, ForumUser, Topic } from "~~/services/forum/types";

const FORUM_URL = "https://forum.arbitrum.foundation";
const MAX_PAGES = 0;

/**
 * Fetch forum posts from the forum API
 */
const fetchForumPostsFromAPI = async (
  page: number,
): Promise<{ users: Record<number, ForumUser>; topics: Topic[]; hasMorePages: boolean }> => {
  const response = await fetch(`${FORUM_URL}/c/proposals/7.json?page=${page}`);
  const data: ForumPostsAPIResponseData = await response.json();

  const usersMappedByUserId = data.users?.reduce(
    (acc, user) => {
      acc[user.id] = user;
      return acc;
    },
    {} as Record<number, ForumUser>,
  );
  return {
    users: usersMappedByUserId ?? {},
    topics: data.topic_list?.topics ?? [],
    hasMorePages: data.topic_list.more_topics_url !== null,
  };
};

/**
 * Main function to import forum posts into the database
 */
export async function importForumPosts() {
  try {
    const existingForumsOriginalIds = await getAllOriginalIds();

    // Iterate over all the API pages
    for (let page = 0; page <= MAX_PAGES; page++) {
      const { users, topics, hasMorePages } = await fetchForumPostsFromAPI(page);

      for (const topic of topics) {
        if (!existingForumsOriginalIds.includes(topic.id.toString())) {
          // Create a new proposal and forum stage if it doesn't exist
          // "Original Poster" seems to be always the first poster (and there some weird naming sometimes on that field)
          const originalPosterId = topic.posters[0].user_id;
          const authorName = users[originalPosterId]?.name || users[originalPosterId]?.username;
          const postUrl = `${FORUM_URL}/t/${topic.slug}/${topic.id}`;

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
        } else {
          // Update existing forum stage with latest activity data
          const postUrl = `${FORUM_URL}/t/${topic.slug}/${topic.id}`;

          const forumStage = await updateForumStageByOriginalId(topic.id.toString(), {
            title: topic.fancy_title || topic.title,
            message_count: topic.posts_count,
            last_message_at: new Date(topic.last_posted_at),
            updated_at: new Date(),
            url: postUrl,
          });
          console.log("Updated forum stage:", forumStage.title);
        }
      }

      if (!hasMorePages) {
        break;
      }
    }
  } catch (error) {
    console.error("Error in importForumPosts:", error);
    throw error;
  }

  console.log("Forum posts imported successfully");
}
