import { 
  users, documents, workflows, workflowActions, verificationLogs,
  type User, type InsertUser, type Document, type InsertDocument,
  type Workflow, type InsertWorkflow, type WorkflowAction, type InsertWorkflowAction,
  type VerificationLog, type InsertVerificationLog
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateLastLogin(id: string): Promise<void>;

  // Document operations  
  getDocument(id: string): Promise<Document | undefined>;
  getDocumentByHash(hash: string): Promise<Document | undefined>;
  getUserDocuments(userId: string): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: string, updates: Partial<InsertDocument>): Promise<Document>;
  getAllDocuments(): Promise<Document[]>;
  getPendingDocumentsForRole(role: string): Promise<(Document & { user: User, workflow: Workflow })[]>;

  // Workflow operations
  getWorkflow(id: string): Promise<Workflow | undefined>;
  getWorkflowByDocumentId(documentId: string): Promise<Workflow | undefined>;
  createWorkflow(workflow: InsertWorkflow): Promise<Workflow>;
  updateWorkflow(id: string, updates: Partial<InsertWorkflow>): Promise<Workflow>;
  getWorkflowWithActions(workflowId: string): Promise<(Workflow & { actions: (WorkflowAction & { user: User })[] }) | undefined>;

  // Workflow action operations
  createWorkflowAction(action: InsertWorkflowAction): Promise<WorkflowAction>;
  getWorkflowActions(workflowId: string): Promise<(WorkflowAction & { user: User })[]>;

  // Verification operations
  createVerificationLog(log: InsertVerificationLog): Promise<VerificationLog>;
  getDocumentForVerification(hash: string): Promise<(Document & { user: User, workflow?: (Workflow & { actions: (WorkflowAction & { user: User })[] }) }) | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(asc(users.fullName));
  }

  async updateLastLogin(id: string): Promise<void> {
    await db
      .update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, id));
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document || undefined;
  }

  async getDocumentByHash(hash: string): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.hash, hash));
    return document || undefined;
  }

  async getUserDocuments(userId: string): Promise<Document[]> {
    return await db
      .select()
      .from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(desc(documents.createdAt));
  }

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const [document] = await db
      .insert(documents)
      .values(insertDocument)
      .returning();
    return document;
  }

  async updateDocument(id: string, updates: Partial<InsertDocument>): Promise<Document> {
    const [document] = await db
      .update(documents)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return document;
  }

  async getAllDocuments(): Promise<Document[]> {
    return await db.select().from(documents).orderBy(desc(documents.createdAt));
  }

  async getPendingDocumentsForRole(role: string): Promise<(Document & { user: User, workflow: Workflow })[]> {
    return await db
      .select()
      .from(documents)
      .innerJoin(users, eq(documents.userId, users.id))
      .innerJoin(workflows, eq(documents.id, workflows.documentId))
      .where(
        and(
          eq(documents.status, "in_review"),
          eq(workflows.isCompleted, false)
        )
      )
      .orderBy(desc(documents.createdAt)) as any;
  }

  async getWorkflow(id: string): Promise<Workflow | undefined> {
    const [workflow] = await db.select().from(workflows).where(eq(workflows.id, id));
    return workflow || undefined;
  }

  async getWorkflowByDocumentId(documentId: string): Promise<Workflow | undefined> {
    const [workflow] = await db.select().from(workflows).where(eq(workflows.documentId, documentId));
    return workflow || undefined;
  }

  async createWorkflow(insertWorkflow: InsertWorkflow): Promise<Workflow> {
    const [workflow] = await db
      .insert(workflows)
      .values({
        ...insertWorkflow,
        stepRoles: insertWorkflow.stepRoles as string[]
      })
      .returning();
    return workflow;
  }

  async updateWorkflow(id: string, updates: Partial<InsertWorkflow>): Promise<Workflow> {
    const updateData: any = { 
      ...updates, 
      updatedAt: new Date()
    };
    
    if (updates.stepRoles) {
      updateData.stepRoles = Array.isArray(updates.stepRoles) ? updates.stepRoles : Array.from(updates.stepRoles);
    }
    
    const [workflow] = await db
      .update(workflows)
      .set(updateData)
      .where(eq(workflows.id, id))
      .returning();
    return workflow;
  }

  async getWorkflowWithActions(workflowId: string): Promise<(Workflow & { actions: (WorkflowAction & { user: User })[] }) | undefined> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) return undefined;

    const actions = await this.getWorkflowActions(workflowId);
    return { ...workflow, actions };
  }

  async createWorkflowAction(insertAction: InsertWorkflowAction): Promise<WorkflowAction> {
    const [action] = await db
      .insert(workflowActions)
      .values(insertAction)
      .returning();
    return action;
  }

  async getWorkflowActions(workflowId: string): Promise<(WorkflowAction & { user: User })[]> {
    return await db
      .select()
      .from(workflowActions)
      .innerJoin(users, eq(workflowActions.userId, users.id))
      .where(eq(workflowActions.workflowId, workflowId))
      .orderBy(asc(workflowActions.createdAt)) as any;
  }

  async createVerificationLog(insertLog: InsertVerificationLog): Promise<VerificationLog> {
    const [log] = await db
      .insert(verificationLogs)
      .values(insertLog)
      .returning();
    return log;
  }

  async getDocumentForVerification(hash: string): Promise<(Document & { user: User, workflow?: (Workflow & { actions: (WorkflowAction & { user: User })[] }) }) | undefined> {
    const document = await db
      .select()
      .from(documents)
      .innerJoin(users, eq(documents.userId, users.id))
      .where(eq(documents.hash, hash))
      .then(results => results[0]);

    if (!document) return undefined;

    const workflow = await this.getWorkflowByDocumentId(document.documents.id);
    let workflowWithActions;
    
    if (workflow) {
      workflowWithActions = await this.getWorkflowWithActions(workflow.id);
    }

    return {
      ...document.documents,
      user: document.users,
      workflow: workflowWithActions
    } as any;
  }
}

export const storage = new DatabaseStorage();
