import { criarReuniao } from './src/controllers/reunioesController';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const req = {
    body: {
        titulo: 'Teste Reunião Script',
        data_hora: new Date().toISOString(),
        emails_convidados: ''
    },
    user: {
        empresa_id: '49427199-186f-47e1-b3fe-7e25b92daef6'
    },
    headers: {
        // Mock authorization so getSupabase uses the service role or falls back to anon?
        // Wait, getSupabase uses req.headers.authorization
        // Let's pass the service role key to bypass RLS for now just to see if insert works through controller
        authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    }
} as unknown as Request;

const res = {
    status: function(code: number) {
        console.log('Status:', code);
        return this;
    },
    json: function(data: any) {
        console.log('JSON Response:', data);
        return this;
    }
} as unknown as Response;

criarReuniao(req, res).then(() => console.log('Done'));
