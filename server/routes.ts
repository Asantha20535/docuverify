import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { insertUserSchema, insertDocumentSchema, insertWorkflowActionSchema } from "@shared/schema";
import { z } from "zod";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    userRole?: string;
  }
}

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), "uploads");
const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and DOCX files are allowed"));
    }
  },
});

// Ensure upload directory exists
fs.mkdir(uploadDir, { recursive: true }).catch(console.error);

// Default workflow configurations
const workflowConfigs = {
  partial_transcript_request: ["dean"],
  transcript_request: ["dean", "vice_chancellor", "assistant_registrar"],
  enrollment_verification: ["academic_staff", "department_head", "dean"],
  grade_report: ["academic_staff", "department_head"],
  other: ["academic_staff", "department_head"],
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Session store configuration
  const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  
  const PgSession = connectPgSimple(session);
  
  // Session configuration
  app.use(session({
    store: new PgSession({
      pool: pgPool,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "university-secret-key",
    resave: true,
    saveUninitialized: true,
    cookie: {
      secure: false, // Set to false for development
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax'
    },
  }));

  // Authentication middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    next();
  };

  const requireRole = (roles: string[]) => (req: any, res: any, next: any) => {
    if (!req.session.userRole || !roles.includes(req.session.userRole)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };

  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password, role } = req.body;
      
      if (!username || !password || !role) {
        return res.status(400).json({ message: "Username, password, and role are required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user || !user.isActive) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (user.role !== role) {
        return res.status(401).json({ message: "Role mismatch" });
      }

      req.session.userId = user.id;
      req.session.userRole = user.role;
      
      await storage.updateLastLogin(user.id);

      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          isGraduated: user.isGraduated,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Could not log out" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isGraduated: user.isGraduated,
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });



  // Document routes - for staff with file uploads
  app.post("/api/documents/upload", requireAuth, requireRole(["academic_staff", "department_head", "dean", "vice_chancellor", "assistant_registrar"]), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { title, description, templateId } = req.body;
      
      if (!title || !templateId) {
        return res.status(400).json({ message: "Title and template are required" });
      }

      const template = await storage.getDocumentTemplate(templateId);
      if (!template) {
        return res.status(400).json({ message: "Invalid template selected" });
      }

      // Read file into memory and generate SHA-256 hash
      const fileBuffer = await fs.readFile(req.file.path);
      const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      // Create organized file path
      const user = await storage.getUser(req.session.userId!);
      const datePath = new Date().toISOString().split('T')[0];
      const userDir = path.join(uploadDir, user!.username, datePath);
      await fs.mkdir(userDir, { recursive: true });
      
      const finalPath = path.join(userDir, `${hash}${path.extname(req.file.originalname)}`);
      await fs.rename(req.file.path, finalPath);

      // Save document metadata and content as base64 for DB storage
      const document = await storage.createDocument({
        title,
        description: description || null,
        type: template.type,
        fileName: req.file.originalname,
        filePath: finalPath,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        hash,
        fileContent: Buffer.from(fileBuffer).toString("base64") as any,
        fileMetadata: {
          originalName: req.file.originalname,
          storedPath: finalPath,
        } as any,
        userId: req.session.userId!,
        status: "pending",
      });

      // Create workflow using template's approval path
      const stepRoles = template.approvalPath;
      await storage.createWorkflow({
        documentId: document.id,
        currentStep: 0,
        totalSteps: stepRoles.length,
        stepRoles,
        isCompleted: false,
      });

      // Update document status to in_review
      await storage.updateDocument(document.id, { status: "in_review" });

      res.json({ document, hash });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Student document request route
  app.post("/api/documents/request-document", requireAuth, requireRole(["student"]), async (req, res) => {
    try {
      const { documentType, title, description, studentName, registrationNumber, email, level } = req.body;
      
      if (!documentType || !title || !studentName || !registrationNumber || !email || !level) {
        return res.status(400).json({ message: "All required fields must be provided" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get the workflow template for this document type
      const template = await storage.getDocumentTemplateByType(documentType);
      if (!template) {
        return res.status(400).json({ message: "Invalid document type" });
      }

      // Generate a unique hash for the document request
      const requestData = `${user.id}-${documentType}-${title}-${Date.now()}`;
      const hash = crypto.createHash("sha256").update(requestData).digest("hex");

      // Save document metadata
      const document = await storage.createDocument({
        title,
        description: description || null,
        type: documentType,
        fileName: `${documentType}_request.pdf`, // Placeholder filename
        filePath: "", // No file path for requests
        fileSize: 0,
        mimeType: "application/pdf",
        hash,
        userId: req.session.userId!,
        status: "pending",
      });

      // Create workflow using template's approval path
      await storage.createWorkflow({
        documentId: document.id,
        currentStep: 0,
        totalSteps: template.approvalPath.length,
        stepRoles: template.approvalPath,
        isCompleted: false,
      });

      // Update document status to in_review
      await storage.updateDocument(document.id, { status: "in_review" });

      res.json({ document, hash });
    } catch (error) {
      console.error("Document request error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Student transcript request route (keep for backward compatibility)
  app.post("/api/documents/request-transcript", requireAuth, requireRole(["student"]), async (req, res) => {
    try {
      const { title, description } = req.body;
      
      if (!title) {
        return res.status(400).json({ message: "Title is required" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Determine approval path based on graduation status
      const stepRoles = user.isGraduated 
        ? ["academic_staff", "assistant_registrar"]  // Graduated students
        : ["academic_staff", "dean"];                 // Non-graduated students

      // Generate a unique hash for the transcript request (no file uploaded)
      const requestData = `${user.id}-${title}-${Date.now()}`;
      const hash = crypto.createHash("sha256").update(requestData).digest("hex");

      // Save document metadata (no actual file for transcript requests)
      const document = await storage.createDocument({
        title,
        description: description || null,
        type: "transcript_request",
        fileName: "transcript_request.pdf", // Placeholder filename
        filePath: "", // No file path for requests
        fileSize: 0,
        mimeType: "application/pdf",
        hash,
        userId: req.session.userId!,
        status: "pending",
      });

      // Create workflow
      await storage.createWorkflow({
        documentId: document.id,
        currentStep: 0,
        totalSteps: stepRoles.length,
        stepRoles,
        isCompleted: false,
      });

      // Update document status to in_review
      await storage.updateDocument(document.id, { status: "in_review" });

      res.json({ document, hash });
    } catch (error) {
      console.error("Transcript request error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/documents", requireAuth, async (req, res) => {
    try {
      const documents = await storage.getUserDocuments(req.session.userId!);
      res.json(documents);
    } catch (error) {
      console.error("Get documents error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Serve document content (binary) for viewing/downloading
  app.get("/api/documents/:documentId/content", requireAuth, async (req, res) => {
    try {
      const { documentId } = req.params;
      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const mimeType = (document as any).mimeType || "application/octet-stream";
      const fileName = (document as any).fileName || "document";
      const forceDownload = String((req.query.download ?? "")).toLowerCase() === "1";

      res.setHeader("Content-Type", mimeType);
      res.setHeader(
        "Content-Disposition",
        `${forceDownload ? "attachment" : "inline"}; filename="${fileName}"`
      );

      // If stored in DB as base64
      if ((document as any).fileContent) {
        const base64 = (document as any).fileContent as unknown as string;
        const buffer = Buffer.from(base64, "base64");
        return res.end(buffer);
      }

      // Else stream from filesystem if path exists
      if ((document as any).filePath) {
        try {
          const buffer = await fs.readFile((document as any).filePath);
          return res.end(buffer);
        } catch (e) {
          // Fall through to 404 below
        }
      }

      return res.status(404).json({ message: "Document content not available" });
    } catch (error) {
      console.error("Get document content error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/documents/pending", requireAuth, async (req, res) => {
    try {
      const documents = await storage.getPendingDocumentsForRole(req.session.userRole!);
      
      // Filter documents that are at the current user's step
      const filteredDocuments = [];
      for (const doc of documents) {
        const workflow = doc.workflow;
        const currentStepRole = workflow.stepRoles[workflow.currentStep];
        if (currentStepRole === req.session.userRole) {
          filteredDocuments.push(doc);
        }
      }
      
      res.json(filteredDocuments);
    } catch (error) {
      console.error("Get pending documents error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Workflow routes
  app.post("/api/workflow/:workflowId/action", requireAuth, async (req, res) => {
    try {
      const { workflowId } = req.params;
      const { action, comment } = req.body;

      if (!action) {
        return res.status(400).json({ message: "Action is required" });
      }

      const workflow = await storage.getWorkflow(workflowId);
      if (!workflow) {
        return res.status(404).json({ message: "Workflow not found" });
      }

      const user = await storage.getUser(req.session.userId!);
      const currentStepRole = workflow.stepRoles[workflow.currentStep];
      
      if (currentStepRole !== user!.role) {
        return res.status(403).json({ message: "Not authorized for this workflow step" });
      }

      // Normalize client action to DB enum action
      const dbAction = action === "approve"
        ? "approved"
        : action === "forward"
        ? "forwarded"
        : action === "reject"
        ? "rejected"
        : null;

      if (!dbAction) {
        return res.status(400).json({ message: "Invalid action" });
      }

      // Create workflow action
      const signature = action === "approve" ? user!.fullName : null;
      await storage.createWorkflowAction({
        workflowId: workflow.id,
        userId: user!.id,
        action: dbAction as any,
        comment: comment || null,
        step: workflow.currentStep,
        signature,
      });

      // Update workflow based on action
      let updates: any = {};
      
      if (action === "approve" || action === "forward") {
        const nextStep = workflow.currentStep + 1;
        if (nextStep >= workflow.totalSteps) {
          // Workflow completed
          updates = {
            currentStep: nextStep,
            isCompleted: true,
          };
          
          // Update document status
          await storage.updateDocument(workflow.documentId, { status: "approved" });
        } else {
          updates = {
            currentStep: nextStep,
          };
        }
      } else if (action === "reject") {
        updates = {
          isCompleted: true,
        };
        
        // Update document status
        await storage.updateDocument(workflow.documentId, { status: "rejected" });
      }

      if (Object.keys(updates).length > 0) {
        await storage.updateWorkflow(workflow.id, updates);
      }

      res.json({ message: "Action processed successfully" });
    } catch (error) {
      console.error("Workflow action error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/workflow/:workflowId", requireAuth, async (req, res) => {
    try {
      const { workflowId } = req.params;
      const workflow = await storage.getWorkflowWithActions(workflowId);
      
      if (!workflow) {
        return res.status(404).json({ message: "Workflow not found" });
      }

      res.json(workflow);
    } catch (error) {
      console.error("Get workflow error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin routes
  app.get("/api/admin/users", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const existingEmail = await storage.getUserByEmail(userData.email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword,
      });

      res.json({ id: user.id, username: user.username, email: user.email, fullName: user.fullName, role: user.role });
    } catch (error) {
      console.error("Create user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/documents", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const documents = await storage.getAllDocuments();
      res.json(documents);
    } catch (error) {
      console.error("Get all documents error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin user management routes
  app.delete("/api/admin/users/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteUser(id);
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/users/:id/deactivate", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { id } = req.params;
      await storage.updateUser(id, { isActive: false });
      res.json({ message: "User deactivated successfully" });
    } catch (error) {
      console.error("Deactivate user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/users/:id/activate", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { id } = req.params;
      await storage.updateUser(id, { isActive: true });
      res.json({ message: "User activated successfully" });
    } catch (error) {
      console.error("Activate user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Signature upload route
  app.post("/api/admin/users/:id/signature", requireAuth, requireRole(["admin"]), upload.single('signature'), async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ message: "No signature file uploaded" });
      }

      // Validate file type
      if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ message: "Only image files are allowed" });
      }

      // Update user with signature file path
      await storage.updateUser(id, { signature: req.file.filename });
      
      res.json({ message: "Signature uploaded successfully", filename: req.file.filename });
    } catch (error) {
      console.error("Upload signature error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Public verification route
  app.post("/api/verify", async (req, res) => {
    try {
      const { hash } = req.body;
      
      if (!hash || !/^[a-fA-F0-9]{64}$/.test(hash)) {
        return res.status(400).json({ message: "Invalid hash format" });
      }

      const document = await storage.getDocumentForVerification(hash);
      const isVerified = !!document && document.status === "approved";

      // Log verification attempt
      await storage.createVerificationLog({
        documentHash: hash,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
        isVerified,
      });

      if (isVerified && document) {
        // Return limited information for verified documents
        const finalSignatory = document.workflow?.actions
          .filter(action => action.signature)
          .slice(-1)[0];

        res.json({
          verified: true,
          document: {
            title: document.title,
            type: document.type,
            student: document.user.fullName,
            issueDate: document.createdAt,
            hash: document.hash,
            finalSignatory: finalSignatory?.user.fullName,
            status: document.status,
          },
        });
      } else {
        res.json({
          verified: false,
          message: "Document not found or not verified",
        });
      }
    } catch (error) {
      console.error("Verification error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Statistics routes
  app.get("/api/stats/user", requireAuth, async (req, res) => {
    try {
      const documents = await storage.getUserDocuments(req.session.userId!);
      
      const stats = {
        totalDocuments: documents.length,
        pendingDocuments: documents.filter(d => d.status === "pending" || d.status === "in_review").length,
        approvedDocuments: documents.filter(d => d.status === "approved").length,
        rejectedDocuments: documents.filter(d => d.status === "rejected").length,
      };

      res.json(stats);
    } catch (error) {
      console.error("Get user stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/stats/workflow", requireAuth, async (req, res) => {
    try {
      const pendingDocuments = await storage.getPendingDocumentsForRole(req.session.userRole!);
      
      // Filter for current user's role
      const userPending = pendingDocuments.filter(doc => {
        const workflow = doc.workflow;
        const currentStepRole = workflow.stepRoles[workflow.currentStep];
        return currentStepRole === req.session.userRole;
      });

      const stats = {
        pendingReview: userPending.length,
        approvedToday: 0, // Would need additional query for today's approvals
        inWorkflow: pendingDocuments.length,
      };

      res.json(stats);
    } catch (error) {
      console.error("Get workflow stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Document template routes
  app.get("/api/templates", requireAuth, async (req, res) => {
    try {
      // For students, show all active templates
      // For other roles, filter by required roles
      const templates = req.session.userRole === "student" 
        ? await storage.getAllDocumentTemplates()
        : await storage.getDocumentTemplatesByRole(req.session.userRole!);
      
      // Filter to only show active templates
      const activeTemplates = templates.filter(template => template.isActive);
      res.json(activeTemplates);
    } catch (error) {
      console.error("Get templates error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/templates", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const templates = await storage.getAllDocumentTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Get all templates error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/templates", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const template = await storage.createDocumentTemplate(req.body);
      res.status(201).json(template);
    } catch (error) {
      console.error("Create template error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/admin/templates/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const template = await storage.updateDocumentTemplate(req.params.id, req.body);
      res.json(template);
    } catch (error) {
      console.error("Update template error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/templates/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      await storage.deleteDocumentTemplate(req.params.id);
      res.json({ message: "Template deleted successfully" });
    } catch (error) {
      console.error("Delete template error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Course Unit routes
  app.get("/api/course-unit/document-requests", requireAuth, requireRole(["course_unit"]), async (req, res) => {
    try {
      const requests = await storage.getDocumentRequestsForCourseUnit();
      res.json(requests);
    } catch (error) {
      console.error("Get document requests error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/course-unit/transcript-requests", requireAuth, requireRole(["course_unit"]), async (req, res) => {
    try {
      const requests = await storage.getTranscriptRequestsForCourseUnit();
      res.json(requests);
    } catch (error) {
      console.error("Get transcript requests error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/course-unit/stats", requireAuth, requireRole(["course_unit"]), async (req, res) => {
    try {
      const stats = await storage.getCourseUnitStats();
      res.json(stats);
    } catch (error) {
      console.error("Get course unit stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/course-unit/upload-document", requireAuth, requireRole(["course_unit"]), upload.single('document'), async (req, res) => {
    try {
      const { requestId, comments } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ message: "Document file is required" });
      }

      // Get the document request
      const request = await storage.getDocumentRequest(requestId);
      if (!request) {
        return res.status(404).json({ message: "Document request not found" });
      }

      // Get the workflow template for this document type
      const template = await storage.getDocumentTemplateByType(request.type);
      if (!template) {
        return res.status(400).json({ message: "No workflow template found for this document type" });
      }

      // Read buffer and generate hash for the uploaded file
      const fileBuffer = await fs.readFile(req.file.path);
      const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      // Create organized file path
      const user = await storage.getUser(req.session.userId!);
      const datePath = new Date().toISOString().split('T')[0];
      const userDir = path.join(uploadDir, user!.username, datePath);
      await fs.mkdir(userDir, { recursive: true });
      
      const finalPath = path.join(userDir, `${hash}${path.extname(req.file.originalname)}`);
      await fs.rename(req.file.path, finalPath);

      // Create document with content as base64 for DB storage
      const document = await storage.createDocument({
        title: `${request.type.replace('_', ' ').toUpperCase()} - ${request.student.fullName}`,
        description: `Uploaded ${request.type.replace('_', ' ')} for ${request.student.fullName}. ${comments ? `Comments: ${comments}` : ""}`,
        type: request.type,
        fileName: req.file.originalname,
        filePath: finalPath,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        hash,
        fileContent: Buffer.from(fileBuffer).toString("base64") as any,
        fileMetadata: {
          originalName: req.file.originalname,
          storedPath: finalPath,
        } as any,
        status: "pending",
        userId: request.student.id,
      });
      
      // Create workflow using template's approval path
      const workflow = await storage.createWorkflow({
        documentId: document.id,
        currentStep: 0,
        totalSteps: template.approvalPath.length,
        stepRoles: template.approvalPath,
        isCompleted: false,
      });

      // Create initial workflow action (course unit uploaded)
      await storage.createWorkflowAction({
        workflowId: workflow.id,
        userId: req.session.userId!,
        action: "uploaded",
        comment: `${request.type.replace('_', ' ')} uploaded. ${comments ? `Comments: ${comments}` : ""}`,
        step: 0,
        signature: req.session.userId!,
      });

      // Update original request status to completed
      await storage.updateDocument(requestId, { status: "completed" });

      // Check if course_unit is the first step in the workflow
      // If so, automatically advance to the next step
      if (template.approvalPath[0] === "course_unit") {
        // Auto-advance to next step since course unit already uploaded
        const nextStep = 1;
        if (nextStep < template.approvalPath.length) {
          await storage.updateWorkflow(workflow.id, {
            currentStep: nextStep,
          });
        } else {
          // Workflow completed if course_unit was the only step
          await storage.updateWorkflow(workflow.id, {
            currentStep: nextStep,
            isCompleted: true,
          });
          await storage.updateDocument(document.id, { status: "approved" });
        }
      }

      // Update document status to in_review to start the workflow
      await storage.updateDocument(document.id, { status: "in_review" });

      res.json({ message: "Document uploaded and forwarded successfully" });
    } catch (error) {
      console.error("Upload document error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Keep the old transcript endpoint for backward compatibility
  app.post("/api/course-unit/upload-transcript", requireAuth, requireRole(["course_unit"]), upload.single('transcript'), async (req, res) => {
    try {
      const { requestId, comments } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ message: "Transcript file is required" });
      }

      // Get the transcript request
      const request = await storage.getTranscriptRequest(requestId);
      if (!request) {
        return res.status(404).json({ message: "Transcript request not found" });
      }

      // Generate hash for the uploaded file (read from disk path)
      const fileBuffer = await fs.readFile(req.file.path);
      const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      // Create transcript document
      const transcriptDocument = await storage.createDocument({
        title: `Transcript - ${request.student.fullName}`,
        description: `Uploaded transcript for ${request.student.fullName}. ${comments ? `Comments: ${comments}` : ""}`,
        type: "academic_record",
        fileName: req.file.originalname,
        filePath: req.file.path,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        hash,
        fileContent: Buffer.from(fileBuffer).toString("base64") as any,
        fileMetadata: {
          originalName: req.file.originalname,
          storedPath: req.file.path,
        } as any,
        status: "pending",
        userId: request.student.id,
      });
      
      // Get the workflow template for transcript requests
      const template = await storage.getDocumentTemplateByType("transcript_request");
      if (!template) {
        return res.status(400).json({ message: "No workflow template found for transcript requests" });
      }
      
      // Create workflow using template's approval path
      const workflow = await storage.createWorkflow({
        documentId: transcriptDocument.id,
        currentStep: 0,
        totalSteps: template.approvalPath.length,
        stepRoles: template.approvalPath,
        isCompleted: false,
      });

      // Create initial workflow action (course unit uploaded)
      await storage.createWorkflowAction({
        workflowId: workflow.id,
        userId: req.session.userId!,
        action: "uploaded",
        comment: `Transcript uploaded. ${comments ? `Comments: ${comments}` : ""}`,
        step: 0,
        signature: req.session.userId!,
      });

      // Update original request status to completed
      await storage.updateDocument(requestId, { status: "completed" });

      // Check if course_unit is the first step in the workflow
      // If so, automatically advance to the next step
      if (template.approvalPath[0] === "course_unit") {
        // Auto-advance to next step since course unit already uploaded
        const nextStep = 1;
        if (nextStep < template.approvalPath.length) {
          await storage.updateWorkflow(workflow.id, {
            currentStep: nextStep,
          });
        } else {
          // Workflow completed if course_unit was the only step
          await storage.updateWorkflow(workflow.id, {
            currentStep: nextStep,
            isCompleted: true,
          });
          await storage.updateDocument(transcriptDocument.id, { status: "approved" });
        }
      }

      // Update document status to in_review to start the workflow
      await storage.updateDocument(transcriptDocument.id, { status: "in_review" });

      res.json({ message: "Transcript uploaded and forwarded successfully" });
    } catch (error) {
      console.error("Upload transcript error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
