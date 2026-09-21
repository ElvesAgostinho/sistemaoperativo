/**
 * Fase E do módulo Documentos: trabalho por pessoa.
 *  - responsáveis por área/tipo (atribuição automática ao entrar um documento)
 *  - tarefas sobre documentos (manuais e automáticas: validade a 30 dias)
 *  - comentários com menções
 *  - ausências com delegação automática (aprovações, assinaturas e tarefas)
 *  - painel de carga por pessoa
 */
import { supabase } from '../lib/supabaseClient';
import { DocumentosGovernoService, Utilizador } from './DocumentosGovernoService';
import { DocumentosFluxoService } from './DocumentosFluxoService';

const DIAS_ANTES_VALIDADE = 30;

export class DocumentosEquipaService {
    // ============================================================
    // RESPONSÁVEIS POR ÁREA / TIPO
    // ============================================================
    public static async regras(empresaId: string): Promise<any[]> {
        const { data } = await supabase.from('documento_responsaveis').select('*').eq('empresa_id', empresaId).order('area');
        return data || [];
    }

    /** Quem fica responsável por um documento: regra do tipo ganha à da área. */
    public static async responsavelPara(empresaId: string, area: string | null, tipoId: number | null): Promise<string | null> {
        const regras = await this.regras(empresaId);
        const porTipo = tipoId ? regras.find((r: any) => r.tipo_id === tipoId) : null;
        if (porTipo) return await this.substitutoDe(empresaId, porTipo.user_id);
        const porArea = area ? regras.find((r: any) => !r.tipo_id && r.area === area) : null;
        if (porArea) return await this.substitutoDe(empresaId, porArea.user_id);
        return null;
    }

    /** Atribui responsável (se ainda não tiver) e avisa-o. Chamado ao classificar. */
    public static async atribuirAutomaticamente(doc: any): Promise<string | null> {
        if (doc.responsavel_id) return doc.responsavel_id;
        const resp = await this.responsavelPara(doc.empresa_id, doc.area, doc.tipo_id);
        if (!resp) return null;
        await supabase.from('documentos').update({ responsavel_id: resp }).eq('id', doc.id);
        await DocumentosGovernoService.auditar(doc.empresa_id, null, 'responsavel_atribuido', doc, { responsavel_id: resp, regra: 'automática' });
        await DocumentosFluxoService.notificar(doc.empresa_id, resp, 'atribuido', `Novo documento à sua responsabilidade: ${doc.titulo}`,
            `Entrou um documento na sua área${doc.estado === 'por_rever' ? ' e está por rever — confirme a proposta da IA' : ''}.`, { documento_id: doc.id });
        return resp;
    }

    // ============================================================
    // AUSÊNCIAS / SUBSTITUTOS
    // ============================================================
    public static async ausencias(empresaId: string, userId?: string): Promise<any[]> {
        let q = supabase.from('documento_ausencias').select('*').eq('empresa_id', empresaId).order('inicio', { ascending: false });
        if (userId) q = q.eq('user_id', userId);
        const { data } = await q;
        return data || [];
    }

    /** Se o utilizador estiver ausente hoje, devolve o substituto (em cadeia, até 3 níveis); senão o próprio. */
    public static async substitutoDe(empresaId: string, userId: string, profundidade = 0): Promise<string> {
        if (profundidade > 3) return userId;
        const hoje = new Date().toISOString().slice(0, 10);
        const { data } = await supabase.from('documento_ausencias').select('substituto_id').eq('empresa_id', empresaId).eq('user_id', userId).lte('inicio', hoje).gte('fim', hoje).limit(1).maybeSingle();
        if (!data || data.substituto_id === userId) return userId;
        return this.substitutoDe(empresaId, data.substituto_id, profundidade + 1);
    }

