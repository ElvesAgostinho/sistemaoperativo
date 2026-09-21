/**
 * Motor de fluxos de aprovação, notificações e checklists de processo
 * (Fase C do módulo Documentos).
 *
 * Um FLUXO é um modelo: etapas em sequência, cada uma com os seus aprovadores,
 * o modo ("qualquer" um aprova / "todos" têm de aprovar), um prazo em horas e
 * para quem escalar quando o prazo passa. Um PROCESSO é a execução de um fluxo
 * sobre um documento concreto; cada aprovador de cada etapa recebe uma TAREFA,
 * que é o que aparece em "As minhas aprovações".
 *
 * As mudanças de ciclo de vida passam sempre por DocumentosGovernoService.transitar
 * com o ator 'workflow' — a máquina de estados continua a ser a única fonte de
 * verdade sobre o que é permitido.
 */
import { supabase } from '../lib/supabaseClient';
import { DocumentosGovernoService, Utilizador } from './DocumentosGovernoService';
import { Ciclo } from './DocumentosCicloService';
import { EmailService } from './EmailService';

export interface Etapa { nome: string; aprovadores: string[]; modo: 'qualquer' | 'todos'; prazo_horas: number | null; escalar_para: string | null }

const CICLOS_VALIDOS_PARA_CHECKLIST = ['ACTIVE', 'APPROVED', 'SIGNED'];
const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.APP_URL || '').replace(/\/$/, '');

export class DocumentosFluxoService {
    // ============================================================
    // FLUXOS (modelos)
    // ============================================================
    public static async fluxos(empresaId: string): Promise<any[]> {
        const { data } = await supabase.from('documento_fluxos').select('*').eq('empresa_id', empresaId).order('nome');
        return data || [];
    }

    /** Valida e normaliza as etapas de um fluxo. Devolve o erro ou as etapas limpas. */
    public static async validarEtapas(empresaId: string, etapas: any): Promise<{ erro?: string; etapas?: Etapa[] }> {
        if (!Array.isArray(etapas) || etapas.length === 0) return { erro: 'O fluxo precisa de pelo menos uma etapa.' };
        if (etapas.length > 10) return { erro: 'Máximo de 10 etapas por fluxo.' };
        const { data: perfis } = await supabase.from('perfis').select('id').eq('empresa_id', empresaId);
        const daEmpresa = new Set((perfis || []).map((p: any) => p.id));
        const limpas: Etapa[] = [];
        for (let i = 0; i < etapas.length; i++) {
            const e = etapas[i] || {};
            const nome = String(e.nome || '').trim();
            if (!nome) return { erro: `A etapa ${i + 1} precisa de nome.` };
            const aprovadores = Array.from(new Set((Array.isArray(e.aprovadores) ? e.aprovadores : []).map((a: any) => String(a)))) as string[];
            if (aprovadores.length === 0) return { erro: `A etapa "${nome}" precisa de pelo menos um aprovador.` };
            const fora = aprovadores.find(a => !daEmpresa.has(a));
            if (fora) return { erro: `A etapa "${nome}" tem um aprovador que não pertence à empresa.` };
            const modo = e.modo === 'todos' ? 'todos' : 'qualquer';
            const prazo = e.prazo_horas === null || e.prazo_horas === undefined || e.prazo_horas === '' ? null : Number(e.prazo_horas);
            if (prazo !== null && (!Number.isFinite(prazo) || prazo < 1 || prazo > 24 * 90)) return { erro: `Prazo inválido na etapa "${nome}" (1 a 2160 horas).` };
            const escalar = e.escalar_para ? String(e.escalar_para) : null;
            if (escalar && !daEmpresa.has(escalar)) return { erro: `A etapa "${nome}" escala para alguém que não pertence à empresa.` };
            if (escalar && !prazo) return { erro: `A etapa "${nome}" só pode escalar se tiver prazo.` };
            limpas.push({ nome, aprovadores, modo, prazo_horas: prazo, escalar_para: escalar });
        }
        return { etapas: limpas };
    }

    // ============================================================
    // PROCESSOS
    // ============================================================
    public static async processoEmCurso(documentoId: string): Promise<any | null> {
        const { data } = await supabase.from('documento_processos').select('*').eq('documento_id', documentoId).eq('estado', 'em_curso').order('iniciado_em', { ascending: false }).limit(1).maybeSingle();
        return data;
    }

