import { Request } from 'express';
import { getSupabase } from '../lib/supabaseClient';
import { PdfService } from './PdfService';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

export class EmployeeService {

    public static async getAllEmployees(req: Request) {
        const supabase = getSupabase(req);
        const { data, error } = await supabase.from('colaboradores').select('*, departamentos(nome), contratos(tipo_contrato, data_fim, estado)');
        if (error) throw error;
        
        return data.map((c: any) => ({
            ...c,
            nome_departamento: c.departamentos?.nome,
            tipo_contrato: c.contratos?.[0]?.tipo_contrato,
            data_fim: c.contratos?.[0]?.data_fim,
            estado_contrato: c.contratos?.[0]?.estado
        }));
    }

    public static async seedPayrollConfigs(req: Request) {
        // Now handled via initial DB seeding or migrations in Postgres
        return true;
    }

    public static async seedDummyEmployee(req: Request) {
        // Not used heavily in production Supabase, skipping
    }

    public static async createEmployee(req: Request, dados: any) {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const { 
            nome, bi, nif, cargo, salario_base, 
            tipo_contrato, data_inicio, data_fim, iban,
            banco, email, telefone, niss, departamento, numero_dependentes,
            sub_alimentacao_contrato, sub_transporte_contrato,
            estado_civil, genero, nacionalidade, endereco, contato_emergencia,
            validade_documento, validade_carta_conducao,
            data_emissao_documento, data_emissao_carta_conducao
        } = dados;
        
        const { data: colab, error: colabError } = await supabase.from('colaboradores').insert({
            empresa_id, nome, bi, nif, cargo, salario_base, 
            iban, banco, email, telefone, niss, departamento, 
            departamento_id: dados.departamento_id || null, 
            numero_dependentes: numero_dependentes || 0,
            sub_alimentacao_contrato: sub_alimentacao_contrato || 0, 
            sub_transporte_contrato: sub_transporte_contrato || 0,
            estado_civil, genero, nacionalidade, endereco, contato_emergencia, estado: 'Ativo',
            // Note: Add missing columns if they exist in schema, else ignore or adapt
        }).select('id').single();

        if (colabError) throw colabError;

        const { error: contratoError } = await supabase.from('contratos').insert({
            empresa_id,
            colaborador_id: colab.id,
            tipo_contrato,
            data_inicio,
            data_fim: data_fim || null,
            iban,
            estado: 'Ativo'
        });

        if (contratoError) throw contratoError;

        return colab.id;
    }

    public static async updateEmployee(req: Request, id: number, dados: any) {
        const supabase = getSupabase(req);
        const { error } = await supabase.from('colaboradores').update({
            nome: dados.nome, bi: dados.bi, nif: dados.nif, cargo: dados.cargo, 
            salario_base: dados.salario_base, iban: dados.iban,
            banco: dados.banco, email: dados.email, telefone: dados.telefone, niss: dados.niss, 
            departamento: dados.departamento, departamento_id: dados.departamento_id || null, 
            numero_dependentes: dados.numero_dependentes || 0,
            sub_alimentacao_contrato: dados.sub_alimentacao_contrato || 0, 
            sub_transporte_contrato: dados.sub_transporte_contrato || 0,
            estado_civil: dados.estado_civil, genero: dados.genero, nacionalidade: dados.nacionalidade, 
            endereco: dados.endereco, contato_emergencia: dados.contato_emergencia
        }).eq('id', id);

        if (error) throw error;
    }

    public static async deleteEmployee(req: Request, id: number) {
        const supabase = getSupabase(req);
        await supabase.from('documentos_colaboradores').delete().eq('colaborador_id', id);
        await supabase.from('recibos_vencimento').delete().eq('colaborador_id', id);
        await supabase.from('ausencias').delete().eq('colaborador_id', id);
        await supabase.from('contratos').delete().eq('colaborador_id', id);
        const { error } = await supabase.from('colaboradores').delete().eq('id', id);
        if (error) throw error;
    }