    /**
     * Corre de hora a hora: aprovações, assinaturas e tarefas pendentes de quem
     * está ausente passam para o substituto (fica registado de quem vieram).
     */
    public static async aplicarAusencias(): Promise<number> {
        const hoje = new Date().toISOString().slice(0, 10);
        const { data: ativas } = await supabase.from('documento_ausencias').select('*').lte('inicio', hoje).gte('fim', hoje);
        let n = 0;
        for (const a of ativas || []) {
            try {
                const destino = await this.substitutoDe(a.empresa_id, a.substituto_id);
                if (destino === a.user_id) continue;
                // aprovações
                const { data: tarefas } = await supabase.from('documento_tarefas').select('*').eq('empresa_id', a.empresa_id).eq('aprovador_id', a.user_id).eq('estado', 'pendente');
                for (const t of tarefas || []) {
                    await supabase.from('documento_tarefas').update({ estado: 'delegada', decidido_em: new Date().toISOString(), comentario: `Ausência (${a.inicio} a ${a.fim})` }).eq('id', t.id);
                    const { data: nova } = await supabase.from('documento_tarefas').insert({ empresa_id: t.empresa_id, processo_id: t.processo_id, documento_id: t.documento_id, etapa: t.etapa, etapa_nome: t.etapa_nome, aprovador_id: destino, delegado_de: a.user_id, prazo: t.prazo }).select('id').single();
                    await DocumentosFluxoService.notificar(a.empresa_id, destino, 'delegacao', 'Aprovação recebida por ausência', `Uma aprovação (${t.etapa_nome}) passou para si porque o titular está ausente.`, { documento_id: t.documento_id, tarefa_id: nova?.id });
                    n++;
                }
                // tarefas gerais
                const { data: gerais } = await supabase.from('documento_tarefas_gerais').select('id, titulo, documento_id').eq('empresa_id', a.empresa_id).eq('responsavel_id', a.user_id).in('estado', ['aberta', 'em_curso']);
                for (const t of gerais || []) {
                    await supabase.from('documento_tarefas_gerais').update({ responsavel_id: destino, descricao: undefined, atualizado_em: new Date().toISOString() }).eq('id', t.id);
                    await DocumentosFluxoService.notificar(a.empresa_id, destino, 'tarefa', `Tarefa recebida por ausência: ${t.titulo}`, 'O titular está ausente; a tarefa passou para si.', { documento_id: t.documento_id || undefined });
                    n++;
                }
                // assinaturas pendentes: não se transferem (assina quem foi pedido); só se avisa quem pediu
                const { data: ass } = await supabase.from('documento_assinaturas').select('id, pedido_por, documento_id').eq('empresa_id', a.empresa_id).eq('signatario_user_id', a.user_id).eq('estado', 'pendente');
                for (const s of ass || []) {
                    if (s.pedido_por) await DocumentosFluxoService.notificar(a.empresa_id, s.pedido_por, 'assinatura', 'Signatário ausente', `O signatário está ausente até ${a.fim}. Assinaturas não se delegam: aguarde ou cancele o pedido e peça a outra pessoa.`, { documento_id: s.documento_id });
                }
            } catch (e: any) { console.error('[Documentos] Ausência não aplicada', a.id, e.message); }
        }
        return n;
    }

    // ============================================================
    // TAREFAS SOBRE DOCUMENTOS
    // ============================================================
    public static async criarTarefa(empresaId: string, dados: { documento_id?: string | null; titulo: string; descricao?: string; responsavel_id: string; prazo?: string | null; prioridade?: string; origem?: string }, user: Utilizador | null): Promise<{ ok: boolean; erro?: string; tarefa?: any }> {
        const titulo = String(dados.titulo || '').trim();
        if (!titulo) return { ok: false, erro: 'Indique o título da tarefa.' };
        const { data: perfil } = await supabase.from('perfis').select('id').eq('id', dados.responsavel_id).eq('empresa_id', empresaId).maybeSingle();
        if (!perfil) return { ok: false, erro: 'Responsável não pertence à empresa.' };
        const responsavel = await this.substitutoDe(empresaId, dados.responsavel_id);
        const { data, error } = await supabase.from('documento_tarefas_gerais').insert({
            empresa_id: empresaId, documento_id: dados.documento_id || null, titulo: titulo.slice(0, 200), descricao: dados.descricao || null, responsavel_id: responsavel, criado_por: user?.id || null,
            origem: dados.origem || 'manual', prazo: dados.prazo || null, prioridade: ['baixa', 'normal', 'alta'].includes(dados.prioridade || '') ? dados.prioridade : 'normal'
        }).select('*').single();
        if (error) return { ok: false, erro: error.code === '23505' ? 'Já existe essa tarefa automática.' : error.message };
        if (dados.documento_id) await DocumentosGovernoService.auditar(empresaId, user, 'tarefa_criada', { id: dados.documento_id, titulo: undefined }, { tarefa_id: data.id, titulo, responsavel_id: responsavel, prazo: dados.prazo || null });
        if (responsavel !== user?.id) await DocumentosFluxoService.notificar(empresaId, responsavel, 'tarefa', `Tarefa: ${titulo}`, `${user ? (user.nome || 'Um colega') + ' atribuiu-lhe' : 'O sistema criou'} uma tarefa${dados.prazo ? ` com prazo ${dados.prazo}` : ''}.`, { documento_id: dados.documento_id || undefined });
        return { ok: true, tarefa: data };
    }

