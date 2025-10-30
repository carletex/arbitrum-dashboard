import { integer, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

// Canonical proposals table (one row per proposal)
export const proposals = pgTable("proposal", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  author_name: varchar("author_name", { length: 255 }),
  category: varchar("category", { length: 50 }),

  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Forum stage (nullable foreign key; linked later)
export const forumStage = pgTable("forum_stage", {
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
});

// Snapshot stage (nullable foreign key; linked later)
export const snapshotStage = pgTable("snapshot_stage", {
  id: uuid("id").defaultRandom().primaryKey(),
  proposal_id: uuid("proposal_id")
    .references(() => proposals.id, { onDelete: "set null" })
    .unique(),

  snapshot_id: text("snapshot_id").unique(),
  title: text("title"),
  author_name: varchar("author_name", { length: 255 }),
  url: text("url"),

  status: varchar("status", { length: 50 }),
  voting_start: timestamp("voting_start"),
  voting_end: timestamp("voting_end"),

  options: jsonb("options"), // flexible voting options

  last_activity: timestamp("last_activity"),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Tally stage (nullable foreign key; linked later)
export const tallyStage = pgTable("tally_stage", {
  id: uuid("id").defaultRandom().primaryKey(),
  proposal_id: uuid("proposal_id")
    .references(() => proposals.id, { onDelete: "set null" })
    .unique(),

  tally_proposal_id: text("tally_proposal_id").unique(),
  title: text("title"),
  author_name: varchar("author_name", { length: 255 }),
  url: text("url"),
  onchain_id: text("onchain_id"),

  status: varchar("status", { length: 50 }),
  substatus: varchar("substatus", { length: 50 }),
  substatus_deadline: timestamp("substatus_deadline"),

  start_timestamp: timestamp("start_timestamp"),
  end_timestamp: timestamp("end_timestamp"),

  options: jsonb("options"), // flexible voting options

  last_activity: timestamp("last_activity"),
  updated_at: timestamp("updated_at").defaultNow(),
});
