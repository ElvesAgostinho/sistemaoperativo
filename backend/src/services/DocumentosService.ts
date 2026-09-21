import crypto from 'crypto';
import { supabase } from '../lib/supabaseClient';
import { MediaUploadService } from './MediaUploadService';
import { DocumentoIAService, AREAS, Area, AnaliseDocumento } from './DocumentoIAService';
import { KnowledgeBaseService } from './KnowledgeBaseService';

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

        // Nome com prefixo aleatório: o bucket é público por link, portanto o
        // link não pode ser adivinhável a partir do nome do ficheiro.
        const token = crypto.randomBytes(6).toString('hex');
        const guardado = await MediaUploadService.upload(e.buffer, `${token}_${e.nomeFicheiro}`, e.mimeType, 'documentos', e.empresaId);

        const pre = e.preClassificado;
        const { data, error } = await supabase.from('documentos').insert({
            empresa_id: e.empresaId,
            titulo: pre?.titulo || e.nomeFicheiro,
            nome_ficheiro: e.nomeFicheiro,
            url: guardado.url,
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
            criado_por: e.criadoPor || null
        }).select('id, estado').single();
        if (error) throw error;

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
            const res = await fetch(doc.url);
            if (!res.ok) throw new Error(`Não foi possível ler o ficheiro guardado (HTTP ${res.status}).`);
            const buffer = Buffer.from(await res.arrayBuffer());

            const analise = await DocumentoIAService.analisar(buffer, doc.mime_type || 'application/octet-stream', doc.nome_ficheiro);

            if (!analise.e_documento) {
                await supabase.from('documentos').update({
                    estado: 'por_rever', titulo: analise.titulo, resumo: analise.resumo || 'A IA não reconheceu isto como um documento da empresa.',
                    confianca: analise.confianca, texto: analise.texto.slice(0, 20000), atualizado_em: new Date().toISOString()
                }).eq('id', doc.id);
                return;
            }

            const ligacao = await this.ligarEntidade(doc.empresa_id, analise.entidade);
            const arquivaSozinho = analise.confianca >= CONFIANCA_MINIMA;

            await supabase.from('documentos').update({
                titulo: analise.titulo,
                area: analise.area,
                tipo: analise.tipo,
                resumo: analise.resumo,
                texto: analise.texto.slice(0, 200000),
                campos: analise.campos,
                data_documento: analise.data_documento,
                validade: analise.validade,
                entidade_tipo: ligacao?.tipo || null,
                entidade_id: ligacao?.id || null,
                entidade_nome: ligacao?.nome || analise.entidade.nome,
                confianca: analise.confianca,
                estado: arquivaSozinho ? 'arquivado' : 'por_rever',
                erro: null,
                atualizado_em: new Date().toISOString()
            }).eq('id', doc.id);

            await this.indexarChunks(doc.empresa_id, doc.id, analise.texto);
        } catch (e: any) {
            console.error(`[Documentos] Falha a processar ${doc.nome_ficheiro}:`, e.message);
            await supabase.from('documentos').update({ estado: 'erro', erro: String(e.message).slice(0, 500), atualizado_em: new Date().toISOString() }).eq('id', doc.id);
        }
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

    public static async pesquisar(empresaId: string, pergunta: string, areasPermitidas: string[] | null) {
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
        if (porDoc.size === 0) return { documentos: [], resposta: null };

        let q = supabase.from('documentos').select('id, titulo, area, tipo, resumo, entidade_nome, validade, data_documento, url, nome_ficheiro, campos')
            .eq('empresa_id', empresaId).in('id', Array.from(porDoc.keys())).neq('estado', 'descartado');
        if (areasPermitidas) q = q.in('area', areasPermitidas);
        const { data: docs } = await q;

        const documentos = (docs || [])
            .map((d: any) => ({ ...d, relevancia: porDoc.get(d.id)!.similarity, excertos: porDoc.get(d.id)!.excertos }))
            .sort((a: any, b: any) => b.relevancia - a.relevancia)
            .slice(0, 6);

        const resposta = documentos.length > 0 ? await this.responderComDocumentos(pergunta, documentos) : null;
        return { documentos, resposta };
    }

    private static async responderComDocumentos(pergunta: string, documentos: any[]): Promise<string | null> {
        try {
            const { AIGatewayService } = require('./AIGatewayService');
            const contexto = documentos.map((d, i) =>
                `[Documento ${i + 1}: "${d.titulo}" — ${d.tipo || 'documento'}, área ${d.area}${d.entidade_nome ? `, de ${d.entidade_nome}` : ''}${d.validade ? `, válido até ${d.validade}` : ''}]\n${d.excertos.join('\n...\n')}`
            ).join('\n\n');
            const r = await AIGatewayService.chamarComFallback({
                temperature: 0,
                messages: [
                    { role: 'system', content: `És o arquivista da empresa. Respondes à pergunta usando SÓ os documentos abaixo. Cita o documento pelo título quando usares informação dele (ex: "segundo a Fatura Unitel nº 118..."). Se os documentos não respondem, diz isso claramente em vez de inventar. Português de Angola, direto, no máximo 4 frases.\n\n${contexto}` },
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
    public static async conformidade(empresaId: string, areasPermitidas: string[] | null) {
        let q = supabase.from('documentos').select('id, titulo, area, tipo, entidade_nome, entidade_tipo, validade, url')
            .eq('empresa_id', empresaId).eq('estado', 'arquivado').not('validade', 'is', null).order('validade', { ascending: true });
        if (areasPermitidas) q = q.in('area', areasPermitidas);
        const { data } = await q;

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
        return { vencidos, aVencer, emDia, diasAviso: DIAS_AVISO_VALIDADE };
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

    public static async capturaAtiva(empresaId: string, canal: 'email' | 'whatsapp'): Promise<boolean> {
        try {
            const { data: row } = await supabase.from('configuracoes').select('valor').eq('empresa_id', empresaId).eq('chave', `documentos_captura_${canal}`).maybeSingle();
            // Email liga-se por omissão (é o caso comum); WhatsApp só se pedido.
            if (!row) return canal === 'email';
            return row.valor !== 'false';
        } catch { return canal === 'email'; }
    }
}
