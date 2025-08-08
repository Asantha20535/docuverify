-- Enums
CREATE TYPE user_role AS ENUM (
  'student',
  'academic_staff',
  'department_head',
  'dean',
  'vice_chancellor',
  'assistant_registrar',
  'course_unit',
  'admin'
);

CREATE TYPE document_type AS ENUM (
  'transcript_request',
  'enrollment_verification',
  'grade_report',
  'certificate_verification',
  'letter_of_recommendation',
  'academic_record',
  'degree_verification',
  'other'
);

CREATE TYPE document_status AS ENUM (
  'pending',
  'in_review',
  'approved',
  'rejected',
  'completed'
);

CREATE TYPE action_type AS ENUM (
  'uploaded',
  'reviewed',
  'approved',
  'rejected',
  'signed',
  'forwarded',
  'completed'
);

-- Tables
CREATE TABLE users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_graduated BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  last_login TIMESTAMP
);

CREATE TABLE documents (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  type document_type NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  status document_status NOT NULL DEFAULT 'pending',
  user_id VARCHAR NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE workflows (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id VARCHAR NOT NULL REFERENCES documents(id),
  current_step INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL,
  step_roles JSONB NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE workflow_actions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id VARCHAR NOT NULL REFERENCES workflows(id),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  action action_type NOT NULL,
  comment TEXT,
  step INTEGER NOT NULL,
  signature TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE verification_logs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  document_hash TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  is_verified BOOLEAN NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE document_templates (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type document_type NOT NULL,
  description TEXT,
  approval_path JSONB NOT NULL,
  required_roles JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Sample users (password = "password123")
INSERT INTO users (username, password, email, full_name, role) VALUES
('admin', '$2b$10$1TblZATgT9DLnbGETfU6TOW7lXvOkCMp68aLGk5v/FccQHa3u9ZF6', 'admin@university.edu', 'System Administrator', 'admin'),
('student1', '$2b$10$Xn8/C5brf0gxge.YmIuY4Of8M2ddSRXMaVECdH/D2CpNhp5gSKqdq', 'student1@university.edu', 'John Student', 'student'),
('student2', '$2b$10$Xn8/C5brf0gxge.YmIuY4Of8M2ddSRXMaVECdH/D2CpNhp5gSKqdq', 'student2@university.edu', 'Jane Graduate', 'student', true),
('professor1', '$2b$10$g2T1HlJYT1YOVpXUtwweg..C78PJt19GxWtKokr.w208F6RYFi7dC', 'prof1@university.edu', 'Dr. Jane Professor', 'academic_staff'),
('head1', '$2b$10$WGrCOsRnySmm62BmfeTheOpVpBPAlVFcqV80.1JKtNYNVFb1fUhgC', 'head1@university.edu', 'Dr. Department Head', 'department_head'),
('dean1', '$2b$10$bHCdxkKP.itHJY83aOXUZuolXqA/6LJcl5dMDdsAqHhK.K3XCghRq', 'dean1@university.edu', 'Dr. Faculty Dean', 'dean'),
('vc1', '$2b$10$bHCdxkKP.itHJY83aOXUZuolXqA/6LJcl5dMDdsAqHhK.K3XCghRq', 'vc@university.edu', 'Dr. Vice Chancellor', 'vice_chancellor'),
('registrar1', '$2b$10$bHCdxkKP.itHJY83aOXUZuolXqA/6LJcl5dMDdsAqHhK.K3XCghRq', 'registrar@university.edu', 'Assistant Registrar', 'assistant_registrar'),
('courseunit1', '$2b$10$bHCdxkKP.itHJY83aOXUZuolXqA/6LJcl5dMDdsAqHhK.K3XCghRq', 'courseunit@university.edu', 'Course Unit Manager', 'course_unit');

-- Document Templates
INSERT INTO document_templates (name, type, description, approval_path, required_roles) VALUES
('Standard Transcript Request', 'transcript_request', 'Official academic transcript processing',
 '["course_unit", "dean", "assistant_registrar"]',
 '["course_unit", "dean", "assistant_registrar"]'),
('Enrollment Verification', 'enrollment_verification', 'Student enrollment status verification',
 '["academic_staff", "department_head", "dean"]',
 '["academic_staff", "department_head", "dean"]'),
('Grade Report Request', 'grade_report', 'Official grade report processing',
 '["academic_staff", "department_head"]',
 '["academic_staff", "department_head"]'),
('Other Documents', 'other', 'General document processing workflow',
 '["academic_staff", "department_head"]',
 '["academic_staff", "department_head"]');

-- Indexes
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_hash ON documents(hash);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_workflows_document_id ON workflows(document_id);
CREATE INDEX idx_workflow_actions_workflow_id ON workflow_actions(workflow_id);
CREATE INDEX idx_verification_logs_hash ON verification_logs(document_hash);







