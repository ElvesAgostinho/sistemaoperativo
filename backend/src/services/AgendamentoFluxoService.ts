/**
 * Ponte entre o Autopilot e o Agendamento: é isto que permite a um fluxo do
 * WhatsApp marcar de verdade, com o que o cliente escreveu — sem IA.
 *
 * Tudo o que aqui está é determinístico: o texto do cliente é interpretado por
 * regras (TextoDataHoraService), a disponibilidade é a mesma que a página de
 * marcação usa, e quando alguma coisa não dá, devolve um motivo em português
 * para o fluxo poder responder ao cliente.
 */
import { supabase } from '../lib/supabaseClient';
import { AgendamentoService } from './AgendamentoService';
import { TextoDataHoraService } from './TextoDataHoraService';

export interface ConfigAgendamento {
    modelo: string;
    rotulo_item: string; rotulo_item_plural: string;
    rotulo_recurso: string; rotulo_recurso_plural: string;
    rotulo_agendamento: string; rotulo_agendamento_plural: string;
    campos: { chave: string; rotulo: string; tipo: string; obrigatorio?: boolean; opcoes?: string[] }[];
}

/** Modelos prontos: o mesmo módulo a falar a língua de cada negócio. */
export const MODELOS_AGENDAMENTO: Record<string, Partial<ConfigAgendamento> & { nome: string; exemplos: string[] }> = {
    generico: { nome: 'Genérico', rotulo_item: 'Serviço', rotulo_item_plural: 'Serviços', rotulo_recurso: 'Responsável', rotulo_recurso_plural: 'Responsáveis', rotulo_agendamento: 'Marcação', rotulo_agendamento_plural: 'Marcações', campos: [], exemplos: [] },
    salao: { nome: 'Salão / Barbearia', rotulo_item: 'Serviço', rotulo_item_plural: 'Serviços', rotulo_recurso: 'Profissional', rotulo_recurso_plural: 'Profissionais', rotulo_agendamento: 'Marcação', rotulo_agendamento_plural: 'Marcações', campos: [], exemplos: ['Corte de cabelo', 'Manicure'] },
    clinica: { nome: 'Clínica / Consultório', rotulo_item: 'Consulta', rotulo_item_plural: 'Consultas', rotulo_recurso: 'Profissional', rotulo_recurso_plural: 'Profissionais', rotulo_agendamento: 'Consulta', rotulo_agendamento_plural: 'Consultas', campos: [{ chave: 'motivo', rotulo: 'Motivo da consulta', tipo: 'texto' }], exemplos: ['Consulta geral', 'Análises'] },
    hotel: { nome: 'Hotel / Residencial', rotulo_item: 'Tipo de quarto', rotulo_item_plural: 'Tipos de quarto', rotulo_recurso: 'Quarto', rotulo_recurso_plural: 'Quartos', rotulo_agendamento: 'Reserva', rotulo_agendamento_plural: 'Reservas', campos: [{ chave: 'pessoas', rotulo: 'Nº de pessoas', tipo: 'numero', obrigatorio: true }, { chave: 'noites', rotulo: 'Nº de noites', tipo: 'numero' }, { chave: 'documento', rotulo: 'BI / Passaporte', tipo: 'texto' }], exemplos: ['Quarto simples', 'Quarto duplo', 'Suite'] },
    restaurante: { nome: 'Restaurante', rotulo_item: 'Tipo de mesa', rotulo_item_plural: 'Tipos de mesa', rotulo_recurso: 'Mesa', rotulo_recurso_plural: 'Mesas', rotulo_agendamento: 'Reserva', rotulo_agendamento_plural: 'Reservas', campos: [{ chave: 'pessoas', rotulo: 'Nº de pessoas', tipo: 'numero', obrigatorio: true }, { chave: 'ocasiao', rotulo: 'Ocasião', tipo: 'selecao', opcoes: ['Normal', 'Aniversário', 'Empresa'] }], exemplos: ['Mesa interior', 'Mesa esplanada'] },
    oficina: { nome: 'Oficina / Assistência', rotulo_item: 'Tipo de serviço', rotulo_item_plural: 'Tipos de serviço', rotulo_recurso: 'Técnico', rotulo_recurso_plural: 'Técnicos', rotulo_agendamento: 'Serviço', rotulo_agendamento_plural: 'Serviços', campos: [{ chave: 'matricula', rotulo: 'Matrícula', tipo: 'texto', obrigatorio: true }, { chave: 'viatura', rotulo: 'Marca/Modelo', tipo: 'texto' }], exemplos: ['Revisão', 'Mudança de óleo'] },
    aluguer: { nome: 'Aluguer de equipamento/espaço', rotulo_item: 'Tipo de aluguer', rotulo_item_plural: 'Tipos de aluguer', rotulo_recurso: 'Equipamento', rotulo_recurso_plural: 'Equipamentos', rotulo_agendamento: 'Reserva', rotulo_agendamento_plural: 'Reservas', campos: [{ chave: 'local', rotulo: 'Local de entrega', tipo: 'texto' }], exemplos: ['Sala de reuniões', 'Gerador'] }
};

