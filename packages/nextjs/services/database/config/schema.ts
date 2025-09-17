import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";

export const proposals = pgTable("proposal", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar({ length: 255 }).notNull(),
});
