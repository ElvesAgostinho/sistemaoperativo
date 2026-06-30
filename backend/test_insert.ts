import { supabase } from './src/config/supabase';

async function testInsert() {
    console.log('Testing insert into perfis...');
    const { data, error } = await supabase.from('perfis').insert([
        {
            id: '00000000-0000-0000-0000-000000000000', // might violate FK to auth.users, but we'll see the error
            nome: 'Test',
            email: 'test@test.com',
            role: 'pending',
            ativo: true
        }
    ]);
    console.log('Insert error:', error);
}

testInsert();
