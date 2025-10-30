import { createForumStage, getAllOriginalIds } from "~~/services/database/repositories/forum";
import { createProposal } from "~~/services/database/repositories/proposals";
import { ForumPostsAPIResponseData, ForumUser, Topic } from "~~/services/forum/types";

const FORUM_API_URL = "https://forum.arbitrum.foundation/c/proposals/7.json?page=";
const MAX_PAGES = 0;

/**
 * Fetch forum posts from the forum API
 */
const fetchForumPostsFromAPI = async (
  page: number,
): Promise<{ users: Record<number, ForumUser>; topics: Topic[]; hasMorePages: boolean }> => {
  const response = await fetch(`${FORUM_API_URL}${page}`);
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
        // Create a new proposal if it doesn't exist
        if (!existingForumsOriginalIds.includes(topic.id.toString())) {
          // "Original Poster" seems to be always the first poster (and there some weird naming sometimes on that field)
          const authorName = users[topic.posters[0].user_id]?.name;

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
            message_count: topic.post_count,
          });
          console.log("Created forum stage:", forumStage.title);
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
}
