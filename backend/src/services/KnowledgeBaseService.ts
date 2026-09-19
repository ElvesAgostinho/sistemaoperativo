import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;

// Quantos excertos ir buscar por pergunta. Mais do que isto começa a encher o
// prompt de texto pouco relacionado, o que faz o modelo divagar.
const TOP_K = 6;

// Abaixo desta semelhança, o excerto é tratado como "não tem que ver com a
// pergunta". Serve para distinguir "a base de conhecimento não fala disto" de
// "isto é o mais parecido que existe lá dentro".
const MIN_SIMILARITY = 0.25;

export interface KnowledgeSearchResult {
    nome_ficheiro: string;
    conteudo: string;
    similarity: number;
}

/**
 * Serviço central de RAG para a Base de Conhecimento: extrai texto dos
 * ficheiros já geridos por knowledgeRoutes.ts (que continuam em disco, sem
 * mudanças), fatia, gera embeddings e indexa em `knowledge_chunks` (pgvector).
 * Os embeddings usam a API da OpenAI diretamente (OPENAI_API_KEY), não o
 * OpenClaw — o OpenClaw é usado só para as conversas de chat.
 */
export class KnowledgeBaseService {
    private static getOpenAIClient(): OpenAI {
        return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }

    public static async extractTextFromFile(filePath: string): Promise<string> {
        return this.extractText(fs.readFileSync(filePath), filePath);
    }

    /** Extrai o texto diretamente do conteúdo, sem precisar que o ficheiro esteja em disco. */
    public static async extractText(buffer: Buffer, nomeFicheiro: string): Promise<string> {
        const ext = path.extname(nomeFicheiro).toLowerCase();
        if (ext === '.txt' || ext === '.md') {
            return buffer.toString('utf8');
        }
        if (ext === '.pdf') {
            const pdfParse = require('pdf-parse');
            const data = await pdfParse(buffer);
            return data.text || '';
        }
        throw new Error(`Tipo de ficheiro não suportado para indexação: ${ext}`);
    }

    /**
     * Corta o texto em pedaços respeitando as fronteiras naturais: primeiro
     * tenta separar por parágrafos, depois por frases, e só corta a meio de uma
     * frase quando ela sozinha já é maior do que o limite.
     *
     * O corte anterior era puramente por número de caracteres, o que partia
     * frases (e até palavras) a meio. Um pedaço que começa a meio de uma frase
     * descreve mal o seu próprio conteúdo, portanto o embedding fica pior e a
     * busca falha — e, mesmo quando é encontrado, chega truncado ao modelo.
     */
    public static chunkText(text: string, maxChars: number = CHUNK_SIZE, overlapChars: number = CHUNK_OVERLAP): string[] {
        const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        if (!clean) return [];

        // Unidades indivisíveis: parágrafos; se um parágrafo for grande demais,
        // desce-se a frases; se uma frase for grande demais, corta-se à força.
        const unidades: string[] = [];
        for (const paragrafo of clean.split(/\n\s*\n/)) {
            const p = paragrafo.trim();
            if (!p) continue;
            if (p.length <= maxChars) { unidades.push(p); continue; }

            for (const frase of p.split(/(?<=[.!?])\s+/)) {
                const f = frase.trim();
                if (!f) continue;
                if (f.length <= maxChars) { unidades.push(f); continue; }
                for (let i = 0; i < f.length; i += maxChars) unidades.push(f.slice(i, i + maxChars));
            }
        }

        // Junta unidades até encher o pedaço, repetindo o final do anterior
        // (overlap) para não perder contexto que fique em cima da fronteira.
        const chunks: string[] = [];
        let atual = '';
        for (const u of unidades) {
            if (atual && atual.length + u.length + 2 > maxChars) {
                chunks.push(atual);
                const cauda = atual.slice(-overlapChars);
                const inicioFrase = cauda.search(/(?<=[.!?])\s+/);
                const sobreposicao = (inicioFrase >= 0 ? cauda.slice(inicioFrase).trim() : cauda.trim());
                // A sobreposição só entra se couber: quando a própria unidade já
                // enche o pedaço (ex: uma frase enorme cortada à força), juntar-lhe
                // a cauda do pedaço anterior punha o resultado acima do limite.
                atual = (sobreposicao && sobreposicao.length + u.length + 2 <= maxChars)
                    ? `${sobreposicao}\n\n${u}`
                    : u;
            } else {
                atual = atual ? `${atual}\n\n${u}` : u;
            }
        }
        if (atual.trim()) chunks.push(atual.trim());
        return chunks;
    }

    public static async embedText(text: string): Promise<number[]> {
        const client = this.getOpenAIClient();
        const response = await client.embeddings.create({ model: EMBEDDING_MODEL, input: text });
        return response.data[0].embedding;
    }

