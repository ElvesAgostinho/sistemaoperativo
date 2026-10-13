/**
 * Mensagens em que o cliente ESCOLHE em vez de escrever.
 *
 * Até agora um menu era texto: "1 - Preços | 2 - Reservar", e o cliente tinha de
 * escrever "1". Quem escrevia "preços" levava com "Não percebi essa resposta".
 * É atrito a cada passo, e é por isso que os fluxos pareciam burros.
 *
 * O WhatsApp tem três formas de o cliente escolher com um toque, e nem todas
 * estão disponíveis em todo o lado:
 *
 *   BOTÕES     até 3, colados à mensagem. Confirmado a sair no formato moderno
 *              (interactiveMessage/nativeFlowMessage) nesta instalação.
 *   SONDAGEM   até 12 opções. Confirmada a funcionar: o Elves votou numa.
 *   LISTA      o menu que abre numa janela, até 10 opções com descrição. É o
 *              mais bonito e o que o ManyChat usa — mas o `sendList` desta
 *              Evolution (2.3.7) rebenta com "this.isZero is not a function",
 *              um erro de dentro do Baileys, e o `single_select` não passa na
 *              validação dela. Fica escrito e pronto: assim que a instalação
 *              for atualizada, liga-se sozinho.
 *
 * A regra é simples: tenta-se o melhor formato que couber, e se o canal não o
 * aceitar cai-se no seguinte, até ao texto numerado de sempre. Nunca fica pior
 * do que estava — só melhor onde der.
 */
import { supabase } from '../lib/supabaseClient';

export interface OpcaoEscolha {
    /** O que o cliente lê no botão ou na linha do menu. */
    rotulo: string;
    /** Como o fluxo a reconhece depois. Volta no toque. */
    id: string;
    /** Só a lista mostra isto, por baixo do rótulo. */
    descricao?: string;
    /**
     * Só a lista: o título do grupo onde esta opção aparece ("Quartos",
     * "Serviços"). Opções sem secção ficam juntas, por ordem, antes das outras.
     */
    seccao?: string;
}

/**
 * O que vai por cima da pergunta.
 *
 * É a diferença entre um menu que parece de uma marca e uma linha de texto com
 * botões por baixo — e era o que faltava para isto se parecer com o ManyChat.
 * A Meta aceita imagem, vídeo, documento ou uma linha de texto; onde não há
 * cabeçalho (a Evolution, o texto numerado), a linha de texto junta-se à
 * pergunta e a média segue como mensagem própria, antes dela.
 */
export interface CabecalhoEscolha {
    tipo: 'texto' | 'imagem' | 'video' | 'documento';
    /** tipo 'texto': a linha. Média: nada. */
    texto?: string;
    /** Média: o endereço do ficheiro. */
    url?: string;
}

export interface PedidoEscolha {
    empresaId: string;
    channelId: string;
    telefone: string;
    /** A pergunta. */
    texto: string;
    opcoes: OpcaoEscolha[];
    /** Linha pequena por baixo (só botões e lista). */
    rodape?: string;
    /** O texto do botão que abre o menu (só lista). */
    textoDoBotao?: string;
    /** Para o registo e para o ecrã saberem o que foi tentado. */
    titulo?: string;
    /** Imagem, vídeo, documento ou uma linha por cima da pergunta. */
    cabecalho?: CabecalhoEscolha;
    /**
     * O formato que quem montou o menu pediu. Sem isto, o sistema escolhe pelo
     * número de opções — e com três ou menos nunca dá o menu que abre, mesmo
     * quando é esse que serve.
     */
    formatoPreferido?: Formato;
}

export type Formato = 'botoes' | 'lista' | 'sondagem' | 'texto';

export interface ResultadoEnvio {
    ok: boolean;
    formato: Formato;
    /** Os formatos que falharam antes deste, e porquê. */
    tentativas: { formato: Formato; erro: string }[];
    messageId?: string;
}

/** O que o WhatsApp aceita em cada formato. Passar daqui é recusa certa. */
export const LIMITES = {
    botoes: { opcoes: 3, rotulo: 20 },
    // Dez linhas NO TOTAL, não dez por secção — é o tecto da Meta, e as secções
    // só mudam como elas se agrupam. O título de uma secção aceita 24.
    lista: { opcoes: 10, rotulo: 24, descricao: 72, seccoes: 10, tituloSeccao: 24 },
    sondagem: { opcoes: 12, rotulo: 100 },
    cabecalho: { texto: 60 },
} as const;

export class WhatsAppInterativoService {

