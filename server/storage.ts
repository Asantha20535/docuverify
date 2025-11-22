import { 
  users, documents, workflows, workflowActions, verificationLogs, documentTemplates,
  type User, type InsertUser, type Document, type InsertDocument,
  type Workflow, type InsertWorkflow, type WorkflowAction, type InsertWorkflowAction,
  type VerificationLog, type InsertVerificationLog, type DocumentTemplate, type InsertDocumentTemplate
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, desc, asc, sql } from "drizzle-orm";
import { encryptSignature, decryptSignature } from "./signature-crypto";

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
  getStaffDocuments(userId: string): Promise<(Document & { forwardedFromUser?: User | null })[]>;
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
  
  // Audit log operations
  getAuditLogs(limit?: number): Promise<any[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (user && user.signature) {
      user.signature = decryptSignature(user.signature);
    }
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (user && user.signature) {
      user.signature = decryptSignature(user.signature);
    }
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (user && user.signature) {
      user.signature = decryptSignature(user.signature);
    }
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
    // Encrypt signature before saving
    const encryptedUpdates = { ...updates };
    if (encryptedUpdates.signature !== undefined) {
      encryptedUpdates.signature = encryptSignature(encryptedUpdates.signature);
    }
    
    const [user] = await db
      .update(users)
      .set(encryptedUpdates)
      .where(eq(users.id, id))
      .returning();
    
    // Decrypt signature when returning
    if (user && user.signature) {
      user.signature = decryptSignature(user.signature);
    }
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getAllUsers(): Promise<User[]> {
    const allUsers = await db.select().from(users).orderBy(asc(users.fullName));
    // Decrypt signatures for all users
    return allUsers.map(user => {
      if (user.signature) {
        user.signature = decryptSignature(user.signature);
      }
      return user;
    });
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

  async getStaffDocuments(userId: string): Promise<(Document & { forwardedFromUser?: User | null })[]> {
    // Get documents uploaded by user OR forwarded to user
    const docs = await db
      .select({
        document: documents,
        forwardedFromUser: users,
      })
      .from(documents)
      .leftJoin(users, eq(documents.forwardedFromUserId, users.id))
      .where(
        or(
          eq(documents.userId, userId),
          eq(documents.forwardedToUserId, userId)
        )
      )
      .orderBy(desc(documents.createdAt));

    return docs.map(({ document, forwardedFromUser }) => {
      // Decrypt signature if forwardedFromUser exists
      let decryptedForwardedFromUser = forwardedFromUser;
      if (decryptedForwardedFromUser && decryptedForwardedFromUser.signature) {
        decryptedForwardedFromUser = {
          ...decryptedForwardedFromUser,
          signature: decryptSignature(decryptedForwardedFromUser.signature),
        };
      }
      return {
        ...document,
        forwardedFromUser: decryptedForwardedFromUser || null,
      };
    });
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
        forwardedToUserId: documents.forwardedToUserId,
        forwardedFromUserId: documents.forwardedFromUserId,
        forwardedAt: documents.forwardedAt,
        fileMetadata: documents.fileMetadata,
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
          // Exclude documents uploaded by staff, EXCEPT vacation_request and funding_request which should follow workflow
          sql`(
            ${users.role} NOT IN ('academic_staff', 'department_head', 'dean', 'vice_chancellor', 'assistant_registrar')
            OR ${documents.type} IN ('vacation_request', 'funding_request')
          )`
        )
      )
      .orderBy(desc(documents.createdAt));

    // Decrypt user signatures
    return rows.map((row: any) => {
      if (row.user && row.user.signature) {
        row.user.signature = decryptSignature(row.user.signature);
      }
      return row;
    }) as any;
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
    // Encrypt signature before saving
    const encryptedAction = { ...insertAction };
    if (encryptedAction.signature !== undefined) {
      encryptedAction.signature = encryptSignature(encryptedAction.signature);
    }
    
    const [action] = await db
      .insert(workflowActions)
      .values(encryptedAction)
      .returning();
    
    // Decrypt signature when returning
    if (action && action.signature) {
      action.signature = decryptSignature(action.signature);
    }
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

    return rows.map(({ action, user }) => {
      // Decrypt signatures
      const decryptedAction = { ...action };
      if (decryptedAction.signature) {
        decryptedAction.signature = decryptSignature(decryptedAction.signature);
      }
      const decryptedUser = { ...user };
      if (decryptedUser.signature) {
        decryptedUser.signature = decryptSignature(decryptedUser.signature);
      }
      return {
        ...decryptedAction,
        user: decryptedUser as User,
      };
    }) as (WorkflowAction & { user: User })[];
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

    // Decrypt user signature
    const decryptedUser = { ...document.users };
    if (decryptedUser.signature) {
      decryptedUser.signature = decryptSignature(decryptedUser.signature);
    }
    
    return {
      ...document.documents,
      user: decryptedUser,
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
    const allRequests = await db
      .select({
        id: documents.id,
        title: documents.title,
        type: documents.type,
        createdAt: documents.createdAt,
        status: documents.status,
        fileMetadata: documents.fileMetadata,
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
      .innerJoin(workflows, eq(documents.id, workflows.documentId))
      .where(and(
        sql`${documents.status} IN ('pending', 'in_review')`,
        sql`${documents.type} != 'transcript_request'`,
        eq(workflows.isCompleted, false)
      ))
      .orderBy(desc(documents.createdAt));
    
    // Filter to show documents where course_unit is in the workflow path
    // Documents remain visible until the entire workflow is completed
    const requests = allRequests.filter((req: any) => {
      if (!req.workflow || !req.workflow.stepRoles) {
        return false;
      }
      // Check if course_unit appears anywhere in the workflow path
      return req.workflow.stepRoles.includes("course_unit");
    });
    
    return requests;
  }

  async getTranscriptRequestsForCourseUnit(): Promise<any[]> {
    const allRequests = await db
      .select({
        id: documents.id,
        title: documents.title,
        type: documents.type,
        createdAt: documents.createdAt,
        status: documents.status,
        fileMetadata: documents.fileMetadata,
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
      .innerJoin(workflows, eq(documents.id, workflows.documentId))
      .where(and(
        eq(documents.type, "transcript_request"),
        sql`${documents.status} IN ('pending', 'in_review')`,
        eq(workflows.isCompleted, false)
      ))
      .orderBy(desc(documents.createdAt));
    
    // Filter to show documents where course_unit is in the workflow path
    // Documents remain visible until the entire workflow is completed
    const requests = allRequests.filter((req: any) => {
      if (!req.workflow || !req.workflow.stepRoles) {
        return false;
      }
      // Check if course_unit appears anywhere in the workflow path
      return req.workflow.stepRoles.includes("course_unit");
    });
    
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

  async getAuditLogs(limit: number = 100): Promise<any[]> {
    // Get workflow actions with user and document info
    const workflowActionLogs = await db
      .select({
        id: workflowActions.id,
        type: sql<string>`'workflow_action'`.as('type'),
        action: workflowActions.action,
        comment: workflowActions.comment,
        step: workflowActions.step,
        createdAt: workflowActions.createdAt,
        user: {
          id: users.id,
          fullName: users.fullName,
          role: users.role,
          username: users.username,
        },
        document: {
          id: documents.id,
          title: documents.title,
          type: documents.type,
          hash: documents.hash,
        },
        workflow: {
          id: workflows.id,
        },
      })
      .from(workflowActions)
      .innerJoin(users, eq(workflowActions.userId, users.id))
      .innerJoin(workflows, eq(workflowActions.workflowId, workflows.id))
      .innerJoin(documents, eq(workflows.documentId, documents.id))
      .orderBy(desc(workflowActions.createdAt))
      .limit(limit);

    // Get verification logs
    const verificationLogsData = await db
      .select({
        id: verificationLogs.id,
        type: sql<string>`'verification'`.as('type'),
        documentHash: verificationLogs.documentHash,
        ipAddress: verificationLogs.ipAddress,
        userAgent: verificationLogs.userAgent,
        isVerified: verificationLogs.isVerified,
        createdAt: verificationLogs.createdAt,
      })
      .from(verificationLogs)
      .orderBy(desc(verificationLogs.createdAt))
      .limit(limit);

    // Get document creation/updates (simplified - just creation for now)
    const documentLogs = await db
      .select({
        id: documents.id,
        type: sql<string>`'document_created'`.as('type'),
        title: documents.title,
        documentType: documents.type,
        status: documents.status,
        createdAt: documents.createdAt,
        user: {
          id: users.id,
          fullName: users.fullName,
          role: users.role,
          username: users.username,
        },
      })
      .from(documents)
      .innerJoin(users, eq(documents.userId, users.id))
      .orderBy(desc(documents.createdAt))
      .limit(limit);

    // Combine and sort all logs by timestamp
    const allLogs = [
      ...workflowActionLogs.map(log => ({
        ...log,
        timestamp: log.createdAt,
      })),
      ...verificationLogsData.map(log => ({
        ...log,
        timestamp: log.createdAt,
      })),
      ...documentLogs.map(log => ({
        ...log,
        timestamp: log.createdAt,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return allLogs.slice(0, limit);
  }
}

export const storage = new DatabaseStorage();
