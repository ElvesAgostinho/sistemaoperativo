import { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import OpenAI from 'openai';
import { JitsiService } from './JitsiService';
import { AIGatewayService } from './AIGatewayService';

interface CriarReuniaoInput {
    empresa_id?: string | number | null;
    titulo: string;
    data_hora: string;
    emails_convidados?: string;
}

export class ReuniaoService {
    /**
     * Cria o registo de uma reunião com sala Jitsi (público, meet.jit.si) gerada.
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
     * A transcrição da reunião, a partir das partes gravadas (ver
     * gravadorSegmentado.ts no frontend).
     *
     * - "sala" é o som da CHAMADA, gravado pelo anfitrião: tem as vozes de
     *   quem está do outro lado. Nos minutos em que existe, o microfone dos
     *   convidados fica de fora — seriam as mesmas falas, duas vezes. Fora
     *   deles (ex: o anfitrião só ligou a gravação da chamada a meio), conta.
     * - As falas ficam pela hora REAL (a de início de cada parte, que vem no
     *   nome do ficheiro, mais o tempo dentro dela).
     * - O que o reconhecimento de voz marca como provável silêncio, ou repete
     *   em ciclo, sai.
     * - Uma frase do microfone do anfitrião igual a uma da chamada, à mesma
     *   hora, é eco da coluna do computador — sai a do microfone.
     *
     * Faz-se sempre com TODAS as partes: se o processamento falhar a meio e se
     * carregar outra vez em "Terminar", a ata sai inteira, e não só com o que
     * faltava.
     *
     * Devolve null se não houver nenhuma parte com fala — quem chama cai para
     * os fragmentos de voz do browser.
     */
    public static async gerarAtaAPartirDeGravacoes(reuniaoId: string, _supabaseClient: SupabaseClient, deps: { transcrever?: (buffer: Buffer, nome: string) => Promise<any>; ler?: (caminho: string) => Promise<Buffer | null> } = {}): Promise<string | null> {
        // O cliente de serviço: quem chama já confirmou que a reunião é da empresa.
        const { supabase: admin } = require('../lib/supabaseClient');
        const { data: gravacoes } = await admin
            .from('reunioes_gravacoes')
            .select('id, participante_nome, participante_tipo, ficheiro_path, criado_em')
            .eq('reuniao_id', reuniaoId);

        if (!gravacoes || gravacoes.length === 0) return null;

        const transcrever = deps.transcrever || (async (buffer: Buffer, nome: string) => {
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');
            const openai = new OpenAI({ apiKey });
            const { toFile } = require('openai');
            return openai.audio.transcriptions.create({
                file: await toFile(buffer, nome),
                model: 'whisper-1',
                language: 'pt',
                response_format: 'verbose_json',
            });
        });
        const ler = deps.ler || (async (caminho: string) => {
            if (String(caminho).startsWith('storage:')) {
                const { MediaUploadService } = require('./MediaUploadService');
                return MediaUploadService.descarregarDocumento(String(caminho).slice('storage:'.length));
            }
            return fs.existsSync(caminho) ? fs.readFileSync(caminho) : null;
        });

        const PARTE_MS = 4 * 60 * 1000;
        const inicioNoNome = (g: any): number | null => {
            const m = /_(\d{13})_(?:host|convidado|sala)\.[a-z0-9]+$/.exec(String(g.ficheiro_path));
            return m ? Number(m[1]) : null;
        };

        // Quem está do outro lado, se só houver um convidado com nome: as falas
        // da chamada ficam com o nome dele, em vez de "Participantes da chamada".
        const nomesConvidados = Array.from(new Set(gravacoes
            .filter((g: any) => g.participante_tipo === 'convidado')
            .map((g: any) => String(g.participante_nome || '').trim())
            .filter(Boolean)));
        const nomeDaSala = nomesConvidados.length === 1 ? nomesConvidados[0] : null;

        type Segmento = { t: number; nome: string; tipo: string; texto: string };
        type Parte = { tipo: string; inicio: number; fim: number; segmentos: Segmento[] };

        const tratar = async (g: any): Promise<Parte | null> => {
            try {
                const buffer = await ler(g.ficheiro_path);
                if (!buffer || !buffer.length) return null;
                const ext = /\.(mp4|m4a|ogg|webm|wav|mp3)$/i.exec(String(g.ficheiro_path))?.[1].toLowerCase() || 'webm';
                const r: any = await transcrever(buffer, `parte-${g.id}.${ext}`);
                const lista: any[] = Array.isArray(r?.segments) && r.segments.length
                    ? r.segments
                    : (r?.text ? [{ start: 0, end: Number(r?.duration) || 0, text: r.text }] : []);
                const duracao = Number(r?.duration) || Math.max(0, ...lista.map(s => Number(s.end) || 0));
                const inicio = inicioNoNome(g) ?? (new Date(g.criado_em).getTime() - duracao * 1000);
                const nome = g.participante_tipo === 'sala' && nomeDaSala ? nomeDaSala : g.participante_nome;
                const segmentos: Segmento[] = [];
                for (const s of lista) {
                    const texto = String(s.text || '').trim();
                    if (!texto) continue;
                    // Silêncio que o modelo "ouviu" como fala, ou texto em ciclo.
                    if (Number(s.no_speech_prob) > 0.6) continue;
                    if (Number(s.avg_logprob) < -1.2) continue;
                    if (Number(s.compression_ratio) > 2.4) continue;
                    segmentos.push({ t: inicio + (Number(s.start) || 0) * 1000, nome, tipo: g.participante_tipo, texto });
                }
                await admin.from('reunioes_gravacoes').update({ transcrito: true }).eq('id', g.id);
                return { tipo: g.participante_tipo, inicio, fim: inicio + duracao * 1000, segmentos };
            } catch (e: any) {
                console.error(`[ReuniaoService] Falha ao transcrever a parte ${g.id}:`, e?.message || e);
                return null;
            }
        };

        // Várias partes ao mesmo tempo (uma hora de reunião são ~30), mas sem
        // atirar todas de uma vez à API.
        const emParalelo = async (lista: any[]): Promise<Parte[]> => {
            const fila = [...lista];
            const feitas: Parte[] = [];
            await Promise.all(Array.from({ length: Math.min(6, fila.length) }, async () => {
                while (fila.length) {
                    const p = await tratar(fila.shift());
                    if (p) feitas.push(p);
                }
            }));
            return feitas;
        };

        // 1) O microfone do anfitrião e o som da chamada.
        const partes = await emParalelo(gravacoes.filter((g: any) => g.participante_tipo !== 'convidado'));

        // 2) Os minutos que o som da chamada cobre.
        const cobertura = partes.filter(p => p.tipo === 'sala').map(p => [p.inicio - 3000, p.fim + 3000]);
        const coberto = (t: number) => cobertura.some(([a, b]) => t >= a && t <= b);

        // 3) O microfone dos convidados, só para o que a chamada não apanhou.
        const convidados = gravacoes.filter((g: any) => {
            if (g.participante_tipo !== 'convidado') return false;
            const i = inicioNoNome(g);
            return i === null || !(coberto(i) && coberto(i + PARTE_MS));
        });
        for (const p of await emParalelo(convidados)) {
            partes.push({ ...p, segmentos: p.segmentos.filter(s => !coberto(s.t)) });
        }

        const segmentos = partes.flatMap(p => p.segmentos);

        // 4) Eco: a fala de quem está do outro lado, a sair da coluna do
        // anfitrião, entra também no microfone dele.
        const daSala = segmentos.filter(s => s.tipo === 'sala');
        if (daSala.length) {
            const palavras = (t: string) => new Set(t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[a-z0-9]{3,}/g) || []);
            const parecido = (a: string, b: string) => {
                const A = palavras(a), B = palavras(b);
                if (!A.size || !B.size) return false;
                let comuns = 0; A.forEach(p => { if (B.has(p)) comuns++; });
                return comuns / Math.min(A.size, B.size) >= 0.6;
            };
            for (let i = segmentos.length - 1; i >= 0; i--) {
                const s = segmentos[i];
                if (s.tipo !== 'host') continue;
                if (daSala.some(x => Math.abs(x.t - s.t) < 10000 && parecido(x.texto, s.texto))) segmentos.splice(i, 1);
            }
        }

        if (segmentos.length === 0) return null;

        segmentos.sort((a, b) => a.t - b.t);
        return segmentos.map(s => `[${s.nome}]: ${s.texto}`).join('\n');
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
        const systemPrompt = `
Você é o Agente IA de Reuniões do BusinessOS.
Recebeu a transcrição de uma reunião em vídeo.
Cada linha começa pelo nome de quem falou. "[Participantes da chamada]" são as outras pessoas na chamada (pode ser mais do que uma).
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

        const response = await AIGatewayService.chamarComFallback({
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