    /**
     * O melhor formato para este número de opções.
     *
     * Três ou menos são botões: ficam à vista, sem mais um toque para abrir.
     * Acima disso seria preciso a lista; enquanto ela não funcionar, a sondagem
     * faz o mesmo trabalho — o cliente escolhe sem escrever, que é o que conta.
     */
    public static formatoIdeal(
        quantas: number,
        listaDisponivel = false,
        botoesFiaveis = true,
        sondagensAtivas = false,
        preferido?: Formato,
    ): Formato[] {
        if (quantas <= 0) return ['texto'];

        // Quem pede o menu que abre, leva o menu que abre — mesmo com duas ou
        // três opções, onde o sistema escolheria botões. Não é capricho: só o
        // menu mostra a linha de descrição por baixo de cada opção, e só ele
        // agrupa em secções. Com uma opção comprida ("Quarto duplo com vista
        // para o mar"), um botão corta aos 20 caracteres e o menu não.
        if (preferido === 'lista' && listaDisponivel && quantas <= LIMITES.lista.opcoes) {
            return ['lista', 'texto'];
        }
        if (preferido === 'botoes' && botoesFiaveis && quantas <= LIMITES.botoes.opcoes) {
            return ['botoes', 'texto'];
        }

        // Num numero ligado pelo Baileys (a Evolution, a mesma via da aplicacao
        // normal) os botoes interativos saem com 201 e NUNCA sao entregues. A
        // Meta deita-os fora em silencio. Provei-o no numero do cliente, em duas
        // versoes da Evolution e com os tres tipos de botao.
        //
        // A sondagem chega, mas uma sondagem com contagem de votos nao e um menu
        // de atendimento — e um inquerito. O cliente foi claro: nao a quer. Por
        // isso, onde os botoes nao chegam, volta-se a lista numerada de sempre:
        // o cliente escreve "1" e o fluxo entende. Funciona, e nao finge ser
        // outra coisa.
        //
        // Quem quiser mesmo a sondagem liga-a no canal (`sondagens: true`).
        if (!botoesFiaveis) {
            if (quantas <= LIMITES.lista.opcoes && listaDisponivel) return ['lista', 'texto'];
            if (sondagensAtivas && quantas <= LIMITES.sondagem.opcoes) return ['sondagem', 'texto'];
            return ['texto'];
        }

        // Pela API oficial da Meta funciona tudo, e esta documentado.
        if (quantas <= LIMITES.botoes.opcoes) return ['botoes', 'texto'];
        if (quantas <= LIMITES.lista.opcoes && listaDisponivel) return ['lista', 'texto'];
        return ['texto'];
    }

    /**
     * As opções agrupadas em secções, pela ordem em que as secções aparecem.
     *
     * Quem não puser secção nenhuma fica com uma só, sem título — que é
     * exactamente o que havia antes, e continua a ser o caso normal.
     */
    public static agrupar(opcoes: OpcaoEscolha[], tituloPorOmissao = 'Opções'): { titulo: string; opcoes: OpcaoEscolha[] }[] {
        const ordem: string[] = [];
        const grupos: Record<string, OpcaoEscolha[]> = {};

        for (const o of opcoes) {
            const chave = (o.seccao || '').trim() || tituloPorOmissao;
            if (!grupos[chave]) { grupos[chave] = []; ordem.push(chave); }
            grupos[chave].push(o);
        }

        return ordem
            .slice(0, LIMITES.lista.seccoes)
            .map(t => ({ titulo: WhatsAppInterativoService.encurtar(t, LIMITES.lista.tituloSeccao), opcoes: grupos[t] }));
    }

    /** Corta um rótulo ao que o formato aceita, sem o deixar a meio da palavra. */
    public static encurtar(texto: string, max: number): string {
        const limpo = String(texto || '').replace(/\s+/g, ' ').trim();
        if (limpo.length <= max) return limpo;
        const corte = limpo.slice(0, max - 1);
        const espaco = corte.lastIndexOf(' ');
        return (espaco > max * 0.6 ? corte.slice(0, espaco) : corte) + '…';
    }

