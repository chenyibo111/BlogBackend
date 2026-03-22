// Test script for Blog API
const API_URL = 'http://localhost:3000/api';

async function test() {
  console.log('🧪 Testing Blog API...\n');

  // Test 1: Register
  console.log('1️⃣ Register new user...');
  const registerRes = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User'
    })
  });
  const registerData = await registerRes.json();
  console.log(registerRes.ok ? '✅ Success' : '❌ Failed:', registerData.success || registerData.error?.message);

  // Test 2: Login
  console.log('\n2️⃣ Login...');
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'password123'
    })
  });
  const loginData = await loginRes.json();
  if (loginRes.ok) {
    console.log('✅ Success');
    console.log('Token:', loginData.data.tokens.accessToken.substring(0, 50) + '...');
    
    // Test 3: Create Post
    console.log('\n3️⃣ Create post...');
    const createPostRes = await fetch(`${API_URL}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${loginData.data.tokens.accessToken}`
      },
      body: JSON.stringify({
        title: 'My First Post',
        content: '<p>Hello World!</p>',
        excerpt: 'This is my first post',
        status: 'PUBLISHED'
      })
    });
    const createPostData = await createPostRes.json();
    console.log(createPostRes.ok ? '✅ Success' : '❌ Failed:', createPostData.success || createPostData.error?.message);
    
    // Test 4: Get Posts
    console.log('\n4️⃣ Get posts...');
    const getPostsRes = await fetch(`${API_URL}/posts`);
    const getPostsData = await getPostsRes.json();
    console.log(getPostsRes.ok ? '✅ Success' : '❌ Failed:', `Found ${getPostsData.data.total} posts`);
    
    // Test 5: Get Archive
    console.log('\n5️⃣ Get archive...');
    const archiveRes = await fetch(`${API_URL}/posts/archive`);
    const archiveData = await archiveRes.json();
    console.log(archiveRes.ok ? '✅ Success' : '❌ Failed:', archiveData.success);
    
  } else {
    console.log('❌ Failed:', loginData.error?.message);
  }

  console.log('\n✅ All tests completed!\n');
}

test().catch(console.error);
