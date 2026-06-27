import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

async function run() {
    const { error } = await supabase.from('perfis').update({ role: 'admin' }).ilike('nome', '%Elves%');
    if (error) console.error(error);
    else console.log('Elves atualizado para admin!');
}
run();
