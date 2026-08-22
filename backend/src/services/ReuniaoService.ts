import { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import OpenAI from 'openai';
import { DailyService } from './DailyService';

interface CriarReuniaoInput {
    empresa_id?: string | number | null;
    titulo: string;
    data_hora: string;
    emails_convidados?: string;
}

export class ReuniaoService {
    /**
     * Cria o registo de uma reunião com sala Daily.co gerada (privada, gravação em
     * nuvem automática). Ponto único de criação usado tanto pela rota REST
     * (reunioesController) quanto pela tool de IA (AIToolsService), para evitar que
     * a fórmula de roomName/link divirja entre os dois lugares.
     */
    public static async criarReuniaoRegistro(dados: CriarReuniaoInput, supabaseClient: SupabaseClient) {
        const nomeInterno = `businessos-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        const { roomName, url } = await DailyService.criarSala(nomeInterno);

        const { data: info, error } = await supabaseClient.from('reunioes').insert({
            empresa_id: dados.empresa_id || null,
            titulo: dados.titulo,
            data_hora: dados.data_hora,
            link_jitsi: url,
            daily_room_name: roomName,
            gravacao_estado: 'pendente',
            emails_convidados: dados.emails_convidados || '',
            estado: 'Agendada'
        }).select('id').single();

        if (error) throw error;

        return { id: info.id as string, roomName, linkJitsi: url };
    }

    /**
     * Chamada a OpenAI que transforma uma transcrição (bruta) em resumo executivo +
     * pontos altos/baixos + recomendações + tarefas, e grava tudo em `reunioes`/
     * `reunioes_tarefas`. Extraído do antigo `processarTranscricao` para ser
     * partilhado entre o botão manual "Terminar Reunião" (transcrição por
     * fragmentos do browser) e o webhook de gravação da Daily (transcrição real via
     * Whisper) — ambos alimentam a mesma lógica, só muda a origem do texto.
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