    /**
     * Envia a pergunta no melhor formato que o canal aceitar.
     *
     * Não atira: devolve o que correu, incluindo o que falhou pelo caminho. Uma
     * pergunta que não sai deixa o cliente à espera, e isso tem de ficar visível
     * a quem for ver, não escondido numa excepção.
     */
    public static async perguntar(p: PedidoEscolha): Promise<ResultadoEnvio> {
        const tentativas: { formato: Formato; erro: string }[] = [];

        const canal = await WhatsAppInterativoService.canal(p.channelId, p.empresaId);
        if (!canal) {
            return { ok: false, formato: 'texto', tentativas: [{ formato: 'texto', erro: 'canal não encontrado' }] };
        }

        for (const formato of WhatsAppInterativoService.formatoIdeal(
            p.opcoes.length, canal.listaDisponivel, canal.botoesFiaveis, canal.sondagensAtivas, p.formatoPreferido,
        )) {
            try {
                const id = await WhatsAppInterativoService.enviarNoFormato(formato, p, canal);
                if (id !== false) {
                    return { ok: true, formato, tentativas, messageId: typeof id === 'string' ? id : undefined };
                }
                tentativas.push({ formato, erro: 'o canal recusou' });
            } catch (e: any) {
                tentativas.push({ formato, erro: String(e?.message || e).slice(0, 180) });
            }
        }

        return { ok: false, formato: 'texto', tentativas };
    }

    /** O canal, e o que ele sabe fazer. */
    private static async canal(channelId: string, empresaId: string): Promise<any> {
        const { data } = await supabase.from('wa_channels')
            .select('id, provider, credentials, status')
            .eq('id', channelId).eq('empresa_id', empresaId).maybeSingle();
        if (!data) return null;

        // O que este canal consegue mesmo fazer.
        //
        // Pela Meta (API oficial) tudo funciona e esta documentado. Pela
        // Evolution 2.3.x a lista rebenta (erro interno do Baileys) e os botoes
        // saem sem erro mas nao sao entregues — a mensagem fica em PENDING.
        // So a sondagem esta confirmada a chegar.
        //
        // Quem tiver uma Evolution onde os botoes funcionem (a 2.3.6, por
        // exemplo) liga-os na configuracao do canal, e eles voltam a ser o
        // primeiro formato.
        const meta = data.provider === 'meta';
        return {
            ...data,
            listaDisponivel: meta,
            botoesFiaveis: meta || data.credentials?.botoesFiaveis === true,
            // Desligadas por omissao: o cliente nao as quer, e com razao. Ficam
            // disponiveis para quem as queira ligar.
            sondagensAtivas: data.credentials?.sondagens === true,
        };
    }

    private static async enviarNoFormato(formato: Formato, p: PedidoEscolha, canal: any): Promise<string | boolean> {
        const { WhatsAppChannelManager } = require('./WhatsAppChannelManager');

        if (formato === 'texto') {
            await WhatsAppInterativoService.enviarCabecalhoAparte(p);
            return WhatsAppChannelManager.sendMessage(
                supabase, p.channelId, p.telefone, WhatsAppInterativoService.comoTexto(p)
            );
        }

        if (canal.provider === 'evolution') {
            return WhatsAppInterativoService.enviarPelaEvolution(formato, p, canal);
        }
        if (canal.provider === 'meta') {
            return WhatsAppInterativoService.enviarPelaMeta(formato, p, canal);
        }
        throw new Error(`provedor desconhecido: ${canal.provider}`);
    }

    /** A pergunta como texto numerado — o que o sistema fazia antes, e a última rede. */
    public static comoTexto(p: PedidoEscolha): string {
        // Onde não há cabeçalho a sério, a linha de texto dele não se perde: vai
        // por cima da pergunta, que é onde ela ia aparecer de qualquer forma.
        const topo = p.cabecalho?.tipo === 'texto' && p.cabecalho.texto?.trim()
            ? [p.cabecalho.texto.trim(), '']
            : [];

        // As secções também se vêem no texto: sem elas, uma lista agrupada de
        // dez opções chegava como dez linhas seguidas, sem se perceber o que ia
        // com o quê.
        const grupos = WhatsAppInterativoService.agrupar(p.opcoes, '');
        const temSeccoes = grupos.length > 1 || (grupos[0] && grupos[0].titulo);

        const linhas: string[] = [];
        let n = 0;
        for (const g of grupos) {
            if (temSeccoes && g.titulo) linhas.push(`*${g.titulo}*`);
            for (const o of g.opcoes) linhas.push(`${++n} - ${o.rotulo}`);
            if (temSeccoes) linhas.push('');
        }
        while (linhas.length && linhas[linhas.length - 1] === '') linhas.pop();

        return [...topo, p.texto, '', ...linhas].join('\n');
    }

    // ─────────────────────────────────────────────────────────────
    // Evolution
    // ─────────────────────────────────────────────────────────────

