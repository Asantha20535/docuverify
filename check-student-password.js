import { db } from './server/db.ts';
import { users } from './shared/schema.ts';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function checkStudentPassword() {
  try {
    console.log('Checking student password...\n');
    
    const student = await db.select().from(users).where(eq(users.username, 'student1')).limit(1);
    
    if (student.length === 0) {
      console.log('Student not found');
      return;
    }
    
    console.log('Student found:', {
      username: student[0].username,
      fullName: student[0].fullName,
      role: student[0].role,
      isActive: student[0].isActive,
      passwordHash: student[0].password.substring(0, 20) + '...'
    });
    
    // Test common passwords
    const testPasswords = ['student123', 'password', 'student1', '123456', 'student'];
    
    for (const password of testPasswords) {
      const isValid = await bcrypt.compare(password, student[0].password);
      if (isValid) {
        console.log(`✅ Password found: "${password}"`);
        return;
      }
    }
    
    console.log('❌ No matching password found. Tested:', testPasswords);
    
  } catch (error) {
    console.error('Error checking student password:', error);
  }
}

checkStudentPassword();

