import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
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
  transcript_request: ["academic_staff", "department_head", "dean", "vice_chancellor", "assistant_registrar"],
  enrollment_verification: ["academic_staff", "department_head", "dean"],
  grade_report: ["academic_staff", "department_head"],
  other: ["academic_staff", "department_head"],
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Session configuration
  app.use(session({
    secret: process.env.SESSION_SECRET || "university-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
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
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Document routes
  app.post("/api/documents/upload", requireAuth, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { title, description, type } = req.body;
      
      if (!title || !type) {
        return res.status(400).json({ message: "Title and type are required" });
      }

      // Generate SHA-256 hash
      const fileBuffer = await fs.readFile(req.file.path);
      const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      // Create organized file path
      const user = await storage.getUser(req.session.userId!);
      const datePath = new Date().toISOString().split('T')[0];
      const userDir = path.join(uploadDir, user!.username, datePath);
      await fs.mkdir(userDir, { recursive: true });
      
      const finalPath = path.join(userDir, `${hash}${path.extname(req.file.originalname)}`);
      await fs.rename(req.file.path, finalPath);

      // Save document metadata
      const document = await storage.createDocument({
        title,
        description: description || null,
        type: type as any,
        fileName: req.file.originalname,
        filePath: finalPath,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        hash,
        userId: req.session.userId!,
        status: "pending",
      });

      // Create workflow
      const stepRoles = workflowConfigs[type as keyof typeof workflowConfigs] || workflowConfigs.other;
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

  app.get("/api/documents", requireAuth, async (req, res) => {
    try {
      const documents = await storage.getUserDocuments(req.session.userId!);
      res.json(documents);
    } catch (error) {
      console.error("Get documents error:", error);
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

      // Create workflow action
      const signature = action === "approve" ? user!.fullName : null;
      await storage.createWorkflowAction({
        workflowId: workflow.id,
        userId: user!.id,
        action: action as any,
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

  const httpServer = createServer(app);
  return httpServer;
}
