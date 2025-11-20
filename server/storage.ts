import { 
  users, documents, workflows, workflowActions, verificationLogs, documentTemplates,
  type User, type InsertUser, type Document, type InsertDocument,
  type Workflow, type InsertWorkflow, type WorkflowAction, type InsertWorkflowAction,
  type VerificationLog, type InsertVerificationLog, type DocumentTemplate, type InsertDocumentTemplate
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, sql } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User>;
  deleteUser(id: string): Promise<void>;
  getAllUsers(): Promise<User[]>;
  updateLastLogin(id: string): Promise<void>;

  // Document operations  
  getDocument(id: string): Promise<Document | undefined>;
  getDocumentByHash(hash: string): Promise<Document | undefined>;
  getUserDocuments(userId: string): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: string, updates: Partial<InsertDocument>): Promise<Document>;
  deleteDocument(id: string, userId: string): Promise<void>;
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

  // Document template operations
  getAllDocumentTemplates(): Promise<DocumentTemplate[]>;
  getDocumentTemplate(id: string): Promise<DocumentTemplate | undefined>;
  getDocumentTemplateByType(type: DocumentTemplate["type"]): Promise<DocumentTemplate | undefined>;
  getDocumentTemplatesByRole(role: string): Promise<DocumentTemplate[]>;
  createDocumentTemplate(template: InsertDocumentTemplate): Promise<DocumentTemplate>;
  updateDocumentTemplate(id: string, updates: Partial<InsertDocumentTemplate>): Promise<DocumentTemplate>;
  deleteDocumentTemplate(id: string): Promise<void>;

  // Course Unit operations
  getDocumentRequestsForCourseUnit(): Promise<any[]>;
  getTranscriptRequestsForCourseUnit(): Promise<any[]>;
  getCourseUnitStats(): Promise<{ pendingRequests: number; processedToday: number; totalRequests: number }>;
  getTranscriptRequest(id: string): Promise<any | undefined>;
  getDocumentRequest(id: string): Promise<any | undefined>;
  deleteDocumentRequest(id: string, userId: string): Promise<void>;
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

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
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

  async deleteDocument(id: string, userId: string): Promise<void> {
    // First get the document to get the file path
    const document = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.userId, userId)));
    
    if (document.length === 0) {
      throw new Error("Document not found or access denied");
    }
    
    const doc = document[0];
    
    // First get the workflow ID for this document
    const workflow = await db.select({ id: workflows.id }).from(workflows).where(eq(workflows.documentId, id));
    
    if (workflow.length > 0) {
      const workflowId = workflow[0].id;
      
      // Delete related workflow actions first
      await db.delete(workflowActions).where(eq(workflowActions.workflowId, workflowId));
      
      // Delete the workflow
      await db.delete(workflows).where(eq(workflows.id, workflowId));
    }
    
    // Delete the document from database
    await db.delete(documents).where(and(eq(documents.id, id), eq(documents.userId, userId)));
    
    // Delete the physical file if it exists
    try {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), 'uploads', doc.filePath);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (fileError) {
      console.warn('Could not delete physical file:', fileError);
      // Don't fail the operation if file deletion fails
    }
  }

  async getAllDocuments(): Promise<Document[]> {
    return await db.select().from(documents).orderBy(desc(documents.createdAt));
  }

  async getPendingDocumentsForRole(role: string): Promise<(Document & { user: User, workflow: Workflow })[]> {
    const rows = await db
      .select({
        id: documents.id,
        title: documents.title,
        description: documents.description,
        type: documents.type,
        fileName: documents.fileName,
        filePath: documents.filePath,
        fileSize: documents.fileSize,
        mimeType: documents.mimeType,
        hash: documents.hash,
        status: documents.status,
        userId: documents.userId,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
        user: {
          id: users.id,
          username: users.username,
          email: users.email,
          fullName: users.fullName,
          role: users.role,
          isActive: users.isActive,
          isGraduated: users.isGraduated,
          signature: users.signature,
          createdAt: users.createdAt,
          lastLogin: users.lastLogin,
        },
        workflow: {
          id: workflows.id,
          documentId: workflows.documentId,
          currentStep: workflows.currentStep,
          totalSteps: workflows.totalSteps,
          stepRoles: workflows.stepRoles,
          isCompleted: workflows.isCompleted,
          createdAt: workflows.createdAt,
          updatedAt: workflows.updatedAt,
        },
      })
      .from(documents)
      .innerJoin(users, eq(documents.userId, users.id))
      .innerJoin(workflows, eq(documents.id, workflows.documentId))
      .where(
        and(
          eq(documents.status, "in_review"),
          eq(workflows.isCompleted, false),
          // Exclude documents uploaded by staff (academic_staff, department_head, dean, etc.)
          sql`${users.role} NOT IN ('academic_staff', 'department_head', 'dean', 'vice_chancellor', 'assistant_registrar')`
        )
      )
      .orderBy(desc(documents.createdAt));

    return rows as any;
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
    const rows = await db
      .select({
        action: {
          id: workflowActions.id,
          workflowId: workflowActions.workflowId,
          userId: workflowActions.userId,
          action: workflowActions.action,
          comment: workflowActions.comment,
          step: workflowActions.step,
          signature: workflowActions.signature,
          createdAt: workflowActions.createdAt,
        },
        user: {
          id: users.id,
          username: users.username,
          email: users.email,
          fullName: users.fullName,
          role: users.role,
          isActive: users.isActive,
          isGraduated: users.isGraduated,
          signature: users.signature,
          createdAt: users.createdAt,
          lastLogin: users.lastLogin,
        },
      })
      .from(workflowActions)
      .innerJoin(users, eq(workflowActions.userId, users.id))
      .where(eq(workflowActions.workflowId, workflowId))
      .orderBy(asc(workflowActions.createdAt));

    return rows.map(({ action, user }) => ({
      ...action,
      user: user as User,
    })) as (WorkflowAction & { user: User })[];
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

  async getAllDocumentTemplates(): Promise<DocumentTemplate[]> {
    return await db.select().from(documentTemplates).where(eq(documentTemplates.isActive, true));
  }

  async getDocumentTemplate(id: string): Promise<DocumentTemplate | undefined> {
    const [template] = await db.select().from(documentTemplates).where(eq(documentTemplates.id, id));
    return template || undefined;
  }

  async getDocumentTemplateByType(type: DocumentTemplate["type"]): Promise<DocumentTemplate | undefined> {
    const [template] = await db.select().from(documentTemplates).where(eq(documentTemplates.type, type));
    return template || undefined;
  }

  async getDocumentTemplatesByRole(role: string): Promise<DocumentTemplate[]> {
    const templates = await db.select().from(documentTemplates).where(eq(documentTemplates.isActive, true));
    return templates.filter(template => 
      template.requiredRoles.includes(role) || role === 'admin'
    );
  }

  async createDocumentTemplate(insertTemplate: InsertDocumentTemplate): Promise<DocumentTemplate> {
    const templateData: any = {
      ...insertTemplate,
      approvalPath: Array.isArray(insertTemplate.approvalPath) ? insertTemplate.approvalPath : [],
      requiredRoles: insertTemplate.requiredRoles || insertTemplate.approvalPath || [],
      signaturePlacements: insertTemplate.signaturePlacements || {}
    };
    
    const [template] = await db
      .insert(documentTemplates)
      .values(templateData)
      .returning();
    return template;
  }

  async updateDocumentTemplate(id: string, updates: Partial<InsertDocumentTemplate>): Promise<DocumentTemplate> {
    const updateData: any = { 
      ...updates, 
      updatedAt: new Date(),
    };
    
    if (updates.signaturePlacements && typeof updates.signaturePlacements === "object") {
      updateData.signaturePlacements = updates.signaturePlacements;
    }
    
    const [template] = await db
      .update(documentTemplates)
      .set(updateData)
      .where(eq(documentTemplates.id, id))
      .returning();
    return template;
  }

  async deleteDocumentTemplate(id: string): Promise<void> {
    await db.delete(documentTemplates).where(eq(documentTemplates.id, id));
  }

  // Course Unit operations
  async getDocumentRequestsForCourseUnit(): Promise<any[]> {
    const requests = await db
      .select({
        id: documents.id,
        title: documents.title,
        type: documents.type,
        createdAt: documents.createdAt,
        status: documents.status,
        student: {
          id: users.id,
          fullName: users.fullName,
          isGraduated: users.isGraduated,
        },
        workflow: {
          stepRoles: workflows.stepRoles,
          currentStep: workflows.currentStep,
          totalSteps: workflows.totalSteps,
        },
      })
      .from(documents)
      .innerJoin(users, eq(documents.userId, users.id))
      .leftJoin(workflows, eq(documents.id, workflows.documentId))
      .where(and(
        sql`${documents.status} IN ('pending', 'in_review')`,
        sql`${documents.type} != 'transcript_request'`
      ))
      .orderBy(desc(documents.createdAt));
    
    return requests;
  }

  async getTranscriptRequestsForCourseUnit(): Promise<any[]> {
    const requests = await db
      .select({
        id: documents.id,
        title: documents.title,
        type: documents.type,
        createdAt: documents.createdAt,
        status: documents.status,
        student: {
          id: users.id,
          fullName: users.fullName,
          isGraduated: users.isGraduated,
        },
        workflow: {
          stepRoles: workflows.stepRoles,
          currentStep: workflows.currentStep,
          totalSteps: workflows.totalSteps,
        },
      })
      .from(documents)
      .innerJoin(users, eq(documents.userId, users.id))
      .leftJoin(workflows, eq(documents.id, workflows.documentId))
      .where(and(
        eq(documents.type, "transcript_request"),
        sql`${documents.status} IN ('pending', 'in_review')`
      ))
      .orderBy(desc(documents.createdAt));
    
    return requests;
  }

  async getCourseUnitStats(): Promise<{ pendingRequests: number; processedToday: number; totalRequests: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalRequests] = await db
      .select({ count: sql<number>`count(*)` })
      .from(documents)
      .where(eq(documents.type, "transcript_request"));

    const [pendingRequests] = await db
      .select({ count: sql<number>`count(*)` })
      .from(documents)
      .where(and(
        eq(documents.type, "transcript_request"),
        eq(documents.status, "pending")
      ));

    const [processedToday] = await db
      .select({ count: sql<number>`count(*)` })
      .from(documents)
      .where(and(
        eq(documents.type, "transcript_request"),
        sql`${documents.updatedAt} >= ${today}`
      ));

    return {
      pendingRequests: pendingRequests.count,
      processedToday: processedToday.count,
      totalRequests: totalRequests.count,
    };
  }

  async getTranscriptRequest(id: string): Promise<any | undefined> {
    const [request] = await db
      .select({
        id: documents.id,
        title: documents.title,
        createdAt: documents.createdAt,
        status: documents.status,
        student: {
          id: users.id,
          fullName: users.fullName,
          isGraduated: users.isGraduated,
        },
      })
      .from(documents)
      .innerJoin(users, eq(documents.userId, users.id))
      .where(and(
        eq(documents.id, id),
        eq(documents.type, "transcript_request")
      ));
    
    return request || undefined;
  }

  async getDocumentRequest(id: string): Promise<any | undefined> {
    const [request] = await db
      .select({
        id: documents.id,
        title: documents.title,
        type: documents.type,
        createdAt: documents.createdAt,
        status: documents.status,
        student: {
          id: users.id,
          fullName: users.fullName,
          isGraduated: users.isGraduated,
        },
      })
      .from(documents)
      .innerJoin(users, eq(documents.userId, users.id))
      .where(and(
        eq(documents.id, id),
        sql`${documents.type} != 'transcript_request'`
      ));
    
    return request || undefined;
  }

  async deleteDocumentRequest(id: string, userId: string): Promise<void> {
    // First get the document to get the file path
    const document = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.userId, userId)));
    
    if (document.length === 0) {
      throw new Error("Document request not found or access denied");
    }
    
    const doc = document[0];
    
    // First get the workflow ID for this document
    const workflow = await db.select({ id: workflows.id }).from(workflows).where(eq(workflows.documentId, id));
    
    if (workflow.length > 0) {
      const workflowId = workflow[0].id;
      
      // Delete related workflow actions first
      await db.delete(workflowActions).where(eq(workflowActions.workflowId, workflowId));
      
      // Delete the workflow
      await db.delete(workflows).where(eq(workflows.id, workflowId));
    }
    
    // Delete the document from database
    await db.delete(documents).where(and(eq(documents.id, id), eq(documents.userId, userId)));
    
    // Delete the physical file if it exists
    try {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), 'uploads', doc.filePath);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (fileError) {
      console.warn('Could not delete physical file:', fileError);
      // Don't fail the operation if file deletion fails
    }
  }
}

export const storage = new DatabaseStorage();
