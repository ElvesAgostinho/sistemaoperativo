import { Request, Response } from 'express';
import { getSupabase } from '../lib/supabaseClient';

export const getPlanosContas = async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase(req);
        const { data: contas, error } = await supabase.from('planos_contas').select('*').order('conta', { ascending: true });
        if (error) throw error;
        res.json({ success: true, contas });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const createPlanoConta = async (req: Request, res: Response) => {
    try {
        const { conta, descricao, tipo, natureza } = req.body;
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const { data: info, error } = await supabase.from('planos_contas').insert({
            empresa_id,
            conta, descricao, tipo, natureza: natureza || 'Devedora'
        }).select('id').single();

        if (error) throw error;
        res.json({ success: true, id: info.id });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getDiarios = async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase(req);
        const { data: diarios, error } = await supabase.from('diarios').select('*').order('codigo', { ascending: true });
        if (error) throw error;
        res.json({ success: true, diarios });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const createDiario = async (req: Request, res: Response) => {
    try {
        const { codigo, descricao } = req.body;
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const { data: info, error } = await supabase.from('diarios').insert({
            empresa_id, codigo, descricao
        }).select('id').single();

        if (error) throw error;
        res.json({ success: true, id: info.id });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getExercicios = async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase(req);
        const { data: exercicios, error } = await supabase.from('exercicios').select('*').order('ano', { ascending: false });
        if (error) throw error;
        res.json({ success: true, exercicios });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const createExercicio = async (req: Request, res: Response) => {
    try {
        const { ano } = req.body;
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const { data: info, error } = await supabase.from('exercicios').insert({
            empresa_id, ano
        }).select('id').single();

        if (error) throw error;
        res.json({ success: true, id: info.id });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getLancamentos = async (req: Request, res: Response) => {
    try {
        const { exercicio_id, diario_id } = req.query;
        const supabase = getSupabase(req);
        
        let query = supabase.from('lancamentos').select(`
            *,
            diarios (codigo),
            exercicios (ano),
            linhas_lancamento (
                id, debito, credito, conta_id,
                planos_contas (conta, descricao)
            )
        `).order('data_lancamento', { ascending: false });
        
        if (exercicio_id) {
            query = query.eq('exercicio_id', exercicio_id);
        }
        if (diario_id) {
            query = query.eq('diario_id', diario_id);
        }
        
        const { data: lancamentosData, error } = await query;
        if (error) throw error;
        
        // Formatar para o formato antigo que o front espera
        const lancamentos = (lancamentosData || []).map((l: any) => {
            return {
                ...l,
                diario_codigo: l.diarios?.codigo,
                exercicio_ano: l.exercicios?.ano,
                linhas: (l.linhas_lancamento || []).map((ll: any) => ({
                    id: ll.id,
                    lancamento_id: l.id,
                    conta_id: ll.conta_id,
                    debito: ll.debito,
                    credito: ll.credito,
                    conta: ll.planos_contas?.conta,
                    conta_descricao: ll.planos_contas?.descricao
                }))
            };
        });
        
        res.json({ success: true, lancamentos });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const createLancamento = async (req: Request, res: Response) => {
    try {
        const { diario_id, exercicio_id, data_lancamento, descricao, documento_referencia, linhas } = req.body;
        
        if (!linhas || linhas.length < 2) {
            return res.status(400).json({ success: false, error: "Um lançamento precisa de pelo menos duas linhas." });
        }
        
        // Validar partida dobrada
        let totalDebito = 0;
        let totalCredito = 0;
        
        for (const linha of linhas) {
            totalDebito += Number(linha.debito) || 0;
            totalCredito += Number(linha.credito) || 0;
        }
        
        totalDebito = Math.round(totalDebito * 100) / 100;
        totalCredito = Math.round(totalCredito * 100) / 100;
        
        if (totalDebito !== totalCredito) {
            return res.status(400).json({ success: false, error: `Partida dobrada inválida. Débitos: ${totalDebito}, Créditos: ${totalCredito}` });
        }

        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        // Sem transações fortes no supabase-js, fazemos insert do parent e depois dos filhos
        const { data: lancInfo, error: lancError } = await supabase.from('lancamentos').insert({
            empresa_id,
            diario_id, exercicio_id, data_lancamento, descricao, documento_referencia
        }).select('id').single();

        if (lancError) throw lancError;
        
        const lancamento_id = lancInfo.id;
        
        const linhasData = linhas.map((linha: any) => ({
            empresa_id,
            lancamento_id,
            conta_id: linha.conta_id,
            debito: linha.debito || 0,
            credito: linha.credito || 0
        }));

        const { error: linhasError } = await supabase.from('linhas_lancamento').insert(linhasData);
        
        if (linhasError) {
            // Rollback manual rudimentar
            await supabase.from('lancamentos').delete().eq('id', lancamento_id);
            throw linhasError;
        }

        res.json({ success: true, id: lancamento_id });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getBalancete = async (req: Request, res: Response) => {
    try {
        const { exercicio_id } = req.query;
        
        if (!exercicio_id) {
            return res.status(400).json({ success: false, error: "Exercicio ID é obrigatório" });
        }

        const supabase = getSupabase(req);
        // Supabase REST API does not easily support complex GROUP BY out of the box without RPC.
        // As a fallback for this demo MVP, we fetch the lines for the exercise and sum in memory.
        const { data: linhas, error } = await supabase.from('linhas_lancamento').select(`
            debito, credito,
            planos_contas (id, conta, descricao),
            lancamentos!inner (exercicio_id)
        `).eq('lancamentos.exercicio_id', exercicio_id);

        if (error) throw error;

        const sumMap = new Map<number, any>();

        (linhas || []).forEach((linha: any) => {
            const p = linha.planos_contas;
            if (!p) return;
            
            if (!sumMap.has(p.id)) {
                sumMap.set(p.id, {
                    conta: p.conta,
                    descricao: p.descricao,
                    total_debito: 0,
                    total_credito: 0
                });
            }
            
            const acc = sumMap.get(p.id);
            acc.total_debito += Number(linha.debito) || 0;
            acc.total_credito += Number(linha.credito) || 0;
        });

        const balancete = Array.from(sumMap.values()).map(acc => {
            return {
                ...acc,
                saldo: acc.total_debito - acc.total_credito
            };
        });
        
        // Sort by conta
        balancete.sort((a, b) => a.conta.localeCompare(b.conta));
        
        res.json({ success: true, balancete });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};
