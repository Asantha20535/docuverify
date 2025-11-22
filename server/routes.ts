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
import { createReadStream } from "fs";
import { insertUserSchema, insertDocumentSchema, insertWorkflowActionSchema } from "@shared/schema";
import type { Document as DbDocument, DocumentTemplate } from "@shared/schema";
import { z } from "zod";
import { applySignatureToPdf, parseSignatureDataUrl } from "./signature-service";
import type { NormalizedSignaturePlacement } from "./signature-service";
import { decryptSignature } from "./signature-crypto";

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

const detectMimeTypeFromPath = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".bmp") return "image/bmp";
  return "image/png";
};

const attemptLoadSignatureFile = async (storedValue: string): Promise<string | null> => {
  const candidates = [
    storedValue,
    path.join(uploadDir, storedValue),
  ];

  for (const candidate of candidates) {
    try {
      const buffer = await fs.readFile(candidate);
      const mimeType = detectMimeTypeFromPath(candidate);
      return `data:${mimeType};base64,${buffer.toString("base64")}`;
    } catch {
      continue;
    }
  }

  return null;
};

const ensureSignatureDataUrl = async (userId: string, signatureValue?: string | null): Promise<string | null> => {
  if (!signatureValue) return null;
  
  // Decrypt if encrypted
  const decrypted = decryptSignature(signatureValue);
  if (!decrypted) return null;
  
  if (decrypted.startsWith("data:image")) {
    return decrypted;
  }

  const normalized = await attemptLoadSignatureFile(decrypted);
  if (normalized) {
    await storage.updateUser(userId, { signature: normalized });
    return normalized;
  }

  return null;
};

// Default workflow configurations
const workflowConfigs = {
  partial_transcript_request: ["dean"],
  transcript_request: ["dean", "vice_chancellor", "assistant_registrar"],
  enrollment_verification: ["academic_staff", "department_head", "dean"],
  grade_report: ["academic_staff", "department_head"],
  other: ["academic_staff", "department_head"],
};

const parseJsonField = <T>(value: unknown, fallback: T): T => {
  if (!value) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
};

const normalizeApprovalPath = (value: unknown): string[] => {
  const parsed = parseJsonField<string[] | undefined>(value, Array.isArray(value) ? (value as string[]) : undefined);
  if (!parsed) return [];
  return parsed.filter((role) => typeof role === "string" && role.trim().length > 0);
};

const normalizeSignaturePlacements = (
  value: unknown,
): Record<string, { page: number; x: number; y: number }[]> => {
  const parsed = parseJsonField<Record<string, any>>(value, {});
  if (!parsed || typeof parsed !== "object") {
    return {};
  }

  const normalized: Record<string, { page: number; x: number; y: number }[]> = {};

  Object.entries(parsed).forEach(([role, placements]) => {
    if (!Array.isArray(placements)) return;
    const clean = placements
      .map((placement) => {
        const page = Number(placement?.page);
        const x = Number(placement?.x);
        const y = Number(placement?.y);

        if (Number.isNaN(page) || Number.isNaN(x) || Number.isNaN(y)) {
          return null;
        }

        return {
          page: page < 1 ? 1 : page,
          x: Math.min(Math.max(x, 0), 1),
          y: Math.min(Math.max(y, 0), 1),
        };
      })
      .filter((placement): placement is { page: number; x: number; y: number } => Boolean(placement));

    if (clean.length) {
      normalized[role] = clean;
    }
  });

  return normalized;
};

const ensureTemplateFileRemoved = async (file?: Express.Multer.File | null) => {
  if (!file) return;
  try {
    await fs.unlink(file.path);
  } catch {
    // ignore cleanup errors
  }
};

const sanitizeNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const selectTemplatePlacementForRole = (
  template: DocumentTemplate | undefined,
  document: DbDocument,
  role: string,
): NormalizedSignaturePlacement | undefined => {
  if (!template?.signaturePlacements) {
    return undefined;
  }

  const normalizedRole = role?.toLowerCase?.() ? role.toLowerCase() : role;
  const placements =
    template.signaturePlacements[role] ??
    template.signaturePlacements[normalizedRole];

  if (!placements || placements.length === 0) {
    return undefined;
  }

  const metadata =
    document.fileMetadata && typeof document.fileMetadata === "object"
      ? (document.fileMetadata as Record<string, any>)
      : null;

  const metadataPlacements = metadata?.signaturePlacements;
  const history: any[] = Array.isArray(metadataPlacements) ? metadataPlacements : [];
  const usedCount = history.filter((entry: any) => entry?.role === role).length;

  const selected = placements[Math.min(usedCount, placements.length - 1)];
  if (!selected) {
    return undefined;
  }

  return {
    page: sanitizeNumber(selected.page, 1),
    x: sanitizeNumber(selected.x, 0.5),
    y: sanitizeNumber(selected.y, 0.5),
    ...(typeof selected.width === "number" ? { width: selected.width } : {}),
    ...(typeof selected.height === "number" ? { height: selected.height } : {}),
  };
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

      const normalizedSignature = await ensureSignatureDataUrl(user.id, user.signature);

      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          isGraduated: user.isGraduated,
          signature: normalizedSignature,
          isActive: user.isActive,
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

      const normalizedSignature = await ensureSignatureDataUrl(user.id, user.signature);

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isGraduated: user.isGraduated,
        signature: normalizedSignature,
        isActive: user.isActive,
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
      
      if (!title) {
        return res.status(400).json({ message: "Title is required" });
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

      // For staff uploads, make documents private (no workflow, just personal storage)
      // Save document metadata and content as base64 for DB storage
      const document = await storage.createDocument({
        title,
        description: description || null,
        type: "other",
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
        status: "completed", // Mark as completed since no workflow needed
      });

      // No workflow created for staff uploads - documents are private

      res.json({ document, hash });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Staff document request route (Academic Staff and Department Head only)
  app.post("/api/documents/request-document-staff", requireAuth, requireRole(["academic_staff", "department_head"]), async (req, res) => {
    try {
      const { documentType, name, note } = req.body;
      
      if (!documentType || !name) {
        return res.status(400).json({ message: "Document type and name are required" });
      }

      // Only allow vacation_request and funding_request
      if (documentType !== "vacation_request" && documentType !== "funding_request") {
        return res.status(400).json({ message: "Invalid document type for staff requests" });
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
      const title = `${documentType === "vacation_request" ? "Vacation Request" : "Funding Request"} - ${name}`;
      const requestData = `${user.id}-${documentType}-${name}-${Date.now()}`;
      const hash = crypto.createHash("sha256").update(requestData).digest("hex");

      // Save document metadata with request form details
      const document = await storage.createDocument({
        title,
        description: note || null,
        type: documentType,
        fileName: `${documentType}_request.pdf`, // Placeholder filename
        filePath: "", // No file path for requests
        fileSize: 0,
        mimeType: "application/pdf",
        hash,
        userId: req.session.userId!,
        status: "pending",
        fileMetadata: {
          name,
          note: note || null,
        },
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
      console.error("Staff document request error:", error);
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

      // Save document metadata with request form details
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
        fileMetadata: {
          studentName,
          registrationNumber,
          email,
          level,
        },
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
      const userRole = req.session.userRole!;
      const staffRoles = ["academic_staff", "department_head", "dean", "vice_chancellor", "assistant_registrar"];
      
      // For staff users, return documents they uploaded OR documents forwarded to them
      if (staffRoles.includes(userRole)) {
        const documents = await storage.getStaffDocuments(req.session.userId!);
        res.json(documents);
      } else {
        // For other users (students), return only their uploaded documents
        const documents = await storage.getUserDocuments(req.session.userId!);
        res.json(documents);
      }
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
        const fileBuffer = Buffer.from((document as any).fileContent, "base64");
        res.send(fileBuffer);
      } else {
        // If stored on disk
        const filePath = (document as any).filePath;
        if (filePath && await fs.access(filePath).then(() => true).catch(() => false)) {
          res.sendFile(filePath);
        } else {
          res.status(404).json({ message: "File not found on disk" });
        }
      }
    } catch (error) {
      console.error("Get document content error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete document endpoint
  app.delete("/api/documents/:documentId", requireAuth, async (req, res) => {
    try {
      const { documentId } = req.params;
      const document = await storage.getDocument(documentId);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Check if user owns the document
      if (document.userId !== req.session.userId) {
        return res.status(403).json({ message: "You can only delete your own documents" });
      }

      // Delete the document
      await storage.deleteDocument(documentId, req.session.userId!);
      
      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      console.error("Delete document error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Forward document endpoint
  app.post("/api/documents/:id/forward", requireAuth, requireRole(["academic_staff", "department_head", "dean", "vice_chancellor", "assistant_registrar"]), async (req, res) => {
    try {
      const { id } = req.params;
      const { userId: forwardedToUserId } = req.body;

      if (!forwardedToUserId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Check if user owns the document or it was forwarded to them
      if (document.userId !== req.session.userId && document.forwardedToUserId !== req.session.userId) {
        return res.status(403).json({ message: "You can only forward documents you own or that were forwarded to you" });
      }

      // Verify the target user exists
      const targetUser = await storage.getUser(forwardedToUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "Target user not found" });
      }

      // Update document with forwarding information
      await storage.updateDocument(id, {
        forwardedToUserId,
        forwardedFromUserId: req.session.userId!,
        forwardedAt: new Date(),
      });

      res.json({ message: "Document forwarded successfully" });
    } catch (error) {
      console.error("Forward document error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all users endpoint (for forward modal)
  app.get("/api/users", requireAuth, requireRole(["academic_staff", "department_head", "dean", "vice_chancellor", "assistant_registrar"]), async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      // Allowed roles for forwarding (exclude student, course_unit, and admin)
      const allowedRoles = ["academic_staff", "department_head", "dean", "vice_chancellor", "assistant_registrar"];
      // Return only active users with allowed roles, excluding the current user
      const users = allUsers
        .filter(user => user.isActive && user.id !== req.session.userId && allowedRoles.includes(user.role))
        .map(user => ({
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        }));
      res.json(users);
    } catch (error) {
      console.error("Get users error:", error);
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

  app.post("/api/documents/:documentId/signature", requireAuth, async (req, res) => {
    try {
      const { documentId } = req.params;
      const { signature } = req.body as { signature?: string };

      if (!signature || !signature.startsWith("data:image")) {
        return res.status(400).json({ message: "Valid signature data is required" });
      }

      const [document, workflow, user] = await Promise.all([
        storage.getDocument(documentId),
        storage.getWorkflowByDocumentId(documentId),
        storage.getUser(req.session.userId!),
      ]);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      if (!workflow) {
        return res.status(404).json({ message: "Workflow not found for document" });
      }

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (document.mimeType !== "application/pdf") {
        return res.status(400).json({ message: "Signature placement supported only for PDF documents" });
      }

      const currentStepRole = workflow.stepRoles[workflow.currentStep];
      if (currentStepRole !== user.role) {
        return res.status(403).json({ message: "Not authorized to sign at this workflow step" });
      }

      const template = await storage.getDocumentTemplateByType(document.type);
      const normalizedPlacement = selectTemplatePlacementForRole(template, document, currentStepRole);
      const placementResult = await applySignatureToPdf(document, currentStepRole, signature, {
        normalizedPlacement,
      });
      if (!placementResult) {
        return res.status(400).json({ message: "Unable to place signature for this template/role" });
      }

      await storage.updateDocument(document.id, {
        hash: placementResult.hash,
        fileSize: placementResult.buffer.length,
        fileContent: placementResult.buffer.toString("base64") as any,
        fileMetadata: placementResult.metadata as any,
      });

      await storage.createWorkflowAction({
        workflowId: workflow.id,
        userId: user.id,
        action: "signed",
        comment: null,
        step: workflow.currentStep,
        signature,
      });

      res.json({ message: "Signature applied", hash: placementResult.hash });
    } catch (error) {
      console.error("Document signature apply error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Workflow routes
  app.post("/api/workflow/:workflowId/action", requireAuth, async (req, res) => {
    try {
      const { workflowId } = req.params;
      const { action, comment, audience, visibility, signature: signatureData } = req.body as {
        action?: string;
        comment?: string;
        audience?: string;
        visibility?: string[];
        signature?: string;
      };

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

      // Normalize comment with audience visibility prefix
      const allowedAudience = new Set(["student", "next_reviewer", "both"]);
      const audienceTag = allowedAudience.has(String(audience || "").toLowerCase())
        ? `[aud:${String(audience).toLowerCase()}]`
        : "";
      let storedComment: string | null = audienceTag
        ? `${audienceTag} ${comment || ""}`.trim()
        : (comment || null);

      if (Array.isArray(visibility) && visibility.length > 0) {
        const normalized = Array.from(new Set(visibility.map(v => String(v).toLowerCase())));
        const visTag = `[vis:${normalized.join(",")}]`;
        storedComment = `${visTag} ${storedComment || ""}`.trim();
      }

      // Create workflow action
      const finalSignature = signatureData || (action === "approve" ? user!.fullName : null);
      await storage.createWorkflowAction({
        workflowId: workflow.id,
        userId: user!.id,
        action: dbAction as any,
        comment: storedComment,
        step: workflow.currentStep,
        signature: finalSignature,
      });

      if (signatureData && signatureData.startsWith("data:image")) {
        const document = await storage.getDocument(workflow.documentId);
        if (document && document.mimeType === "application/pdf") {
          try {
            const template = await storage.getDocumentTemplateByType(document.type);
            const normalizedPlacement = selectTemplatePlacementForRole(template, document, currentStepRole);
            const placementResult = await applySignatureToPdf(document, currentStepRole, signatureData, {
              normalizedPlacement,
            });
            if (placementResult) {
              await storage.updateDocument(document.id, {
                hash: placementResult.hash,
                fileSize: placementResult.buffer.length,
                fileContent: placementResult.buffer.toString("base64") as any,
                fileMetadata: placementResult.metadata as any,
              });
            }
          } catch (placementError) {
            console.error("Signature placement error:", placementError);
          }
        }
      }

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

  app.get("/api/admin/audit-logs", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const logs = await storage.getAuditLogs(limit);
      res.json(logs);
    } catch (error) {
      console.error("Get audit logs error:", error);
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

  // Profile settings routes
  app.patch("/api/profile", requireAuth, async (req, res) => {
    try {
      const { fullName, email } = req.body;
      
      if (!fullName || !email) {
        return res.status(400).json({ message: "Full name and email are required" });
      }

      // Check if email is already taken by another user
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser && existingUser.id !== req.session.userId) {
        return res.status(400).json({ message: "Email is already taken" });
      }

      const updatedUser = await storage.updateUser(req.session.userId!, {
        fullName,
        email,
      });

      res.json({
        message: "Profile updated successfully",
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          fullName: updatedUser.fullName,
          role: updatedUser.role,
          isGraduated: updatedUser.isGraduated,
        },
      });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/profile/password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body;
      
      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({ message: "All password fields are required" });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ message: "New passwords do not match" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }

      // Get current user and verify current password
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Hash new password and update
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(req.session.userId!, {
        password: hashedPassword,
      });

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const profileSignatureUploadMiddleware = (req: any, res: any, next: any) => {
    if (req.is("application/json")) {
      return next();
    }
    upload.single("signature")(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          return res.status(400).json({ message: err.message });
        }
        return res.status(400).json({ message: "Signature upload failed" });
      }
      next();
    });
  };

  const convertFileToDataUrl = async (filePath: string, mimeType: string) => {
    const buffer = await fs.readFile(filePath);
    const base64 = buffer.toString("base64");
    return `data:${mimeType};base64,${base64}`;
  };

  app.post("/api/profile/signature", requireAuth, requireRole(["academic_staff", "department_head", "dean", "vice_chancellor", "assistant_registrar", "course_unit"]), profileSignatureUploadMiddleware, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const bodySignature = typeof req.body?.signature === "string" ? req.body.signature : typeof req.body?.signatureData === "string" ? req.body.signatureData : null;
      let signatureValue: string | null = null;

      if (bodySignature && bodySignature.startsWith("data:image")) {
        const parsed = parseSignatureDataUrl(bodySignature);
        if (!parsed) {
          return res.status(400).json({ message: "Invalid signature data" });
        }
        signatureValue = bodySignature;
      } else if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          return res.status(400).json({ message: "Only image files are allowed" });
        }

        const datePath = new Date().toISOString().split('T')[0];
        const signatureDir = path.join(uploadDir, "signatures", user.username, datePath);
        await fs.mkdir(signatureDir, { recursive: true });
        
        const finalPath = path.join(signatureDir, `${req.file.filename}${path.extname(req.file.originalname)}`);
        await fs.rename(req.file.path, finalPath);
        signatureValue = await convertFileToDataUrl(finalPath, req.file.mimetype);
      }

      if (!signatureValue) {
        return res.status(400).json({ message: "No signature provided" });
      }

      await storage.updateUser(req.session.userId!, { signature: signatureValue });
      
      res.json({ 
        message: "Signature saved successfully", 
        signature: signatureValue,
      });
    } catch (error) {
      console.error("Upload signature error:", error);
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

      const signatureDataUrl = await convertFileToDataUrl(req.file.path, req.file.mimetype);
      await fs.unlink(req.file.path).catch(() => {});

      await storage.updateUser(id, { signature: signatureDataUrl });
      
      res.json({ message: "Signature uploaded successfully", signature: signatureDataUrl });
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
      // For students, show all active templates (excluding staff-only types)
      // For other roles, filter by required roles
      const templates = req.session.userRole === "student" 
        ? await storage.getAllDocumentTemplates()
        : await storage.getDocumentTemplatesByRole(req.session.userRole!);
      
      // Filter to only show active templates
      let activeTemplates = templates.filter(template => template.isActive);
      
      // For students, exclude vacation_request and funding_request
      if (req.session.userRole === "student") {
        activeTemplates = activeTemplates.filter(
          template => template.type !== "vacation_request" && template.type !== "funding_request"
        );
      }
      
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

  app.get("/api/admin/templates/:id/template", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const template = await storage.getDocumentTemplate(req.params.id);
      if (!template || !template.templateFilePath) {
        return res.status(404).json({ message: "Template not found" });
      }

      const stream = createReadStream(template.templateFilePath);
      stream.on("error", (error) => {
        console.error("Read template error:", error);
        if (!res.headersSent) {
          res.status(500).json({ message: "Unable to read template file" });
        }
      });

      res.setHeader("Content-Type", template.templateMimeType || "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${template.templateFileName || "template.pdf"}"`);
      stream.pipe(res);
    } catch (error) {
      console.error("Download template error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.post("/api/admin/templates", requireAuth, requireRole(["admin"]), upload.single("templateFile"), async (req, res) => {
    try {
      const { name, type } = req.body;
      const approvalPath = normalizeApprovalPath(req.body.approvalPath);
      const signaturePlacements = normalizeSignaturePlacements(req.body.signaturePlacements);
      const templatePageCount = req.body.templatePageCount ? Number(req.body.templatePageCount) : undefined;

      if (!name || !type) {
        await ensureTemplateFileRemoved(req.file);
        return res.status(400).json({ message: "Name and document type are required" });
      }

      if (!approvalPath.length) {
        await ensureTemplateFileRemoved(req.file);
        return res.status(400).json({ message: "Approval workflow must include at least one reviewer" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Template PDF is required" });
      }

      if (req.file.mimetype !== "application/pdf") {
        await ensureTemplateFileRemoved(req.file);
        return res.status(400).json({ message: "Template must be a PDF file" });
      }

      const missingPlacement = approvalPath.find((role) => !signaturePlacements[role] || signaturePlacements[role].length === 0);
      if (missingPlacement) {
        await ensureTemplateFileRemoved(req.file);
        return res.status(400).json({ message: `Missing signature placement for ${missingPlacement}` });
      }

      const sanitizedPlacements = approvalPath.reduce((acc, role) => {
        if (signaturePlacements[role]) {
          acc[role] = signaturePlacements[role];
        }
        return acc;
      }, {} as Record<string, { page: number; x: number; y: number }[]>);

      const payload = {
        name,
        type,
        description: req.body.description ?? "",
        approvalPath,
        requiredRoles: approvalPath,
        signaturePlacements: sanitizedPlacements,
        templateFileName: req.file.originalname,
        templateFilePath: req.file.path,
        templateFileSize: req.file.size,
        templateMimeType: req.file.mimetype,
        templatePageCount: templatePageCount && !Number.isNaN(templatePageCount) ? templatePageCount : undefined,
      };

      const template = await storage.createDocumentTemplate(payload);
      res.status(201).json(template);
    } catch (error) {
      await ensureTemplateFileRemoved(req.file);
      console.error("Create template error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/admin/templates/:id", requireAuth, requireRole(["admin"]), upload.single("templateFile"), async (req, res) => {
    try {
      const existingTemplate = await storage.getDocumentTemplate(req.params.id);
      if (!existingTemplate) {
        await ensureTemplateFileRemoved(req.file);
        return res.status(404).json({ message: "Template not found" });
      }

      const updates: Record<string, any> = {};
      let nextApprovalPath = existingTemplate.approvalPath || [];

      if (req.body.name) {
        updates.name = req.body.name;
      }

      if (req.body.type) {
        updates.type = req.body.type;
      }

      if (req.body.description !== undefined) {
        updates.description = req.body.description;
      }

      if (req.body.approvalPath) {
        const normalized = normalizeApprovalPath(req.body.approvalPath);
        if (!normalized.length) {
          await ensureTemplateFileRemoved(req.file);
          return res.status(400).json({ message: "Approval workflow must include at least one reviewer" });
        }
        updates.approvalPath = normalized;
        updates.requiredRoles = normalized;
        nextApprovalPath = normalized;
      }

      if (req.body.signaturePlacements) {
        const placements = normalizeSignaturePlacements(req.body.signaturePlacements);
        const missingPlacement = nextApprovalPath.find((role) => !placements[role] || placements[role].length === 0);
        if (missingPlacement) {
          await ensureTemplateFileRemoved(req.file);
          return res.status(400).json({ message: `Missing signature placement for ${missingPlacement}` });
        }
        updates.signaturePlacements = nextApprovalPath.reduce((acc, role) => {
          if (placements[role]) {
            acc[role] = placements[role];
          }
          return acc;
        }, {} as Record<string, { page: number; x: number; y: number }[]>);
      }

      if (req.body.templatePageCount) {
        const parsedPageCount = Number(req.body.templatePageCount);
        if (!Number.isNaN(parsedPageCount)) {
          updates.templatePageCount = parsedPageCount;
        }
      }

      if (req.file) {
        if (req.file.mimetype !== "application/pdf") {
          await ensureTemplateFileRemoved(req.file);
          return res.status(400).json({ message: "Template must be a PDF file" });
        }
        updates.templateFileName = req.file.originalname;
        updates.templateFilePath = req.file.path;
        updates.templateFileSize = req.file.size;
        updates.templateMimeType = req.file.mimetype;
      }

      const template = await storage.updateDocumentTemplate(req.params.id, updates);
      res.json(template);
    } catch (error) {
      await ensureTemplateFileRemoved(req.file);
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

  // Delete course unit request endpoint
  app.delete("/api/course-unit/requests/:requestId", requireAuth, async (req, res) => {
    try {
      const { requestId } = req.params;
      const request = await storage.getDocumentRequest(requestId);
      
      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }

      // Check if user owns the request
      if (request.student.id !== req.session.userId) {
        return res.status(403).json({ message: "You can only delete your own requests" });
      }

      // Check if request is still pending (can't delete if already processed)
      if (request.status !== "pending") {
        return res.status(400).json({ message: "Can only delete pending requests" });
      }

      // Delete the request
      await storage.deleteDocumentRequest(requestId, req.session.userId!);
      
      res.json({ message: "Request discarded successfully" });
    } catch (error) {
      console.error("Delete course unit request error:", error);
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

      // Update the existing document request with file information instead of creating a new document
      const updatedDocument = await storage.updateDocument(requestId, {
        title: `${request.type.replace('_', ' ').toUpperCase()} - ${request.student.fullName}`,
        description: `Uploaded ${request.type.replace('_', ' ')} for ${request.student.fullName}. ${comments ? `Comments: ${comments}` : ""}`,
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
        status: "in_review",
      });
      
      // Get or create workflow for the existing document
      let workflow = await storage.getWorkflowByDocumentId(requestId);
      if (!workflow) {
        // Create workflow if it doesn't exist
        workflow = await storage.createWorkflow({
          documentId: requestId,
          currentStep: 0,
          totalSteps: template.approvalPath.length,
          stepRoles: template.approvalPath,
          isCompleted: false,
        });
      }

      // Create initial workflow action (course unit uploaded)
      await storage.createWorkflowAction({
        workflowId: workflow.id,
        userId: req.session.userId!,
        action: "uploaded",
        comment: `${request.type.replace('_', ' ')} uploaded. ${comments ? `Comments: ${comments}` : ""}`,
        step: 0,
        signature: req.session.userId!,
      });

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
          await storage.updateDocument(requestId, { status: "approved" });
        }
      }

      res.json({ message: "Document uploaded and forwarded successfully" });
    } catch (error) {
      console.error("Upload document error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Upload document by first reviewer endpoint (for all roles, not just course_unit)
  app.post("/api/documents/:documentId/upload-by-reviewer", requireAuth, requireRole(["academic_staff", "department_head", "dean", "vice_chancellor", "assistant_registrar", "course_unit"]), upload.single('document'), async (req, res) => {
    try {
      const { documentId } = req.params;
      const { comments } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ message: "Document file is required" });
      }

      // Get the document
      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Get the workflow
      const workflow = await storage.getWorkflowByDocumentId(documentId);
      if (!workflow) {
        return res.status(404).json({ message: "Workflow not found" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if user is the first reviewer (currentStep === 0)
      if (workflow.currentStep !== 0) {
        return res.status(403).json({ message: "You can only upload documents as the first reviewer" });
      }

      // Check if user's role matches the first step role
      const firstStepRole = workflow.stepRoles[0];
      if (user.role !== firstStepRole) {
        return res.status(403).json({ message: "You are not authorized to upload this document" });
      }

      // Check if document comes directly from requester (not forwarded)
      if (document.forwardedToUserId || document.forwardedFromUserId) {
        return res.status(400).json({ message: "Cannot upload document that was forwarded" });
      }

      // Check if document already has a file uploaded by a reviewer
      // Check workflow actions to see if someone already uploaded
      const workflowActions = await storage.getWorkflowActions(workflow.id);
      const hasUploadAction = workflowActions.some(action => action.action === "uploaded");
      if (hasUploadAction) {
        return res.status(400).json({ message: "Document already has an uploaded file from a previous reviewer" });
      }
      
      // Also check if document has a real file (not just a placeholder from request)
      // Request documents typically have empty filePath or fileSize 0, or placeholder filenames
      // If filePath exists, is not empty, fileSize > 0, and filename doesn't look like a placeholder
      if (document.filePath && document.filePath !== "" && document.fileSize > 0) {
        // Check if filename looks like a placeholder (e.g., ends with "_request.pdf")
        const isPlaceholder = document.fileName.includes("_request") || document.fileName.includes("request");
        if (!isPlaceholder) {
          // This might be a real file, but we'll allow if no upload action exists
          // The upload action check above is the primary validation
        }
      }

      // Get the workflow template for this document type
      const template = await storage.getDocumentTemplateByType(document.type);
      if (!template) {
        return res.status(400).json({ message: "No workflow template found for this document type" });
      }

      // Read buffer and generate hash for the uploaded file
      const fileBuffer = await fs.readFile(req.file.path);
      const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      // Create organized file path
      const datePath = new Date().toISOString().split('T')[0];
      const userDir = path.join(uploadDir, user.username, datePath);
      await fs.mkdir(userDir, { recursive: true });
      
      const finalPath = path.join(userDir, `${hash}${path.extname(req.file.originalname)}`);
      await fs.rename(req.file.path, finalPath);

      // Get the requester user info
      const requester = await storage.getUser(document.userId);
      const requesterName = requester?.fullName || "Unknown";

      // Update the document with file information
      const updatedDocument = await storage.updateDocument(documentId, {
        title: `${document.type.replace('_', ' ').toUpperCase()} - ${requesterName}`,
        description: `Uploaded ${document.type.replace('_', ' ')} for ${requesterName}. ${comments ? `Comments: ${comments}` : ""}`,
        fileName: req.file.originalname,
        filePath: finalPath,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        hash,
        fileContent: Buffer.from(fileBuffer).toString("base64") as any,
        fileMetadata: {
          originalName: req.file.originalname,
          storedPath: finalPath,
          uploadedBy: user.id,
          uploadedAt: new Date().toISOString(),
        } as any,
        status: "in_review",
      });

      // Create workflow action (reviewer uploaded)
      await storage.createWorkflowAction({
        workflowId: workflow.id,
        userId: req.session.userId!,
        action: "uploaded",
        comment: `${document.type.replace('_', ' ')} uploaded. ${comments ? `Comments: ${comments}` : ""}`,
        step: 0,
        signature: req.session.userId!,
      });

      // Only automatically advance if the first reviewer is course_unit
      // For other roles, they need to explicitly approve/forward through the review modal
      if (firstStepRole === "course_unit") {
        // Auto-advance to next step since course unit already uploaded
        const nextStep = 1;
        if (nextStep < workflow.totalSteps) {
          await storage.updateWorkflow(workflow.id, {
            currentStep: nextStep,
          });
        } else {
          // Workflow completed if course_unit was the only step
          await storage.updateWorkflow(workflow.id, {
            currentStep: nextStep,
            isCompleted: true,
          });
          await storage.updateDocument(documentId, { status: "approved" });
        }
        res.json({ message: "Document uploaded and forwarded successfully" });
      } else {
        // For non-course_unit first reviewers, keep document at current step
        // They need to review and approve/forward explicitly
        res.json({ message: "Document uploaded successfully. Please review and approve to forward to the next reviewer." });
      }
    } catch (error) {
      console.error("Upload document by reviewer error:", error);
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

      // Create organized file path
      const user = await storage.getUser(req.session.userId!);
      const datePath = new Date().toISOString().split('T')[0];
      const userDir = path.join(uploadDir, user!.username, datePath);
      await fs.mkdir(userDir, { recursive: true });
      
      const finalPath = path.join(userDir, `${hash}${path.extname(req.file.originalname)}`);
      await fs.rename(req.file.path, finalPath);

      // Update the existing document request with file information instead of creating a new document
      const updatedDocument = await storage.updateDocument(requestId, {
        title: `Transcript - ${request.student.fullName}`,
        description: `Uploaded transcript for ${request.student.fullName}. ${comments ? `Comments: ${comments}` : ""}`,
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
        status: "in_review",
      });
      
      // Get the workflow template for transcript requests
      const template = await storage.getDocumentTemplateByType("transcript_request");
      if (!template) {
        return res.status(400).json({ message: "No workflow template found for transcript requests" });
      }
      
      // Get or create workflow for the existing document
      let workflow = await storage.getWorkflowByDocumentId(requestId);
      if (!workflow) {
        // Create workflow if it doesn't exist
        workflow = await storage.createWorkflow({
          documentId: requestId,
          currentStep: 0,
          totalSteps: template.approvalPath.length,
          stepRoles: template.approvalPath,
          isCompleted: false,
        });
      }

      // Create initial workflow action (course unit uploaded)
      await storage.createWorkflowAction({
        workflowId: workflow.id,
        userId: req.session.userId!,
        action: "uploaded",
        comment: `Transcript uploaded. ${comments ? `Comments: ${comments}` : ""}`,
        step: 0,
        signature: req.session.userId!,
      });

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
          await storage.updateDocument(requestId, { status: "approved" });
        }
      }

      res.json({ message: "Transcript uploaded and forwarded successfully" });
    } catch (error) {
      console.error("Upload transcript error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
