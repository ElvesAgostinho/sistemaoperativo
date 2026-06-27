import { supabase } from './src/config/supabase';

async function test() {
    const r1 = await supabase.from('configuracoes').select('*');
    console.log('configuracoes data:', r1.data);
    
    const r2 = await supabase.from('configuracoes_sistema').select('*');
    console.log('configuracoes_sistema data:', r2.data);
}

test();
