import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'dummy';

if (supabaseUrl === 'https://dummy.supabase.co') {
  console.warn('⚠️ SUPABASE_URL or SUPABASE_KEY is missing. Ensure your .env file is configured.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
