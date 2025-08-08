import { db } from './server/db.ts';
import { users } from './shared/schema.ts';

async function checkUsers() {
  try {
    console.log('Checking available users...\n');
    
    const allUsers = await db.select().from(users);
    
    console.log(`Found ${allUsers.length} users:\n`);
    
    allUsers.forEach(user => {
      console.log(`- ${user.fullName} (${user.username}) - Role: ${user.role} - Active: ${user.isActive}`);
    });
    
  } catch (error) {
    console.error('Error checking users:', error);
  }
}

checkUsers();

