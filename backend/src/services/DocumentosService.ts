import crypto from 'crypto';
import { supabase } from '../lib/supabaseClient';
import { MediaUploadService } from './MediaUploadService';
import { DocumentoIAService, AREAS, Area, AnaliseDocumento } from './DocumentoIAService';
import { KnowledgeBaseService } from './KnowledgeBaseService';
import { DocumentosGovernoService } from './DocumentosGovernoService';

export type Origem = 'manual' | 'email' | 'whatsapp' | 'sistema';

interface Entrada {
    empresaId: string;
    buffer: Buffer;
    nomeFicheiro: string;
    mimeType: string;
    origem: Origem;
    origemRef?: string;
    origemDetalhe?: string;
    criadoPor?: string;
    // Documentos gerados pelo sistema já vêm classificados — não passam pela IA.
    preClassificado?: { titulo: string; area: Area; tipo: string; entidade?: { tipo?: string; id?: string | number; nome: string }; resumo?: string };
}

// A partir daqui a IA arquiva sozinha; abaixo, fica "Por rever" para um humano.
const CONFIANCA_MINIMA = 0.7;
const DIAS_AVISO_VALIDADE = 30;
const MIN_SIMILARIDADE = 0.25;

export class DocumentosService {

    // ============================================================
    // ENTRADA — todas as portas (manual, email, WhatsApp, sistema) chegam aqui
    // ============================================================
    public static async receber(e: Entrada): Promise<{ id: string; duplicado: boolean; estado: string }> {
        const hash = crypto.createHash('sha256').update(e.buffer).digest('hex');

        // O mesmo ficheiro pode chegar por email, ser reencaminhado e ainda
        // carregado à mão. Guarda-se uma vez; regista-se só por onde entrou.
        const { data: existente } = await supabase.from('documentos')
            .select('id, estado, origem_detalhe').eq('empresa_id', e.empresaId).eq('hash', hash).neq('estado', 'descartado').maybeSingle();
        if (existente) {
            const nota = `${existente.origem_detalhe || ''} | também recebido por ${e.origem}${e.origemDetalhe ? ` (${e.origemDetalhe})` : ''}`.replace(/^ \| /, '');
            await supabase.from('documentos').update({ origem_detalhe: nota.slice(0, 500) }).eq('id', existente.id);
            return { id: existente.id, duplicado: true, estado: existente.estado };
        }

        // Bucket privado: o ficheiro só sai por links assinados que expiram.
        const storagePath = await MediaUploadService.guardarDocumento(e.buffer, e.empresaId, e.nomeFicheiro, e.mimeType);

        const pre = e.preClassificado;
        const tipoPre = pre ? await DocumentosGovernoService.tipoPorNome(e.empresaId, pre.tipo) : null;
        const { data, error } = await supabase.from('documentos').insert({
            empresa_id: e.empresaId,
            titulo: pre?.titulo || e.nomeFicheiro,
            nome_ficheiro: e.nomeFicheiro,
            url: null,
            storage_path: storagePath,
            mime_type: e.mimeType,
            tamanho: e.buffer.length,
            hash,
            area: pre?.area || 'Outros',
            tipo: pre?.tipo || null,
            resumo: pre?.resumo || null,
            entidade_tipo: (pre?.entidade?.tipo && pre.entidade.id !== undefined) ? pre.entidade.tipo : null,
            entidade_id: pre?.entidade?.id !== undefined ? String(pre.entidade.id) : null,
            entidade_nome: pre?.entidade?.nome || null,
            origem: e.origem,
            origem_ref: e.origemRef || null,
            origem_detalhe: e.origemDetalhe || null,
            estado: pre ? 'arquivado' : 'a_processar',
            confianca: pre ? 1 : null,
            criado_por: e.criadoPor || null,
            tipo_id: tipoPre?.id || null,
            confidencialidade: tipoPre?.confidencialidade_padrao || 'Normal',
            ciclo: pre ? 'ACTIVE' : 'DRAFT'
        }).select('id, estado').single();
        if (error) throw error;

        await DocumentosGovernoService.registarVersaoInicial(e.empresaId, {
            id: data.id, storage_path: storagePath, nome_ficheiro: e.nomeFicheiro, mime_type: e.mimeType, tamanho: e.buffer.length, hash
        }, e.criadoPor);
        if (pre) await DocumentosGovernoService.atribuirCodigo(e.empresaId, data.id, tipoPre?.prefixo || 'DOC');
        await DocumentosGovernoService.auditar(e.empresaId, e.criadoPor ? { id: e.criadoPor, role: '', empresa_id: e.empresaId } : null, 'upload',
            { id: data.id, titulo: pre?.titulo || e.nomeFicheiro }, { origem: e.origem, nome_ficheiro: e.nomeFicheiro, tamanho: e.buffer.length });

        if (pre) {
            // Só indexar para pesquisa; a classificação já veio feita.
            this.indexarTexto(e.empresaId, data.id, e.buffer, e.mimeType, e.nomeFicheiro).catch(err =>
                console.error('[Documentos] Falha a indexar documento do sistema:', err.message));
        } else {
            this.processarFila().catch(() => {});
        }
        return { id: data.id, duplicado: false, estado: data.estado };
    }

