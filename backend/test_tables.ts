import { supabase } from './src/config/supabase';

async function test() {
    console.log('Testing perfis...');
    const p = await supabase.from('perfis').select('*').limit(1);
    console.log('Perfis error:', p.error);

    console.log('Testing reunioes...');
    const r = await supabase.from('reunioes').select('*').limit(1);
    console.log('Reunioes error:', r.error);
    
    console.log('Testing auth connection...');
    const session = await supabase.auth.getSession();
    console.log('Session error:', session.error);
}

test();
