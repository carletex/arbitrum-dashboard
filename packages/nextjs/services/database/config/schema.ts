import { relations } from "drizzle-orm";
import { bigint, boolean, jsonb, numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const proposals = pgTable("proposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  author_address: varchar("author_address", { length: 42 }).notNull(),
  author_name: varchar("author_name", { length: 255 }),
  author_ens: varchar("author_ens", { length: 255 }),
  proposer_address: varchar("proposer_address", { length: 42 }),
  proposer_name: varchar("proposer_name", { length: 255 }),
  proposer_ens: varchar("proposer_ens", { length: 255 }),
  overall_status: varchar("overall_status", { length: 50 }).notNull(),
  governor_name: varchar("governor_name", { length: 255 }),
  governor_slug: varchar("governor_slug", { length: 255 }),
  start_block_number: bigint("start_block_number", { mode: "number" }),
  start_timestamp: timestamp("start_timestamp"),
  end_block_number: bigint("end_block_number", { mode: "number" }),
  end_timestamp: timestamp("end_timestamp"),
  created_at: timestamp("created_at").notNull(),
  eta: timestamp("eta"),
  ipfs_hash: varchar("ipfs_hash", { length: 100 }),
  tx_hash: varchar("tx_hash", { length: 66 }),
  discourse_url: text("discourse_url"),
  snapshot_url: text("snapshot_url"),
  timelock_id: varchar("timelock_id", { length: 100 }),
  timelock_chain_id: varchar("timelock_chain_id", { length: 20 }),
  previous_end: timestamp("previous_end"),
  chain_id: varchar("chain_id", { length: 20 }).notNull(),
  last_activity: timestamp("last_activity").defaultNow(),
  // Derived execution info for quick UI access
  requires_l1_execution: boolean("requires_l1_execution"),
  execution_chain_id: varchar("execution_chain_id", { length: 20 }),
  queued_at: timestamp("queued_at"),
  executed_at: timestamp("executed_at"),
  waiting_l2_to_l1: boolean("waiting_l2_to_l1"),
  l2_message_available_at: timestamp("l2_message_available_at"),
});

export const tallyVotes = pgTable("tally_votes", {
  id: uuid("id").defaultRandom().primaryKey(),
  proposal_id: uuid("proposal_id")
    .references(() => proposals.id)
    .notNull(),
  tally_proposal_id: varchar("tally_proposal_id", { length: 100 }).notNull().unique(),
  onchain_id: varchar("onchain_id", { length: 200 }).notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  for_votes: numeric("for_votes", { precision: 30, scale: 0 }),
  against_votes: numeric("against_votes", { precision: 30, scale: 0 }),
  abstain_votes: numeric("abstain_votes", { precision: 30, scale: 0 }),
  pending_for_votes: numeric("pending_for_votes", { precision: 30, scale: 0 }),
  pending_against_votes: numeric("pending_against_votes", { precision: 30, scale: 0 }),
  pending_abstain_votes: numeric("pending_abstain_votes", { precision: 30, scale: 0 }),
  for_voters_count: bigint("for_voters_count", { mode: "number" }),
  against_voters_count: bigint("against_voters_count", { mode: "number" }),
  abstain_voters_count: bigint("abstain_voters_count", { mode: "number" }),
  for_percent: numeric("for_percent", { precision: 5, scale: 2 }),
  against_percent: numeric("against_percent", { precision: 5, scale: 2 }),
  abstain_percent: numeric("abstain_percent", { precision: 5, scale: 2 }),
  last_activity: timestamp("last_activity").defaultNow(),
});

export const executableCalls = pgTable("executable_calls", {
  id: uuid("id").defaultRandom().primaryKey(),
  proposal_id: uuid("proposal_id")
    .references(() => proposals.id)
    .notNull(),
  target: varchar("target", { length: 42 }).notNull(),
  value: varchar("value", { length: 100 }),
  calldata: text("calldata"),
});

export const proposalEvents = pgTable("proposal_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  proposal_id: uuid("proposal_id")
    .references(() => proposals.id)
    .notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  chain_id: varchar("chain_id", { length: 20 }).notNull(),
  block_number: bigint("block_number", { mode: "number" }),
  block_timestamp: timestamp("block_timestamp"),
  created_at: timestamp("created_at"),
  tx_hash: varchar("tx_hash", { length: 66 }),
  raw: jsonb("raw"),
});

// Define relations
export const proposalsRelations = relations(proposals, ({ one, many }) => ({
  tallyVote: one(tallyVotes, {
    fields: [proposals.id],
    references: [tallyVotes.proposal_id],
  }),
  executableCalls: many(executableCalls),
  events: many(proposalEvents),
}));

export const tallyVotesRelations = relations(tallyVotes, ({ one }) => ({
  proposal: one(proposals, {
    fields: [tallyVotes.proposal_id],
    references: [proposals.id],
  }),
}));

export const executableCallsRelations = relations(executableCalls, ({ one }) => ({
  proposal: one(proposals, {
    fields: [executableCalls.proposal_id],
    references: [proposals.id],
  }),
}));

export const proposalEventsRelations = relations(proposalEvents, ({ one }) => ({
  proposal: one(proposals, {
    fields: [proposalEvents.proposal_id],
    references: [proposals.id],
  }),
}));
