import { createClient } from '@supabase/supabase-js';
import { Request } from 'express';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

export const getSupabase = (req: Request) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        return createClient(supabaseUrl, supabaseKey, {
            global: {
                headers: {
                    Authorization: authHeader
                }
            }
        });
    }
    return supabase;
};