const PADRAO: ConfigAgendamento = {
    modelo: 'generico', rotulo_item: 'Serviço', rotulo_item_plural: 'Serviços',
    rotulo_recurso: 'Responsável', rotulo_recurso_plural: 'Responsáveis',
    rotulo_agendamento: 'Marcação', rotulo_agendamento_plural: 'Marcações', campos: []
};

export class AgendamentoFluxoService {
    // ============================================================
    // CONFIGURAÇÃO (rótulos e campos extra)
    // ============================================================
    public static async config(empresaId: string, client: any = supabase): Promise<ConfigAgendamento> {
        try {
            const { data } = await client.from('agendamento_config').select('*').eq('empresa_id', empresaId).maybeSingle();
            return data ? { ...PADRAO, ...data, campos: data.campos || [] } : PADRAO;
        } catch { return PADRAO; }
    }

    public static async guardarConfig(empresaId: string, alteracoes: Partial<ConfigAgendamento>, client: any = supabase) {
        const atual = await this.config(empresaId, client);
        const novo = { ...atual, ...alteracoes, empresa_id: empresaId, atualizado_em: new Date().toISOString() };
        await client.from('agendamento_config').delete().eq('empresa_id', empresaId);
        const { error } = await client.from('agendamento_config').insert(novo);
        if (error) throw error;
        return novo;
    }

    /** Valida os campos extra definidos pela empresa. Devolve o erro ou os dados limpos. */
    public static validarCampos(config: ConfigAgendamento, dados: Record<string, any>): { erro?: string; dados?: Record<string, any> } {
        const limpo: Record<string, any> = {};
        for (const c of config.campos || []) {
            const bruto = dados?.[c.chave];
            const v = typeof bruto === 'string' ? bruto.trim() : bruto;
            if (v === undefined || v === null || v === '') {
                if (c.obrigatorio) return { erro: `Falta ${c.rotulo.toLowerCase()}.` };
                continue;
            }
            if (c.tipo === 'numero') {
                // "muitas pessoas" não pode virar 0: se não sobrar nenhum dígito, é erro.
                const so = String(v).replace(/[^\d.,-]/g, '').replace(',', '.');
                const n = Number(so);
                if (!/\d/.test(so) || !Number.isFinite(n)) return { erro: `${c.rotulo}: indique um número.` };
                limpo[c.chave] = n;
            } else if (c.tipo === 'selecao' && c.opcoes?.length) {
                const achado = c.opcoes.find(o => o.toLowerCase() === String(v).toLowerCase());
                if (!achado) return { erro: `${c.rotulo}: escolha uma das opções (${c.opcoes.join(', ')}).` };
                limpo[c.chave] = achado;
            } else {
                limpo[c.chave] = String(v).slice(0, 300);
            }
        }
        return { dados: limpo };
    }

    // ============================================================
    // ENCONTRAR O SERVIÇO PELO QUE O CLIENTE ESCREVEU
    // ============================================================
    /** Aceita o id, o nome exato, parte do nome, ou o número da opção ("1", "2"). */
    public static async encontrarServico(empresaId: string, texto: string, client: any = supabase): Promise<{ id: number; nome: string; duracao_minutos: number } | null> {
        const { data: servicos } = await client.from('agendamento_servicos')
            .select('id, nome, duracao_minutos').eq('empresa_id', empresaId).eq('ativo', true).order('nome');
        const lista = servicos || [];
        if (lista.length === 0) return null;

        const t = String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
        if (!t) return null;

        const porId = lista.find((s: any) => String(s.id) === t);
        if (porId) return porId;

        const norm = (s: string) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
        const exato = lista.find((s: any) => norm(s.nome) === t);
        if (exato) return exato;

        // número da opção, como aparece num menu ("1 - Quarto simples")
        if (/^\d{1,2}$/.test(t)) {
            const i = Number(t) - 1;
            if (i >= 0 && i < lista.length) return lista[i];
        }

        const contem = lista.filter((s: any) => norm(s.nome).includes(t) || t.includes(norm(s.nome)));
        return contem.length === 1 ? contem[0] : null;
    }

