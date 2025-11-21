export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: "student" | "academic_staff" | "department_head" | "dean" | "vice_chancellor" | "assistant_registrar" | "course_unit" | "admin";
  isActive: boolean;
  isGraduated?: boolean; // For students only
  signature?: string; // For non-student users
  createdAt: string;
  lastLogin?: string;
}

export interface Document {
  id: string;
  title: string;
  description?: string;
  type: "transcript_request" | "enrollment_verification" | "grade_report" | "certificate_verification" | "letter_of_recommendation" | "academic_record" | "degree_verification" | "vacation_request" | "funding_request" | "other";
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  hash: string;
  status: "pending" | "in_review" | "approved" | "rejected" | "completed";
  userId: string;
  forwardedToUserId?: string | null;
  forwardedFromUserId?: string | null;
  forwardedAt?: string | null;
  forwardedFromUser?: User | null; // Populated by backend when needed
  fileMetadata?: {
    studentName?: string;
    registrationNumber?: string;
    email?: string;
    level?: string;
    name?: string;
    note?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface Workflow {
  id: string;
  documentId: string;
  currentStep: number;
  totalSteps: number;
  stepRoles: string[];
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowAction {
  id: string;
  workflowId: string;
  userId: string;
  action: "uploaded" | "reviewed" | "approved" | "rejected" | "signed" | "forwarded" | "completed";
  comment?: string;
  step: number;
  signature?: string;
  createdAt: string;
  user: User;
}

export interface DocumentWithDetails extends Document {
  user: User;
  workflow?: Workflow & {
    actions: WorkflowAction[];
  };
}

export interface SignaturePlacement {
  page: number;
  x: number;
  y: number;
}

export type SignaturePlacementMap = Record<string, SignaturePlacement[]>;

export interface DocumentTemplate {
  id: string;
  name: string;
  type: Document["type"];
  description?: string;
  approvalPath: string[];
  requiredRoles: string[];
  isActive: boolean;
  templateFileName?: string | null;
  templateFilePath?: string | null;
  templateFileSize?: number | null;
  templateMimeType?: string | null;
  templatePageCount?: number | null;
  signaturePlacements?: SignaturePlacementMap;
  createdAt: string;
  updatedAt: string;
}
