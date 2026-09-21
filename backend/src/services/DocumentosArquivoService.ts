/**
 * Fase D do módulo Documentos: retenção, arquivo físico (localização e
 * etiqueta QR), assinaturas por adaptador, partilha temporária por link,
 * favoritos/recentes e o painel executivo.
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabaseClient';
import { DocumentosGovernoService, Utilizador } from './DocumentosGovernoService';
import { DocumentosFluxoService } from './DocumentosFluxoService';
import { MediaUploadService } from './MediaUploadService';
import { Ciclo } from './DocumentosCicloService';

export const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.APP_URL || 'https://business.topconsultores.pt').replace(/\/$/, '');

export class DocumentosArquivoService {
    // ============================================================
    // RETENÇÃO
    // ============================================================
    /** Data até à qual o documento tem de ser guardado, segundo a política do seu tipo. */
    public static calcularRetencao(doc: any, tipo: any): string | null {
        if (!tipo?.retencao_anos) return null;
        const base = tipo.retencao_base === 'validade' ? doc.validade : tipo.retencao_base === 'documento' ? doc.data_documento : (doc.arquivado_em || doc.criado_em);
        if (!base) return null;
        const d = new Date(base); d.setFullYear(d.getFullYear() + Number(tipo.retencao_anos));
        return d.toISOString().slice(0, 10);
    }

    /** Recalcula retencao_ate de um documento (chamado quando é arquivado, caduca ou muda de tipo). */
    public static async atualizarRetencao(doc: any): Promise<string | null> {
        const tipos = await DocumentosGovernoService.tipos(doc.empresa_id);
        const tipo = tipos.find((t: any) => t.id === doc.tipo_id);
        const ate = this.calcularRetencao(doc, tipo);
        await supabase.from('documentos').update({ retencao_ate: ate }).eq('id', doc.id);
        return ate;
    }

    /**
     * Corre de hora a hora: documentos arquivados/caducados cujo prazo de
     * retenção venceu passam a "Em retenção" (decisão humana) ou, se a política
     * do tipo disser "eliminar", são eliminados pelo sistema (soft delete, com
     * auditoria — a eliminação definitiva continua a ser manual).
     */
    public static async aplicarRetencao(): Promise<number> {
        const hoje = new Date().toISOString().slice(0, 10);
        const { data: vencidos } = await supabase.from('documentos').select('*').in('ciclo', ['ARCHIVED', 'EXPIRED', 'ACTIVE']).lte('retencao_ate', hoje).limit(200);
        let n = 0;
        for (const d of vencidos || []) {
            try {
                const tipos = await DocumentosGovernoService.tipos(d.empresa_id);
                const tipo = tipos.find((t: any) => t.id === d.tipo_id);
                const r = await DocumentosGovernoService.transitar(d, 'RETENTION_PENDING', 'sistema', null, `Prazo de retenção (${d.retencao_ate}) atingido.`);
                if (!r.ok) continue;
                n++;
                if (tipo?.retencao_acao === 'eliminar') {
                    await DocumentosGovernoService.transitar({ ...d, ciclo: 'RETENTION_PENDING' }, 'DELETED', 'sistema', null, `Política de retenção do tipo "${tipo.nome}": eliminar após ${tipo.retencao_anos} anos.`);
                    await supabase.from('documentos').update({ retencao_decisao: 'eliminar' }).eq('id', d.id);
                }
                await this.avisarRetencao(d, tipo?.retencao_acao === 'eliminar');
            } catch (e: any) { console.error('[Documentos] Retenção falhou em', d.id, e.message); }
        }
        return n;
    }

    private static async avisarRetencao(doc: any, eliminado: boolean) {
        const ids = new Set<string>();
        if (doc.responsavel_id) ids.add(doc.responsavel_id);
        const { data: admins } = await supabase.from('perfis').select('id').eq('empresa_id', doc.empresa_id).in('role', ['admin', 'superadmin']).limit(5);
        for (const a of admins || []) ids.add(a.id);
        for (const id of ids) {
            await DocumentosFluxoService.notificar(doc.empresa_id, id, 'retencao',
                eliminado ? `Eliminado por retenção: ${doc.titulo}` : `Prazo de retenção atingido: ${doc.titulo}`,
                eliminado ? `A política do tipo eliminou o documento; pode ser restaurado durante o período de segurança.` : `Decida se o documento se mantém em arquivo por mais um período ou se é eliminado.`,
                { documento_id: doc.id });
        }
    }

    /** Decisão humana sobre um documento em retenção. */
    public static async decidirRetencao(doc: any, decisao: 'manter' | 'eliminar', user: Utilizador, motivo: string): Promise<{ ok: boolean; erro?: string }> {
        if (doc.ciclo !== 'RETENTION_PENDING') return { ok: false, erro: 'O documento não está em retenção.' };
        if (decisao === 'manter') {
            const r = await DocumentosGovernoService.transitar(doc, 'ARCHIVED', 'utilizador', user, motivo);
            if (!r.ok) return r;
            const tipos = await DocumentosGovernoService.tipos(doc.empresa_id);
            const tipo = tipos.find((t: any) => t.id === doc.tipo_id);
            const anos = Number(tipo?.retencao_anos || 1);
            const nova = new Date(); nova.setFullYear(nova.getFullYear() + anos);
            await supabase.from('documentos').update({ retencao_ate: nova.toISOString().slice(0, 10), retencao_decisao: 'manter' }).eq('id', doc.id);
        } else {
            const r = await DocumentosGovernoService.transitar(doc, 'DELETED', 'utilizador', user, motivo);
            if (!r.ok) return r;
            await supabase.from('documentos').update({ retencao_decisao: 'eliminar' }).eq('id', doc.id);
        }
        await DocumentosGovernoService.auditar(doc.empresa_id, user, 'retencao_decidida', doc, { decisao, motivo });
        return { ok: true };
    }

    // ============================================================
    // ARQUIVO FÍSICO
    // ============================================================
    public static async etiquetaQR(doc: any): Promise<{ svg: string; url: string; codigo: string }> {
        const codigo = doc.codigo_fisico || doc.codigo || doc.id;
        const url = `${FRONTEND_URL}/?modulo=documentos&doc=${doc.id}`;
        const svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 180 });
        return { svg, url, codigo };
    }

    public static localizacaoLegivel(l: any): string {
        if (!l) return '';
        return ['edificio', 'sala', 'armario', 'prateleira', 'caixa', 'pasta'].map(k => l[k] ? `${({ edificio: 'Edif.', sala: 'Sala', armario: 'Arm.', prateleira: 'Prat.', caixa: 'Caixa', pasta: 'Pasta' } as any)[k]} ${l[k]}` : '').filter(Boolean).join(' · ');
    }

    // ============================================================
    // ASSINATURAS
    // ============================================================
    /** Adaptadores disponíveis. 'externa' só quando houver fornecedor configurado. */
    public static adaptadores(): { id: 'interna' | 'externa'; nome: string; disponivel: boolean; nota: string }[] {
        const externaConfigurada = !!process.env.ASSINATURA_EXTERNA_URL && !!process.env.ASSINATURA_EXTERNA_API_KEY;
        return [
            { id: 'interna', nome: 'Confirmação no sistema', disponivel: true, nota: 'Assinatura eletrónica simples: o signatário, autenticado, confirma que leu e aceita esta versão. Fica registado quem, quando, de que IP e o hash do ficheiro. Não substitui uma assinatura qualificada.' },
            { id: 'externa', nome: 'Fornecedor certificado', disponivel: externaConfigurada, nota: externaConfigurada ? 'Assinatura qualificada através do fornecedor configurado.' : 'Não configurado. Para assinatura qualificada, ligue um fornecedor (ex.: Autentique, DocuSign) em ASSINATURA_EXTERNA_URL / ASSINATURA_EXTERNA_API_KEY.' }
        ];
    }

    public static async pedirAssinaturas(doc: any, signatarios: { user_id?: string; nome?: string; email?: string }[], fornecedor: 'interna' | 'externa', user: Utilizador): Promise<{ ok: boolean; erro?: string }> {
        const ad = this.adaptadores().find(a => a.id === fornecedor);
        if (!ad || !ad.disponivel) return { ok: false, erro: ad?.nota || 'Adaptador indisponível.' };
        if (fornecedor === 'externa') return { ok: false, erro: 'O adaptador externo ainda não tem implementação de envio neste sistema.' };
        if (!['ACTIVE', 'APPROVED'].includes(doc.ciclo)) return { ok: false, erro: 'Só se pedem assinaturas a documentos ativos ou aprovados.' };
        if (!Array.isArray(signatarios) || signatarios.length === 0) return { ok: false, erro: 'Indique pelo menos um signatário.' };

        const { data: perfis } = await supabase.from('perfis').select('id, nome, email').eq('empresa_id', doc.empresa_id);
        const linhas: any[] = [];
        for (const s of signatarios) {
            const p = s.user_id ? (perfis || []).find((x: any) => x.id === s.user_id) : null;
            if (s.user_id && !p) return { ok: false, erro: 'Signatário não pertence à empresa.' };
            if (!p) return { ok: false, erro: 'A assinatura interna exige utilizadores do sistema. Para pessoas externas use o adaptador externo.' };
            linhas.push({ user_id: p.id, nome: p.nome || p.email, email: p.email });
        }
        const buffer = await MediaUploadService.descarregarDocumento(doc.storage_path);
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        const { error } = await supabase.from('documento_assinaturas').insert(linhas.map(l => ({
            empresa_id: doc.empresa_id, documento_id: doc.id, versao: doc.versao_atual || 1, fornecedor, signatario_user_id: l.user_id, signatario_nome: l.nome, signatario_email: l.email,
            hash_documento: hash, pedido_por: user.id
        })));
        if (error) return { ok: false, erro: error.message };
        const t = await DocumentosGovernoService.transitar(doc, 'PENDING_SIGNATURE', 'workflow', user, `Pedido de assinatura a ${linhas.map(l => l.nome).join(', ')}.`);
        if (!t.ok) return t;
        await DocumentosGovernoService.auditar(doc.empresa_id, user, 'assinatura_pedida', doc, { signatarios: linhas.map(l => l.nome), fornecedor, hash });
        for (const l of linhas) {
            await DocumentosFluxoService.notificar(doc.empresa_id, l.user_id, 'assinatura', `Assinatura pedida: ${doc.titulo}`, `${user.nome || 'Um colega'} pede-lhe que confirme e assine a versão ${doc.versao_atual || 1} deste documento.`, { documento_id: doc.id });
        }
        return { ok: true };
    }

    public static async assinar(assinaturaId: number, user: Utilizador, decisao: 'assinada' | 'recusada', motivo: string | undefined, evidencia: { ip?: string; user_agent?: string }): Promise<{ ok: boolean; erro?: string; estadoDoc?: string }> {
        const { data: a } = await supabase.from('documento_assinaturas').select('*').eq('id', assinaturaId).eq('empresa_id', user.empresa_id).maybeSingle();
        if (!a) return { ok: false, erro: 'Pedido de assinatura não encontrado.' };
        if (a.signatario_user_id !== user.id) return { ok: false, erro: 'Este pedido não é seu.' };
        if (a.estado !== 'pendente') return { ok: false, erro: 'Este pedido já foi respondido.' };
        if (decisao === 'recusada' && !(motivo || '').trim()) return { ok: false, erro: 'Indique o motivo da recusa.' };
        const { data: doc } = await supabase.from('documentos').select('*').eq('id', a.documento_id).maybeSingle();
        if (!doc) return { ok: false, erro: 'Documento não encontrado.' };

        // O ficheiro tem de ser exatamente o que foi pedido para assinar.
        const buffer = await MediaUploadService.descarregarDocumento(doc.storage_path);
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        if (hash !== a.hash_documento) return { ok: false, erro: 'O documento foi alterado depois do pedido de assinatura. Peça uma nova assinatura sobre a versão atual.' };

        await supabase.from('documento_assinaturas').update({
            estado: decisao, concluido_em: new Date().toISOString(), motivo: motivo || null,
            evidencia: { ip: evidencia.ip || null, user_agent: (evidencia.user_agent || '').slice(0, 300), declaracao: decisao === 'assinada' ? 'Confirmo que li e aceito esta versão do documento.' : null, hash }
        }).eq('id', a.id);
        await DocumentosGovernoService.auditar(doc.empresa_id, user, decisao === 'assinada' ? 'assinou' : 'recusou_assinar', doc, { assinatura_id: a.id, versao: a.versao, hash, motivo: motivo || null });

        if (decisao === 'recusada') {
            await supabase.from('documento_assinaturas').update({ estado: 'cancelada' }).eq('documento_id', doc.id).eq('versao', a.versao).eq('estado', 'pendente');
            const volta = (['APPROVED', 'ACTIVE'].includes(doc.ciclo) ? doc.ciclo : 'ACTIVE') as Ciclo;
            if (doc.ciclo === 'PENDING_SIGNATURE') await DocumentosGovernoService.transitar(doc, volta === 'APPROVED' ? 'APPROVED' : 'ACTIVE', 'workflow', user, `Assinatura recusada por ${user.nome}: ${motivo}`);
            await this.avisarPedinte(a, doc, `Assinatura recusada: ${doc.titulo}`, `${user.nome || 'O signatário'} recusou assinar: ${motivo}`);
            return { ok: true, estadoDoc: 'recusada' };
        }
        const { count } = await supabase.from('documento_assinaturas').select('id', { count: 'exact', head: true }).eq('documento_id', doc.id).eq('versao', a.versao).eq('estado', 'pendente');
        if ((count || 0) > 0) return { ok: true, estadoDoc: 'pendente' };
        if (doc.ciclo === 'PENDING_SIGNATURE') {
            await DocumentosGovernoService.transitar(doc, 'SIGNED', 'workflow', user, 'Todas as assinaturas recolhidas.');
            await DocumentosGovernoService.transitar({ ...doc, ciclo: 'SIGNED' }, 'ACTIVE', 'sistema', null, 'Em vigor após assinatura.');
        }
        await this.avisarPedinte(a, doc, `Assinado: ${doc.titulo}`, 'Todas as assinaturas foram recolhidas. O documento está em vigor.');
        return { ok: true, estadoDoc: 'assinada' };
    }

    public static async cancelarAssinaturas(doc: any, user: Utilizador, motivo: string): Promise<{ ok: boolean; erro?: string }> {
        if (!(motivo || '').trim()) return { ok: false, erro: 'Indique o motivo.' };
        await supabase.from('documento_assinaturas').update({ estado: 'cancelada', concluido_em: new Date().toISOString(), motivo }).eq('documento_id', doc.id).eq('estado', 'pendente');
        if (doc.ciclo === 'PENDING_SIGNATURE') await DocumentosGovernoService.transitar(doc, 'ACTIVE', 'workflow', user, `Pedido de assinatura cancelado: ${motivo}`);
        await DocumentosGovernoService.auditar(doc.empresa_id, user, 'assinatura_cancelada', doc, { motivo });
        return { ok: true };
    }

    private static async avisarPedinte(a: any, doc: any, titulo: string, mensagem: string) {
        if (a.pedido_por) await DocumentosFluxoService.notificar(doc.empresa_id, a.pedido_por, 'assinatura', titulo, mensagem, { documento_id: doc.id });
    }

    public static async assinaturasDe(documentoId: string): Promise<any[]> {
        const { data } = await supabase.from('documento_assinaturas').select('*').eq('documento_id', documentoId).order('pedido_em', { ascending: false });
        return data || [];
    }

    public static async minhasAssinaturas(empresaId: string, userId: string): Promise<any[]> {
        const { data } = await supabase.from('documento_assinaturas').select('*').eq('empresa_id', empresaId).eq('signatario_user_id', userId).eq('estado', 'pendente').order('pedido_em');
        if (!data || data.length === 0) return [];
        const { data: docs } = await supabase.from('documentos').select('id, codigo, titulo, tipo, area, versao_atual, resumo').in('id', data.map((a: any) => a.documento_id));
        const porDoc = new Map((docs || []).map((d: any) => [d.id, d]));
        return data.map((a: any) => ({ ...a, documento: porDoc.get(a.documento_id) || null }));
    }

    // ============================================================
    // PARTILHA TEMPORÁRIA
    // ============================================================
    public static async criarPartilha(doc: any, user: Utilizador, opts: { horas: number; destinatario?: string; max_acessos?: number | null; senha?: string }): Promise<{ ok: boolean; erro?: string; url?: string; token?: string; expira_em?: string }> {
        if (doc.confidencialidade === 'Restrito') return { ok: false, erro: 'Documentos Restritos não se partilham por link.' };
        const horas = Math.min(Math.max(Number(opts.horas) || 24, 1), 24 * 30);
        const token = crypto.randomBytes(24).toString('base64url');
        const expira = new Date(Date.now() + horas * 3600 * 1000).toISOString();
        const { error } = await supabase.from('documento_partilhas').insert({
            empresa_id: doc.empresa_id, documento_id: doc.id, token, criado_por: user.id, destinatario: opts.destinatario || null, expira_em: expira,
            max_acessos: opts.max_acessos || null, senha_hash: opts.senha ? await bcrypt.hash(opts.senha, 8) : null
        });
        if (error) return { ok: false, erro: error.message };
        await DocumentosGovernoService.auditar(doc.empresa_id, user, 'partilha_criada', doc, { destinatario: opts.destinatario || null, expira_em: expira, max_acessos: opts.max_acessos || null, com_senha: !!opts.senha });
        return { ok: true, url: `${FRONTEND_URL}/partilha/${token}`, token, expira_em: expira };
    }

    public static async partilhasDe(documentoId: string): Promise<any[]> {
        const { data } = await supabase.from('documento_partilhas').select('id, destinatario, expira_em, max_acessos, acessos, revogado, ultimo_acesso_em, criado_em, criado_por, token, senha_hash').eq('documento_id', documentoId).order('criado_em', { ascending: false });
        return (data || []).map((p: any) => ({ ...p, com_senha: !!p.senha_hash, senha_hash: undefined, url: `${FRONTEND_URL}/partilha/${p.token}`, ativa: !p.revogado && new Date(p.expira_em) > new Date() && (!p.max_acessos || p.acessos < p.max_acessos) }));
    }

    public static async revogarPartilha(documentoId: string, partilhaId: number, user: Utilizador): Promise<boolean> {
        const { data } = await supabase.from('documento_partilhas').update({ revogado: true }).eq('id', partilhaId).eq('documento_id', documentoId).select('id').maybeSingle();
        if (data) await DocumentosGovernoService.auditar(user.empresa_id, user, 'partilha_revogada', { id: documentoId }, { partilha_id: partilhaId });
        return !!data;
    }

    /** Acesso público pelo token: devolve o essencial e um link assinado de curta duração. */
    public static async abrirPartilha(token: string, senha: string | undefined, ip: string | undefined): Promise<{ ok: boolean; erro?: string; precisaSenha?: boolean; documento?: any; url?: string }> {
        const { data: p } = await supabase.from('documento_partilhas').select('*').eq('token', token).maybeSingle();
        if (!p || p.revogado) return { ok: false, erro: 'Este link já não está disponível.' };
        if (new Date(p.expira_em) < new Date()) return { ok: false, erro: 'Este link expirou.' };
        if (p.max_acessos && p.acessos >= p.max_acessos) return { ok: false, erro: 'Este link atingiu o número máximo de acessos.' };
        if (p.senha_hash) {
            if (!senha) return { ok: false, precisaSenha: true, erro: 'Este link está protegido por senha.' };
            if (!(await bcrypt.compare(senha, p.senha_hash))) return { ok: false, precisaSenha: true, erro: 'Senha incorreta.' };
        }
        const { data: doc } = await supabase.from('documentos').select('id, empresa_id, codigo, titulo, tipo, nome_ficheiro, mime_type, tamanho, storage_path, ciclo').eq('id', p.documento_id).maybeSingle();
        if (!doc || doc.ciclo === 'DELETED') return { ok: false, erro: 'O documento já não está disponível.' };
        const url = await MediaUploadService.assinarDocumento(doc.storage_path, 300);
        if (!url) return { ok: false, erro: 'Não foi possível preparar o ficheiro.' };
        await supabase.from('documento_partilhas').update({ acessos: p.acessos + 1, ultimo_acesso_em: new Date().toISOString() }).eq('id', p.id);
        await DocumentosGovernoService.auditar(doc.empresa_id, null, 'partilha_acedida', doc, { partilha_id: p.id, destinatario: p.destinatario, ip: ip || null, acesso_n: p.acessos + 1 });
        return { ok: true, documento: { codigo: doc.codigo, titulo: doc.titulo, tipo: doc.tipo, nome_ficheiro: doc.nome_ficheiro, mime_type: doc.mime_type, tamanho: doc.tamanho }, url };
    }

    // ============================================================
    // FAVORITOS E RECENTES
    // ============================================================
    public static async alternarFavorito(empresaId: string, userId: string, documentoId: string): Promise<boolean> {
        const { data } = await supabase.from('documento_favoritos').select('documento_id').eq('user_id', userId).eq('documento_id', documentoId).maybeSingle();
        if (data) { await supabase.from('documento_favoritos').delete().eq('user_id', userId).eq('documento_id', documentoId); return false; }
        await supabase.from('documento_favoritos').insert({ empresa_id: empresaId, user_id: userId, documento_id: documentoId });
        return true;
    }

    public static async favoritosIds(userId: string): Promise<string[]> {
        const { data } = await supabase.from('documento_favoritos').select('documento_id').eq('user_id', userId).order('criado_em', { ascending: false });
        return (data || []).map((f: any) => f.documento_id);
    }

    /** Últimos documentos consultados por este utilizador (a partir da auditoria). */
    public static async recentesIds(empresaId: string, userId: string, limite = 20): Promise<string[]> {
        const { data } = await supabase.from('documentos_auditoria').select('documento_id, criado_em').eq('empresa_id', empresaId).eq('user_id', userId).in('acao', ['ver', 'descarregar', 'editar', 'upload']).not('documento_id', 'is', null).order('criado_em', { ascending: false }).limit(200);
        const vistos: string[] = [];
        for (const r of data || []) { if (!vistos.includes(r.documento_id)) vistos.push(r.documento_id); if (vistos.length >= limite) break; }
        return vistos;
    }

    // ============================================================
    // PAINEL EXECUTIVO
    // ============================================================
    public static async painel(empresaId: string, areas: string[] | null, user: { id: string; role: string }): Promise<any> {
        const { DocumentosService } = require('./DocumentosService');
        let q = supabase.from('documentos').select('id, area, tipo, ciclo, estado, validade, origem, tamanho, criado_em, confidencialidade, responsavel_id, criado_por, retencao_ate, entidade_nome, localizacao_fisica')
            .eq('empresa_id', empresaId).neq('estado', 'descartado');
        if (areas) q = q.in('area', areas);
        const { data: brutos } = await q.limit(5000);
        const docs = await DocumentosService.filtrarVisiveis(brutos || [], user);
        const hoje = new Date().toISOString().slice(0, 10);
        const em30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        const conta = (f: (d: any) => boolean) => docs.filter(f).length;
        const agrupa = (k: (d: any) => string) => { const m: Record<string, number> = {}; for (const d of docs) { if (d.ciclo === 'DELETED') continue; const x = k(d) || '—'; m[x] = (m[x] || 0) + 1; } return Object.entries(m).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total); };
        const meses: { mes: string; total: number }[] = [];
        for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); const k = d.toISOString().slice(0, 7); meses.push({ mes: k, total: conta(x => (x.criado_em || '').startsWith(k)) }); }
        const [{ count: aprovacoesPendentes }, { count: assinaturasPendentes }, { count: processosEmCurso }] = await Promise.all([
            supabase.from('documento_tarefas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('estado', 'pendente'),
            supabase.from('documento_assinaturas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('estado', 'pendente'),
            supabase.from('documento_processos').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('estado', 'em_curso'),
        ]);
        const vivos = docs.filter((d: any) => d.ciclo !== 'DELETED');
        return {
            total: vivos.length,
            emVigor: conta(d => d.ciclo === 'ACTIVE'),
            porRever: conta(d => d.estado === 'por_rever'),
            aProcessar: conta(d => d.estado === 'a_processar'),
            comErro: conta(d => d.estado === 'erro'),
            caducados: conta(d => d.ciclo === 'EXPIRED' || (!!d.validade && d.validade < hoje && !['DELETED', 'ARCHIVED'].includes(d.ciclo))),
            aCaducar30: conta(d => !!d.validade && d.validade >= hoje && d.validade <= em30 && !['DELETED', 'ARCHIVED'].includes(d.ciclo)),
            emAprovacao: conta(d => d.ciclo === 'PENDING_APPROVAL'),
            emAssinatura: conta(d => d.ciclo === 'PENDING_SIGNATURE'),
            emRetencao: conta(d => d.ciclo === 'RETENTION_PENDING'),
            arquivados: conta(d => d.ciclo === 'ARCHIVED'),
            eliminados: conta(d => d.ciclo === 'DELETED'),
            confidenciais: conta(d => d.confidencialidade !== 'Normal' && d.ciclo !== 'DELETED'),
            comLocalizacaoFisica: conta(d => !!d.localizacao_fisica && d.ciclo !== 'DELETED'),
            armazenamentoBytes: vivos.reduce((s: number, d: any) => s + (d.tamanho || 0), 0),
            aprovacoesPendentes: aprovacoesPendentes || 0, assinaturasPendentes: assinaturasPendentes || 0, processosEmCurso: processosEmCurso || 0,
            porArea: agrupa(d => d.area), porTipo: agrupa(d => d.tipo).slice(0, 8), porOrigem: agrupa(d => d.origem), porCiclo: agrupa(d => d.ciclo),
            entradasPorMes: meses,
            topEntidades: agrupa(d => d.entidade_nome).filter(x => x.nome !== '—').slice(0, 6)
        };
    }
}
