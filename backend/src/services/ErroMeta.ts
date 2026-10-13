/**
 * O que a Meta recusou, dito em português e com o que fazer a seguir.
 *
 * A Meta responde em inglês e em linguagem de programador. O cliente viu no
 * painel "Error validating access token: The session is invalid because the
 * user logged out." — numa página onde ninguém tinha saído de lado nenhum, a
 * configurar um número de WhatsApp. A mensagem está correcta e é inútil: não
 * diz o que correu mal (o token é temporário) nem o que fazer (criar um
 * permanente num Utilizador de Sistema).
 *
 * Quem configura isto é o dono de um negócio, não um programador. A mensagem em
 * bruto fica guardada no fim, entre parênteses, para quem a quiser procurar.
 */

export interface ErroMetaLegivel {
    /** A frase que o painel mostra. */
    texto: string;
    /** O que fazer, quando há um passo concreto. */
    comoResolver?: string;
}

/** O que a Meta devolveu, seja qual for o formato. */
interface RespostaMeta {
    message?: string;
    code?: number;
    error_subcode?: number;
    type?: string;
}

export class ErroMeta {

    /**
     * Traduz o erro. `bruto` é o corpo `error` da resposta da Meta; o estado
     * HTTP serve quando ela não diz mais nada.
     */
    public static explicar(bruto: RespostaMeta | null | undefined, estadoHttp?: number): ErroMetaLegivel {
        const msg = String(bruto?.message || '');
        const codigo = Number(bruto?.code);
        const sub = Number(bruto?.error_subcode);

        // ── Token ────────────────────────────────────────────────
        // 190/463 e 190/467 são o mesmo problema para quem configura: o token
        // que a Meta mostra na página "Introdução" dura 24 horas e morre com a
        // sessão do Facebook. É o erro que quase toda a gente apanha à primeira.
        if (codigo === 190 && (sub === 467 || sub === 463 || /logged out|expired|session/i.test(msg))) {
            return {
                texto: 'O token de acesso expirou. O que colou é um token temporário — ele dura 24 horas e morre quando a sua sessão do Facebook termina.',
                comoResolver: 'Crie um token permanente: business.facebook.com → Definições do Negócio → Utilizadores de sistema → adicione um utilizador, dê-lhe a sua conta do WhatsApp em "Adicionar activos", e gere um token com validade "Nunca expira" e as permissões whatsapp_business_messaging e whatsapp_business_management.',
            };
        }

        if (codigo === 190 || /validating access token|invalid oauth/i.test(msg)) {
            return {
                texto: 'A Meta não aceitou o token de acesso.',
                comoResolver: 'Confirme que copiou o token inteiro, sem espaços no início ou no fim, e que é o token da aplicação ligada a este número.',
            };
        }

        // ── Permissões ───────────────────────────────────────────
        if (codigo === 10 || codigo === 200 || /permission/i.test(msg)) {
            return {
                texto: 'O token é válido, mas não tem permissão para este número.',
                comoResolver: 'No Utilizador de Sistema que gerou o token, abra "Adicionar activos", escolha a sua conta do WhatsApp e ligue o "Controlo total". Depois gere o token outra vez — as permissões não se aplicam a um token já criado.',
            };
        }

        // ── Identificadores errados ──────────────────────────────
        if (codigo === 803 || /does not exist|cannot be loaded|unsupported get request/i.test(msg)) {
            return {
                texto: 'A Meta não encontrou este identificador.',
                comoResolver: 'Confirme o ID do número de telefone e o ID da conta WhatsApp Business. São dois números diferentes e é fácil trocá-los: o do número está em WhatsApp › Configuração da API, o da conta aparece logo por baixo.',
            };
        }

        if (codigo === 100) {
            return {
                texto: 'A Meta recusou um dos valores enviados.',
                comoResolver: 'Normalmente é o ID do número ou o da conta WhatsApp Business trocados um pelo outro. Confirme os dois no painel da Meta.',
            };
        }

        if (codigo === 368 || /blocked|restricted/i.test(msg)) {
            return {
                texto: 'Esta conta está bloqueada ou limitada pela Meta.',
                comoResolver: 'Veja o estado da conta em business.facebook.com — a Meta costuma explicar lá o motivo e o que é preciso para levantar a limitação.',
            };
        }

        // ── Sem nada de útil ─────────────────────────────────────
        if (estadoHttp === 401 || estadoHttp === 403) {
            return {
                texto: 'A Meta recusou o acesso com estas credenciais.',
                comoResolver: 'Verifique o token de acesso e as permissões da aplicação.',
            };
        }

        if (!msg) {
            return { texto: `A Meta não respondeu como esperado${estadoHttp ? ` (estado ${estadoHttp})` : ''}.` };
        }

        return { texto: msg };
    }

    /** A explicação numa linha só, para quando só há espaço para uma. */
    public static numaLinha(bruto: RespostaMeta | null | undefined, estadoHttp?: number): string {
        const e = ErroMeta.explicar(bruto, estadoHttp);
        const original = String(bruto?.message || '').trim();

        // A mensagem original vai no fim: não serve a quem configura, mas serve
        // a quem for procurá-la na documentação da Meta.
        const rodape = original && original !== e.texto ? ` (a Meta disse: "${original}")` : '';
        return e.comoResolver ? `${e.texto} ${e.comoResolver}${rodape}` : `${e.texto}${rodape}`;
    }
}
