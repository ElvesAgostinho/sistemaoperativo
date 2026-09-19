import OpenAI from 'openai';
import { supabase } from '../lib/supabaseClient';
import { AIGatewayService } from './AIGatewayService';

/**
 * =============================================================
 *  AI ROUTER INTELIGENTE
 *  Decide automaticamente qual IA usar baseado no tipo de tarefa:
 *
 *  SENSÍVEL     → Sempre o gateway self-hospedado - dados nunca saem para terceiros
 *  COMPLEXO     → OpenAI (análise profunda, geração avançada)
 *  SIMPLES      → Gateway self-hospedado primeiro → fallback OpenAI se falhar
 *  FALLBACK     → Se o gateway falhar em tarefa não-sensível → OpenAI
 *
 *  (Já não usa Ollama — o "local" abaixo é o gateway self-hospedado no VPS
 *  próprio, não um modelo a correr no mesmo processo do backend.)
 * =============================================================
 */

const SENSITIVE_KEYWORDS = ['bi', 'nif', 'niss', 'iban', 'salario', 'salário', 'banco', 'senha', 'password', 'token'];

type TaskType =
    | 'cv_analysis'         // Análise de CV
    | 'cv_ranking'          // Ranking de múltiplos CVs
    | 'contract_generation' // Geração de contratos
    | 'payroll_question'    // Perguntas sobre processamento salarial
    | 'employee_summary'    // Resumo de colaborador
    | 'chat_hr'             // Chat genérico de RH
    | 'performance_insight' // Análise de desempenho avançada
    | 'policy_drafting'     // Redigir políticas internas
    | 'simple_format';      // Formatar/simplificar texto

interface RouterDecision {
    ai: 'local' | 'openai';
    motivo: string;
    taskType: TaskType;
    isSensitive: boolean;
}

interface AIResult {
    texto: string;
    ai_usado: 'local' | 'openai';
    motivo_roteamento: string;
    duracao_ms: number;
    tokens?: number;
}

// ─── Regras do Router ─────────────────────────────────────────────────────────
const TASK_RULES: Record<TaskType, { forceLocal?: boolean; preferOpenAI?: boolean; sensitive?: boolean }> = {
    cv_analysis:         { preferOpenAI: false },   // IA local aguenta bem
    cv_ranking:          { preferOpenAI: true },    // Comparação de muitos CVs → OpenAI é mais preciso
    contract_generation: { preferOpenAI: true },    // Geração jurídica complexa → OpenAI
    payroll_question:    { forceLocal: true, sensitive: true }, // Dados salariais → NUNCA sai
    employee_summary:    { forceLocal: true, sensitive: true }, // BI, NIF → NUNCA sai
    chat_hr:             { preferOpenAI: false },   // Local primeiro
    performance_insight: { preferOpenAI: true },    // Análise profunda → OpenAI
    policy_drafting:     { preferOpenAI: true },    // Texto jurídico → OpenAI
    simple_format:       { forceLocal: true },      // Simples → sempre local
};

// ─── Detecção de Sensibilidade ─────────────────────────────────────────────────
function detectarSensibilidade(texto: string): boolean {
    const lower = texto.toLowerCase();
    return SENSITIVE_KEYWORDS.some(kw => lower.includes(kw));
}

// ─── Decisão do Router ─────────────────────────────────────────────────────────
function decidirAI(taskType: TaskType, contexto: string, modo: string): RouterDecision {
    const rules = TASK_RULES[taskType];
    const isSensitive = rules.sensitive || detectarSensibilidade(contexto);

    // Modo forçado via configuração
    if (modo === 'sempre_local') {
        return { ai: 'local', motivo: 'Modo forçado: sempre_local', taskType, isSensitive };
    }
    if (modo === 'sempre_openai' && !isSensitive) {
        return { ai: 'openai', motivo: 'Modo forçado: sempre_openai', taskType, isSensitive };
    }

    // Dados sensíveis → NUNCA OpenAI
    if (isSensitive || rules.forceLocal) {
        return {
            ai: 'local',
            motivo: isSensitive ? 'Dados sensíveis detectados — processamento local obrigatório' : 'Regra: tarefa forçada para IA local',
            taskType,
            isSensitive,
        };
    }

    // OpenAI preferido e disponível
    const openaiKey = process.env.OPENAI_API_KEY;
    if (rules.preferOpenAI && openaiKey) {
        return {
            ai: 'openai',
            motivo: 'Análise complexa — OpenAI selecionado para máxima qualidade',
            taskType,
            isSensitive,
        };
    }

    // Default: local
    return {
        ai: 'local',
        motivo: 'Tarefa simples — IA local suficiente',
        taskType,
        isSensitive,
    };
}