    public static async iniciar(doc: any, fluxoId: number, user: Utilizador, comentario?: string): Promise<{ ok: boolean; erro?: string; processo?: any }> {
        if (await this.processoEmCurso(doc.id)) return { ok: false, erro: 'Este documento já tem um processo de aprovação em curso.' };
        const { data: fluxo } = await supabase.from('documento_fluxos').select('*').eq('id', fluxoId).eq('empresa_id', doc.empresa_id).maybeSingle();
        if (!fluxo) return { ok: false, erro: 'Fluxo não encontrado.' };
        if (!fluxo.ativo) return { ok: false, erro: 'Este fluxo está desativado.' };
        const etapas: Etapa[] = fluxo.etapas || [];
        if (etapas.length === 0) return { ok: false, erro: 'O fluxo não tem etapas.' };

        const { data: processo, error } = await supabase.from('documento_processos').insert({
            empresa_id: doc.empresa_id, documento_id: doc.id, fluxo_id: fluxo.id, fluxo_nome: fluxo.nome, etapas,
            etapa_atual: 0, ciclo_anterior: doc.ciclo, iniciado_por: user.id, comentario: comentario || null, versao_documento: doc.versao_atual || 1
        }).select('*').single();
        if (error || !processo) return { ok: false, erro: error?.message || 'Não foi possível iniciar o processo.' };

        const t = await DocumentosGovernoService.transitar(doc, 'PENDING_APPROVAL', 'workflow', user, `Submetido ao fluxo "${fluxo.nome}".`);
        if (!t.ok) {
            await supabase.from('documento_processos').delete().eq('id', processo.id);
            return { ok: false, erro: t.erro };
        }
        await DocumentosGovernoService.auditar(doc.empresa_id, user, 'fluxo_iniciado', doc, { processo_id: processo.id, fluxo: fluxo.nome, comentario: comentario || null });
        await this.criarTarefasEtapa(processo, doc, 0);
        return { ok: true, processo };
    }

    private static async criarTarefasEtapa(processo: any, doc: any, idx: number) {
        const etapa: Etapa = processo.etapas[idx];
        const prazo = etapa.prazo_horas ? new Date(Date.now() + etapa.prazo_horas * 3600 * 1000).toISOString() : null;
        const linhas = etapa.aprovadores.map(a => ({
            empresa_id: processo.empresa_id, processo_id: processo.id, documento_id: processo.documento_id,
            etapa: idx, etapa_nome: etapa.nome, aprovador_id: a, prazo
        }));
        const { data: tarefas } = await supabase.from('documento_tarefas').insert(linhas).select('id, aprovador_id');
        for (const t of tarefas || []) {
            await this.notificar(processo.empresa_id, t.aprovador_id, 'tarefa_nova',
                `Aprovação pendente: ${doc.titulo}`,
                `Foi-lhe atribuída a etapa "${etapa.nome}" do fluxo "${processo.fluxo_nome}".${prazo ? ` Prazo: ${new Date(prazo).toLocaleString('pt-PT')}.` : ''}`,
                { documento_id: doc.id, tarefa_id: t.id });
        }
    }