    /**
     * Extrai, fateia, gera embeddings e (re)indexa um ficheiro — idempotente:
     * remove os chunks antigos desse ficheiro antes de inserir os novos, para
     * poder ser chamado de novo em caso de reupload sem duplicar dados.
     */
    public static async indexFile(empresaId: string, nomeFicheiro: string, filePath: string, supabaseClient: SupabaseClient): Promise<{ chunks: number }> {
        return this.indexBuffer(empresaId, nomeFicheiro, fs.readFileSync(filePath), supabaseClient);
    }

    public static async indexBuffer(empresaId: string, nomeFicheiro: string, buffer: Buffer, supabaseClient: SupabaseClient): Promise<{ chunks: number }> {
        const texto = await this.extractText(buffer, nomeFicheiro);
        const chunks = this.chunkText(texto);

        await this.deleteFileChunks(empresaId, nomeFicheiro, supabaseClient);
        if (chunks.length === 0) return { chunks: 0 };

        const rows = [];
        for (let i = 0; i < chunks.length; i++) {
            const embedding = await this.embedText(chunks[i]);
            rows.push({
                empresa_id: empresaId,
                nome_ficheiro: nomeFicheiro,
                chunk_index: i,
                conteudo: chunks[i],
                embedding
            });
        }

        const { error } = await supabaseClient.from('knowledge_chunks').insert(rows);
        if (error) throw error;

        return { chunks: rows.length };
    }

    public static async deleteFileChunks(empresaId: string, nomeFicheiro: string, supabaseClient: SupabaseClient): Promise<void> {
        await supabaseClient.from('knowledge_chunks').delete().eq('empresa_id', empresaId).eq('nome_ficheiro', nomeFicheiro);
    }

    /**
     * O que está mesmo indexado, ou seja, o que a IA consegue mesmo usar.
     * É esta a lista que interessa mostrar ao utilizador — não a de ficheiros
     * em disco, que pode estar dessincronizada (e esteve: os ficheiros
     * desapareciam num redeploy e os trechos indexados ficavam órfãos).
     */
    public static async listarIndexados(empresaId: string, supabaseClient: SupabaseClient): Promise<{ nome: string; chunks: number }[]> {
        const { data, error } = await supabaseClient.from('knowledge_chunks')
            .select('nome_ficheiro').eq('empresa_id', empresaId);
        if (error) {
            console.error('[KnowledgeBaseService] Erro ao listar indexados:', error);
            return [];
        }
        const contagem = new Map<string, number>();
        for (const r of (data || [])) contagem.set(r.nome_ficheiro, (contagem.get(r.nome_ficheiro) || 0) + 1);
        return Array.from(contagem.entries())
            .map(([nome, chunks]) => ({ nome, chunks }))
            .sort((a, b) => a.nome.localeCompare(b.nome));
    }

    public static async search(empresaId: string, query: string, supabaseClient: SupabaseClient, topK: number = TOP_K): Promise<KnowledgeSearchResult[]> {
        if (!query || !query.trim()) return [];

        const embedding = await this.embedText(query);
        const { data, error } = await supabaseClient.rpc('match_knowledge_chunks', {
            query_embedding: embedding,
            match_empresa_id: empresaId,
            match_count: topK
        });

        if (error) {
            console.error('[KnowledgeBaseService] Erro na busca semântica:', error);
            return [];
        }

        // A busca por vetores devolve SEMPRE os mais próximos, mesmo que nada
        // tenha que ver com a pergunta — "o menos mau" continua a ser devolvido.
        // Sem este corte, uma pergunta fora do âmbito recebia na mesma pedaços
        // de texto aleatórios como se fossem resposta.
        const relevantes = (data || []).filter((r: KnowledgeSearchResult) => r.similarity >= MIN_SIMILARITY);
        if ((data || []).length > 0 && relevantes.length === 0) {
            console.log(`[KnowledgeBase] "${query.slice(0, 60)}" — ${data.length} resultado(s) abaixo do limiar (melhor: ${(data[0].similarity * 100).toFixed(0)}%). Tratado como sem informação.`);
        }
        return relevantes;
    }

    /** Busca e já formata o resultado como bloco de contexto pronto para injetar num prompt. */
    public static async searchAsContext(empresaId: string, query: string, supabaseClient: SupabaseClient, topK: number = TOP_K): Promise<string> {
        const results = await this.search(empresaId, query, supabaseClient, topK);
        if (results.length === 0) return '';
        return results
            .map((r, i) => `[Excerto ${i + 1} — de "${r.nome_ficheiro}"]\n${r.conteudo}`)
            .join('\n\n');
    }
}
