import { boolean, integer, jsonb, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";

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
  proposal_id: uuid("proposal_id").references(() => proposals.id, { onDelete: "set null" }),

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
  proposal_id: uuid("proposal_id").references(() => proposals.id, { onDelete: "set null" }),

  snapshot_id: text("snapshot_id").unique(),
  title: text("title"),
  author_name: varchar("author_name", { length: 255 }),
  url: text("url"),

  status: varchar("status", { length: 50 }),
  voting_start: timestamp("voting_start"),
  voting_end: timestamp("voting_end"),

  options: jsonb("options"), // flexible voting options

  updated_at: timestamp("updated_at").defaultNow(),
});

// Tally stage (nullable foreign key; linked later)
export const tallyStage = pgTable("tally_stage", {
  id: uuid("id").defaultRandom().primaryKey(),
  proposal_id: uuid("proposal_id").references(() => proposals.id, { onDelete: "set null" }),

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

// Matching results table (audit trail for proposal matching)
export const matchingResult = pgTable(
  "matching_result",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source_type: varchar("source_type", { length: 20 }).notNull(), // "snapshot" or "tally"
    source_stage_id: uuid("source_stage_id").notNull(), // References snapshot_stage.id or tally_stage.id (app-level, polymorphic)
    proposal_id: uuid("proposal_id").references(() => proposals.id, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).notNull(), // "matched", "pending_review", "no_match"
    method: varchar("method", { length: 30 }).notNull(), // "csv_import", "manual_override", "llm"
    confidence: integer("confidence"), // 0-100 score (for future LLM API use)
    reasoning: text("reasoning"), // LLM explanation (for future LLM API use)
    source_title: text("source_title"), // Denormalized for debugging
    source_url: text("source_url"), // Denormalized for debugging
    matched_forum_url: text("matched_forum_url"), // The forum URL used for lookup
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  table => [unique().on(table.source_type, table.source_stage_id)],
);

// Users table for admin management
export const users = pgTable("user", {
  address: varchar("address", { length: 42 }).primaryKey(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