    public static async decidir(tarefaId: number, user: Utilizador, decisao: 'aprovada' | 'rejeitada', comentario?: string): Promise<{ ok: boolean; erro?: string; estado?: string }> {
        const { data: tarefa } = await supabase.from('documento_tarefas').select('*').eq('id', tarefaId).eq('empresa_id', user.empresa_id).maybeSingle();
        if (!tarefa) return { ok: false, erro: 'Tarefa não encontrada.' };
        if (tarefa.aprovador_id !== user.id) return { ok: false, erro: 'Esta tarefa não lhe está atribuída.' };
        if (tarefa.estado !== 'pendente') return { ok: false, erro: 'Esta tarefa já foi decidida.' };
        if (decisao === 'rejeitada' && !(comentario || '').trim()) return { ok: false, erro: 'Indique o motivo da rejeição.' };

        const { data: processo } = await supabase.from('documento_processos').select('*').eq('id', tarefa.processo_id).maybeSingle();
        const { data: doc } = await supabase.from('documentos').select('*').eq('id', tarefa.documento_id).maybeSingle();
        if (!processo || !doc || processo.estado !== 'em_curso') return { ok: false, erro: 'O processo já não está em curso.' };

        const { data: atualizada } = await supabase.from('documento_tarefas').update({ estado: decisao, decidido_em: new Date().toISOString(), comentario: comentario || null })
            .eq('id', tarefa.id).eq('estado', 'pendente').select('id').maybeSingle();
        if (!atualizada) return { ok: false, erro: 'Esta tarefa já foi decidida.' };
        await DocumentosGovernoService.auditar(doc.empresa_id, user, decisao === 'aprovada' ? 'aprovou' : 'rejeitou', doc, { processo_id: processo.id, etapa: tarefa.etapa_nome, comentario: comentario || null });

        if (decisao === 'rejeitada') {
            await this.cancelarTarefasPendentes(processo.id);
            await supabase.from('documento_processos').update({ estado: 'rejeitado', concluido_em: new Date().toISOString() }).eq('id', processo.id);
            await DocumentosGovernoService.transitar(doc, 'REJECTED', 'workflow', user, comentario);
            await this.avisarInteressados(processo, doc, 'processo_rejeitado', `Rejeitado: ${doc.titulo}`, `${await this.nome(user)} rejeitou na etapa "${tarefa.etapa_nome}": ${comentario}`);
            return { ok: true, estado: 'rejeitado' };
        }

        const etapa: Etapa = processo.etapas[tarefa.etapa];
        if (etapa.modo === 'qualquer') {
            await this.cancelarTarefasPendentes(processo.id, tarefa.etapa);
        } else {
            const { count } = await supabase.from('documento_tarefas').select('id', { count: 'exact', head: true }).eq('processo_id', processo.id).eq('etapa', tarefa.etapa).eq('estado', 'pendente');
            if ((count || 0) > 0) return { ok: true, estado: 'em_curso' };   // faltam outros aprovadores desta etapa
        }

        const proxima = tarefa.etapa + 1;
        if (proxima < processo.etapas.length) {
            await supabase.from('documento_processos').update({ etapa_atual: proxima }).eq('id', processo.id);
            await this.criarTarefasEtapa({ ...processo, etapa_atual: proxima }, doc, proxima);
            return { ok: true, estado: 'em_curso' };
        }

        // Última etapa aprovada: processo concluído.
        await supabase.from('documento_processos').update({ estado: 'aprovado', concluido_em: new Date().toISOString() }).eq('id', processo.id);
        await DocumentosGovernoService.transitar(doc, 'APPROVED', 'workflow', user, `Fluxo "${processo.fluxo_nome}" concluído.`);
        let ativar = true;
        if (processo.fluxo_id) {
            const { data: fluxo } = await supabase.from('documento_fluxos').select('ativar_ao_aprovar').eq('id', processo.fluxo_id).maybeSingle();
            if (fluxo) ativar = !!fluxo.ativar_ao_aprovar;
        }
        if (ativar) await DocumentosGovernoService.transitar({ ...doc, ciclo: 'APPROVED' }, 'ACTIVE', 'workflow', null, 'Ativado automaticamente após aprovação.');
        await this.avisarInteressados(processo, doc, 'processo_aprovado', `Aprovado: ${doc.titulo}`, `O fluxo "${processo.fluxo_nome}" foi concluído com aprovação.${ativar ? ' O documento está em vigor.' : ''}`);
        return { ok: true, estado: 'aprovado' };
    }

