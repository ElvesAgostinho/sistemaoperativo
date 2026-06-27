import { Request } from 'express';
import { getSupabase } from '../lib/supabaseClient';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
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
        
        return new Promise(async (resolve, reject) => {
            try {
                const { data: negocio, error } = await supabase.from('negocios').select('*, clientes(nome, empresa, telefone, email)').eq('id', negocio_id).single();
                if (error || !negocio) throw new Error('Negócio não encontrado');

                const doc = new PDFDocument({ margin: 50 });
                const fileName = `Proforma_${negocio.id}_${Date.now()}.pdf`;
                const filePath = path.join(__dirname, '..', '..', 'tmp', fileName);
                
                if (!fs.existsSync(path.dirname(filePath))) {
                    fs.mkdirSync(path.dirname(filePath), { recursive: true });
                }

                const writeStream = fs.createWriteStream(filePath);
                doc.pipe(writeStream);

                const { data: configs } = await supabase.from('configuracoes_sistema').select('chave, valor');
                const confMap = (configs || []).reduce((acc: any, c: any) => ({...acc, [c.chave]: c.valor}), {});

                const companyName = confMap['COMPANY_NAME'] || 'BUSINESS OS, LDA';
                const companyNif = confMap['COMPANY_NIF'] || '5000000000';
                const companyAddress = confMap['COMPANY_ADDRESS'] || 'Luanda, Angola';
                const companyPhone = confMap['COMPANY_PHONE'] || '';
                const companyEmail = confMap['COMPANY_EMAIL'] || 'geral@businessos.ao';

                // Skip logo for simplicity or implement it
                // if (confMap['COMPANY_LOGO_BASE64']) {
                //     PdfService.applyCompanyLogo(doc, confMap['COMPANY_LOGO_BASE64'], 'top-left');
                // }

                doc.fontSize(22).fillColor('#0078D4').text(companyName, { align: 'right' });
                doc.fontSize(10).fillColor('gray').text(`${companyAddress} | NIF: ${companyNif} | ${companyEmail} ${companyPhone ? '| ' + companyPhone : ''}`, { align: 'right' });
                doc.moveDown(2);

                doc.fontSize(18).fillColor('black').text('PROPOSTA COMERCIAL / PROFORMA', { align: 'left', underline: true });
                doc.fontSize(10).text(`Ref: PRF-${new Date().getFullYear()}-${negocio.id.toString().padStart(4, '0')}`, { align: 'left' });
                doc.text(`Data: ${new Date().toLocaleDateString('pt-PT')}`, { align: 'left' });
                doc.moveDown(2);

                doc.fontSize(12).fillColor('#333333').text('A Exmos. Senhores,', { continued: false });
                doc.font('Helvetica-Bold').text(negocio.clientes?.empresa || negocio.clientes?.nome);
                doc.font('Helvetica').fontSize(10);
                if (negocio.clientes?.empresa) doc.text(`A/C: ${negocio.clientes?.nome}`);
                if (negocio.clientes?.telefone) doc.text(`Tel: ${negocio.clientes?.telefone}`);
                if (negocio.clientes?.email) doc.text(`Email: ${negocio.clientes?.email}`);
                doc.moveDown(2);

                let totalGeral = 0;
                itens.forEach(item => {
                    const totalItem = item.qtd * item.preco_unitario;
                    totalGeral += totalItem;
                });

                doc.end();

                writeStream.on('finish', async () => {
                    await supabase.from('negocios').update({ valor_estimado: totalGeral }).eq('id', negocio_id);
                    await supabase.from('proformas').insert({
                        empresa_id,
                        negocio_id,
                        detalhes_json: JSON.stringify(itens),
                        pdf_path: filePath
                    });
                    resolve(filePath);
                });
                writeStream.on('error', reject);
            } catch (err) {
                reject(err);
            }
        });
    }

    public static async registerPayment(req: Request, negocio_id: number, valor: number, metodo_pagamento: string, data_pagamento: string) {
        // Implementação simplificada para Supabase
        const supabase = getSupabase(req);
        const { error } = await supabase.from('negocios').update({ fase: 'Ganho' }).eq('id', negocio_id);
        if (error) throw error;
        return 1;
    }

    public static formatAOA(value: number): string {
        return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(value);
    }
}
