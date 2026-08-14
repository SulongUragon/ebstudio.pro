import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const cloudProjects = sqliteTable(
  "cloud_projects",
  {
    ownerEmail: text("owner_email").notNull(),
    projectId: text("project_id").notNull(),
    kind: text("kind", { enum: ["manuscript", "visual"] }).notNull(),
    title: text("title").notNull(),
    author: text("author").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    objectKey: text("object_key").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerEmail, table.kind, table.projectId] }),
    index("cloud_projects_owner_updated_idx").on(
      table.ownerEmail,
      table.updatedAt,
    ),
  ],
);
