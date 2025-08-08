# Course Unit Module Testing Guide

This guide provides step-by-step instructions for testing the Course Unit module functionality.

## Prerequisites

1. Ensure the database is seeded with the required data
2. Have test transcript files ready (PDF, DOC, or DOCX format)

## Test Users

### Course Unit User
- **Username**: `courseunit1`
- **Password**: `password123`
- **Role**: `course_unit`

### Students
- **Student 1** (Current Student): `student1` / `password123`
- **Student 2** (Graduated Student): `student2` / `password123`

### Approvers
- **Dean**: `dean1` / `password123`
- **Assistant Registrar**: `registrar1` / `password123`

## Test Scenarios

### Scenario 1: Current Student Transcript Request

1. **Login as Student 1** (`student1` / `password123`)
2. **Navigate to Student Dashboard** (`/dashboard/student`)
3. **Request a transcript**:
   - Click "Request Transcript"
   - Enter title: "Partial Transcript Request"
   - Enter description: "Need partial transcript for job application"
   - Submit request
4. **Login as Course Unit** (`courseunit1` / `password123`)
5. **Navigate to Course Unit Dashboard** (`/dashboard/course-unit`)
6. **View the transcript request**:
   - Should see the request in the list
   - Status should be "Pending"
   - Should show "Partial transcript → Dean"
7. **Upload transcript**:
   - Click "Upload Transcript" button
   - Select a transcript file (PDF/DOC/DOCX)
   - Add optional comments
   - Click "Upload & Forward"
8. **Expected Result**: 
   - Request status changes to "In Review"
   - Transcript is forwarded to Dean
   - Success message appears

### Scenario 2: Graduated Student Transcript Request

1. **Login as Student 2** (`student2` / `password123`)
2. **Navigate to Student Dashboard** (`/dashboard/student`)
3. **Request a transcript**:
   - Click "Request Transcript"
   - Enter title: "Full Transcript Request"
   - Enter description: "Need full transcript for graduate school"
   - Submit request
4. **Login as Course Unit** (`courseunit1` / `password123`)
5. **Navigate to Course Unit Dashboard** (`/dashboard/course-unit`)
6. **View the transcript request**:
   - Should see the request in the list
   - Status should be "Pending"
   - Should show "Full transcript → Assistant Registrar"
7. **Upload transcript**:
   - Click "Upload Transcript" button
   - Select a transcript file (PDF/DOC/DOCX)
   - Add optional comments
   - Click "Upload & Forward"
8. **Expected Result**: 
   - Request status changes to "In Review"
   - Transcript is forwarded to Assistant Registrar
   - Success message appears

### Scenario 3: Dean Approval (Partial Transcript)

1. **Complete Scenario 1** to upload a transcript
2. **Login as Dean** (`dean1` / `password123`)
3. **Navigate to Workflow Dashboard** (`/dashboard/workflow`)
4. **View the forwarded transcript**:
   - Should see the transcript in the pending documents list
   - Should show workflow progress: Course Unit → Dean
5. **Review and approve**:
   - Click "Review Document"
   - Select action: "Approve & Sign"
   - Add comments (optional)
   - Submit review
6. **Expected Result**:
   - Document status becomes "Approved"
   - Workflow is completed
   - Document shows as signed by Dean

### Scenario 4: Assistant Registrar Approval (Full Transcript)

1. **Complete Scenario 2** to upload a transcript
2. **Login as Assistant Registrar** (`registrar1` / `password123`)
3. **Navigate to Workflow Dashboard** (`/dashboard/workflow`)
4. **View the forwarded transcript**:
   - Should see the transcript in the pending documents list
   - Should show workflow progress: Course Unit → Assistant Registrar
5. **Review and approve**:
   - Click "Review Document"
   - Select action: "Approve & Sign"
   - Add comments (optional)
   - Submit review
6. **Expected Result**:
   - Document status becomes "Approved"
   - Workflow is completed
   - Document shows as signed by Assistant Registrar

## API Endpoints

### Course Unit Endpoints
- `GET /api/course-unit/transcript-requests` - Get transcript requests
- `GET /api/course-unit/stats` - Get course unit statistics
- `POST /api/course-unit/upload-transcript` - Upload and forward transcript

### Workflow Endpoints
- `GET /api/documents/pending` - Get pending documents for current user's role
- `POST /api/workflow/:workflowId/action` - Submit workflow action (approve/reject/forward)

## Expected Workflow Behavior

### For Current Students:
1. Student requests transcript
2. Course Unit uploads transcript file
3. Transcript forwarded to Dean
4. Dean approves/signs transcript
5. Workflow completed

### For Graduated Students:
1. Student requests transcript
2. Course Unit uploads transcript file
3. Transcript forwarded to Assistant Registrar
4. Assistant Registrar approves/signs transcript
5. Workflow completed

## File Upload Requirements

- **Supported formats**: PDF, DOC, DOCX
- **File size**: No specific limit (handled by server configuration)
- **Required fields**: Transcript file
- **Optional fields**: Comments

## Error Handling

- **Missing file**: Returns 400 error with "Transcript file is required"
- **Invalid request ID**: Returns 404 error with "Transcript request not found"
- **Unauthorized access**: Returns 403 error
- **Server errors**: Returns 500 error with "Internal server error"

## Success Indicators

- ✅ Transcript file uploaded successfully
- ✅ Document created in database with proper metadata
- ✅ Workflow created with correct approval path
- ✅ Initial workflow action recorded
- ✅ Original request status updated to "in_review"
- ✅ Success message displayed to user
- ✅ Dashboard statistics updated
- ✅ Forwarded document appears in approver's workflow queue 