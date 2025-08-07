# Course Unit Module Test Guide

## Overview
The Course Unit module handles transcript generation based on student graduation status:
- **Graduated students**: Full transcript → Assistant Registrar
- **Current students**: Partial transcript → Dean

## Test Steps

### 1. Login as Course Unit
- Username: `courseunit1`
- Password: `password123`
- Role: `course_unit`

### 2. Create Test Transcript Requests
First, login as a student and create transcript requests:

#### Login as Student
- Username: `student1`
- Password: `password123`
- Role: `student`

#### Create Transcript Request
1. Go to Student Dashboard
2. Click "Request Transcript"
3. Fill in details and submit

### 3. Test Course Unit Dashboard
1. Login as course unit user
2. Navigate to Course Unit Dashboard
3. Verify transcript requests are displayed
4. Test transcript generation for both graduated and current students

### 4. Test Workflow
1. Generate transcript for a current student
2. Verify it goes to Dean for approval
3. Generate transcript for a graduated student
4. Verify it goes to Assistant Registrar for approval

## Expected Behavior

### For Current Students
- Transcript request appears in Course Unit dashboard
- When generated, workflow: Course Unit → Dean
- Dean can approve and sign

### For Graduated Students
- Transcript request appears in Course Unit dashboard
- When generated, workflow: Course Unit → Assistant Registrar
- Assistant Registrar can approve and sign

## Database Changes
- Added `course_unit` role to user_role enum
- Updated transcript request workflow to include course unit
- Added course unit user: `courseunit1`

## API Endpoints Added
- `GET /api/course-unit/transcript-requests` - Get pending requests
- `GET /api/course-unit/stats` - Get course unit statistics
- `POST /api/course-unit/generate-transcript` - Generate and forward transcript 