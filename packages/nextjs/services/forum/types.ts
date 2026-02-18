import { z } from "zod";

// API response types
export type ForumPostsAPIResponseData = {
  users: ForumUser[];
  topic_list: TopicListData;
};

export type ForumUser = {
  id: number;
  name: string;
  username: string;
};

export type TopicListData = {
  topics: Topic[];
};

export type Topic = {
  id: number;
  title: string;
  fancy_title: string;
  posts_count: number;
  slug: string;
  last_posted_at: Date | string;
  posters: Poster[];
};

export type Poster = {
  description: string;
  user_id: number;
};

// Forum post content types (for RAG enrichment)
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

// Discourse API response schemas
export const DiscoursePostSchema = z.object({
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

export const DiscourseTopicSchema = z.object({
  id: z.number(),
  title: z.string(),
  posts_count: z.number(),
  last_posted_at: z.string(),
  post_stream: z.object({
    posts: z.array(DiscoursePostSchema),
    stream: z.array(z.number()),
  }),
});

export type DiscoursePost = z.infer<typeof DiscoursePostSchema>;
export type DiscourseTopic = z.infer<typeof DiscourseTopicSchema>;

export type FetchContentResult = {
  posts: ForumPost[];
  topic: DiscourseTopic;
  fetchedCount: number;
  failedBatches: number;
};
