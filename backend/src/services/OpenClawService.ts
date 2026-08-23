import OpenAI from 'openai';

function criarClienteOpenClaw(): OpenAI {
    // OPENCLAW_VPS_URL já deve incluir a porta certa (ex: http://IP:4000 para o
    // LiteLLM) — antes esta função ignorava a porta do URL e usava sempre
    // :18789 (a porta antiga do OpenClaw), o que partiria silenciosamente
    // assim que o serviço mudasse de porta.
    const vpsUrl = process.env.OPENCLAW_VPS_URL || 'http://187.124.218.242:18789';
    const baseUrl = vpsUrl.replace(/\/$/, '');
    return new OpenAI({
        baseURL: process.env.OPENAI_BASE_URL || `${baseUrl}/v1`,
        apiKey: process.env.OPENCLAW_API_KEY || process.env.OPENAI_API_KEY || 'admin123'
    });
}

interface ChatParams {
    messages: any[];
    tools?: any[];
    response_format?: any;
    temperature?: number;
}

/**
 * Ponto único de chamada a um gateway de IA self-hospedado no VPS (endpoint
 * compatível com a API da OpenAI — hoje LiteLLM, depois de o OpenClaw se ter
 * revelado pouco fiável para este uso), mais barato que pagar tokens da
 * OpenAI a cada pedido — usado por todos os caminhos que geram texto com IA:
 * o Assistente interno, o fallback de IA do WhatsApp, o nó "Responder com
 * IA" do Autopilot, a classificação/resumo de grupos de WhatsApp, e o
 * AIRouterService (RH/folha salarial). O modelo continua a chamar-se
 * "openclaw/default" só para não obrigar a mudar todos os pontos de
 * chamada — no LiteLLM isso é apenas um apelido (alias) para o modelo real
 * configurado (ver config.yaml no VPS).
 */
export class OpenClawService {
    /**
     * Chama só o OpenClaw — propaga o erro se falhar, sem cair para a OpenAI.
     * Usar quando quem chama tem regras próprias sobre se pode ou não usar a
     * OpenAI como reserva (ex: AIRouterService, que nunca deixa dados
     * sensíveis como BI/NIF/salário saírem para a OpenAI).
     */
    public static async chamar(params: ChatParams): Promise<any> {
        return criarClienteOpenClaw().chat.completions.create({
            model: 'openclaw/default',
            messages: params.messages,
            ...(params.tools ? { tools: params.tools } : {}),
            ...(params.response_format ? { response_format: params.response_format } : {}),
            ...(params.temperature !== undefined ? { temperature: params.temperature } : {})
        } as any);
    }

    /**
     * OpenClaw primeiro, OpenAI como reserva automática se o OpenClaw falhar
     * (ex: VPS em baixo). Nunca fica sem resposta — regista um aviso sempre
     * que precisa de usar a reserva.
     */
    public static async chamarComFallback(params: ChatParams, modeloOpenAI = 'gpt-4o-mini'): Promise<any> {
        try {
            return await this.chamar(params);
        } catch (e: any) {
            console.warn(`[OpenClawService] OpenClaw indisponível, a usar OpenAI como reserva: ${e?.message || e}`);
        }

        const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        return await openaiClient.chat.completions.create({
            model: modeloOpenAI,
            messages: params.messages,
            ...(params.tools ? { tools: params.tools } : {}),
            ...(params.response_format ? { response_format: params.response_format } : {}),
            ...(params.temperature !== undefined ? { temperature: params.temperature } : {})
        } as any);
    }
}