    // ============================================================
    // PROCESSAMENTO EM SEGUNDO PLANO — um de cada vez, com travão de reentrância
    // ============================================================
    private static aProcessar = false;

    public static async processarFila(): Promise<void> {
        if (this.aProcessar) return;
        this.aProcessar = true;
        try {
            for (;;) {
                const { data: doc } = await supabase.from('documentos').select('*')
                    .eq('estado', 'a_processar').order('criado_em', { ascending: true }).limit(1).maybeSingle();
                if (!doc) break;
                await this.processar(doc);
            }
        } catch (e: any) {
            console.error('[Documentos] Erro na fila de processamento:', e.message);
        } finally {
            this.aProcessar = false;
        }
    }

    private static async processar(doc: any): Promise<void> {
        try {
            const buffer = await MediaUploadService.descarregarDocumento(doc.storage_path);

            const contexto = await this.contextoParaIA(doc.empresa_id);
            const analise = await DocumentoIAService.analisar(buffer, doc.mime_type || 'application/octet-stream', doc.nome_ficheiro, contexto);

            if (!analise.e_documento) {
                await supabase.from('documentos').update({
                    estado: 'por_rever', titulo: analise.titulo, resumo: analise.resumo || 'A IA não reconheceu isto como um documento da empresa.',
                    confianca: analise.confianca, texto: analise.texto.slice(0, 20000), atualizado_em: new Date().toISOString()
                }).eq('id', doc.id);
                return;
            }

            const ligacao = await this.ligarEntidade(doc.empresa_id, analise.entidade);
            // Validação humana: por omissão TUDO passa por "Por rever" — a IA propõe, uma
            // pessoa confirma. Só com "auto" ligado é que a IA arquiva sozinha o que lê com confiança.
            const arquivaSozinho = (await this.validacaoAutomatica(doc.empresa_id)) && analise.confianca >= CONFIANCA_MINIMA;
            const tipoDoc = await DocumentosGovernoService.tipoPorNome(doc.empresa_id, analise.tipo);

            await supabase.from('documentos').update({
                titulo: analise.titulo,
                area: analise.area,
                tipo: tipoDoc?.nome || analise.tipo,
                tipo_id: tipoDoc?.id || null,
                // o que a IA pôs já pela chave certa ganha aos campos soltos mapeados por sinónimos
                metadados: DocumentosGovernoService.metadadosDe(tipoDoc, { ...analise.campos, ...analise.metadados }),
                confidencialidade: tipoDoc?.confidencialidade_padrao || 'Normal',
                ciclo: arquivaSozinho ? 'ACTIVE' : 'PENDING_REVIEW',
                resumo: analise.resumo,
                texto: analise.texto.slice(0, 200000),
                campos: analise.campos,
                data_documento: analise.data_documento,
                validade: analise.validade,
                // uma ligação feita à mão (ex.: carregado a partir da ficha do cliente) prevalece sobre a sugestão da IA
                entidade_tipo: doc.entidade_id ? doc.entidade_tipo : (ligacao?.tipo || null),
                entidade_id: doc.entidade_id ? doc.entidade_id : (ligacao?.id || null),
                entidade_nome: doc.entidade_id ? doc.entidade_nome : (ligacao?.nome || analise.entidade.nome),
                confianca: analise.confianca,
                estado: arquivaSozinho ? 'arquivado' : 'por_rever',
                erro: null,
                atualizado_em: new Date().toISOString()
            }).eq('id', doc.id);

            await DocumentosGovernoService.atribuirCodigo(doc.empresa_id, doc.id, tipoDoc?.prefixo || 'DOC');
            // Responsável por área/tipo: o documento fica logo atribuído a alguém.
            const { DocumentosEquipaService } = require('./DocumentosEquipaService');
            await DocumentosEquipaService.atribuirAutomaticamente({ ...doc, titulo: analise.titulo, area: analise.area, tipo_id: tipoDoc?.id || null, estado: arquivaSozinho ? 'arquivado' : 'por_rever' }).catch(() => null);
            await DocumentosGovernoService.auditar(doc.empresa_id, null, 'classificado', { id: doc.id, titulo: analise.titulo },
                { area: analise.area, tipo: tipoDoc?.nome || analise.tipo, confianca: analise.confianca, estado: arquivaSozinho ? 'arquivado' : 'por_rever' });
            await this.indexarChunks(doc.empresa_id, doc.id, analise.texto);
        } catch (e: any) {
            console.error(`[Documentos] Falha a processar ${doc.nome_ficheiro}:`, e.message);
            await supabase.from('documentos').update({ estado: 'erro', erro: String(e.message).slice(0, 500), atualizado_em: new Date().toISOString() }).eq('id', doc.id);
        }
    }