    public static async delegar(tarefaId: number, user: Utilizador, paraUserId: string, comentario?: string): Promise<{ ok: boolean; erro?: string }> {
        const { data: tarefa } = await supabase.from('documento_tarefas').select('*').eq('id', tarefaId).eq('empresa_id', user.empresa_id).maybeSingle();
        if (!tarefa) return { ok: false, erro: 'Tarefa não encontrada.' };
        if (tarefa.aprovador_id !== user.id) return { ok: false, erro: 'Esta tarefa não lhe está atribuída.' };
        if (tarefa.estado !== 'pendente') return { ok: false, erro: 'Esta tarefa já foi decidida.' };
        if (paraUserId === user.id) return { ok: false, erro: 'Não pode delegar a si próprio.' };
        const { data: destino } = await supabase.from('perfis').select('id, nome').eq('id', paraUserId).eq('empresa_id', user.empresa_id).maybeSingle();
        if (!destino) return { ok: false, erro: 'Utilizador não encontrado.' };

        await supabase.from('documento_tarefas').update({ estado: 'delegada', decidido_em: new Date().toISOString(), comentario: comentario || null }).eq('id', tarefa.id);
        const { data: nova } = await supabase.from('documento_tarefas').insert({
            empresa_id: tarefa.empresa_id, processo_id: tarefa.processo_id, documento_id: tarefa.documento_id, etapa: tarefa.etapa, etapa_nome: tarefa.etapa_nome,
            aprovador_id: paraUserId, delegado_de: user.id, prazo: tarefa.prazo
        }).select('id').single();
        const { data: doc } = await supabase.from('documentos').select('id, titulo, empresa_id').eq('id', tarefa.documento_id).maybeSingle();
        await DocumentosGovernoService.auditar(user.empresa_id, user, 'delegou', doc, { tarefa_id: tarefa.id, para: destino.nome, etapa: tarefa.etapa_nome, comentario: comentario || null });
        await this.notificar(user.empresa_id, paraUserId, 'delegacao', `Aprovação delegada: ${doc?.titulo || ''}`,
            `${await this.nome(user)} delegou-lhe a etapa "${tarefa.etapa_nome}".${comentario ? ` Nota: ${comentario}` : ''}`, { documento_id: tarefa.documento_id, tarefa_id: nova?.id });
        return { ok: true };
    }

    public static async cancelar(processoId: number, user: Utilizador, motivo: string, podeGerirDoc: boolean): Promise<{ ok: boolean; erro?: string }> {
        const { data: processo } = await supabase.from('documento_processos').select('*').eq('id', processoId).eq('empresa_id', user.empresa_id).maybeSingle();
        if (!processo) return { ok: false, erro: 'Processo não encontrado.' };
        if (processo.estado !== 'em_curso') return { ok: false, erro: 'O processo já terminou.' };
        const ehAdmin = user.role === 'admin' || user.role === 'superadmin';
        if (!ehAdmin && processo.iniciado_por !== user.id && !podeGerirDoc) return { ok: false, erro: 'Só quem submeteu, quem gere o documento ou um administrador pode cancelar.' };
        if (!(motivo || '').trim()) return { ok: false, erro: 'Indique o motivo.' };
        const { data: doc } = await supabase.from('documentos').select('*').eq('id', processo.documento_id).maybeSingle();
        if (!doc) return { ok: false, erro: 'Documento não encontrado.' };

        await this.cancelarTarefasPendentes(processo.id);
        await supabase.from('documento_processos').update({ estado: 'cancelado', concluido_em: new Date().toISOString(), comentario: motivo }).eq('id', processo.id);
        const volta = (['DRAFT', 'IN_REVIEW', 'ACTIVE', 'APPROVED'].includes(processo.ciclo_anterior) ? processo.ciclo_anterior : 'DRAFT') as Ciclo;
        await DocumentosGovernoService.transitar(doc, volta, 'workflow', user, `Processo cancelado: ${motivo}`);
        await DocumentosGovernoService.auditar(doc.empresa_id, user, 'fluxo_cancelado', doc, { processo_id: processo.id, motivo });
        await this.avisarInteressados(processo, doc, 'processo_cancelado', `Aprovação cancelada: ${doc.titulo}`, `${await this.nome(user)} cancelou o processo: ${motivo}`);
        return { ok: true };
    }

    private static async cancelarTarefasPendentes(processoId: number, etapa?: number) {
        let q = supabase.from('documento_tarefas').update({ estado: 'cancelada', decidido_em: new Date().toISOString() }).eq('processo_id', processoId).eq('estado', 'pendente');
        if (etapa !== undefined) q = q.eq('etapa', etapa);
        await q;
    }

    /** Quem submeteu e o responsável do documento (sem repetir). */
    private static async avisarInteressados(processo: any, doc: any, tipo: string, titulo: string, mensagem: string) {
        const ids = new Set<string>();
        if (processo.iniciado_por) ids.add(processo.iniciado_por);
        if (doc.responsavel_id) ids.add(doc.responsavel_id);
        for (const id of ids) await this.notificar(doc.empresa_id, id, tipo, titulo, mensagem, { documento_id: doc.id });
    }

