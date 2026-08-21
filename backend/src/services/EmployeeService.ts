import { Request } from 'express';
import { getSupabase } from '../lib/supabaseClient';
import { PdfService } from './PdfService';
import { PayrollService, SalarioResult } from './PayrollService';
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

    // --- Processamento Salarial ---
    public static async processarSalarios(req: Request, mes: number, ano: number) {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const { data: existente } = await supabase.from('processamentos_mensais')
            .select('id, estado').eq('empresa_id', empresa_id).eq('mes', mes).eq('ano', ano).maybeSingle();

        if (existente && existente.estado === 'Fechado') {
            throw new Error('Este mês já foi processado e fechado. Não pode ser reprocessado.');
        }

        const { data: colaboradores, error: colabErr } = await supabase.from('colaboradores')
            .select('id, salario_base, sub_alimentacao_contrato, sub_transporte_contrato')
            .eq('empresa_id', empresa_id).eq('estado', 'Ativo');
        if (colabErr) throw colabErr;
        if (!colaboradores || colaboradores.length === 0) {
            throw new Error('Não há colaboradores ativos para processar.');
        }

        let processamento_id: number;
        if (existente) {
            processamento_id = existente.id;
            await supabase.from('recibos_vencimento').delete().eq('processamento_id', processamento_id);
        } else {
            const { data: proc, error: procErr } = await supabase.from('processamentos_mensais')
                .insert({ empresa_id, mes, ano, estado: 'Rascunho' }).select('id').single();
            if (procErr) throw procErr;
            processamento_id = proc.id;
        }

        const inicioMes = new Date(ano, mes - 1, 1);
        const fimMes = new Date(ano, mes, 0);
        const inicioMesStr = inicioMes.toISOString().split('T')[0];
        const fimMesStr = fimMes.toISOString().split('T')[0];

        const recibos = [];
        for (const colab of colaboradores) {
            const { data: ausencias } = await supabase.from('ausencias')
                .select('data_inicio, data_fim')
                .eq('colaborador_id', colab.id)
                .eq('tipo', 'Falta Injustificada')
                .lte('data_inicio', fimMesStr)
                .gte('data_fim', inicioMesStr);

            let faltasDias = 0;
            (ausencias || []).forEach((a: any) => {
                const ini = new Date(Math.max(new Date(a.data_inicio).getTime(), inicioMes.getTime()));
                const fim = new Date(Math.min(new Date(a.data_fim).getTime(), fimMes.getTime()));
                const dias = Math.floor((fim.getTime() - ini.getTime()) / 86400000) + 1;
                if (dias > 0) faltasDias += dias;
            });

            const salarioBase = Number(colab.salario_base) || 0;
            const subAlimentacao = Number(colab.sub_alimentacao_contrato) || 0;
            const subTransporte = Number(colab.sub_transporte_contrato) || 0;

            const calculo = PayrollService.calcularSalario({
                salarioBase,
                faltasInjustificadas: faltasDias,
                subsidiosNaoTributaveis: subAlimentacao + subTransporte,
                subsidiosTributaveis: 0
            });

            recibos.push({
                empresa_id,
                processamento_id,
                colaborador_id: colab.id,
                salario_base: salarioBase,
                faltas_dias: faltasDias,
                desconto_faltas: calculo.descontoFaltas,
                subsidio_alimentacao: subAlimentacao,
                subsidio_transporte: subTransporte,
                outros_abonos: 0,
                outros_descontos: 0,
                inss_trabalhador: calculo.inssTrabalhador,
                inss_entidade: calculo.salarioAposFaltas * 0.08,
                irt: calculo.irt,
                total_liquido: calculo.salarioLiquido
            });
        }

        const { error: insErr } = await supabase.from('recibos_vencimento').insert(recibos);
        if (insErr) throw insErr;

        return processamento_id;
    }

    public static async getProcessamento(req: Request, mes: number, ano: number) {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const { data: processamento, error: procErr } = await supabase.from('processamentos_mensais')
            .select('*').eq('empresa_id', empresa_id).eq('mes', mes).eq('ano', ano).maybeSingle();
        if (procErr) throw procErr;
        if (!processamento) return null;

        const { data: recibosData, error: recErr } = await supabase.from('recibos_vencimento')
            .select('*, colaboradores(nome)').eq('processamento_id', processamento.id);
        if (recErr) throw recErr;

        const recibos = (recibosData || []).map((r: any) => ({ ...r, nome: r.colaboradores?.nome }));
        return { processamento, recibos };
    }

    public static async fecharProcessamento(req: Request, processamentoId: number) {
        const supabase = getSupabase(req);
        const { error } = await supabase.from('processamentos_mensais').update({ estado: 'Fechado' }).eq('id', processamentoId);
        if (error) throw error;
    }

    public static async atualizarReciboManual(req: Request, id: number, dados: any) {
        const supabase = getSupabase(req);
        const { data: existente, error: getErr } = await supabase.from('recibos_vencimento').select('salario_base').eq('id', id).single();
        if (getErr) throw getErr;

        const salarioBase = Number(existente.salario_base) || 0;
        const descontoFaltas = Number(dados.desconto_faltas) || 0;
        const subAlimentacao = Number(dados.subsidio_alimentacao) || 0;
        const subTransporte = Number(dados.subsidio_transporte) || 0;
        const outrosAbonos = Number(dados.outros_abonos) || 0;
        const outrosDescontos = Number(dados.outros_descontos) || 0;
        const irt = Number(dados.irt) || 0;
        const inssTrabalhador = Number(dados.inss_trabalhador) || 0;

        const salarioBruto = salarioBase + subAlimentacao + subTransporte + outrosAbonos;
        const totalDescontos = descontoFaltas + inssTrabalhador + irt + outrosDescontos;
        const total_liquido = salarioBruto - totalDescontos;

        const { error } = await supabase.from('recibos_vencimento').update({
            faltas_dias: dados.faltas_dias,
            desconto_faltas: descontoFaltas,
            subsidio_alimentacao: subAlimentacao,
            subsidio_transporte: subTransporte,
            outros_abonos: outrosAbonos,
            outros_descontos: outrosDescontos,
            irt,
            inss_trabalhador: inssTrabalhador,
            total_liquido
        }).eq('id', id);
        if (error) throw error;
    }

    public static async gerarReciboPdf(req: Request, reciboId: number): Promise<string> {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const { data: recibo, error } = await supabase.from('recibos_vencimento')
            .select('*, colaboradores(nome, nif), processamentos_mensais(mes, ano)')
            .eq('id', reciboId).single();
        if (error || !recibo) throw new Error('Recibo não encontrado.');

        const mesAno = `${String(recibo.processamentos_mensais?.mes || '').padStart(2, '0')}/${recibo.processamentos_mensais?.ano || ''}`;

        const dadosSalariais: SalarioResult = {
            salarioBruto: Number(recibo.salario_base) + Number(recibo.subsidio_alimentacao) + Number(recibo.subsidio_transporte) + Number(recibo.outros_abonos),
            descontoFaltas: Number(recibo.desconto_faltas),
            salarioAposFaltas: Number(recibo.salario_base) - Number(recibo.desconto_faltas),
            inssTrabalhador: Number(recibo.inss_trabalhador),
            materiaColetavelIRT: 0,
            irt: Number(recibo.irt),
            totalDescontos: Number(recibo.desconto_faltas) + Number(recibo.inss_trabalhador) + Number(recibo.irt) + Number(recibo.outros_descontos),
            salarioLiquido: Number(recibo.total_liquido)
        };

        return PdfService.gerarReciboVencimento(
            recibo.colaboradores?.nome || 'Colaborador',
            recibo.colaboradores?.nif || '999999999',
            mesAno,
            dadosSalariais,
            empresa_id
        );
    }

    public static async gerarDeclaracaoServico(req: Request, colaborador_id: number): Promise<string> {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const { data: colaborador, error } = await supabase.from('colaboradores')
            .select('nome, bi, nif, cargo, salario_base, contratos(data_inicio)')
            .eq('id', colaborador_id).single();
        if (error || !colaborador) throw new Error('Colaborador não encontrado.');

        return PdfService.gerarDeclaracaoServico({
            nome: colaborador.nome,
            bi: colaborador.bi,
            nif: colaborador.nif,
            cargo: colaborador.cargo,
            salario_base: Number(colaborador.salario_base),
            data_inicio: (colaborador as any).contratos?.[0]?.data_inicio
        }, empresa_id);
    }

    // --- Adiantamentos (Vales) ---
    public static async listarAdiantamentos(req: Request) {
        const supabase = getSupabase(req);
        const { data, error } = await supabase.from('adiantamentos')
            .select('*, colaboradores(nome)').order('criado_em', { ascending: false });
        if (error) throw error;
        return (data || []).map((a: any) => ({ ...a, nome: a.colaboradores?.nome }));
    }

    public static async criarAdiantamento(req: Request, dados: any) {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const valorTotal = Number(dados.valor_total) || 0;
        const parcelas = Number(dados.parcelas_mensais) || 1;

        const { error } = await supabase.from('adiantamentos').insert({
            empresa_id,
            colaborador_id: Number(dados.colaborador_id),
            valor_total: valorTotal,
            parcelas_mensais: parcelas,
            valor_por_parcela: valorTotal / parcelas,
            parcelas_pagas: 0,
            estado: 'Em Curso'
        });
        if (error) throw error;
    }

    // --- Avaliações de Desempenho ---
    public static async listarAvaliacoes(req: Request) {
        const supabase = getSupabase(req);
        const { data, error } = await supabase.from('avaliacoes_desempenho')
            .select('*, avaliado:colaboradores!avaliacoes_desempenho_colaborador_id_fkey(nome), avaliador:colaboradores!avaliacoes_desempenho_avaliador_id_fkey(nome)')
            .order('data_avaliacao', { ascending: false });
        if (error) throw error;
        return (data || []).map((a: any) => ({
            ...a,
            avaliado_nome: a.avaliado?.nome,
            avaliador_nome: a.avaliador?.nome
        }));
    }

    public static async criarAvaliacao(req: Request, dados: any) {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const { error } = await supabase.from('avaliacoes_desempenho').insert({
            empresa_id,
            colaborador_id: Number(dados.colaborador_id),
            avaliador_id: dados.avaliador_id ? Number(dados.avaliador_id) : null,
            pontuacao: Number(dados.pontuacao),
            comentarios: dados.comentarios || null
        });
        if (error) throw error;
    }
}
