/**
 * Ler o que o cliente TOCOU, em vez do que escreveu.
 *
 * Esta era a metade que faltava por inteiro. Enviar botões não serve de nada se
 * um toque não chega ao fluxo — e não chegava: procurei por
 * `buttonsResponseMessage`, `listResponseMessage` e `interactiveResponseMessage`
 * em todo o backend e não havia uma única ocorrência.
 *
 * Provei-o na produção: enviei uma sondagem ao Elves, ele votou em "Reservar", e
 * na conversa não entrou nada. O voto chegou mesmo a entrar pelo webhook — os
 * eventos MESSAGES_UPSERT e MESSAGES_UPDATE estão os dois subscritos — mas o
 * nosso código, no `messages.update`, só mexia no estado de entrega ("enviada",
 * "entregue", "lida") e deitava fora tudo o resto.
 *
 * O WhatsApp tem uma forma diferente para cada tipo de escolha, e os dois
 * provedores embrulham-nas de maneiras diferentes. Tudo isso é reduzido aqui a
 * uma coisa só: o que a pessoa escolheu.
 */

export interface Escolha {
    /** O id que mandámos na opção. Vazio nas sondagens, que não levam id. */
    id: string;
    /** O que a pessoa leu e tocou. É por aqui que se reconhece uma sondagem. */
    texto: string;
    /** De onde veio, para o registo e para quem for depurar. */
    origem: 'botao' | 'lista' | 'sondagem';
}

export class WhatsAppEscolhaRecebida {

    /**
     * Uma mensagem recebida é uma escolha? Se for, qual.
     *
     * Devolve null para tudo o resto — texto normal, fotos, áudios — e quem
     * chama segue o caminho de sempre.
     */
    public static ler(msg: any): Escolha | null {
        return WhatsAppEscolhaRecebida.daEvolution(msg)
            || WhatsAppEscolhaRecebida.daMeta(msg)
            || null;
    }

    // ─────────────────────────────────────────────────────────────
    // Evolution (Baileys)
    // ─────────────────────────────────────────────────────────────

    private static daEvolution(msg: any): Escolha | null {
        const m = msg?.message || msg?.data?.message || msg;
        if (!m || typeof m !== 'object') return null;

        // Mensagens interativas vêm embrulhadas em viewOnceMessage.
        const dentro = m.viewOnceMessage?.message
            || m.viewOnceMessageV2?.message
            || m.ephemeralMessage?.message
            || m;

        // 1. Botão tocado, formato moderno (nativeFlow). É o que esta
        //    instalação produz — confirmei a estrutura que ela devolve.
        const nf = dentro.interactiveResponseMessage?.nativeFlowResponseMessage;
        if (nf?.paramsJson) {
            try {
                const p = JSON.parse(nf.paramsJson);
                const id = p.id || p.selectedId || p.selected_id || '';
                const texto = p.display_text || p.displayText || p.selectedDisplayText || '';
                if (id || texto) return { id: String(id), texto: String(texto), origem: 'botao' };
            } catch { /* json estragado: cai para os outros */ }
        }

        // 2. Botão tocado, formato antigo.
        const br = dentro.buttonsResponseMessage;
        if (br) {
            return {
                id: String(br.selectedButtonId || ''),
                texto: String(br.selectedDisplayText || br.selectedButtonId || ''),
                origem: 'botao',
            };
        }

        // 3. Linha do menu escolhida.
        const lr = dentro.listResponseMessage;
        if (lr) {
            return {
                id: String(lr.singleSelectReply?.selectedRowId || ''),
                texto: String(lr.title || lr.singleSelectReply?.selectedRowId || ''),
                origem: 'lista',
            };
        }

        // 4. Resposta a um template com botões.
        const tr = dentro.templateButtonReplyMessage;
        if (tr) {
            return {
                id: String(tr.selectedId || ''),
                texto: String(tr.selectedDisplayText || ''),
                origem: 'botao',
            };
        }

        return null;
    }

    /**
     * O voto numa sondagem.
     *
     * Vem à parte dos outros porque chega por outro caminho — o evento
     * `messages.update`, não o `messages.upsert` — e porque o que volta é um
     * HASH da opção, não o texto dela. Para saber em que votou é preciso ter a
     * sondagem original à mão: é ela que diz que opções existiam.
     */
    public static lerVoto(msg: any, opcoesDaSondagem: string[]): Escolha | null {
        const alvo = msg?.pollUpdates || msg?.update?.pollUpdates
            || msg?.message?.pollUpdateMessage || msg?.update?.pollUpdateMessage;
        if (!alvo) return null;

        // A Evolution, quando consegue, já manda o texto decifrado.
        const lista = Array.isArray(alvo) ? alvo : [alvo];
        for (const v of lista) {
            const nome = v?.pollUpdateMessageKey?.name
                || v?.name
                || v?.vote?.selectedOptions?.[0]
                || v?.selectedOptions?.[0];
            if (typeof nome === 'string' && nome.trim()) {
                return { id: '', texto: nome.trim(), origem: 'sondagem' };
            }
        }

        // Sem texto decifrado não se adivinha: devolver a primeira opção da
        // sondagem seria pôr o cliente num caminho que ele não escolheu, e
        // isso é pior do que não perceber e voltar a perguntar.
        if (opcoesDaSondagem.length === 0) return null;
        return null;
    }

    // ─────────────────────────────────────────────────────────────
    // Meta (API oficial)
    // ─────────────────────────────────────────────────────────────

    private static daMeta(msg: any): Escolha | null {
        const i = msg?.interactive;
        if (!i) return null;

        if (i.type === 'button_reply' && i.button_reply) {
            return { id: String(i.button_reply.id || ''), texto: String(i.button_reply.title || ''), origem: 'botao' };
        }
        if (i.type === 'list_reply' && i.list_reply) {
            return { id: String(i.list_reply.id || ''), texto: String(i.list_reply.title || ''), origem: 'lista' };
        }
        return null;
    }

    /**
     * O texto que o fluxo deve ver.
     *
     * O motor já sabe comparar uma resposta com as opções de um menu. Em vez de
     * lhe ensinar um caminho novo, entrega-se-lhe a escolha como se a pessoa a
     * tivesse escrito — e o id vai à frente, porque é por ele que se acerta
     * sem depender de maiúsculas, acentos ou de dois rótulos parecidos.
     */
    public static comoTexto(e: Escolha): string {
        return e.id || e.texto;
    }
}