    /**
     * SLA: tarefas pendentes cujo prazo passou. Se a etapa tiver "escalar para",
     * a tarefa original fica 'escalada' e nasce uma nova para essa pessoa; caso
     * contrário o aprovador é apenas avisado (uma vez).
     */
    public static async escalarAtrasadas(): Promise<number> {
        const { data: atrasadas } = await supabase.from('documento_tarefas').select('*').eq('estado', 'pendente').eq('avisado_prazo', false).lt('prazo', new Date().toISOString()).limit(200);
        let n = 0;
        for (const t of atrasadas || []) {
            try {
                const { data: processo } = await supabase.from('documento_processos').select('id, etapas, fluxo_nome, estado, empresa_id').eq('id', t.processo_id).maybeSingle();
                const { data: doc } = await supabase.from('documentos').select('id, titulo, empresa_id').eq('id', t.documento_id).maybeSingle();
                if (!processo || !doc || processo.estado !== 'em_curso') continue;
                const etapa: Etapa = processo.etapas[t.etapa];
                const escalarPara = etapa?.escalar_para && etapa.escalar_para !== t.aprovador_id ? etapa.escalar_para : null;

                if (escalarPara) {
                    await supabase.from('documento_tarefas').update({ estado: 'escalada', avisado_prazo: true, decidido_em: new Date().toISOString() }).eq('id', t.id);
                    const { data: nova } = await supabase.from('documento_tarefas').insert({
                        empresa_id: t.empresa_id, processo_id: t.processo_id, documento_id: t.documento_id, etapa: t.etapa, etapa_nome: t.etapa_nome,
                        aprovador_id: escalarPara, escalada_de: t.aprovador_id, prazo: null
                    }).select('id').single();
                    await DocumentosGovernoService.auditar(t.empresa_id, null, 'escalado', doc, { tarefa_id: t.id, etapa: t.etapa_nome, de: t.aprovador_id, para: escalarPara });
                    await this.notificar(t.empresa_id, escalarPara, 'tarefa_escalada', `Escalado para si: ${doc.titulo}`,
                        `A etapa "${t.etapa_nome}" do fluxo "${processo.fluxo_nome}" passou o prazo sem decisão e foi-lhe escalada.`, { documento_id: doc.id, tarefa_id: nova?.id });
                    await this.notificar(t.empresa_id, t.aprovador_id, 'tarefa_prazo', `Prazo ultrapassado: ${doc.titulo}`,
                        `A etapa "${t.etapa_nome}" passou o prazo e foi escalada.`, { documento_id: doc.id, tarefa_id: t.id });
                } else {
                    await supabase.from('documento_tarefas').update({ avisado_prazo: true }).eq('id', t.id);
                    await this.notificar(t.empresa_id, t.aprovador_id, 'tarefa_prazo', `Prazo ultrapassado: ${doc.titulo}`,
                        `A etapa "${t.etapa_nome}" do fluxo "${processo.fluxo_nome}" passou o prazo e continua à sua espera.`, { documento_id: doc.id, tarefa_id: t.id });
                }
                n++;
            } catch (e: any) {
                console.error('[Documentos] Falha a escalar tarefa', t.id, e.message);
            }
        }
        return n;
    }

