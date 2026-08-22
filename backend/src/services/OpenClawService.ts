import OpenAI from 'openai';

function criarClienteOpenClaw(): OpenAI {
    const vpsUrl = process.env.OPENCLAW_VPS_URL || 'http://187.124.218.242';
    const ip = vpsUrl.replace(/^https?:\/\//, '').split(':')[0];
    return new OpenAI({
        baseURL: process.env.OPENAI_BASE_URL || `http://${ip}:18789/v1`,
        apiKey: process.env.OPENCLAW_API_KEY || process.env.OPENAI_API_KEY || 'admin123'
    });
}

/**
 * Ponto único de chamada ao OpenClaw (self-hospedado, mais barato que pagar
 * tokens da OpenAI a cada pedido) — usado por todos os caminhos que geram
 * texto com IA: o Assistente interno, o fallback de IA do WhatsApp, o nó
 * "Responder com IA" do Autopilot, e o AIRouterService (RH/folha salarial).
 */
export class OpenClawService {
    /**
     * Chama só o OpenClaw — propaga o erro se falhar, sem cair para a OpenAI.
     * Usar quando quem chama tem regras próprias sobre se pode ou não usar a
     * OpenAI como reserva (ex: AIRouterService, que nunca deixa dados
     * sensíveis como BI/NIF/salário saírem para a OpenAI).
     */
    public static async chamar(messages: any[], tools?: any[]): Promise<any> {
        return criarClienteOpenClaw().chat.completions.create({
            model: 'openclaw/default',
            messages,
            ...(tools ? { tools } : {})
        });
    }

    /**
     * OpenClaw primeiro, OpenAI como reserva automática se o OpenClaw falhar
     * (ex: VPS em baixo). Nunca fica sem resposta — regista um aviso sempre
     * que precisa de usar a reserva.
     */
    public static async chamarComFallback(messages: any[], tools?: any[], modeloOpenAI = 'gpt-4o-mini'): Promise<any> {
        try {
            return await this.chamar(messages, tools);
        } catch (e: any) {
            console.warn(`[OpenClawService] OpenClaw indisponível, a usar OpenAI como reserva: ${e?.message || e}`);
        }

        const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        return await openaiClient.chat.completions.create({
            model: modeloOpenAI,
            messages,
            ...(tools ? { tools } : {})
        });
    }
}
