import { db } from './server/db.ts';
import { users } from './shared/schema.ts';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function setStudentPassword() {
  try {
    console.log('Setting student password...\n');
    
    const newPassword = 'student123';
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const result = await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.username, 'student1'))
      .returning();
    
    if (result.length > 0) {
      console.log(`✅ Password updated for ${result[0].fullName} (${result[0].username})`);
      console.log(`New password: ${newPassword}`);
    } else {
      console.log('❌ Student not found');
    }
    
  } catch (error) {
    console.error('Error setting student password:', error);
  }
}

setStudentPassword();

