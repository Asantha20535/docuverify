import { db } from './server/db.ts';
import { documentTemplates } from './shared/schema.ts';

async function createDefaultTemplates() {
  try {
    console.log('Creating default document templates...\n');
    
    const defaultTemplates = [
      {
        name: "Transcript Request",
        type: "transcript_request",
        description: "Request for official academic transcript",
        approvalPath: ["academic_staff", "dean", "assistant_registrar"],
        requiredRoles: ["student"],
        isActive: true,
      },
      {
        name: "Enrollment Verification",
        type: "enrollment_verification",
        description: "Verification of current enrollment status",
        approvalPath: ["academic_staff", "department_head", "dean"],
        requiredRoles: ["student"],
        isActive: true,
      },
      {
        name: "Grade Report",
        type: "grade_report",
        description: "Request for detailed grade report",
        approvalPath: ["academic_staff", "department_head"],
        requiredRoles: ["student"],
        isActive: true,
      },
      {
        name: "Certificate Verification",
        type: "certificate_verification",
        description: "Verification of academic certificates",
        approvalPath: ["academic_staff", "dean", "assistant_registrar"],
        requiredRoles: ["student"],
        isActive: true,
      },
      {
        name: "Letter of Recommendation",
        type: "letter_of_recommendation",
        description: "Request for academic recommendation letter",
        approvalPath: ["academic_staff", "department_head", "dean"],
        requiredRoles: ["student"],
        isActive: true,
      },
      {
        name: "Degree Verification",
        type: "degree_verification",
        description: "Verification of degree completion",
        approvalPath: ["academic_staff", "dean", "vice_chancellor", "assistant_registrar"],
        requiredRoles: ["student"],
        isActive: true,
      },
    ];

    for (const template of defaultTemplates) {
      const result = await db
        .insert(documentTemplates)
        .values(template)
        .returning();
      
      console.log(`✅ Created template: ${result[0].name}`);
    }
    
    console.log('\n🎉 Default templates created successfully!');
    
  } catch (error) {
    console.error('Error creating default templates:', error);
  }
}

createDefaultTemplates();
