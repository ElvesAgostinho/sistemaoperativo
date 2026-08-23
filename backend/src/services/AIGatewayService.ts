import OpenAI from 'openai';

function criarClienteGateway(): OpenAI {
    // AI_GATEWAY_URL já deve incluir a porta certa (ex: http://IP:4000 para o
    // LiteLLM, que corre no VPS próprio).
    const gatewayUrl = process.env.AI_GATEWAY_URL || 'http://187.124.218.242:4000';
    const baseUrl = gatewayUrl.replace(/\/$/, '');
    return new OpenAI({
        baseURL: process.env.OPENAI_BASE_URL || `${baseUrl}/v1`,
        apiKey: process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY || ''
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
 * compatível com a API da OpenAI — hoje LiteLLM), mais barato que pagar
 * tokens da OpenAI a cada pedido — usado por todos os caminhos que geram
 * texto com IA: o Assistente interno, o fallback de IA do WhatsApp, o nó
 * "Responder com IA" do Autopilot, a classificação/resumo de grupos de
 * WhatsApp, e o AIRouterService (RH/folha salarial). O nome do modelo
 * ("ai-gateway/default") é só um apelido (alias) configurado no
 * config.yaml do LiteLLM, que aponta para o modelo real por baixo.
 */
export class AIGatewayService {
    /**
     * Chama só o gateway self-hospedado — propaga o erro se falhar, sem cair
     * para a OpenAI. Usar quando quem chama tem regras próprias sobre se pode
     * ou não usar a OpenAI como reserva (ex: AIRouterService, que nunca deixa
     * dados sensíveis como BI/NIF/salário saírem para a OpenAI).
     */
    public static async chamar(params: ChatParams): Promise<any> {
        return criarClienteGateway().chat.completions.create({
            model: 'ai-gateway/default',
            messages: params.messages,
            ...(params.tools ? { tools: params.tools } : {}),
            ...(params.response_format ? { response_format: params.response_format } : {}),
            ...(params.temperature !== undefined ? { temperature: params.temperature } : {})
        } as any);
    }

    /**
     * Gateway self-hospedado primeiro, OpenAI como reserva automática se
     * falhar (ex: VPS em baixo). Nunca fica sem resposta — regista um aviso
     * sempre que precisa de usar a reserva.
     */
    public static async chamarComFallback(params: ChatParams, modeloOpenAI = 'gpt-4o-mini'): Promise<any> {
        try {
            return await this.chamar(params);
        } catch (e: any) {
            console.warn(`[AIGatewayService] Gateway indisponível, a usar OpenAI como reserva: ${e?.message || e}`);
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