    // ============================================================
    // CONSULTAS
    // ============================================================
    /** Caixa "As minhas aprovações": tarefas pendentes do utilizador, com o documento. */
    public static async minhasTarefas(empresaId: string, userId: string): Promise<any[]> {
        const { data: tarefas } = await supabase.from('documento_tarefas').select('*').eq('empresa_id', empresaId).eq('aprovador_id', userId).eq('estado', 'pendente').order('prazo', { ascending: true, nullsFirst: false }).order('criado_em');
        if (!tarefas || tarefas.length === 0) return [];
        const docIds = Array.from(new Set(tarefas.map((t: any) => t.documento_id)));
        const procIds = Array.from(new Set(tarefas.map((t: any) => t.processo_id)));
        const [{ data: docs }, { data: procs }] = await Promise.all([
            supabase.from('documentos').select('id, codigo, titulo, tipo, area, confidencialidade, validade, versao_atual, resumo').in('id', docIds),
            supabase.from('documento_processos').select('id, fluxo_nome, etapas, etapa_atual, iniciado_por, iniciado_em, comentario').in('id', procIds)
        ]);
        const porDoc = new Map((docs || []).map((d: any) => [d.id, d]));
        const porProc = new Map((procs || []).map((p: any) => [p.id, p]));
        const nomes = await this.nomes(Array.from(new Set([...tarefas.map((t: any) => t.delegado_de), ...tarefas.map((t: any) => t.escalada_de), ...(procs || []).map((p: any) => p.iniciado_por)].filter(Boolean))));
        return tarefas.map((t: any) => {
            const p = porProc.get(t.processo_id);
            return {
                ...t, documento: porDoc.get(t.documento_id) || null,
                processo: p ? { id: p.id, fluxo_nome: p.fluxo_nome, total_etapas: (p.etapas || []).length, etapa_atual: p.etapa_atual, iniciado_por_nome: nomes.get(p.iniciado_por) || '—', iniciado_em: p.iniciado_em, comentario: p.comentario } : null,
                delegado_de_nome: t.delegado_de ? nomes.get(t.delegado_de) || '—' : null,
                escalada_de_nome: t.escalada_de ? nomes.get(t.escalada_de) || '—' : null,
                atrasada: !!t.prazo && new Date(t.prazo) < new Date()
            };
        });
    }

    /** Histórico de processos de um documento, com as tarefas de cada um. */
    public static async processosDoDocumento(documentoId: string): Promise<any[]> {
        const { data: procs } = await supabase.from('documento_processos').select('*').eq('documento_id', documentoId).order('iniciado_em', { ascending: false });
        if (!procs || procs.length === 0) return [];
        const { data: tarefas } = await supabase.from('documento_tarefas').select('*').in('processo_id', procs.map((p: any) => p.id)).order('etapa').order('criado_em');
        const ids = new Set<string>();
        for (const p of procs) { if (p.iniciado_por) ids.add(p.iniciado_por); for (const e of p.etapas || []) { for (const a of e.aprovadores || []) ids.add(a); if (e.escalar_para) ids.add(e.escalar_para); } }
        for (const t of tarefas || []) { ids.add(t.aprovador_id); if (t.delegado_de) ids.add(t.delegado_de); if (t.escalada_de) ids.add(t.escalada_de); }
        const nomes = await this.nomes(Array.from(ids));
        const n = (id: string | null) => (id ? nomes.get(id) || '—' : null);
        return procs.map((p: any) => ({
            ...p, iniciado_por_nome: n(p.iniciado_por),
            etapas: (p.etapas || []).map((e: any) => ({ ...e, aprovadores_nomes: (e.aprovadores || []).map(n), escalar_para_nome: n(e.escalar_para) })),
            tarefas: (tarefas || []).filter((t: any) => t.processo_id === p.id).map((t: any) => ({ ...t, aprovador_nome: n(t.aprovador_id), delegado_de_nome: n(t.delegado_de), escalada_de_nome: n(t.escalada_de) }))
        }));
    }

    /** O utilizador tem (ou teve) alguma tarefa neste documento? Dá-lhe pelo menos direito a vê-lo. */
    public static async temTarefaNoDocumento(documentoId: string, userId: string): Promise<boolean> {
        const { count } = await supabase.from('documento_tarefas').select('id', { count: 'exact', head: true }).eq('documento_id', documentoId).eq('aprovador_id', userId);
        return (count || 0) > 0;
    }

    public static async documentosComTarefaDe(userId: string, documentoIds: string[]): Promise<Set<string>> {
        if (documentoIds.length === 0) return new Set();
        const { data } = await supabase.from('documento_tarefas').select('documento_id').eq('aprovador_id', userId).in('documento_id', documentoIds);
        return new Set((data || []).map((t: any) => t.documento_id));
    }

