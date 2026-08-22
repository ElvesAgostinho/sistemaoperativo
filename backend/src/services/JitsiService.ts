import jwt from 'jsonwebtoken';

/**
 * Jitsi Meet auto-hospedado no VPS — sem chamadas de rede para criar uma sala
 * (existe assim que alguém entra) nem para gerar o token de acesso (é só um JWT
 * assinado localmente, mesmo padrão síncrono jwt.sign/jwt.verify já usado em
 * backend/src/api/afiliadosRoutes.ts para o Portal de Afiliados — mas com um
 * segredo próprio, JITSI_APP_SECRET, nunca partilhado com o JWT_SECRET da
 * plataforma nem com o do Portal de Afiliados).
 */
export class JitsiService {

    public static criarSala(nomeInterno: string): { roomName: string; url: string } {
        const dominio = process.env.JITSI_DOMAIN;
        if (!dominio) throw new Error('JITSI_DOMAIN não configurada.');
        return { roomName: nomeInterno, url: `https://${dominio}/${nomeInterno}` };
    }

    public static criarTokenReuniao(params: { roomName: string; nomeParticipante: string; isOwner: boolean; expiraEmSegundos?: number }): string {
        const appId = process.env.JITSI_APP_ID;
        const appSecret = process.env.JITSI_APP_SECRET;
        const dominio = process.env.JITSI_DOMAIN;
        if (!appId || !appSecret || !dominio) {
            throw new Error('Configuração do Jitsi incompleta (JITSI_APP_ID/JITSI_APP_SECRET/JITSI_DOMAIN).');
        }

        return jwt.sign(
            {
                aud: appId,
                iss: appId,
                sub: dominio,
                room: params.roomName,
                moderator: params.isOwner,
                context: { user: { name: params.nomeParticipante } }
            },
            appSecret,
            { expiresIn: `${params.expiraEmSegundos || 60 * 60 * 6}s`, algorithm: 'HS256' }
        );
    }
}
