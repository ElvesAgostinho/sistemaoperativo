import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as xlsx from 'xlsx';
import { getSupabase } from '../lib/supabaseClient';
import { requireAuth } from '../middleware/authMiddleware';
import OpenAI from 'openai';

const router = Router();
const upload = multer({ dest: 'uploads/' });

const getOpenAI = async (req: Request): Promise<OpenAI> => {
    const supabase = getSupabase(req);
    const empresa_id = (req as any).user?.empresa_id;

    if (empresa_id) {
        const { data } = await supabase.from('configuracoes').select('valor').eq('chave', 'openai_api_key').single();
        if (data && data.valor) {
            return new OpenAI({ apiKey: data.valor });
        }
    }
    
    if (process.env.OPENAI_API_KEY) {
        return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    
    throw new Error('OpenAI API key não configurada.');
};

// GET /api/data/stats - Fetch overall stats for dashboard
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase(req);

        // HR Stats
        const { count: hrCount } = await supabase.from('colaboradores').select('*', { count: 'exact', head: true }).eq('estado', 'Ativo');
        const { data: hrData } = await supabase.from('colaboradores').select('salario_base').eq('estado', 'Ativo');
        const hrSalaries = hrData?.reduce((acc: number, curr: any) => acc + (Number(curr.salario_base) || 0), 0) || 0;
        
        // CRM Stats
        const { count: leadsCount } = await supabase.from('negocios').select('*', { count: 'exact', head: true }).eq('fase', 'Nova Lead');
        
        const { data: wonDeals } = await supabase.from('negocios').select('valor_estimado').eq('fase', 'Ganho');
        const wonTotal = wonDeals?.reduce((acc: number, curr: any) => acc + (Number(curr.valor_estimado) || 0), 0) || 0;
        
        const { data: activeDeals } = await supabase.from('negocios').select('valor_estimado').neq('fase', 'Ganho').neq('fase', 'Perdido');
        const activeTotal = activeDeals?.reduce((acc: number, curr: any) => acc + (Number(curr.valor_estimado) || 0), 0) || 0;
        
        const { count: totalClients } = await supabase.from('clientes').select('*', { count: 'exact', head: true });

        // CRM Funnel
        const { data: funnelData } = await supabase.from('negocios').select('fase');
        const funnelMap: Record<string, number> = {};
        funnelData?.forEach((d: any) => {
            funnelMap[d.fase] = (funnelMap[d.fase] || 0) + 1;
        });
        const funnel = Object.keys(funnelMap).map(key => ({ name: key, value: funnelMap[key] }));

        // HR Departments
        const { data: deptData } = await supabase.from('colaboradores').select('departamento').eq('estado', 'Ativo');
        const deptMap: Record<string, number> = {};
        deptData?.forEach((d: any) => {
            const dept = d.departamento || 'Geral';
            deptMap[dept] = (deptMap[dept] || 0) + 1;
        });
        const deptStats = Object.keys(deptMap).map(key => ({ name: key, value: deptMap[key] }));

        return res.json({
            success: true,
            stats: {
                hr: {
                    active_employees: hrCount || 0,
                    monthly_payroll: hrSalaries || 0,
                    departments: deptStats
                },
                crm: {
                    total_clients: totalClients || 0,
                    active_leads: leadsCount || 0,
                    won_value: wonTotal || 0,
                    active_value: activeTotal || 0,
                    funnel: funnel
                }
            }
        });
    } catch (error) {
        console.error("Error fetching data stats:", error);
        return res.status(500).json({ error: 'Erro ao buscar estatísticas.' });
    }
});

// GET /api/data/insights - Get recent insights
router.get('/insights', requireAuth, async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase(req);
        const { data: insights, error } = await supabase.from('datainsights').select('*').order('criado_em', { ascending: false }).limit(10);
        
        if (error) throw error;

        // Parse the JSON string
        const parsedInsights = (insights || []).map((i: any) => {
            let parsed = {};
            try {
                parsed = typeof i.insights_json === 'string' ? JSON.parse(i.insights_json) : i.insights_json;
            } catch(e) {}
            return {
                ...i,
                insights: parsed
            };
        });
        return res.json({ success: true, insights: parsedInsights });
    } catch (error) {
        return res.status(500).json({ error: 'Erro ao buscar insights.' });
    }
});

// POST /api/data/upload - Upload file for AI analysis
router.post('/upload', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum ficheiro fornecido.' });
    }

    try {
        const ai = await getOpenAI(req);
        const filePath = req.file.path;
        const filename = req.file.originalname;

        // Ler ficheiro
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Converter para JSON Array
        const jsonData = xlsx.utils.sheet_to_json(sheet);
        
        // Se for muito grande, vamos pegar apenas uma amostra
        const maxRowsForAI = 150; 
        const sampleData = jsonData.slice(0, maxRowsForAI);
        
        const systemPrompt = `És um analista de dados especialista a trabalhar num sistema ERP moderno.
Foi-te fornecido um extrato de dados importado pelo utilizador de um ficheiro Excel/CSV chamado "${filename}".
Analisa os dados fornecidos e extrai:
1. Um resumo executivo claro e profissional do que estes dados representam.
2. 3 principais descobertas ou padrões (Insights).
3. Uma recomendação de ação.

Devolve a tua resposta num objeto JSON ESTRITO com o seguinte formato:
{
  "resumo": "...",
  "insights": ["...", "...", "..."],
  "recomendacao": "..."
}`;

        const aiResponse = await ai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: JSON.stringify(sampleData) }
            ],
            response_format: { type: 'json_object' }
        });

        const resultJson = aiResponse.choices[0]?.message?.content || '{}';
        
        // Salvar na DB
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        
        const { data: info, error } = await supabase.from('datainsights').insert({
            empresa_id,
            filename: filename,
            file_size: req.file.size,
            insights_json: resultJson
        }).select('id').single();

        if (error) throw error;

        return res.json({
            success: true,
            message: 'Ficheiro analisado com sucesso!',
            insight: {
                id: info.id,
                filename: filename,
                file_size: req.file.size,
                insights: JSON.parse(resultJson),
                criado_em: new Date().toISOString()
            }
        });
    } catch (error: any) {
        console.error("Erro na análise do ficheiro:", error);
        return res.status(500).json({ error: 'Erro ao processar ficheiro com IA: ' + error.message });
    }
});

export default router;