    // ============================================================
    // NOTIFICAÇÕES
    // ============================================================
    public static async notificar(empresaId: string, userId: string, tipo: string, titulo: string, mensagem: string, ref: { documento_id?: string; tarefa_id?: number } = {}) {
        try {
            const { data: n } = await supabase.from('documento_notificacoes').insert({ empresa_id: empresaId, user_id: userId, tipo, titulo, mensagem, documento_id: ref.documento_id || null, tarefa_id: ref.tarefa_id || null }).select('id').single();
            // Email em segundo plano: se não houver SMTP configurado, fica só a notificação interna.
            setImmediate(async () => {
                try {
                    const { data: perfil } = await supabase.from('perfis').select('email, nome').eq('id', userId).maybeSingle();
                    if (!perfil?.email) return;
                    const link = ref.documento_id && FRONTEND_URL ? `<p><a href="${FRONTEND_URL}/?modulo=documentos&doc=${ref.documento_id}">Abrir no BusinessOS</a></p>` : '';
                    const corpo = `<p>Olá ${perfil.nome || ''},</p><p>${mensagem.replace(/\n/g, '<br>')}</p>${link}<p style="color:#888;font-size:12px">Notificação automática do módulo Documentos.</p>`;
                    const ok = await EmailService.enviarEmailPersonalizado(perfil.email, `[Documentos] ${titulo}`, corpo, empresaId);
                    if (ok && n?.id) await supabase.from('documento_notificacoes').update({ email_enviado: true }).eq('id', n.id);
                } catch { /* email é melhor-esforço */ }
            });
        } catch (e: any) {
            console.error('[Documentos] Falha a notificar:', e.message);
        }
    }

    public static async notificacoes(empresaId: string, userId: string, limite = 50): Promise<{ lista: any[]; naoLidas: number }> {
        const [{ data }, { count }] = await Promise.all([
            supabase.from('documento_notificacoes').select('*').eq('empresa_id', empresaId).eq('user_id', userId).order('criado_em', { ascending: false }).limit(limite),
            supabase.from('documento_notificacoes').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('user_id', userId).eq('lida', false)
        ]);
        return { lista: data || [], naoLidas: count || 0 };
    }

    public static async marcarLidas(empresaId: string, userId: string, ids?: number[]) {
        let q = supabase.from('documento_notificacoes').update({ lida: true }).eq('empresa_id', empresaId).eq('user_id', userId).eq('lida', false);
        if (ids && ids.length > 0) q = q.in('id', ids);
        await q;
    }

    // ============================================================
    // CHECKLISTS DE PROCESSO
    // ============================================================
    public static async checklists(empresaId: string): Promise<any[]> {
        const { data } = await supabase.from('documento_checklists').select('*').eq('empresa_id', empresaId).order('nome');
        return data || [];
    }

    public static async validarItens(empresaId: string, itens: any): Promise<{ erro?: string; itens?: { tipo_id: number; obrigatorio: boolean; nota: string | null }[] }> {
        if (!Array.isArray(itens) || itens.length === 0) return { erro: 'A checklist precisa de pelo menos um tipo de documento.' };
        const tipos = await DocumentosGovernoService.tipos(empresaId);
        const validos = new Set(tipos.map((t: any) => t.id));
        const vistos = new Set<number>();
        const limpos: { tipo_id: number; obrigatorio: boolean; nota: string | null }[] = [];
        for (const it of itens) {
            const id = Number(it?.tipo_id);
            if (!validos.has(id)) return { erro: 'Tipo de documento inválido na checklist.' };
            if (vistos.has(id)) continue;
            vistos.add(id);
            limpos.push({ tipo_id: id, obrigatorio: it.obrigatorio !== false, nota: it.nota ? String(it.nota).slice(0, 200) : null });
        }
        return { itens: limpos };
    }

