async function testStudentAccess() {
  try {
    console.log('Testing student access to document types...\n');
    
    // First, login as a student
    console.log('1. Logging in as student...');
    const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'student1',
        password: 'student123',
        role: 'student'
      }),
    });
    
    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status} ${loginResponse.statusText}`);
    }
    
    const loginData = await loginResponse.json();
    console.log('✅ Student login successful');
    
    // Get cookies from login response
    const cookies = loginResponse.headers.get('set-cookie');
    if (!cookies) {
      throw new Error('No cookies received from login');
    }
    
    console.log('\n2. Fetching document types for student...');
    const templatesResponse = await fetch('http://localhost:5000/api/admin/templates', {
      headers: {
        'Cookie': cookies,
      },
    });
    
    if (!templatesResponse.ok) {
      const errorText = await templatesResponse.text();
      throw new Error(`Fetch templates failed: ${templatesResponse.status} ${templatesResponse.statusText} - ${errorText}`);
    }
    
    const templates = await templatesResponse.json();
    console.log('✅ Document types fetched successfully:', templates.length, 'templates found');
    
    templates.forEach(template => {
      console.log(`  - ${template.name} (${template.type})`);
    });
    
    console.log('\n🎉 Student can access document types successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testStudentAccess();

