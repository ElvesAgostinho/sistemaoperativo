import { Request } from 'express';
import { getSupabase } from '../lib/supabaseClient';
import { PdfService } from './PdfService';

export class CrmService {

    // --- CLIENTES ---
    public static async getClientes(req: Request) {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { data, error } = await supabase.from('clientes').select('*').eq('empresa_id', empresa_id).order('criado_em', { ascending: false });
        if (error) throw error;
        return data;
    }

    /** Tudo o que o sistema sabe deste cliente, num sítio só. */
    public static async getCliente(req: Request, id: number) {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const { data: cliente } = await supabase.from('clientes')
            .select('*').eq('id', id).eq('empresa_id', empresa_id).maybeSingle();
        if (!cliente) return null;

        const { data: negocios } = await supabase.from('negocios')
            .select('id, titulo, fase, valor, criado_em')
            .eq('empresa_id', empresa_id).eq('cliente_id', id)
            .order('criado_em', { ascending: false });

        // A conversa de WhatsApp deste número, se existir — para se poder saltar
        // da ficha para o chat em vez de a ir procurar à mão.
        const telefone = String(cliente.telefone || '').replace(/\D/g, '');
        let conversa = null;
        if (telefone) {
            const { data } = await supabase.from('wa_conversations')
                .select('id, last_message_at').eq('empresa_id', empresa_id).eq('phone_number', telefone).maybeSingle();
            conversa = data || null;
        }

        return { cliente, negocios: negocios || [], conversa };
    }

    public static async updateCliente(req: Request, id: number, dados: any) {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const { data: atual } = await supabase.from('clientes')
            .select('id, custom_fields').eq('id', id).eq('empresa_id', empresa_id).maybeSingle();
        if (!atual) throw new Error('Cliente não encontrado.');

        const patch: any = {};
        if (dados.nome !== undefined) {
            const nome = String(dados.nome).trim();
            if (!nome) throw new Error('O nome não pode ficar vazio.');
            patch.nome = nome;
        }
        if (dados.email !== undefined) {
            const email = String(dados.email).trim();
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Esse email não parece válido.');
            patch.email = email || null;
        }
        if (dados.telefone !== undefined) patch.telefone = String(dados.telefone).replace(/\D/g, '') || null;
        if (dados.empresa !== undefined) patch.empresa = String(dados.empresa).trim() || null;
        if (dados.notas !== undefined) patch.custom_fields = { ...(atual.custom_fields || {}), notas: String(dados.notas) };

        if (Object.keys(patch).length === 0) throw new Error('Não havia nada para guardar.');

        const { data, error } = await supabase.from('clientes')
            .update(patch).eq('id', id).eq('empresa_id', empresa_id).select('*').single();
        if (error) throw error;

        // O nome corrigido aqui é o que deve aparecer no chat do WhatsApp.
        if (patch.nome && data?.telefone) {
            await supabase.from('wa_conversations').update({ contact_name: patch.nome })
                .eq('empresa_id', empresa_id).eq('phone_number', String(data.telefone).replace(/\D/g, ''));
        }
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
        const empresa_id = (req as any).user?.empresa_id;
        // Cascade delete child negocios explicitly — scoped à mesma empresa.
        await supabase.from('negocios').delete().eq('cliente_id', id).eq('empresa_id', empresa_id);
        const { data, error } = await supabase.from('clientes').delete().eq('id', id).eq('empresa_id', empresa_id).select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Cliente não encontrado ou sem permissão para eliminar.');
    }

    // --- NEGÓCIOS (LEADS) ---
    public static async getNegocios(req: Request) {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { data, error } = await supabase.from('negocios').select('*, clientes(nome, empresa)').eq('empresa_id', empresa_id).order('criado_em', { ascending: false });
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
        const empresa_id = (req as any).user?.empresa_id;
        const { data, error } = await supabase.from('negocios').update({ fase: nova_fase }).eq('id', negocio_id).eq('empresa_id', empresa_id).select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Negócio não encontrado ou sem permissão para alterar.');
    }

    public static async deleteNegocio(req: Request, id: number) {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        await supabase.from('proformas').delete().eq('negocio_id', id).eq('empresa_id', empresa_id);
        const { data, error } = await supabase.from('negocios').delete().eq('id', id).eq('empresa_id', empresa_id).select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Negócio não encontrado ou sem permissão para eliminar.');
    }

    // --- PROFORMAS ---
    public static async gerarProformaPdf(req: Request, negocio_id: number, itens: Array<{descricao: string, qtd: number, preco_unitario: number}>): Promise<string> {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const { data: negocio, error } = await supabase.from('negocios').select('*, clientes(nome, empresa, telefone, email)').eq('id', negocio_id).eq('empresa_id', empresa_id).single();
        if (error || !negocio) throw new Error('Negócio não encontrado');

        const { filePath, totalGeral } = await PdfService.gerarProformaPdf(negocio, itens, empresa_id);

        await supabase.from('negocios').update({ valor_estimado: totalGeral }).eq('id', negocio_id).eq('empresa_id', empresa_id);
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
            .select('titulo, clientes(nome)').eq('id', negocio_id).eq('empresa_id', empresa_id).single();
        if (negErr) throw negErr;

        const { data: faseData, error: faseErr } = await supabase.from('negocios').update({ fase: 'Ganho' }).eq('id', negocio_id).eq('empresa_id', empresa_id).select('id');
        if (faseErr) throw faseErr;
        if (!faseData || faseData.length === 0) throw new Error('Negócio não encontrado ou sem permissão para registar pagamento.');

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