    /**
     * Contexto que a empresa já tem e que faz a IA acertar mais: os tipos
     * configurados (com os campos), os nomes dos registos e o nome da empresa.
     * Fica em cache 5 minutos por empresa — a fila processa muitos documentos
     * seguidos e isto não muda de minuto a minuto.
     */
    private static contextoCache = new Map<string, { ate: number; ctx: any }>();
    private static async contextoParaIA(empresaId: string): Promise<any> {
        const c = this.contextoCache.get(empresaId);
        if (c && c.ate > Date.now()) return c.ctx;
        const [tipos, { data: emp }, { data: cli }, { data: col }, { data: ati }] = await Promise.all([
            DocumentosGovernoService.tipos(empresaId),
            supabase.from('empresas').select('nome').eq('id', empresaId).maybeSingle(),
            supabase.from('clientes').select('nome').eq('empresa_id', empresaId).order('nome').limit(300),
            supabase.from('colaboradores').select('nome').eq('empresa_id', empresaId).order('nome').limit(300),
            supabase.from('ativos').select('nome').eq('empresa_id', empresaId).order('nome').limit(300),
        ]);
        const ctx = {
            empresaNome: emp?.nome || null,
            tipos: tipos.filter((t: any) => t.ativo).map((t: any) => ({ nome: t.nome, area_padrao: t.area_padrao, tem_validade: t.tem_validade, campos: t.campos || [] })),
            entidades: { clientes: (cli || []).map((x: any) => x.nome), colaboradores: (col || []).map((x: any) => x.nome), ativos: (ati || []).map((x: any) => x.nome) }
        };
        this.contextoCache.set(empresaId, { ate: Date.now() + 5 * 60 * 1000, ctx });
        return ctx;
    }

