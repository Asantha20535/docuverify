# University Document Management System

## Overview

This is a full-stack University Document Management and Verification System built with React.js frontend and Node.js/Express.js backend, using PostgreSQL for data storage. The system handles secure document uploads, multi-step approval workflows, digital signing, and public verification capabilities with role-based access control.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React.js with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack React Query for server state
- **Authentication**: Context-based auth with session management
- **Build Tool**: Vite for development and bundling

### Backend Architecture
- **Framework**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Session Management**: express-session with PostgreSQL store
- **File Handling**: Multer for document uploads
- **Authentication**: bcrypt for password hashing
- **Database ORM**: Drizzle ORM with Neon PostgreSQL

### Database Design
- **Primary Database**: PostgreSQL via Neon Database
- **Schema Management**: Drizzle Kit for migrations
- **Connection**: Connection pooling with @neondatabase/serverless

## Key Components

### Authentication & Authorization
- **Session-based authentication** using express-session
- **Role-based access control** with 7 distinct roles:
  - Student (document submission)
  - Academic Staff (initial review)
  - Department Head (departmental approval)
  - Dean (faculty approval)
  - Vice Chancellor (executive approval)
  - Assistant Registrar (final processing)
  - Admin (system administration)
- **Password security** with bcrypt hashing
- **Route protection** on both frontend and backend

### Document Management
- **File Upload**: Secure upload handling with file type validation (PDF/DOCX only)
- **Document Integrity**: SHA-256 hash generation for each uploaded document
- **Metadata Storage**: Document title, description, type, and file information
- **Status Tracking**: Documents progress through pending → in_review → approved/rejected → completed

### Workflow Engine
- **Multi-step Approval Process**: Configurable workflows based on document type
- **Role-based Routing**: Documents automatically route to appropriate roles
- **Digital Signatures**: Each approval step can include digital signature
- **Comment System**: Reviewers can add comments at each step
- **Audit Trail**: Complete history of all workflow actions

### Verification System
- **Public Verification Portal**: Hash-based document verification without login
- **QR Code Support**: Generate QR codes for easy verification access
- **Verification Logging**: Track all verification attempts
- **Document Authenticity**: Cryptographic hash verification ensures document integrity

## Data Flow

### Document Submission Flow
1. Student uploads document with metadata
2. System generates SHA-256 hash for integrity
3. Workflow automatically created based on document type
4. Document routed to first approver (Academic Staff)

### Approval Workflow
1. Each role receives pending documents in their queue
2. Reviewers can approve, reject, or request changes
3. Digital signatures and comments recorded
4. Document progresses to next role or returns to submitter
5. Final approval completes the workflow

### Verification Process
1. External verifier enters document hash
2. System queries database for matching document
3. Returns verification status and document metadata
4. Logs verification attempt for audit purposes

## External Dependencies

### Core Technologies
- **React Query**: Server state management and caching
- **Wouter**: Lightweight React routing
- **Tailwind CSS**: Utility-first CSS framework
- **shadcn/ui**: Accessible React component library
- **Drizzle ORM**: Type-safe SQL ORM for PostgreSQL

### Backend Services
- **Neon Database**: Serverless PostgreSQL hosting
- **Express Session**: Session management middleware
- **Multer**: File upload handling
- **bcrypt**: Password hashing library

### Development Tools
- **Vite**: Development server and build tool
- **TypeScript**: Type safety across the stack
- **ESBuild**: Fast bundling for production
- **PostCSS**: CSS processing with Autoprefixer

## Deployment Strategy

### Development Environment
- **Local Development**: Vite dev server with hot reload
- **Database**: Neon PostgreSQL with connection pooling
- **File Storage**: Local filesystem for uploaded documents
- **Session Store**: PostgreSQL-backed session storage

### Production Build
- **Frontend**: Static files built with Vite
- **Backend**: Node.js server with Express
- **Database**: Neon PostgreSQL with production optimizations
- **File Handling**: Structured upload directory with 10MB file limits

### Environment Configuration
- **Database Connection**: `DATABASE_URL` environment variable
- **Session Security**: Configurable session secrets
- **File Upload**: Configurable upload directory and size limits
- **CORS**: Development and production CORS configuration

The system is designed as a monorepo with shared TypeScript types and schema definitions, ensuring type safety across the entire stack while maintaining clear separation between frontend and backend concerns.