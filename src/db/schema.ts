import { relations } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  password: text("password"), // For credentials auth
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  role: text("role").default("user"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const accounts = pgTable("accounts", {
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("providerAccountId").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
});

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"), // Self-reference handled in application logic or separate relation if needed
  createdAt: timestamp("created_at").defaultNow(),
});

export const series = pgTable("series", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  author: text("author"),
  groupName: text("group_name"),
  originalTitle: text("original_title"),
  sequenceNumber: integer("sequence_number").default(0),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Legacy/Fallback string fields if strict relation not possible during migration (but we are starting fresh)
  categoryName: text("category_name"),
});

export const images = pgTable("images", {
  id: uuid("id").defaultRandom().primaryKey(),
  seriesId: uuid("series_id")
    .notNull()
    .references(() => series.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  originalKey: text("original_key").notNull(),
  translatedKey: text("translated_key"),
  status: text("status").default("idle"), // idle, processing, completed, error
  sequenceNumber: integer("sequence_number").default(0),
  bubbles: jsonb("bubbles"), // Array of TextBubble
  usage: jsonb("usage"), // UsageMetadata
  cost: real("cost").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const seriesRelations = relations(series, ({ one, many }) => ({
  user: one(users, {
    fields: [series.userId],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [series.categoryId],
    references: [categories.id],
  }),
  images: many(images),
}));

export const imagesRelations = relations(images, ({ one }) => ({
  series: one(series, {
    fields: [images.seriesId],
    references: [series.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, {
    fields: [categories.userId],
    references: [users.id],
  }),
  series: many(series),
}));
