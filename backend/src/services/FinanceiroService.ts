import { Request } from 'express';
import { getSupabase } from '../lib/supabaseClient';
import { EmployeeService } from './EmployeeService';

export class FinanceiroService {

    public static async listarTransacoes(req: Request, filtros: { tipo?: string; categoria?: string; estado?: string; mes?: number; ano?: number }) {
        const supabase = getSupabase(req);
        let query = supabase.from('financeiro_transacoes').select('*').order('data', { ascending: false }).order('id', { ascending: false });

        if (filtros.tipo) query = query.eq('tipo', filtros.tipo);
        if (filtros.categoria) query = query.eq('categoria', filtros.categoria);
        if (filtros.estado) query = query.eq('estado', filtros.estado);
        if (filtros.mes && filtros.ano) {
            const inicio = `${filtros.ano}-${String(filtros.mes).padStart(2, '0')}-01`;
            const fim = new Date(filtros.ano, filtros.mes, 0).toISOString().split('T')[0];
            query = query.gte('data', inicio).lte('data', fim);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    }

    public static async criarTransacao(req: Request, dados: any, file?: Express.Multer.File) {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        if (!dados.tipo || !['entrada', 'saida'].includes(dados.tipo)) {
            throw new Error('Tipo de transação inválido (entrada ou saida).');
        }
        if (!dados.categoria) throw new Error('Categoria é obrigatória.');
        if (!dados.valor || Number(dados.valor) <= 0) throw new Error('Valor deve ser maior que zero.');
        if (!dados.data) throw new Error('Data é obrigatória.');

        const payload: any = {
            empresa_id,
            tipo: dados.tipo,
            categoria: dados.categoria,
            descricao: dados.descricao || null,
            valor: Number(dados.valor),
            data: dados.data,
            estado: dados.estado === 'Pendente' ? 'Pendente' : 'Pago',
            data_vencimento: dados.data_vencimento || null,
            forma_pagamento: dados.forma_pagamento || null,
            origem: dados.origem || 'manual',
            referencia_tipo: dados.referencia_tipo || null,
            referencia_id: dados.referencia_id || null
        };

        if (file) {
            payload.anexo_path = '/tmp/' + file.filename;
            payload.anexo_nome = file.originalname;
        }

        const { data, error } = await supabase.from('financeiro_transacoes').insert(payload).select('id').single();
        if (error) throw error;
        return data.id;
    }

    public static async marcarPago(req: Request, id: number) {
        const supabase = getSupabase(req);
        const { error } = await supabase.from('financeiro_transacoes')
            .update({ estado: 'Pago', data: new Date().toISOString().split('T')[0] })
            .eq('id', id);
        if (error) throw error;
    }

    public static async apagarTransacao(req: Request, id: number) {
        const supabase = getSupabase(req);
        const { error } = await supabase.from('financeiro_transacoes').delete().eq('id', id);
        if (error) throw error;
    }

    public static async getResumo(req: Request) {
        const supabase = getSupabase(req);
        const { data: transacoes, error } = await supabase.from('financeiro_transacoes')
            .select('tipo, valor, data').eq('estado', 'Pago');
        if (error) throw error;

        const hoje = new Date();
        const mesAtual = hoje.getMonth();
        const anoAtual = hoje.getFullYear();

        let saldo = 0;
        let entradasMes = 0;
        let saidasMes = 0;
        const fluxoPorMes = new Map<string, { entradas: number; saidas: number }>();

        (transacoes || []).forEach((t: any) => {
            const d = new Date(t.data);
            const valor = Number(t.valor) || 0;
            if (t.tipo === 'entrada') saldo += valor; else saldo -= valor;

            if (d.getMonth() === mesAtual && d.getFullYear() === anoAtual) {
                if (t.tipo === 'entrada') entradasMes += valor; else saidasMes += valor;
            }

            const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!fluxoPorMes.has(chave)) fluxoPorMes.set(chave, { entradas: 0, saidas: 0 });
            const acc = fluxoPorMes.get(chave)!;
            if (t.tipo === 'entrada') acc.entradas += valor; else acc.saidas += valor;
        });

        const fluxo: { mes: string; entradas: number; saidas: number }[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(anoAtual, mesAtual - i, 1);
            const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const acc = fluxoPorMes.get(chave) || { entradas: 0, saidas: 0 };
            fluxo.push({ mes: d.toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' }), entradas: acc.entradas, saidas: acc.saidas });
        }

        const { count: pendentesCount } = await supabase.from('financeiro_transacoes')
            .select('*', { count: 'exact', head: true }).eq('estado', 'Pendente');

        return { saldo, entradasMes, saidasMes, fluxo, pendentesCount: pendentesCount || 0 };
    }

    public static async getSalarios(req: Request, mes: number, ano: number) {
        const dados: any = await EmployeeService.getProcessamento(req, mes, ano);
        if (!dados) return { processado: false, estado: null, total: 0, recibos: [] };

        const total = (dados.recibos || []).reduce((acc: number, r: any) => acc + (Number(r.total_liquido) || 0), 0);
        return { processado: true, estado: dados.processamento.estado, total, recibos: dados.recibos };
    }
}
