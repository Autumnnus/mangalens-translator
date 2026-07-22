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
import {
  BatchTranslationItemResult,
  LocalOcrBubble,
  LocalOcrRunMetadata,
  TextBubble,
  TranslationSettings,
  UsageMetadata,
} from "../types";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  password: text("password"), // For credentials auth
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  role: text("role").default("user"),
  createdAt: timestamp("created_at").defaultNow(),
  settings: jsonb("settings").$type<TranslationSettings>(),
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
  parentId: uuid("parent_id"),
  color: text("color").default("#6366f1"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
  contentMode: text("content_mode").default("standard").notNull(),
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

export const translationJobs = pgTable("translation_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  seriesId: uuid("series_id")
    .notNull()
    .references(() => series.id, { onDelete: "cascade" }),
  providerJobName: text("provider_job_name").notNull(),
  keyFingerprint: text("key_fingerprint").notNull(),
  model: text("model").notNull(),
  fallbackModel: text("fallback_model").notNull(),
  prompt: text("prompt").notNull(),
  qualityFallback: integer("quality_fallback").default(1).notNull(),
  pipeline: text("pipeline").default("auto").notNull(),
  imageIds: jsonb("image_ids").$type<string[]>().notNull(),
  status: text("status").default("queued").notNull(),
  results: jsonb("results").$type<BatchTranslationItemResult[]>(),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const localOcrJobs = pgTable("local_ocr_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestKey: text("request_key").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  seriesId: uuid("series_id")
    .notNull()
    .references(() => series.id, { onDelete: "cascade" }),
  imageId: uuid("image_id")
    .notNull()
    .references(() => images.id, { onDelete: "cascade" }),
  targetLanguage: text("target_language").notNull(),
  customInstructions: text("custom_instructions"),
  primaryModel: text("primary_model").notNull(),
  fallbackModel: text("fallback_model").notNull(),
  status: text("status").default("queued").notNull(),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: timestamp("lease_expires_at"),
  attempts: integer("attempts").default(0).notNull(),
  ocrBubbles: jsonb("ocr_bubbles").$type<LocalOcrBubble[]>(),
  translatedBubbles: jsonb("translated_bubbles").$type<TextBubble[]>(),
  usage: jsonb("usage").$type<UsageMetadata>(),
  initialUsage: jsonb("initial_usage").$type<UsageMetadata>(),
  pipeline: text("pipeline").default("auto").notNull(),
  ocrMetadata: jsonb("ocr_metadata").$type<LocalOcrRunMetadata>(),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const localOcrWorkers = pgTable("local_ocr_workers", {
  workerId: text("worker_id").primaryKey(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "category_hierarchy",
  }),
  children: many(categories, {
    relationName: "category_hierarchy",
  }),
}));

export const translationJobsRelations = relations(
  translationJobs,
  ({ one }) => ({
    user: one(users, {
      fields: [translationJobs.userId],
      references: [users.id],
    }),
    series: one(series, {
      fields: [translationJobs.seriesId],
      references: [series.id],
    }),
  }),
);

export const localOcrJobsRelations = relations(localOcrJobs, ({ one }) => ({
  user: one(users, {
    fields: [localOcrJobs.userId],
    references: [users.id],
  }),
  series: one(series, {
    fields: [localOcrJobs.seriesId],
    references: [series.id],
  }),
  image: one(images, {
    fields: [localOcrJobs.imageId],
    references: [images.id],
  }),
}));