    public static async atualizarTarefa(empresaId: string, tarefaId: number, alt: any, user: Utilizador): Promise<{ ok: boolean; erro?: string }> {
        const { data: t } = await supabase.from('documento_tarefas_gerais').select('*').eq('id', tarefaId).eq('empresa_id', empresaId).maybeSingle();
        if (!t) return { ok: false, erro: 'Tarefa não encontrada.' };
        const ehAdmin = ['admin', 'superadmin'].includes(user.role);
        if (!ehAdmin && t.responsavel_id !== user.id && t.criado_por !== user.id) return { ok: false, erro: 'Só o responsável, quem criou ou um administrador pode alterar a tarefa.' };
        const upd: any = { atualizado_em: new Date().toISOString() };
        for (const k of ['titulo', 'descricao', 'prazo', 'prioridade', 'estado', 'responsavel_id', 'nota_conclusao']) if (k in alt) upd[k] = alt[k] === '' ? null : alt[k];
        if (upd.estado && !['aberta', 'em_curso', 'concluida', 'cancelada'].includes(upd.estado)) return { ok: false, erro: 'Estado inválido.' };
        if (upd.estado === 'concluida') upd.concluida_em = new Date().toISOString();
        if (upd.responsavel_id) {
            const { data: p } = await supabase.from('perfis').select('id').eq('id', upd.responsavel_id).eq('empresa_id', empresaId).maybeSingle();
            if (!p) return { ok: false, erro: 'Responsável não pertence à empresa.' };
        }
        await supabase.from('documento_tarefas_gerais').update(upd).eq('id', t.id);
        if (t.documento_id) await DocumentosGovernoService.auditar(empresaId, user, upd.estado === 'concluida' ? 'tarefa_concluida' : 'tarefa_alterada', { id: t.documento_id }, { tarefa_id: t.id, campos: Object.keys(upd) });
        if (upd.responsavel_id && upd.responsavel_id !== t.responsavel_id) await DocumentosFluxoService.notificar(empresaId, upd.responsavel_id, 'tarefa', `Tarefa: ${t.titulo}`, `${user.nome || 'Um colega'} passou-lhe esta tarefa.`, { documento_id: t.documento_id || undefined });
        if (upd.estado === 'concluida' && t.criado_por && t.criado_por !== user.id) await DocumentosFluxoService.notificar(empresaId, t.criado_por, 'tarefa', `Concluída: ${t.titulo}`, `${user.nome || 'O responsável'} concluiu a tarefa.${upd.nota_conclusao ? ` Nota: ${upd.nota_conclusao}` : ''}`, { documento_id: t.documento_id || undefined });
        return { ok: true };
    }