// ─── Chamada "Local" (gateway self-hospedado no VPS próprio) ────────────────
// Usa o ponto único AIGatewayService.chamar (propaga erro em vez de cair para a
// OpenAI sozinho — quem decide se pode ou não recorrer à OpenAI é o
// rotearEExecutar abaixo, com base em isSensitive).
async function chamarGateway(prompt: string, systemPrompt?: string): Promise<string> {
    const completion = await AIGatewayService.chamar({
        messages: [
            { role: 'system', content: systemPrompt || 'És um assistente especializado em Recursos Humanos, legislação laboral angolana e gestão empresarial. Responde sempre em Português de Angola.' },
            { role: 'user', content: prompt },
        ]
    });

    return completion.choices[0]?.message?.content || '';
}

// ─── Chamada OpenAI ────────────────────────────────────────────────────────────
async function chamarOpenAI(prompt: string, systemPrompt?: string): Promise<{ texto: string; tokens: number }> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY não configurada');

    const client = new OpenAI({ apiKey: key });
    const modelo = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const completion = await client.chat.completions.create({
        model: modelo,
        messages: [
            { role: 'system', content: systemPrompt || 'És um assistente especializado em Recursos Humanos, legislação laboral angolana e gestão empresarial. Responde sempre em Português de Angola.' },
            { role: 'user', content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.3,
    });

    return {
        texto: completion.choices[0]?.message?.content || '',
        tokens: completion.usage?.total_tokens || 0,
    };
}

// ─── Método Principal: Rotear e Executar ──────────────────────────────────────
export async function rotearEExecutar(
    taskType: TaskType,
    prompt: string,
    contexto: string = '',
    userId?: string,
): Promise<AIResult> {
    const modo = process.env.AI_ROUTER_MODE || 'inteligente';
    const decisao = decidirAI(taskType, contexto, modo);
    const inicio = Date.now();

    let texto = '';
    let aiUsado: 'local' | 'openai' = decisao.ai;
    let tokens: number | undefined;
    let erro: string | undefined;
    let sucesso = true;

    try {
        if (decisao.ai === 'openai') {
            const result = await chamarOpenAI(prompt);
            texto = result.texto;
            tokens = result.tokens;
        } else {
            // Tentar o gateway self-hospedado
            try {
                texto = await chamarGateway(prompt);
            } catch (localErr: any) {
                // Fallback → OpenAI se não for sensível e key existir
                if (!decisao.isSensitive && process.env.OPENAI_API_KEY) {
                    console.warn(`[AIRouter] Gateway falhou (${localErr.message}), a usar fallback OpenAI...`);
                    aiUsado = 'openai';
                    const result = await chamarOpenAI(prompt);
                    texto = result.texto;
                    tokens = result.tokens;
                } else {
                    throw localErr; // Sensível → propagar erro, não usar OpenAI
                }
            }
        }
    } catch (err: any) {
        sucesso = false;
        erro = err.message;
        texto = `⚠️ Erro no processamento IA: ${err.message}`;
    }

    const duracao = Date.now() - inicio;

    // Registar log no Supabase (async, não bloqueante)
    supabase.from('ai_router_logs').insert({
        user_id: userId || null,
        task_type: taskType,
        ai_usado: aiUsado,
        motivo: decisao.motivo,
        tokens_usados: tokens,
        duracao_ms: duracao,
        sucesso,
        erro,
    }).then(() => {}, () => {}); // fire-and-forget

    return {
        texto,
        ai_usado: aiUsado,
        motivo_roteamento: decisao.motivo,
        duracao_ms: duracao,
        tokens,
    };
}

// ─── Exports de conveniência ───────────────────────────────────────────────────
export { TaskType, RouterDecision, AIResult };
