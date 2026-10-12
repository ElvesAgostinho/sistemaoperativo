import { useState, useEffect } from 'react';

/**
 * O canal desta empresa consegue mesmo enviar botões a clicar?
 *
 * Num número ligado por QR code (a Evolution) o WhatsApp não os entrega: a
 * mensagem sai com 201 e nunca chega. Provado no número do cliente e num
 * segundo número, em duas versões da Evolution e com os três tipos de botão.
 *
 * Dois painéis precisam de saber isto — a pré-visualização do menu e o editor
 * de blocos — e precisam de responder a mesma coisa. Duas cópias do pedido
 * seriam duas maneiras de divergirem.
 */
export interface CanalBotoes {
    /** Os botões já foram confirmados a chegar neste canal. */
    botoesFiaveis: boolean;
    /** A lista (o menu que abre) só existe pela API oficial. */
    listaDisponivel: boolean;
    /** Ainda não se sabe — a resposta não chegou. */
    aCarregar: boolean;
}

export function useCanalBotoes(): CanalBotoes {
    const [canal, setCanal] = useState<{ funcionam: boolean; provider: string | null } | null>(null);
    const [aCarregar, setACarregar] = useState(true);

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const r = await fetch(`${import.meta.env.VITE_API_URL}/api/whatsapp/canal/botoes`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('os_auth_token')}` },
                });
                const d = await r.json();
                if (vivo && d.success) setCanal({ funcionam: d.funcionam, provider: d.provider });
            } catch {
                // Sem resposta assume-se o caso conservador: sem botões. Prometer
                // um botão que não chega é pior do que prometer menos.
            } finally {
                if (vivo) setACarregar(false);
            }
        })();
        return () => { vivo = false; };
    }, []);

    return {
        botoesFiaveis: canal?.funcionam === true,
        listaDisponivel: canal?.provider === 'meta',
        aCarregar,
    };
}
