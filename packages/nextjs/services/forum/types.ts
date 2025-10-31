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
  more_topics_url?: string;
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