    public static async tarefas(empresaId: string, filtro: { responsavel_id?: string; documento_id?: string; estado?: string; todas?: boolean }): Promise<any[]> {
        let q = supabase.from('documento_tarefas_gerais').select('*').eq('empresa_id', empresaId).order('prazo', { ascending: true, nullsFirst: false }).order('criado_em', { ascending: false }).limit(500);
        if (filtro.responsavel_id) q = q.eq('responsavel_id', filtro.responsavel_id);
        if (filtro.documento_id) q = q.eq('documento_id', filtro.documento_id);
        if (filtro.estado) q = q.eq('estado', filtro.estado); else if (!filtro.todas) q = q.in('estado', ['aberta', 'em_curso']);
        const { data } = await q;
        const lista = data || [];
        const docIds = Array.from(new Set(lista.map((t: any) => t.documento_id).filter(Boolean)));
        const userIds = Array.from(new Set(lista.flatMap((t: any) => [t.responsavel_id, t.criado_por]).filter(Boolean)));
        const [{ data: docs }, { data: perfis }] = await Promise.all([
            docIds.length ? supabase.from('documentos').select('id, codigo, titulo, tipo, area, validade, ciclo').in('id', docIds) : Promise.resolve({ data: [] } as any),
            userIds.length ? supabase.from('perfis').select('id, nome, email').in('id', userIds) : Promise.resolve({ data: [] } as any)
        ]);
        const porDoc = new Map((docs || []).map((d: any) => [d.id, d])); const nomes = new Map((perfis || []).map((p: any) => [p.id, p.nome || p.email]));
        const hoje = new Date().toISOString().slice(0, 10);
        return lista.map((t: any) => ({ ...t, documento: t.documento_id ? porDoc.get(t.documento_id) || null : null, responsavel_nome: nomes.get(t.responsavel_id) || '—', criado_por_nome: t.criado_por ? nomes.get(t.criado_por) || '—' : 'sistema', atrasada: !!t.prazo && t.prazo < hoje && ['aberta', 'em_curso'].includes(t.estado) }));
    }

    /**
     * Corre de hora a hora: para cada documento em vigor que caduca dentro de
     * 30 dias e tem responsável, cria uma tarefa "Renovar …" (uma só). Sem
     * responsável, avisa os administradores. Também lembra tarefas cujo prazo
     * é hoje/ontem (uma vez).
     */
    public static async tarefasAutomaticas(): Promise<number> {
        const hoje = new Date(); const limite = new Date(hoje.getTime() + DIAS_ANTES_VALIDADE * 86400000);
        const h = hoje.toISOString().slice(0, 10), l = limite.toISOString().slice(0, 10);
        const { data: docs } = await supabase.from('documentos').select('id, empresa_id, titulo, codigo, validade, responsavel_id, area, tipo_id').eq('ciclo', 'ACTIVE').gte('validade', h).lte('validade', l).limit(500);
        let n = 0;
        for (const d of docs || []) {
            try {
                const { data: existe } = await supabase.from('documento_tarefas_gerais').select('id').eq('documento_id', d.id).eq('origem', 'validade').eq('prazo', d.validade).maybeSingle();
                if (existe) continue;
                let resp = d.responsavel_id || await this.responsavelPara(d.empresa_id, d.area, d.tipo_id);
                if (!resp) {
                    const { data: admin } = await supabase.from('perfis').select('id').eq('empresa_id', d.empresa_id).in('role', ['admin', 'superadmin']).order('role').limit(1).maybeSingle();
                    resp = admin?.id || null;
                }
                if (!resp) continue;
                const r = await this.criarTarefa(d.empresa_id, { documento_id: d.id, titulo: `Renovar: ${d.codigo ? d.codigo + ' — ' : ''}${d.titulo}`, descricao: `Caduca a ${d.validade}. Trate da renovação e carregue a nova versão no documento.`, responsavel_id: resp, prazo: d.validade, prioridade: 'alta', origem: 'validade' }, null);
                if (r.ok) n++;
            } catch (e: any) { console.error('[Documentos] Tarefa automática falhou', d.id, e.message); }
        }
        // lembretes de prazo (tarefas com prazo até amanhã, ainda abertas, sem lembrete)
        const amanha = new Date(hoje.getTime() + 86400000).toISOString().slice(0, 10);
        const { data: aVencer } = await supabase.from('documento_tarefas_gerais').select('*').in('estado', ['aberta', 'em_curso']).eq('lembrete_enviado', false).lte('prazo', amanha).limit(200);
        for (const t of aVencer || []) {
            await supabase.from('documento_tarefas_gerais').update({ lembrete_enviado: true }).eq('id', t.id);
            await DocumentosFluxoService.notificar(t.empresa_id, t.responsavel_id, 'tarefa_prazo', `Prazo ${t.prazo < h ? 'ultrapassado' : 'a chegar'}: ${t.titulo}`, `A tarefa tem prazo ${t.prazo}.`, { documento_id: t.documento_id || undefined });
        }
        return n;
    }