    // ============================================================
    // NÓ "VER HORÁRIOS LIVRES"
    // ============================================================
    public static async horariosLivres(empresaId: string, servicoTexto: string, dataTexto: string, maximo = 8): Promise<{
        ok: boolean; erro?: string; data?: string; dataPorExtenso?: string; servico?: any; horarios: string[]; texto: string;
    }> {
        const servico = await this.encontrarServico(empresaId, servicoTexto);
        if (!servico) return { ok: false, erro: 'Não percebi qual é o serviço.', horarios: [], texto: '' };

        const data = TextoDataHoraService.data(dataTexto);
        if (!data) return { ok: false, erro: 'Não percebi a data.', horarios: [], texto: '' };
        if (data < new Date().toISOString().slice(0, 10)) return { ok: false, erro: 'Essa data já passou.', data, horarios: [], texto: '' };

        const { horarios, motivo } = await AgendamentoService.getDisponibilidade(empresaId, servico.id, data);
        const escolhidos = horarios.slice(0, maximo);
        return {
            ok: true, data, dataPorExtenso: TextoDataHoraService.dataPorExtenso(data), servico,
            erro: horarios.length === 0 ? (motivo || 'Não há horários livres nesse dia.') : undefined,
            horarios: escolhidos,
            texto: escolhidos.length ? escolhidos.join(', ') : ''
        };
    }

    // ============================================================
    // NÓ "CRIAR MARCAÇÃO"
    // ============================================================
    public static async criarPeloFluxo(empresaId: string, entrada: {
        servico: string; data: string; hora: string; nome: string; telefone: string;
        notas?: string; dados?: Record<string, any>; automationId?: number | null;
    }): Promise<{ ok: boolean; erro?: string; id?: number; data?: string; hora?: string; servicoNome?: string }> {
        const servico = await this.encontrarServico(empresaId, entrada.servico);
        if (!servico) return { ok: false, erro: 'Não consegui identificar o serviço pedido.' };

        const data = TextoDataHoraService.data(entrada.data);
        if (!data) return { ok: false, erro: 'Não consegui perceber a data.' };
        const hora = TextoDataHoraService.hora(entrada.hora);
        if (!hora) return { ok: false, erro: 'Não consegui perceber a hora.' };
        if (data < new Date().toISOString().slice(0, 10)) return { ok: false, erro: 'Essa data já passou.' };

        const nome = String(entrada.nome || '').trim();
        const telefone = String(entrada.telefone || '').replace(/\D/g, '');
        if (!nome) return { ok: false, erro: 'Falta o nome do cliente.' };
        if (!telefone) return { ok: false, erro: 'Falta o telefone do cliente.' };

        const config = await this.config(empresaId);
        const v = this.validarCampos(config, entrada.dados || {});
        if (v.erro) return { ok: false, erro: v.erro };

        try {
            const id = await AgendamentoService.criarAgendamento(empresaId, {
                servico_id: servico.id, cliente_nome: nome, cliente_telefone: telefone,
                data, hora_inicio: hora, notas: entrada.notas
            }, 'whatsapp');

            // Dados extra, ligação ao CRM e ao fluxo que a criou.
            const { data: cliente } = await supabase.from('clientes').select('id')
                .eq('empresa_id', empresaId).or(`telefone.eq.${telefone},telefone.ilike.%${telefone}%`).limit(1).maybeSingle();
            await supabase.from('agendamentos').update({
                dados: v.dados || {}, origem: 'fluxo',
                cliente_id: cliente?.id || null, automation_id: entrada.automationId || null
            }).eq('id', id).eq('empresa_id', empresaId);

            return { ok: true, id, data, hora, servicoNome: servico.nome };
        } catch (e: any) {
            // A mensagem do serviço já é legível ("Esse horário deixou de estar disponível…")
            return { ok: false, erro: e.message || 'Não foi possível criar a marcação.' };
        }
    }

    /** Marcações futuras de um telefone, em texto pronto a enviar. */
    public static async minhasMarcacoes(empresaId: string, telefone: string): Promise<{ lista: any[]; texto: string }> {
        const lista = await AgendamentoService.listarAgendamentosPorTelefone(empresaId, String(telefone || '').replace(/\D/g, ''));
        const texto = (lista || []).map((a: any, i: number) =>
            `${i + 1} - ${a.servico_nome || 'Marcação'} · ${TextoDataHoraService.dataPorExtenso(a.data)} às ${String(a.hora_inicio).slice(0, 5)}`
        ).join('\n');
        return { lista: lista || [], texto };
    }
}
