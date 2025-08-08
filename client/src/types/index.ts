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
  type: "transcript_request" | "enrollment_verification" | "grade_report" | "certificate_verification" | "letter_of_recommendation" | "academic_record" | "degree_verification" | "other";
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  hash: string;
  status: "pending" | "in_review" | "approved" | "rejected" | "completed";
  userId: string;
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

export interface DocumentTemplate {
  id: string;
  name: string;
  type: string;
  description?: string;
  approvalPath: string[];
  requiredRoles: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
