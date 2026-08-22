import { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import OpenAI from 'openai';
import { JitsiService } from './JitsiService';

interface CriarReuniaoInput {
    empresa_id?: string | number | null;
    titulo: string;
    data_hora: string;
    emails_convidados?: string;
}

export class ReuniaoService {
    /**
     * Cria o registo de uma reunião com sala Jitsi (auto-hospedado no VPS) gerada.
     * Ponto único de criação usado tanto pela rota REST (reunioesController) quanto
     * pela tool de IA (AIToolsService), para evitar que a fórmula de roomName/link
     * divirja entre os dois lugares.
     */
    public static async criarReuniaoRegistro(dados: CriarReuniaoInput, supabaseClient: SupabaseClient) {
        const nomeInterno = `businessos-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        const { roomName, url } = JitsiService.criarSala(nomeInterno);

        const { data: info, error } = await supabaseClient.from('reunioes').insert({
            empresa_id: dados.empresa_id || null,
            titulo: dados.titulo,
            data_hora: dados.data_hora,
            link_jitsi: url,
            jitsi_room_name: roomName,
            emails_convidados: dados.emails_convidados || '',
            estado: 'Agendada'
        }).select('id').single();

        if (error) throw error;

        return { id: info.id as string, roomName, linkJitsi: url };
    }

    /**
     * Transcreve todas as gravações de áudio ainda por processar desta reunião
     * (uma por participante, ver reunioes_gravacoes / receberGravacao em
     * reunioesPublicController.ts) com o Whisper da OpenAI, e junta tudo por ordem
     * cronológica de fala entre participantes diferentes (usa os timestamps por
     * segmento do `verbose_json`, não só a ordem de upload). Marca cada gravação
     * como transcrita para nunca voltar a pagar Whisper sobre o mesmo ficheiro se
     * "Terminar Reunião" for clicado mais que uma vez.
     *
     * Devolve null se não houver nenhuma gravação de áudio (ex: falha de upload em
     * todos os participantes) — quem chama deve cair para o fallback dos
     * fragmentos de voz do browser nesse caso.
     */
    public static async gerarAtaAPartirDeGravacoes(reuniaoId: string, supabaseClient: SupabaseClient): Promise<string | null> {
        const { data: gravacoes } = await supabaseClient
            .from('reunioes_gravacoes')
            .select('id, participante_nome, ficheiro_path')
            .eq('reuniao_id', reuniaoId)
            .eq('transcrito', false);

        if (!gravacoes || gravacoes.length === 0) return null;

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');
        const openai = new OpenAI({ apiKey });

        type Segmento = { inicio: number; nome: string; texto: string };
        const segmentos: Segmento[] = [];

        for (const g of gravacoes) {
            if (!fs.existsSync(g.ficheiro_path)) continue;
            try {
                const resultado: any = await openai.audio.transcriptions.create({
                    file: fs.createReadStream(g.ficheiro_path),
                    model: 'whisper-1',
                    language: 'pt',
                    response_format: 'verbose_json'
                });

                const segs = resultado.segments || [];
                if (segs.length > 0) {
                    for (const s of segs) {
                        segmentos.push({ inicio: s.start || 0, nome: g.participante_nome, texto: (s.text || '').trim() });
                    }
                } else if (resultado.text) {
                    segmentos.push({ inicio: 0, nome: g.participante_nome, texto: String(resultado.text).trim() });
                }

                await supabaseClient.from('reunioes_gravacoes').update({ transcrito: true }).eq('id', g.id);
            } catch (e) {
                console.error(`[ReuniaoService] Falha ao transcrever gravação ${g.id}:`, e);
            }
        }

        if (segmentos.length === 0) return null;

        segmentos.sort((a, b) => a.inicio - b.inicio);
        return segmentos
            .filter(s => s.texto)
            .map(s => `[${s.nome}]: ${s.texto}`)
            .join('\n');
    }

    /**
     * Chamada a OpenAI que transforma uma transcrição (bruta) em resumo executivo +
     * pontos altos/baixos + recomendações + tarefas, e grava tudo em `reunioes`/
     * `reunioes_tarefas`. Agnóstica de onde veio a transcrição (gravações reais via
     * Whisper, ou o fallback de fragmentos de voz do browser) — chamada tanto pelo
     * botão manual "Terminar Reunião" quanto por qualquer futuro gatilho automático.
     */
    public static async gerarResumoIA(transcricao: string, reuniaoId: string, supabaseClient: SupabaseClient): Promise<{
        resumo: string;
        pontos_altos: string[];
        pontos_baixos: string[];
        recomendacoes: string[];
        tarefas: Array<{ descricao: string; responsavel?: string; prazo?: string }>;
    }> {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');

        const openai = new OpenAI({ apiKey });

        const systemPrompt = `
Você é o Agente IA de Reuniões do BusinessOS.
Recebeu a transcrição de uma reunião em vídeo.
A sua tarefa é:
1. Fazer um resumo executivo bem estruturado.
2. Identificar os "pontos_altos" (sucessos, boas notícias).
3. Identificar os "pontos_baixos" (desafios, problemas, alertas).
4. Extrair as "recomendacoes" ou sugestões que foram explicitamente mencionadas ou debatidas pelas pessoas durante a reunião (não invente conselhos, reporte apenas o que foi aconselhado na reunião).
5. Extrair todas as tarefas mencionadas, com responsavel (se não houver, escreva 'Não definido') e prazo (se não houver, 'Sem prazo').

Responda EXATAMENTE neste formato JSON:
{
  "resumo": "Resumo executivo...",
  "pontos_altos": ["Ponto 1", "Ponto 2"],
  "pontos_baixos": ["Ponto 1"],
  "recomendacoes": ["Rec 1", "Rec 2"],
  "tarefas": [
    { "descricao": "Fazer X", "responsavel": "João", "prazo": "Amanhã" }
  ]
}
`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Transcrição da reunião:\n\n${transcricao}` }
            ],
            response_format: { type: "json_object" }
        });

        const outputMsg = response.choices[0].message?.content;
        if (!outputMsg) throw new Error("A IA não retornou um resumo válido.");

        const jsonOut = JSON.parse(outputMsg);

        await supabaseClient.from('reunioes').update({
            resumo_ia: jsonOut.resumo,
            pontos_altos: JSON.stringify(jsonOut.pontos_altos || []),
            pontos_baixos: JSON.stringify(jsonOut.pontos_baixos || []),
            recomendacoes: JSON.stringify(jsonOut.recomendacoes || [])
        }).eq('id', reuniaoId);

        const tarefasArr = jsonOut.tarefas || [];
        for (const t of tarefasArr) {
            await supabaseClient.from('reunioes_tarefas').insert({
                reuniao_id: reuniaoId,
                descricao: t.descricao,
                responsavel: t.responsavel || 'Não definido',
                prazo: t.prazo || 'Sem prazo'
            });
        }

        return {
            resumo: jsonOut.resumo,
            pontos_altos: jsonOut.pontos_altos || [],
            pontos_baixos: jsonOut.pontos_baixos || [],
            recomendacoes: jsonOut.recomendacoes || [],
            tarefas: tarefasArr
        };
    }
}