    private static async enviarPelaEvolution(formato: Formato, p: PedidoEscolha, canal: any): Promise<string | boolean> {
        const base = (process.env.EVOLUTION_API_URL || '').trim().replace(/\/+$/, '');
        const chave = process.env.AUTHENTICATION_API_KEY || '';
        const instancia = canal.credentials?.instanceName;
        if (!base || !instancia) throw new Error('Evolution sem URL ou sem instância');

        const telefone = String(p.telefone).replace(/\D/g, '');
        const cabecalho = { 'Content-Type': 'application/json', apikey: chave };

        let caminho: string;
        let corpo: any;

        if (formato === 'botoes') {
            caminho = 'sendButtons';
            corpo = {
                number: telefone,
                title: p.titulo || '',
                description: p.texto,
                footer: p.rodape || '',
                buttons: p.opcoes.slice(0, LIMITES.botoes.opcoes).map(o => ({
                    type: 'reply',
                    displayText: WhatsAppInterativoService.encurtar(o.rotulo, LIMITES.botoes.rotulo),
                    id: o.id,
                })),
            };
        } else if (formato === 'sondagem') {
            caminho = 'sendPoll';
            corpo = {
                number: telefone,
                name: p.texto,
                selectableCount: 1,
                // Os rótulos das sondagens não levam id: o voto volta com o
                // TEXTO escolhido, e é por ele que o fluxo o reconhece.
                values: p.opcoes.slice(0, LIMITES.sondagem.opcoes)
                    .map(o => WhatsAppInterativoService.encurtar(o.rotulo, LIMITES.sondagem.rotulo)),
            };
        } else if (formato === 'lista') {
            caminho = 'sendList';
            corpo = {
                number: telefone,
                title: p.titulo || 'Menu',
                description: p.texto,
                buttonText: p.textoDoBotao || 'Ver opções',
                footerText: p.rodape || '',
                sections: [{
                    title: p.titulo || 'Opções',
                    rows: p.opcoes.slice(0, LIMITES.lista.opcoes).map(o => ({
                        title: WhatsAppInterativoService.encurtar(o.rotulo, LIMITES.lista.rotulo),
                        // A Evolution recusa descrições vazias.
                        description: WhatsAppInterativoService.encurtar(o.descricao || o.rotulo, LIMITES.lista.descricao),
                        rowId: o.id,
                    })),
                }],
            };
        } else {
            throw new Error(`formato sem envio: ${formato}`);
        }

        const r = await fetch(`${base}/message/${caminho}/${instancia}`, {
            method: 'POST', headers: cabecalho, body: JSON.stringify(corpo),
        });
        const d: any = await r.json().catch(() => ({}));

        if (r.status >= 300) {
            const detalhe = d?.response?.message || d?.message || `estado ${r.status}`;
            throw new Error(typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe).slice(0, 180));
        }
        return d?.key?.id || true;
    }

    // ─────────────────────────────────────────────────────────────
    // Meta (API oficial)
    // ─────────────────────────────────────────────────────────────

    /**
     * A média do cabeçalho enviada como mensagem própria, antes da pergunta.
     *
     * Só a mensagem de botões da Meta leva uma imagem por dentro. Na lista o
     * cabeçalho só aceita texto, e no texto numerado não há cabeçalho nenhum —
     * nesses casos a imagem vai à frente em vez de desaparecer.
     *
     * Falhar aqui não impede a pergunta de sair: ficar sem a foto é mau, ficar
     * sem o menu é pior.
     */
    private static async enviarCabecalhoAparte(p: PedidoEscolha): Promise<void> {
        const c = p.cabecalho;
        if (!c || c.tipo === 'texto' || !c.url) return;
        try {
            const canal = await WhatsAppInterativoService.canal(p.channelId, p.empresaId);

            // Pela Meta vai o LINK, directo. O caminho geral descarrega o
            // ficheiro e volta a enviá-lo para a Meta, o que aqui é trabalho a
            // dobrar: estes ficheiros já estão num endereço público nosso, e a
            // Meta aceita-o — é o mesmo `link` que o cabeçalho embutido usa.
            if (canal?.provider === 'meta') {
                const { phoneNumberId, accessToken } = canal.credentials || {};
                const campo = c.tipo === 'imagem' ? 'image' : c.tipo === 'video' ? 'video' : 'document';
                const r = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                    body: JSON.stringify({
                        messaging_product: 'whatsapp',
                        to: String(p.telefone).replace(/\D/g, ''),
                        type: campo,
                        [campo]: { link: c.url },
                    }),
                });
                if (r.status >= 300) {
                    const d: any = await r.json().catch(() => ({}));
                    throw new Error(d?.error?.message || `estado ${r.status}`);
                }
                return;
            }

            const { WhatsAppChannelManager } = require('./WhatsAppChannelManager');
            const nome = { imagem: 'imagem.jpg', video: 'video.mp4', documento: 'ficheiro.pdf' }[c.tipo] || 'ficheiro';
            await WhatsAppChannelManager.sendMediaMessage(supabase, p.channelId, p.telefone, c.url, nome, '');
        } catch (e: any) {
            console.warn('[ESCOLHA] o cabeçalho não saiu, a pergunta segue na mesma:', e?.message || e);
        }
    }

    /** O cabeçalho no formato da Meta, ou nada se não houver. */
    private static cabecalhoMeta(c?: CabecalhoEscolha): any | null {
        if (!c) return null;
        if (c.tipo === 'texto') {
            const t = WhatsAppInterativoService.encurtar(c.texto || '', LIMITES.cabecalho.texto);
            return t ? { type: 'text', text: t } : null;
        }
        if (!c.url) return null;
        if (c.tipo === 'imagem') return { type: 'image', image: { link: c.url } };
        if (c.tipo === 'video') return { type: 'video', video: { link: c.url } };
        return { type: 'document', document: { link: c.url } };
    }

    private static async enviarPelaMeta(formato: Formato, p: PedidoEscolha, canal: any): Promise<string | boolean> {
        const { phoneNumberId, accessToken } = canal.credentials || {};
        if (!phoneNumberId || !accessToken) throw new Error('canal Meta sem credenciais');

        const telefone = String(p.telefone).replace(/\D/g, '');
        let interactive: any;

        // O cabeçalho é igual nos dois formatos.
        const cabecalho = WhatsAppInterativoService.cabecalhoMeta(p.cabecalho);

        if (formato === 'botoes') {
            interactive = {
                type: 'button',
                ...(cabecalho ? { header: cabecalho } : {}),
                body: { text: p.texto },
                ...(p.rodape ? { footer: { text: p.rodape } } : {}),
                action: {
                    buttons: p.opcoes.slice(0, LIMITES.botoes.opcoes).map(o => ({
                        type: 'reply',
                        reply: { id: o.id, title: WhatsAppInterativoService.encurtar(o.rotulo, LIMITES.botoes.rotulo) },
                    })),
                },
            };
        } else if (formato === 'lista') {
            // O corte é no TOTAL das linhas, antes de agrupar: a Meta recusa a
            // mensagem inteira acima de dez, por mais secções que haja — e aí o
            // cliente não receberia nada.
            // A lista não leva imagem por dentro: ela vai antes, à parte.
            if (p.cabecalho && p.cabecalho.tipo !== 'texto') {
                await WhatsAppInterativoService.enviarCabecalhoAparte(p);
            }

            const cabem = p.opcoes.slice(0, LIMITES.lista.opcoes);
            const grupos = WhatsAppInterativoService.agrupar(cabem, p.titulo || 'Opções');

            interactive = {
                type: 'list',
                // A lista só aceita cabeçalho de TEXTO. Com uma imagem, ela vai
                // à frente, numa mensagem própria — ver `enviarCabecalhoAparte`.
                ...(cabecalho && cabecalho.type === 'text' ? { header: cabecalho } : {}),
                body: { text: p.texto },
                ...(p.rodape ? { footer: { text: p.rodape } } : {}),
                action: {
                    button: WhatsAppInterativoService.encurtar(p.textoDoBotao || 'Ver opções', 20),
                    sections: grupos.map(g => ({
                        title: g.titulo,
                        rows: g.opcoes.map(o => ({
                            id: o.id,
                            title: WhatsAppInterativoService.encurtar(o.rotulo, LIMITES.lista.rotulo),
                            ...(o.descricao ? { description: WhatsAppInterativoService.encurtar(o.descricao, LIMITES.lista.descricao) } : {}),
                        })),
                    })),
                },
            };
        } else {
            // A Meta não tem sondagens. Acima de dez opções é mesmo texto.
            throw new Error('a Meta não envia sondagens');
        }

        const r = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ messaging_product: 'whatsapp', to: telefone, type: 'interactive', interactive }),
        });
        const d: any = await r.json().catch(() => ({}));
        if (r.status >= 300) throw new Error(d?.error?.message || `estado ${r.status}`);
        return d?.messages?.[0]?.id || true;
    }
}
