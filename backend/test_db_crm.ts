import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

async function main() {
    console.log("--- Inserindo canal Evolution ---");
    const { data, error } = await supabase.from('wa_channels').insert({
        name: 'Evolution Default',
        provider: 'evolution',
        status: 'connected'
    }).select();
    
    console.log(data, error);
}

main().catch(console.error);
