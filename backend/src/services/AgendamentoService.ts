import { Request } from 'express';
import { getSupabase, supabase } from '../lib/supabaseClient';
import { WhatsAppChannelManager } from './WhatsAppChannelManager';

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function addMinutes(hhmm: string, minutes: number): string {
    const [h, m] = hhmm.split(':').map(Number);
    const total = h * 60 + m + minutes;
    const nh = Math.floor(total / 60) % 24;
    const nm = total % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

export class AgendamentoService {

    // ============================================================
    // Cálculo de disponibilidade — a parte "inteligente": gera os
    // horários possíveis dentro do expediente e remove os que já
    // colidem com marcações existentes (do mesmo profissional, se
    // indicado, ou de todo o negócio caso contrário).
    // ============================================================
    public static async getDisponibilidade(
        empresaId: string,
        servicoId: number,
        data: string,
        profissionalId?: number,
        client: any = supabase
    ): Promise<{ horarios: string[]; motivo?: string }> {
        const { data: servico } = await client.from('agendamento_servicos')
            .select('duracao_minutos').eq('id', servicoId).eq('empresa_id', empresaId).single();
        if (!servico) return { horarios: [], motivo: 'Serviço não encontrado.' };

        const diaSemana = new Date(data + 'T12:00:00').getDay();
        const { data: horario } = await client.from('agendamento_horarios')
            .select('hora_inicio, hora_fim, ativo').eq('empresa_id', empresaId).eq('dia_semana', diaSemana).maybeSingle();

        if (!horario || !horario.ativo) {
            return { horarios: [], motivo: `Fechado às ${DIAS_SEMANA[diaSemana]}s.` };
        }

        let ocupadosQuery = client.from('agendamentos')
            .select('hora_inicio, hora_fim, profissional_id')
            .eq('empresa_id', empresaId)
            .eq('data', data)
            .neq('estado', 'Cancelado');
        if (profissionalId) ocupadosQuery = ocupadosQuery.eq('profissional_id', profissionalId);
        const { data: ocupados } = await ocupadosQuery;

        const duracao = servico.duracao_minutos;
        const inicioExpediente = toMinutes(horario.hora_inicio.slice(0, 5));
        const fimExpediente = toMinutes(horario.hora_fim.slice(0, 5));
        const passo = 15; // grelha de 15 em 15 minutos

        const ocupadosMin = (ocupados || []).map((o: any) => ({
            inicio: toMinutes(o.hora_inicio.slice(0, 5)),
            fim: toMinutes(o.hora_fim.slice(0, 5)),
        }));

        const horarios: string[] = [];
        const agora = new Date();
        const isHoje = data === agora.toISOString().slice(0, 10);
        const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

        for (let inicio = inicioExpediente; inicio + duracao <= fimExpediente; inicio += passo) {
            const fim = inicio + duracao;
            if (isHoje && inicio <= minutosAgora) continue; // não oferecer horários já passados hoje

            const colide = ocupadosMin.some((o: { inicio: number; fim: number }) => inicio < o.fim && fim > o.inicio);
            if (!colide) {
                const hh = String(Math.floor(inicio / 60)).padStart(2, '0');
                const mm = String(inicio % 60).padStart(2, '0');
                horarios.push(`${hh}:${mm}`);
            }
        }

        return { horarios };
    }

    // ============================================================
    // Informação pública (para a página de marcação do cliente)
    // ============================================================
    public static async getInfoPublica(empresaId: string) {
        const [{ data: empresa }, { data: servicos }, { data: profissionais }] = await Promise.all([
            supabase.from('empresas').select('nome').eq('id', empresaId).single(),
            supabase.from('agendamento_servicos').select('*').eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
            supabase.from('agendamento_profissionais').select('*').eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
        ]);
        return { empresaNome: empresa?.nome || 'Empresa', servicos: servicos || [], profissionais: profissionais || [] };
    }

    // ============================================================
    // Criar marcação (cliente público OU admin/manual) — revalida a
    // disponibilidade no momento da escrita para evitar dupla marcação
    // por corrida entre dois pedidos simultâneos.
    // ============================================================
    public static async criarAgendamento(
        empresaId: string,
        dados: { servico_id: number; profissional_id?: number; cliente_nome: string; cliente_telefone: string; data: string; hora_inicio: string; notas?: string },
        origem: 'manual' | 'cliente' | 'whatsapp',
        client: any = supabase
    ) {
        const { data: servico } = await client.from('agendamento_servicos')
            .select('duracao_minutos, nome').eq('id', dados.servico_id).eq('empresa_id', empresaId).single();
        if (!servico) throw new Error('Serviço não encontrado.');

        const horaFim = addMinutes(dados.hora_inicio, servico.duracao_minutos);

        if (origem === 'cliente' || origem === 'whatsapp') {
            const { horarios } = await AgendamentoService.getDisponibilidade(empresaId, dados.servico_id, dados.data, dados.profissional_id, client);
            if (!horarios.includes(dados.hora_inicio)) {
                throw new Error('Esse horário deixou de estar disponível. Por favor escolha outro.');
            }
        }

        const { data: agendamento, error } = await client.from('agendamentos').insert({
            empresa_id: empresaId,
            servico_id: dados.servico_id,
            profissional_id: dados.profissional_id || null,
            cliente_nome: dados.cliente_nome,
            cliente_telefone: dados.cliente_telefone,
            data: dados.data,
            hora_inicio: dados.hora_inicio,
            hora_fim: horaFim,
            estado: 'Agendado',
            origem,
            notas: dados.notas || null,
        }).select('id').single();

        if (error) throw error;

        await AgendamentoService.notificarCliente(empresaId, dados.cliente_telefone,
            `Olá ${dados.cliente_nome}! A sua marcação para *${servico.nome}* no dia ${AgendamentoService.formatarData(dados.data)} às ${dados.hora_inicio} foi confirmada. Para remarcar ou cancelar, é só responder esta mensagem.`,
            client
        );

        return agendamento.id;
    }

    public static async cancelarAgendamento(req: Request, id: number) {
        const client = getSupabase(req);
        const { data: ag } = await client.from('agendamentos').select('*, agendamento_servicos(nome)').eq('id', id).single();
        if (!ag) throw new Error('Marcação não encontrada.');

        const { error } = await client.from('agendamentos').update({ estado: 'Cancelado' }).eq('id', id);
        if (error) throw error;

        await AgendamentoService.notificarCliente((req as any).user?.empresa_id, ag.cliente_telefone,
            `Olá ${ag.cliente_nome}, a sua marcação de *${(ag as any).agendamento_servicos?.nome}* no dia ${AgendamentoService.formatarData(ag.data)} às ${ag.hora_inicio.slice(0, 5)} foi cancelada. Contacte-nos para remarcar quando quiser.`,
            client
        );
    }

    public static async remarcarAgendamento(req: Request, id: number, novaData: string, novaHora: string) {
        const client = getSupabase(req);
        const empresaId = (req as any).user?.empresa_id;
        const { data: ag } = await client.from('agendamentos').select('*, agendamento_servicos(nome, duracao_minutos)').eq('id', id).single();
        if (!ag) throw new Error('Marcação não encontrada.');

        const duracao = (ag as any).agendamento_servicos?.duracao_minutos || 30;
        const novaHoraFim = addMinutes(novaHora, duracao);

        const { error } = await client.from('agendamentos').update({
            data: novaData, hora_inicio: novaHora, hora_fim: novaHoraFim, estado: 'Agendado'
        }).eq('id', id);
        if (error) throw error;

        await AgendamentoService.notificarCliente(empresaId, ag.cliente_telefone,
            `Olá ${ag.cliente_nome}, a sua marcação de *${(ag as any).agendamento_servicos?.nome}* foi remarcada para o dia ${AgendamentoService.formatarData(novaData)} às ${novaHora}.`,
            client
        );
    }

    // ============================================================
    // Variantes por telefone — usadas pelo Assistente IA do WhatsApp,
    // onde não há sessão de staff (req) e a única identidade fiável é
    // o próprio número que está a conversar. Nunca confiar num ID de
    // marcação sem confirmar que pertence a este telefone + empresa —
    // caso contrário um cliente poderia cancelar a marcação de outro.
    // ============================================================
    public static async listarAgendamentosPorTelefone(empresaId: string, telefone: string, client: any = supabase) {
        const hoje = new Date().toISOString().slice(0, 10);
        const { data, error } = await client.from('agendamentos')
            .select('id, data, hora_inicio, estado, agendamento_servicos(nome), agendamento_profissionais(nome)')
            .eq('empresa_id', empresaId).eq('cliente_telefone', telefone)
            .neq('estado', 'Cancelado').gte('data', hoje)
            .order('data', { ascending: true }).order('hora_inicio', { ascending: true });
        if (error) throw error;
        return (data || []).map((a: any) => ({
            id: a.id, data: a.data, hora_inicio: String(a.hora_inicio).slice(0, 5), estado: a.estado,
            servico_nome: a.agendamento_servicos?.nome, profissional_nome: a.agendamento_profissionais?.nome,
        }));
    }

    private static async buscarAgendamentoDoTelefone(empresaId: string, telefone: string, id: number, client: any) {
        const { data: ag } = await client.from('agendamentos').select('*, agendamento_servicos(nome, duracao_minutos)')
            .eq('id', id).eq('empresa_id', empresaId).eq('cliente_telefone', telefone).maybeSingle();
        return ag;
    }

    public static async cancelarAgendamentoPorTelefone(empresaId: string, telefone: string, id: number, client: any = supabase) {
        const ag = await AgendamentoService.buscarAgendamentoDoTelefone(empresaId, telefone, id, client);
        if (!ag) throw new Error('Marcação não encontrada para este número.');

        const { error } = await client.from('agendamentos').update({ estado: 'Cancelado' }).eq('id', id);
        if (error) throw error;

        await AgendamentoService.notificarCliente(empresaId, telefone,
            `A sua marcação de *${(ag as any).agendamento_servicos?.nome}* no dia ${AgendamentoService.formatarData(ag.data)} às ${String(ag.hora_inicio).slice(0, 5)} foi cancelada.`,
            client
        );
        return ag;
    }

    public static async remarcarAgendamentoPorTelefone(empresaId: string, telefone: string, id: number, novaData: string, novaHora: string, client: any = supabase) {
        const ag = await AgendamentoService.buscarAgendamentoDoTelefone(empresaId, telefone, id, client);
        if (!ag) throw new Error('Marcação não encontrada para este número.');

        const { horarios } = await AgendamentoService.getDisponibilidade(empresaId, ag.servico_id, novaData, ag.profissional_id || undefined, client);
        if (!horarios.includes(novaHora)) {
            throw new Error('Esse horário não está disponível. Escolha outro.');
        }

        const duracao = (ag as any).agendamento_servicos?.duracao_minutos || 30;
        const novaHoraFim = addMinutes(novaHora, duracao);

        const { error } = await client.from('agendamentos').update({
            data: novaData, hora_inicio: novaHora, hora_fim: novaHoraFim, estado: 'Agendado'
        }).eq('id', id);
        if (error) throw error;

        await AgendamentoService.notificarCliente(empresaId, telefone,
            `A sua marcação de *${(ag as any).agendamento_servicos?.nome}* foi remarcada para o dia ${AgendamentoService.formatarData(novaData)} às ${novaHora}.`,
            client
        );
        return ag;
    }

    public static async atualizarEstado(req: Request, id: number, estado: string) {
        const client = getSupabase(req);
        const { error } = await client.from('agendamentos').update({ estado }).eq('id', id);
        if (error) throw error;
    }

    public static async eliminarAgendamento(req: Request, id: number) {
        const client = getSupabase(req);
        const { error } = await client.from('agendamentos').delete().eq('id', id);
        if (error) throw error;
    }

    public static async listarAgendamentos(req: Request, filtros: { data_inicio?: string; data_fim?: string; estado?: string }) {
        const client = getSupabase(req);
        let query = client.from('agendamentos')
            .select('*, agendamento_servicos(nome, duracao_minutos, cor), agendamento_profissionais(nome)')
            .order('data', { ascending: true }).order('hora_inicio', { ascending: true });

        if (filtros.data_inicio) query = query.gte('data', filtros.data_inicio);
        if (filtros.data_fim) query = query.lte('data', filtros.data_fim);
        if (filtros.estado) query = query.eq('estado', filtros.estado);

        const { data, error } = await query;
        if (error) throw error;
        return (data || []).map((a: any) => ({
            ...a,
            servico_nome: a.agendamento_servicos?.nome,
            servico_cor: a.agendamento_servicos?.cor,
            profissional_nome: a.agendamento_profissionais?.nome,
        }));
    }

    public static async getResumo(req: Request) {
        const client = getSupabase(req);
        const hoje = new Date().toISOString().slice(0, 10);
        const em7dias = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

        const { data: hojeRows } = await client.from('agendamentos').select('estado').eq('data', hoje).neq('estado', 'Cancelado');
        const { count: totalProximos } = await client.from('agendamentos').select('*', { count: 'exact', head: true })
            .gte('data', hoje).lte('data', em7dias).neq('estado', 'Cancelado');
        const { data: servicos } = await client.from('agendamento_servicos').select('id').eq('ativo', true);

        return {
            marcacoesHoje: (hojeRows || []).length,
            confirmadasHoje: (hojeRows || []).filter((r: any) => r.estado === 'Confirmado').length,
            proximos7dias: totalProximos || 0,
            servicosAtivos: (servicos || []).length,
        };
    }

    private static formatarData(data: string): string {
        return new Date(data + 'T12:00:00').toLocaleDateString('pt-PT');
    }

    private static async notificarCliente(empresaId: string | undefined, telefone: string, mensagem: string, client: any) {
        try {
            if (!empresaId) return;
            const { data: channel } = await client.from('wa_channels').select('id').eq('empresa_id', empresaId).eq('status', 'connected').limit(1).maybeSingle();
            if (!channel) return; // Sem WhatsApp ligado — a marcação continua válida, só não há notificação automática.
            await WhatsAppChannelManager.sendMessage(client, channel.id, telefone, mensagem);
        } catch (e) {
            console.error('[AgendamentoService] Falha ao notificar cliente via WhatsApp:', e);
        }
    }
}
