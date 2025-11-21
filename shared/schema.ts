import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", [
  "student",
  "academic_staff", 
  "department_head",
  "dean",
  "vice_chancellor",
  "assistant_registrar",
  "course_unit",
  "admin"
]);

export const documentTypeEnum = pgEnum("document_type", [
  "transcript_request",
  "enrollment_verification", 
  "grade_report",
  "certificate_verification",
  "letter_of_recommendation",
  "academic_record",
  "degree_verification",
  "other"
]);

export const documentStatusEnum = pgEnum("document_status", [
  "pending",
  "in_review",
  "approved", 
  "rejected",
  "completed"
]);

export const actionTypeEnum = pgEnum("action_type", [
  "uploaded",
  "reviewed",
  "approved",
  "rejected", 
  "signed",
  "forwarded",
  "completed"
]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  role: userRoleEnum("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  isGraduated: boolean("is_graduated").default(false), // For students only
  signature: text("signature"), // For non-student users - stores image file path
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLogin: timestamp("last_login"),
});

export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  type: documentTypeEnum("type").notNull(),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  hash: text("hash").notNull().unique(),
  status: documentStatusEnum("status").notNull().default("pending"),
  userId: varchar("user_id").notNull().references(() => users.id),
  // Optional raw file content stored in DB as base64-encoded text (compat with current Drizzle version)
  fileContent: text("file_content"),
  fileMetadata: jsonb("file_metadata"),
  // Forwarding fields
  forwardedToUserId: varchar("forwarded_to_user_id").references(() => users.id),
  forwardedFromUserId: varchar("forwarded_from_user_id").references(() => users.id),
  forwardedAt: timestamp("forwarded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workflows = pgTable("workflows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id),
  currentStep: integer("current_step").notNull().default(0),
  totalSteps: integer("total_steps").notNull(),
  stepRoles: jsonb("step_roles").notNull().$type<string[]>(),
  isCompleted: boolean("is_completed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workflowActions = pgTable("workflow_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: varchar("workflow_id").notNull().references(() => workflows.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  action: actionTypeEnum("action").notNull(),
  comment: text("comment"),
  step: integer("step").notNull(),
  signature: text("signature"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const verificationLogs = pgTable("verification_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentHash: text("document_hash").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  isVerified: boolean("is_verified").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const documentTemplates = pgTable("document_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: documentTypeEnum("type").notNull(),
  description: text("description"),
  approvalPath: jsonb("approval_path").notNull().$type<string[]>(),
  requiredRoles: jsonb("required_roles").notNull().$type<string[]>(),
  templateFileName: text("template_file_name"),
  templateFilePath: text("template_file_path"),
  templateFileSize: integer("template_file_size"),
  templateMimeType: text("template_mime_type"),
  templatePageCount: integer("template_page_count"),
  signaturePlacements: jsonb("signature_placements")
    .notNull()
    .$type<Record<string, { page: number; x: number; y: number }[]>>()
    .default(sql`'{}'::jsonb`),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  documents: many(documents),
  workflowActions: many(workflowActions),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  user: one(users, {
    fields: [documents.userId],
    references: [users.id],
  }),
  workflow: one(workflows),
}));

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  document: one(documents, {
    fields: [workflows.documentId],
    references: [documents.id],
  }),
  actions: many(workflowActions),
}));

export const workflowActionsRelations = relations(workflowActions, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowActions.workflowId],
    references: [workflows.id],
  }),
  user: one(users, {
    fields: [workflowActions.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  lastLogin: true,
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkflowSchema = createInsertSchema(workflows).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkflowActionSchema = createInsertSchema(workflowActions).omit({
  id: true,
  createdAt: true,
});

export const insertVerificationLogSchema = createInsertSchema(verificationLogs).omit({
  id: true,
  createdAt: true,
});

export const insertDocumentTemplateSchema = createInsertSchema(documentTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Workflow = typeof workflows.$inferSelect;
export type InsertWorkflow = z.infer<typeof insertWorkflowSchema>;
export type WorkflowAction = typeof workflowActions.$inferSelect;
export type InsertWorkflowAction = z.infer<typeof insertWorkflowActionSchema>;
export type VerificationLog = typeof verificationLogs.$inferSelect;
export type InsertVerificationLog = z.infer<typeof insertVerificationLogSchema>;
export type DocumentTemplate = typeof documentTemplates.$inferSelect;
export type InsertDocumentTemplate = z.infer<typeof insertDocumentTemplateSchema>;