    /**
     * Estado de uma checklist para uma entidade concreta: por cada tipo pedido,
     * se existe documento válido (em vigor e não caducado). Os documentos que o
     * utilizador não pode ver contam como existentes mas sem título nem link.
     */
    public static async estadoChecklist(checklist: any, entidadeId: string, user: { id: string; role: string }): Promise<any> {
        const tipos = await DocumentosGovernoService.tipos(checklist.empresa_id);
        const tipoIds = (checklist.itens || []).map((i: any) => i.tipo_id);
        const { data: docs } = await supabase.from('documentos').select('id, codigo, titulo, tipo_id, ciclo, validade, confidencialidade, responsavel_id, criado_por')
            .eq('empresa_id', checklist.empresa_id).eq('entidade_tipo', checklist.entidade_tipo).eq('entidade_id', entidadeId).in('tipo_id', tipoIds).neq('ciclo', 'DELETED');
        const { DocumentosService } = require('./DocumentosService');
        const visiveis = new Set((await DocumentosService.filtrarVisiveis(docs || [], user)).map((d: any) => d.id));
        const hoje = new Date().toISOString().slice(0, 10);
        const itens = (checklist.itens || []).map((it: any) => {
            const tipo = tipos.find((t: any) => t.id === it.tipo_id);
            const candidatos = (docs || []).filter((d: any) => d.tipo_id === it.tipo_id);
            const validos = candidatos.filter((d: any) => CICLOS_VALIDOS_PARA_CHECKLIST.includes(d.ciclo) && (!d.validade || d.validade >= hoje));
            const melhor = validos[0] || candidatos[0] || null;
            let situacao: 'ok' | 'caducado' | 'pendente' | 'em_falta' = 'em_falta';
            if (validos.length > 0) situacao = 'ok';
            else if (melhor && melhor.validade && melhor.validade < hoje) situacao = 'caducado';
            else if (melhor) situacao = 'pendente';   // existe mas ainda não está em vigor (rascunho, em aprovação...)
            return {
                tipo_id: it.tipo_id, tipo_nome: tipo?.nome || '—', obrigatorio: it.obrigatorio !== false, nota: it.nota || null, situacao,
                documento: melhor ? (visiveis.has(melhor.id) ? { id: melhor.id, codigo: melhor.codigo, titulo: melhor.titulo, ciclo: melhor.ciclo, validade: melhor.validade } : { id: null, sem_acesso: true }) : null
            };
        });
        const obrigatoriosEmFalta = itens.filter((i: any) => i.obrigatorio && i.situacao !== 'ok').length;
        return { checklist: { id: checklist.id, nome: checklist.nome, entidade_tipo: checklist.entidade_tipo }, entidade_id: entidadeId, itens, completa: obrigatoriosEmFalta === 0, em_falta: obrigatoriosEmFalta };
    }

    /** Visão global: por cada entidade do tipo da checklist, quantos obrigatórios faltam. */
    public static async panoramaChecklist(checklist: any): Promise<any[]> {
        const tabela = ({ cliente: 'clientes', colaborador: 'colaboradores', ativo: 'ativos', negocio: 'negocios' } as any)[checklist.entidade_tipo];
        if (!tabela) return [];
        const { data: entidades } = await supabase.from(tabela).select('id, nome, titulo').eq('empresa_id', checklist.empresa_id).order('nome').limit(500);
        if (!entidades || entidades.length === 0) return [];
        const obrigatorios = (checklist.itens || []).filter((i: any) => i.obrigatorio !== false).map((i: any) => i.tipo_id);
        const { data: docs } = await supabase.from('documentos').select('entidade_id, tipo_id, ciclo, validade')
            .eq('empresa_id', checklist.empresa_id).eq('entidade_tipo', checklist.entidade_tipo).in('tipo_id', obrigatorios).in('ciclo', CICLOS_VALIDOS_PARA_CHECKLIST);
        const hoje = new Date().toISOString().slice(0, 10);
        const cobertos = new Map<string, Set<number>>();
        for (const d of docs || []) {
            if (d.validade && d.validade < hoje) continue;
            const k = String(d.entidade_id);
            if (!cobertos.has(k)) cobertos.set(k, new Set());
            cobertos.get(k)!.add(d.tipo_id);
        }
        return entidades.map((e: any) => {
            const tem = cobertos.get(String(e.id)) || new Set();
            const faltam = obrigatorios.filter((t: number) => !tem.has(t)).length;
            return { id: e.id, nome: e.nome || e.titulo || `#${e.id}`, obrigatorios: obrigatorios.length, em_falta: faltam, completa: faltam === 0 };
        }).sort((a: any, b: any) => b.em_falta - a.em_falta || a.nome.localeCompare(b.nome));
    }

    // ============================================================
    // AUXILIARES
    // ============================================================
    private static async nomes(ids: string[]): Promise<Map<string, string>> {
        if (ids.length === 0) return new Map();
        const { data } = await supabase.from('perfis').select('id, nome, email').in('id', ids);
        return new Map((data || []).map((p: any) => [p.id, p.nome || p.email || '—']));
    }

    private static async nome(user: Utilizador): Promise<string> {
        const m = await this.nomes([user.id]);
        return m.get(user.id) || user.nome || '—';
    }
}
