import crypto from 'crypto';

const DAILY_API_BASE = 'https://api.daily.co/v1';

function apiKey(): string {
    const key = process.env.DAILY_API_KEY;
    if (!key) throw new Error('DAILY_API_KEY não configurada.');
    return key;
}

/**
 * Wrapper fino sobre a REST API da Daily.co — substitui o link direto para o
 * meet.jit.si público. Salas ficam privadas (privacy: 'private') e com gravação
 * em nuvem automática (enable_recording: 'cloud'); entrar exige sempre um token
 * de reunião mintado aqui, nunca um URL cru partilhável.
 */
export class DailyService {

    public static async criarSala(nomeInterno: string, expiraEmSegundos = 60 * 60 * 6): Promise<{ roomName: string; url: string }> {
        const exp = Math.floor(Date.now() / 1000) + expiraEmSegundos;
        const res = await fetch(`${DAILY_API_BASE}/rooms`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: nomeInterno,
                privacy: 'private',
                properties: {
                    enable_recording: 'cloud',
                    exp,
                    eject_at_room_exp: true,
                    enable_prejoin_ui: true
                }
            })
        });
        const data: any = await res.json();
        if (!res.ok) throw new Error(`Daily.co: falha ao criar sala — ${data?.error || res.status}`);
        return { roomName: data.name, url: data.url };
    }

    public static async criarTokenReuniao(params: { roomName: string; nomeParticipante: string; isOwner: boolean; expiraEmSegundos?: number }): Promise<string> {
        const exp = Math.floor(Date.now() / 1000) + (params.expiraEmSegundos || 60 * 60 * 6);
        const res = await fetch(`${DAILY_API_BASE}/meeting-tokens`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                properties: {
                    room_name: params.roomName,
                    user_name: params.nomeParticipante,
                    is_owner: params.isOwner,
                    exp
                }
            })
        });
        const data: any = await res.json();
        if (!res.ok) throw new Error(`Daily.co: falha ao gerar token — ${data?.error || res.status}`);
        return data.token;
    }

    // NOTA: nome exato do campo de resposta (download_link vs outro) por
    // confirmar com uma chamada real assim que houver DAILY_API_KEY — ver plano.
    public static async obterLinkGravacao(recordingId: string): Promise<string> {
        const res = await fetch(`${DAILY_API_BASE}/recordings/${recordingId}/access-link`, {
            headers: { 'Authorization': `Bearer ${apiKey()}` }
        });
        const data: any = await res.json();
        if (!res.ok) throw new Error(`Daily.co: falha ao obter link da gravação — ${data?.error || res.status}`);
        return data.download_link;
    }

    // Esquema de assinatura da Daily: HMAC-SHA256 sobre "${timestamp}.${rawBody}"
    // com o segredo do webhook em base64 — diferente do esquema usado no webhook
    // da Meta (whatsappRoutes.ts), que assina só o corpo em bruto. NÃO copiar esse
    // código; confirmar contra um payload real de teste antes de assumir como certo.
    public static verificarAssinaturaWebhook(rawBody: Buffer, timestamp: string, signature: string): boolean {
        const secret = process.env.DAILY_WEBHOOK_SECRET;
        if (!secret) return false;
        try {
            const secretBuffer = Buffer.from(secret, 'base64');
            const mensagem = Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]);
            const esperado = crypto.createHmac('sha256', secretBuffer).update(mensagem).digest('base64');
            return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(signature));
        } catch {
            return false;
        }
    }
}
