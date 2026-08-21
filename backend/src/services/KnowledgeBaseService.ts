import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;

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
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.txt' || ext === '.md') {
            return fs.readFileSync(filePath, 'utf8');
        }
        if (ext === '.pdf') {
            const pdfParse = require('pdf-parse');
            const data = await pdfParse(fs.readFileSync(filePath));
            return data.text || '';
        }
        throw new Error(`Tipo de ficheiro não suportado para indexação: ${ext}`);
    }

    public static chunkText(text: string, maxChars: number = CHUNK_SIZE, overlapChars: number = CHUNK_OVERLAP): string[] {
        const clean = text.replace(/\r\n/g, '\n').trim();
        if (!clean) return [];

        const chunks: string[] = [];
        let start = 0;
        while (start < clean.length) {
            const end = Math.min(start + maxChars, clean.length);
            const piece = clean.slice(start, end).trim();
            if (piece) chunks.push(piece);
            if (end === clean.length) break;
            start = end - overlapChars;
        }
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
        const texto = await this.extractTextFromFile(filePath);
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

    public static async search(empresaId: string, query: string, supabaseClient: SupabaseClient, topK: number = 5): Promise<KnowledgeSearchResult[]> {
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
        return data || [];
    }

    /** Busca e já formata o resultado como bloco de contexto pronto para injetar num prompt. */
    public static async searchAsContext(empresaId: string, query: string, supabaseClient: SupabaseClient, topK: number = 5): Promise<string> {
        const results = await this.search(empresaId, query, supabaseClient, topK);
        if (results.length === 0) return '';
        return results
            .map(r => `--- ${r.nome_ficheiro} (relevância ${(r.similarity * 100).toFixed(0)}%) ---\n${r.conteudo}`)
            .join('\n\n');
    }
}
