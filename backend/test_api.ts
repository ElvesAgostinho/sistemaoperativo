import { supabase } from './src/config/supabase';

async function testSignup() {
    console.log('Testing user signup...');
    const email = `test_${Date.now()}@test.com`;
    const password = 'Password123!';
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { nome: 'Test User', role: 'admin' },
        },
    });
    console.log('Signup error:', error);
    console.log('Signup data:', data);
}

testSignup();