    // ============================================================
    // COMENTÁRIOS
    // ============================================================
    public static async comentar(doc: any, user: Utilizador, texto: string, mencoes: string[]): Promise<{ ok: boolean; erro?: string; comentario?: any }> {
        const t = String(texto || '').trim();
        if (!t) return { ok: false, erro: 'Escreva o comentário.' };
        const ids = Array.from(new Set((mencoes || []).map(String)));
        let validos: string[] = [];
        if (ids.length) { const { data } = await supabase.from('perfis').select('id').eq('empresa_id', doc.empresa_id).in('id', ids); validos = (data || []).map((p: any) => p.id); }
        const { data, error } = await supabase.from('documento_comentarios').insert({ empresa_id: doc.empresa_id, documento_id: doc.id, user_id: user.id, user_nome: user.nome || null, texto: t.slice(0, 4000), mencoes: validos }).select('*').single();
        if (error) return { ok: false, erro: error.message };
        await DocumentosGovernoService.auditar(doc.empresa_id, user, 'comentou', doc, { mencoes: validos.length });
        // Avisar mencionados e o responsável (sem repetir e sem avisar quem escreveu)
        const alvos = new Set<string>(validos); if (doc.responsavel_id) alvos.add(doc.responsavel_id); alvos.delete(user.id);
        for (const id of alvos) await DocumentosFluxoService.notificar(doc.empresa_id, id, 'comentario', `${user.nome || 'Um colega'} comentou: ${doc.titulo}`, t.slice(0, 200), { documento_id: doc.id });
        return { ok: true, comentario: data };
    }

    public static async comentarios(documentoId: string): Promise<any[]> {
        const { data } = await supabase.from('documento_comentarios').select('*').eq('documento_id', documentoId).order('criado_em');
        return data || [];
    }

    // ============================================================
    // PAINEL DE CARGA POR PESSOA (admin)
    // ============================================================
    public static async cargaPorPessoa(empresaId: string): Promise<any[]> {
        const hoje = new Date().toISOString().slice(0, 10);
        const [{ data: perfis }, { data: aprov }, { data: ass }, { data: tar }, { data: docs }, { data: aus }] = await Promise.all([
            supabase.from('perfis').select('id, nome, email, role').eq('empresa_id', empresaId).neq('role', 'pending').order('nome'),
            supabase.from('documento_tarefas').select('aprovador_id, prazo').eq('empresa_id', empresaId).eq('estado', 'pendente'),
            supabase.from('documento_assinaturas').select('signatario_user_id').eq('empresa_id', empresaId).eq('estado', 'pendente'),
            supabase.from('documento_tarefas_gerais').select('responsavel_id, prazo').eq('empresa_id', empresaId).in('estado', ['aberta', 'em_curso']),
            supabase.from('documentos').select('responsavel_id, estado, ciclo').eq('empresa_id', empresaId).neq('ciclo', 'DELETED').not('responsavel_id', 'is', null),
            supabase.from('documento_ausencias').select('user_id, substituto_id, fim').eq('empresa_id', empresaId).lte('inicio', hoje).gte('fim', hoje)
        ]);
        const agora = new Date();
        return (perfis || []).map((p: any) => {
            const a = (aprov || []).filter((x: any) => x.aprovador_id === p.id);
            const t = (tar || []).filter((x: any) => x.responsavel_id === p.id);
            const d = (docs || []).filter((x: any) => x.responsavel_id === p.id);
            const ausente = (aus || []).find((x: any) => x.user_id === p.id);
            return {
                id: p.id, nome: p.nome || p.email, role: p.role,
                aprovacoes: a.length, aprovacoesAtrasadas: a.filter((x: any) => x.prazo && new Date(x.prazo) < agora).length,
                assinaturas: (ass || []).filter((x: any) => x.signatario_user_id === p.id).length,
                tarefas: t.length, tarefasAtrasadas: t.filter((x: any) => x.prazo && x.prazo < hoje).length,
                documentos: d.length, porRever: d.filter((x: any) => x.estado === 'por_rever').length,
                ausente: ausente ? { ate: ausente.fim, substituto_id: ausente.substituto_id } : null
            };
        }).map((l: any) => ({ ...l, total: l.aprovacoes + l.assinaturas + l.tarefas + l.porRever, atrasos: l.aprovacoesAtrasadas + l.tarefasAtrasadas }));
    }
}
