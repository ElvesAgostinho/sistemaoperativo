import * as dotenv from 'dotenv';
dotenv.config();

async function testFetch() {
    console.log('Testing Supabase Auth with fetch...');
    const email = `test_${Date.now()}@test.com`;
    const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: {
            'apikey': process.env.SUPABASE_KEY as string,
            'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            email,
            password: 'Password123!',
            data: { nome: 'Test User', role: 'admin' }
        })
    });
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Body:', text);
}
testFetch();