    // ============================================================
    // LIGAÇÃO A CLIENTES / COLABORADORES / ATIVOS
    // ============================================================
    private static normalizar(s: string): string {
        return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    private static async ligarEntidade(empresaId: string, sugestao: AnaliseDocumento['entidade']): Promise<{ tipo: string; id: string; nome: string } | null> {
        if (!sugestao?.nome) return null;
        const alvo = this.normalizar(sugestao.nome);
        if (alvo.length < 3) return null;

        // Fornecedores não têm registo próprio; ficam só como nome sugerido.
        const tabelas: { tipo: string; tabela: string }[] =
            sugestao.tipo === 'colaborador' ? [{ tipo: 'colaborador', tabela: 'colaboradores' }]
            : sugestao.tipo === 'ativo' ? [{ tipo: 'ativo', tabela: 'ativos' }]
            : sugestao.tipo === 'cliente' ? [{ tipo: 'cliente', tabela: 'clientes' }]
            : [{ tipo: 'cliente', tabela: 'clientes' }, { tipo: 'colaborador', tabela: 'colaboradores' }, { tipo: 'ativo', tabela: 'ativos' }];

        for (const { tipo, tabela } of tabelas) {
            const { data } = await supabase.from(tabela).select('id, nome').eq('empresa_id', empresaId).limit(2000);
            const candidatos = (data || []).map((r: any) => ({ id: String(r.id), nome: r.nome, norm: this.normalizar(r.nome) }))
                .filter(c => c.norm && (c.norm === alvo || c.norm.includes(alvo) || alvo.includes(c.norm)));
            // Só liga quando há exatamente um candidato — dois "Silva" não se
            // decidem à sorte, ficam para o humano no "Por rever".
            if (candidatos.length === 1) return { tipo, id: candidatos[0].id, nome: candidatos[0].nome };
            const exato = candidatos.find(c => c.norm === alvo);
            if (exato) return { tipo, id: exato.id, nome: exato.nome };
        }
        return null;
    }

    // ============================================================
    // PESQUISA SEMÂNTICA
    // ============================================================
    private static async indexarTexto(empresaId: string, documentoId: string, buffer: Buffer, mimeType: string, nome: string) {
        const { texto } = await DocumentoIAService.extrairTexto(buffer, mimeType, nome).catch(() => ({ texto: '' }));
        if (texto) {
            await supabase.from('documentos').update({ texto: texto.slice(0, 200000) }).eq('id', documentoId);
            await this.indexarChunks(empresaId, documentoId, texto);
        }
    }

    private static async indexarChunks(empresaId: string, documentoId: string, texto: string) {
        await supabase.from('documento_chunks').delete().eq('documento_id', documentoId);
        const pedacos = KnowledgeBaseService.chunkText(texto || '');
        if (pedacos.length === 0) return;
        const rows = [];
        for (let i = 0; i < pedacos.length; i++) {
            rows.push({ empresa_id: empresaId, documento_id: documentoId, chunk_index: i, conteudo: pedacos[i], embedding: await KnowledgeBaseService.embedText(pedacos[i]) });
        }
        const { error } = await supabase.from('documento_chunks').insert(rows);
        if (error) throw error;
    }

    /**
     * Documentos confidenciais/restritos só aparecem a quem pode vê-los: admins,
     * responsável/autor, ou quem tem acesso explícito válido. Aplica-se a
     * listagens, pesquisa e conformidade — a IA nunca cita o que o utilizador
     * não podia abrir.
     */
    public static async filtrarVisiveis<T extends { id: string; confidencialidade?: string; responsavel_id?: string | null; criado_por?: string | null }>(docs: T[], user: { id: string; role: string }): Promise<T[]> {
        if (user.role === 'admin' || user.role === 'superadmin') return docs;
        const sensiveis = docs.filter(d => d.confidencialidade && d.confidencialidade !== 'Normal');
        if (sensiveis.length === 0) return docs;
        const { data } = await supabase.from('documento_acessos').select('documento_id, expira_em').eq('user_id', user.id).in('documento_id', sensiveis.map(d => d.id));
        const comAcesso = new Set((data || []).filter((a: any) => !a.expira_em || new Date(a.expira_em) > new Date()).map((a: any) => a.documento_id));
        const { DocumentosFluxoService } = require('./DocumentosFluxoService');
        const comTarefa: Set<string> = await DocumentosFluxoService.documentosComTarefaDe(user.id, sensiveis.map(d => d.id));
        return docs.filter(d => !d.confidencialidade || d.confidencialidade === 'Normal' || d.responsavel_id === user.id || d.criado_por === user.id || comAcesso.has(d.id) || comTarefa.has(d.id));
    }

    public static async pesquisar(empresaId: string, pergunta: string, areasPermitidas: string[] | null, user?: { id: string; role: string }) {
        const embedding = await KnowledgeBaseService.embedText(pergunta);
        const { data, error } = await supabase.rpc('match_documento_chunks', { query_embedding: embedding, match_empresa_id: empresaId, match_count: 12 });
        if (error) throw error;

        const relevantes = (data || []).filter((r: any) => r.similarity >= MIN_SIMILARIDADE);
        const porDoc = new Map<string, { similarity: number; excertos: string[] }>();
        for (const r of relevantes) {
            const atual = porDoc.get(r.documento_id) || { similarity: 0, excertos: [] };
            atual.similarity = Math.max(atual.similarity, r.similarity);
            if (atual.excertos.length < 2) atual.excertos.push(r.conteudo);
            porDoc.set(r.documento_id, atual);
        }
        // Sem excertos por significado, tenta pelo menos por palavras no título,
        // código, entidade ou resumo (ex.: "CTR-2026-00012", "Sonangol").
        if (porDoc.size === 0) {
            const termos = pergunta.split(/\s+/).map(t => t.replace(/[%_,.;:?!"']/g, '')).filter(t => t.length >= 3).slice(0, 5);
            if (termos.length > 0) {
                const filtro = termos.map(t => `titulo.ilike.%${t}%,codigo.ilike.%${t}%,entidade_nome.ilike.%${t}%,resumo.ilike.%${t}%`).join(',');
                const { data: porTexto } = await supabase.from('documentos').select('id').eq('empresa_id', empresaId).neq('estado', 'descartado').neq('ciclo', 'DELETED').or(filtro).limit(12);
                for (const d of porTexto || []) porDoc.set(d.id, { similarity: 0.3, excertos: [] });
            }
        }
        if (porDoc.size === 0) return { documentos: [], resposta: null };

        let q = supabase.from('documentos').select('id, titulo, codigo, area, tipo, ciclo, resumo, entidade_nome, validade, data_documento, storage_path, nome_ficheiro, mime_type, campos, metadados, confidencialidade, responsavel_id, criado_por')
            .eq('empresa_id', empresaId).in('id', Array.from(porDoc.keys())).neq('estado', 'descartado').neq('ciclo', 'DELETED');
        if (areasPermitidas) q = q.in('area', areasPermitidas);
        const { data: docs } = await q;

        const visiveis = user ? await this.filtrarVisiveis(docs || [], user) : (docs || []);
        const documentos = await this.comLinks(visiveis
            .map((d: any) => ({ ...d, relevancia: porDoc.get(d.id)!.similarity, excertos: porDoc.get(d.id)!.excertos }))
            .sort((a: any, b: any) => b.relevancia - a.relevancia)
            .slice(0, 6));

        const resposta = documentos.length > 0 ? await this.responderComDocumentos(pergunta, documentos) : null;
        return { documentos, resposta };
    }

    private static async responderComDocumentos(pergunta: string, documentos: any[]): Promise<string | null> {
        try {
            const { AIGatewayService } = require('./AIGatewayService');
            const hoje = new Date().toISOString().slice(0, 10);
            const contexto = documentos.map((d, i) => {
                const meta = Object.entries(d.metadados || {}).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object').map(([k, v]) => `${k}: ${v}`).join('; ');
                const cab = [
                    `[Documento ${i + 1}${d.codigo ? ` ${d.codigo}` : ''}: "${d.titulo}" — ${d.tipo || 'documento'}, área ${d.area}, estado ${d.ciclo}`,
                    d.entidade_nome ? `entidade: ${d.entidade_nome}` : '', d.data_documento ? `data: ${d.data_documento}` : '',
                    d.validade ? `validade: ${d.validade}${d.validade < hoje ? ' (JÁ CADUCOU)' : ''}` : '', meta ? `dados: ${meta}` : ''
                ].filter(Boolean).join(' · ') + ']';
                return `${cab}\n${d.resumo ? `Resumo: ${d.resumo}\n` : ''}${d.excertos.join('\n...\n')}`;
            }).join('\n\n');
            const r = await AIGatewayService.chamarComFallback({
                temperature: 0,
                messages: [
                    { role: 'system', content: `És o arquivista da empresa. Hoje é ${hoje}. Respondes à pergunta usando SÓ os documentos abaixo — nada do que não estiver neles.
Regras:
- Cita sempre o documento de onde tiras cada facto, pelo código e título (ex: "segundo o CTR-2026-00012, Contrato Sonangol...").
- Se a pergunta pede uma lista (que contratos, quais caducam, quanto pagámos), responde em lista curta, um documento por linha, com o dado pedido.
- Datas e valores exatamente como estão nos documentos; valores em Kz com separador de milhares (25.000.000 Kz).
- Se os documentos não respondem, ou só respondem em parte, diz isso claramente e o que falta — nunca inventes.
- Português de Angola, direto, sem introduções. Máximo 6 frases ou 6 linhas de lista.

${contexto}` },
                    { role: 'user', content: pergunta }
                ]
            });
            return r.choices[0]?.message?.content || null;
        } catch (e: any) {
            console.error('[Documentos] Falha a gerar resposta:', e.message);
            return null;
        }
    }

    // ============================================================
    // CONFORMIDADE — o que caduca, o que já caducou
    // ============================================================
    public static async conformidade(empresaId: string, areasPermitidas: string[] | null, user?: { id: string; role: string }) {
        let q = supabase.from('documentos').select('id, titulo, codigo, area, tipo, entidade_nome, entidade_tipo, validade, storage_path, mime_type, nome_ficheiro, ciclo, confidencialidade, responsavel_id, criado_por')
            .eq('empresa_id', empresaId).eq('estado', 'arquivado').neq('ciclo', 'DELETED').neq('ciclo', 'ARCHIVED').not('validade', 'is', null).order('validade', { ascending: true });
        if (areasPermitidas) q = q.in('area', areasPermitidas);
        const { data: brutos } = await q;
        const data = user ? await this.filtrarVisiveis(brutos || [], user) : (brutos || []);

        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        const limite = new Date(hoje); limite.setDate(limite.getDate() + DIAS_AVISO_VALIDADE);
        const vencidos: any[] = [], aVencer: any[] = [], emDia: any[] = [];
        for (const d of (data || [])) {
            const v = new Date(d.validade + 'T00:00:00');
            const dias = Math.round((v.getTime() - hoje.getTime()) / 86400000);
            const item = { ...d, dias };
            if (v < hoje) vencidos.push(item);
            else if (v <= limite) aVencer.push(item);
            else emDia.push(item);
        }
        return { vencidos: await this.comLinks(vencidos), aVencer: await this.comLinks(aVencer), emDia: await this.comLinks(emDia), diasAviso: DIAS_AVISO_VALIDADE };
    }

    /** Junta a cada documento um link assinado de 1 hora para ver/descarregar. */
    public static async comLinks<T extends { storage_path?: string | null }>(docs: T[]): Promise<(T & { url: string | null })[]> {
        return Promise.all(docs.map(async d => ({ ...d, url: d.storage_path ? await MediaUploadService.assinarDocumento(d.storage_path) : null })));
    }

    // ============================================================
    // PERMISSÕES POR ÁREA
    // ============================================================
    public static async areasPermitidas(empresaId: string, userId: string, role: string): Promise<string[] | null> {
        if (role === 'admin' || role === 'superadmin') return null; // tudo
        const { data } = await supabase.from('documentos_permissoes').select('area').eq('empresa_id', empresaId).eq('user_id', userId);
        if (!data || data.length === 0) return null; // sem restrições configuradas -> tudo (regra geral do sistema)
        return data.map((r: any) => r.area);
    }

    public static get areas(): readonly string[] { return AREAS; }

    // ============================================================
    // DOCUMENTOS GERADOS PELO SISTEMA (proformas, recibos, atas, declarações)
    // ============================================================
    public static async registarGerado(p: {
        empresaId: string | number | null | undefined; buffer: Buffer; nomeFicheiro: string; titulo: string; area: Area; tipo: string;
        entidade?: { tipo?: string; id?: string | number; nome: string }; resumo?: string; origemRef?: string;
    }) {
        if (!p.empresaId) return;
        try {
            if (!(await this.empresaTemModulo(String(p.empresaId)))) return;
            await this.receber({
                empresaId: String(p.empresaId), buffer: p.buffer, nomeFicheiro: p.nomeFicheiro, mimeType: 'application/pdf',
                origem: 'sistema', origemRef: p.origemRef, origemDetalhe: 'Gerado pelo sistema',
                preClassificado: { titulo: p.titulo, area: p.area, tipo: p.tipo, entidade: p.entidade, resumo: p.resumo }
            });
        } catch (e: any) {
            // Nunca pode fazer falhar a geração do PDF em si.
            console.error('[Documentos] Falha a registar documento gerado:', e.message);
        }
    }

    public static async empresaTemModulo(empresaId: string): Promise<boolean> {
        try {
            const { data: row } = await supabase.from('configuracoes').select('valor').eq('empresa_id', empresaId).eq('chave', 'modulos_empresa').maybeSingle();
            if (!row?.valor) return false;
            const modulos = JSON.parse(row.valor);
            return Array.isArray(modulos) && modulos.includes('documentos');
        } catch { return false; }
    }

    /** true = a IA arquiva sozinha o que lê com confiança; false (omissão) = tudo passa por "Por rever". */
    public static async validacaoAutomatica(empresaId: string): Promise<boolean> {
        try {
            const { data: row } = await supabase.from('configuracoes').select('valor').eq('empresa_id', empresaId).eq('chave', 'documentos_arquivo_automatico').maybeSingle();
            return row?.valor === 'true';
        } catch { return false; }
    }

    public static async capturaAtiva(empresaId: string, canal: 'email' | 'whatsapp'): Promise<boolean> {
        try {
            const { data: row } = await supabase.from('configuracoes').select('valor').eq('empresa_id', empresaId).eq('chave', `documentos_captura_${canal}`).maybeSingle();
            // Email liga-se por omissão (é o caso comum); WhatsApp só se pedido.
            if (!row) return canal === 'email';
            return row.valor !== 'false';
        } catch { return canal === 'email'; }
    }
}
