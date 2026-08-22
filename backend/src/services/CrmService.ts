import { Request } from 'express';
import { getSupabase } from '../lib/supabaseClient';
import { PdfService } from './PdfService';

export class CrmService {

    // --- CLIENTES ---
    public static async getClientes(req: Request) {
        const supabase = getSupabase(req);
        const { data, error } = await supabase.from('clientes').select('*').order('criado_em', { ascending: false });
        if (error) throw error;
        return data;
    }

    public static async createCliente(req: Request | null, dados: { nome: string; email?: string; telefone?: string; empresa?: string, empresa_id?: number | null }) {
        const { supabase } = await import('../lib/supabaseClient'); // admin client
        const client = req ? getSupabase(req) : supabase;
        // empresa_id is handled by RLS/Postgres if possible? No, we must provide it if it doesn't have a default.
        // Wait, RLS just restricts access. If we INSERT, we MUST provide empresa_id unless it has a default!
        // But the user's role/auth token has the `empresa_id`? No, the user JWT doesn't inherently have `empresa_id` unless it's in app_metadata.
        // Let's get the user's empresa_id from `req.user.empresa_id` (AuthRequest).
        const empresa_id = req ? (req as any).user?.empresa_id : dados.empresa_id;
        
        const { data, error } = await client.from('clientes').insert({
            empresa_id,
            nome: dados.nome,
            email: dados.email || null,
            telefone: dados.telefone || null,
            empresa: dados.empresa || null
        }).select('id').single();
        if (error) throw error;
        return data.id;
    }

    public static async deleteCliente(req: Request, id: number) {
        const supabase = getSupabase(req);
        // Cascade delete child negocios explicitly
        await supabase.from('negocios').delete().eq('cliente_id', id);
        const { error } = await supabase.from('clientes').delete().eq('id', id);
        if (error) throw error;
    }

    // --- NEGÓCIOS (LEADS) ---
    public static async getNegocios(req: Request) {
        const supabase = getSupabase(req);
        const { data, error } = await supabase.from('negocios').select('*, clientes(nome, empresa)').order('criado_em', { ascending: false });
        if (error) throw error;
        return data.map((n: any) => ({
            ...n,
            cliente_nome: n.clientes?.nome,
            cliente_empresa: n.clientes?.empresa
        }));
    }

    public static async createNegocio(req: Request | null, dados: { cliente_id: number; titulo: string; valor_estimado?: number, empresa_id?: number | null }) {
        const { supabase } = await import('../lib/supabaseClient');
        const client = req ? getSupabase(req) : supabase;
        const empresa_id = req ? (req as any).user?.empresa_id : dados.empresa_id;
        const { data, error } = await client.from('negocios').insert({
            empresa_id,
            cliente_id: dados.cliente_id,
            titulo: dados.titulo,
            valor_estimado: dados.valor_estimado || 0,
            fase: 'Nova Lead'
        }).select('id').single();
        if (error) throw error;
        return data.id;
    }

    public static async updateFaseNegocio(req: Request, negocio_id: number, nova_fase: string) {
        const supabase = getSupabase(req);
        const { error } = await supabase.from('negocios').update({ fase: nova_fase }).eq('id', negocio_id);
        if (error) throw error;
    }

    public static async deleteNegocio(req: Request, id: number) {
        const supabase = getSupabase(req);
        await supabase.from('proformas').delete().eq('negocio_id', id);
        const { error } = await supabase.from('negocios').delete().eq('id', id);
        if (error) throw error;
    }

    // --- PROFORMAS ---
    public static async gerarProformaPdf(req: Request, negocio_id: number, itens: Array<{descricao: string, qtd: number, preco_unitario: number}>): Promise<string> {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const { data: negocio, error } = await supabase.from('negocios').select('*, clientes(nome, empresa, telefone, email)').eq('id', negocio_id).single();
        if (error || !negocio) throw new Error('Negócio não encontrado');

        const { filePath, totalGeral } = await PdfService.gerarProformaPdf(negocio, itens, empresa_id);

        await supabase.from('negocios').update({ valor_estimado: totalGeral }).eq('id', negocio_id);
        await supabase.from('proformas').insert({
            empresa_id,
            negocio_id,
            detalhes_json: JSON.stringify(itens),
            pdf_path: filePath
        });

        return filePath;
    }

    public static async registerPayment(req: Request, negocio_id: number, valor: number, metodo_pagamento: string, data_pagamento: string) {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const { data: negocio, error: negErr } = await supabase.from('negocios')
            .select('titulo, clientes(nome)').eq('id', negocio_id).single();
        if (negErr) throw negErr;

        const { error: faseErr } = await supabase.from('negocios').update({ fase: 'Ganho' }).eq('id', negocio_id);
        if (faseErr) throw faseErr;

        const clienteNome = (negocio as any)?.clientes?.nome || 'Cliente';
        const { data: transacao, error: transErr } = await supabase.from('financeiro_transacoes').insert({
            empresa_id,
            tipo: 'entrada',
            categoria: 'Vendas',
            descricao: `${negocio?.titulo || 'Negócio'} — ${clienteNome}`,
            valor,
            data: data_pagamento,
            estado: 'Pago',
            forma_pagamento: metodo_pagamento,
            origem: 'crm',
            referencia_tipo: 'negocio',
            referencia_id: String(negocio_id)
        }).select('id').single();
        if (transErr) throw transErr;

        return transacao.id;
    }

    public static formatAOA(value: number): string {
        return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(value);
    }
}