    public static async listarDocumentos(req: Request, colaboradorId: number) {
        const supabase = getSupabase(req);
        const { data, error } = await supabase.from('documentos_colaboradores').select('*').eq('colaborador_id', colaboradorId).order('criado_em', { ascending: false });
        if (error) throw error;
        return data;
    }

    public static async adicionarDocumento(req: Request, dados: any) {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { data, error } = await supabase.from('documentos_colaboradores').insert({
            empresa_id,
            colaborador_id: dados.colaborador_id,
            categoria: dados.categoria,
            titulo: dados.titulo,
            file_path: dados.file_path
        }).select('id').single();
        if (error) throw error;
        return data.id;
    }

    public static async listarDepartamentos(req: Request) {
        const supabase = getSupabase(req);
        const { data, error } = await supabase.from('departamentos').select('*, colaboradores(nome)');
        if (error) throw error;
        return data.map((d: any) => ({ ...d, nome_gestor: d.colaboradores?.nome }));
    }

    public static async criarDepartamento(req: Request, dados: any) {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { data, error } = await supabase.from('departamentos').insert({
            empresa_id,
            nome: dados.nome,
            descricao: dados.descricao,
            orcamento_mensal: dados.orcamento_mensal || 0,
            gestor_id: dados.gestor_id || null
        }).select('id').single();
        if (error) throw error;
        return data.id;
    }

    public static async deleteDepartamento(req: Request, id: number) {
        const supabase = getSupabase(req);
        await supabase.from('colaboradores').update({ departamento_id: null }).eq('departamento_id', id);
        const { error } = await supabase.from('departamentos').delete().eq('id', id);
        if (error) throw error;
    }

    public static async registrarAusencia(req: Request, colaborador_id: number, tipo: string, data_inicio: string, data_fim: string, justificada: boolean, comprovativo_path: string | null = null, estado_inicial: string = 'Pendente Chefia') {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { error } = await supabase.from('ausencias').insert({
            empresa_id,
            colaborador_id,
            tipo,
            data_inicio,
            data_fim,
            justificada,
            comprovativo_path,
            estado_aprovacao: estado_inicial
        });
        if (error) throw error;
    }

    public static async listarAusencias(req: Request, colaboradorId?: number) {
        const supabase = getSupabase(req);
        let query = supabase.from('ausencias').select('*, colaboradores(nome, cargo)').order('criado_em', { ascending: false });
        if (colaboradorId) {
            query = query.eq('colaborador_id', colaboradorId);
        }
        const { data, error } = await query;
        if (error) throw error;
        return data.map((a: any) => ({ ...a, nome: a.colaboradores?.nome, cargo: a.colaboradores?.cargo }));
    }

    public static async atualizarEstadoAusencia(req: Request, id: number, estado: string) {
        const supabase = getSupabase(req);
        const { error } = await supabase.from('ausencias').update({
            estado_aprovacao: estado,
            justificada: estado === 'Justificada'
        }).eq('id', id);
        if (error) throw error;
    }

    // --- Outros Métodos Omitidos Para Brevidade - Serão Integrados Mais Tarde ---
    public static async processarSalarios(req: Request, mes: number, ano: number) {
        // Implementação mock para evitar crashes (A lógica do HR complexa deve ser movida gradualmente)
        throw new Error('Migração para Supabase em curso. Processamento de salários via Supabase ficará disponível em breve.');
    }

    public static async gerarDeclaracaoServico(req: Request, colaborador_id: number): Promise<string> {
        throw new Error('Em manutenção: Migrando para Supabase.');
    }
    public static async fecharProcessamento(req: Request, processamentoId: number) {}
    public static async getProcessamento(req: Request, mes: number, ano: number) { return null; }
    public static async gerarReciboPdf(req: Request, reciboId: number): Promise<string> { return ''; }
}
