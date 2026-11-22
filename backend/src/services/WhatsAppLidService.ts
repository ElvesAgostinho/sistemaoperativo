/**
 * De "11112222333344@lid" para o número de telefone.
 *
 * O WhatsApp passou a identificar muitos contactos por um código interno (o
 * LID) em vez do número. Normalmente a Evolution manda os dois — `remoteJid`
 * com o código e `remoteJidAlt` com o número. Mas nem sempre: há mensagens que
 * chegam SÓ com o código, e o "nome" vem trocado pelo próprio código.
 *
 * Sem o número, a mensagem não encontrava a conversa do cliente: ia para uma
 * conversa "…@lid" à parte, que a caixa de conversas nem mostrava — o cliente
 * escrevia, e para a empresa era como se não tivesse escrito.
 *
 * O número desse contacto costuma estar nas OUTRAS mensagens dele guardadas na
 * Evolution (as que vieram com o `remoteJidAlt`). É aí que se vai buscar, e
 * fica em memória para não se perguntar outra vez a cada mensagem.
 */

const cache = new Map<string, { telefone: string | null; ate: number }>();
const UM_DIA = 24 * 60 * 60 * 1000;
const DEZ_MIN = 10 * 60 * 1000;

const chave = (instancia: string, lid: string) => `${instancia}|${lid}`;
const soDigitos = (jid: string) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

export class WhatsAppLidService {

    /** Aprende com uma mensagem que trouxe os dois (código e número). */
    public static aprender(instancia: string, key: any): void {
        const lid = String(key?.remoteJid || '');
        const alt = String(key?.remoteJidAlt || key?.senderPn || '');
        if (!instancia || !lid.endsWith('@lid') || !alt.includes('@s.whatsapp.net')) return;
        const telefone = soDigitos(alt);
        if (telefone) cache.set(chave(instancia, lid), { telefone, ate: Date.now() + UM_DIA });
    }

    /** O número de um contacto "@lid", ou null se não houver forma de o saber. */
    public static async resolver(instancia: string, lid: string): Promise<string | null> {
        if (!instancia || !String(lid || '').endsWith('@lid')) return null;
        const k = chave(instancia, lid);
        const guardado = cache.get(k);
        if (guardado && guardado.ate > Date.now()) return guardado.telefone;

        let telefone: string | null = null;
        try {
            const base = (process.env.EVOLUTION_API_URL || '').trim().replace(/\/+$/, '');
            const r = await fetch(`${base}/chat/findMessages/${instancia}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: process.env.AUTHENTICATION_API_KEY || '' },
                body: JSON.stringify({ where: { key: { remoteJid: lid } }, limit: 60, page: 1 }),
            });
            const d: any = await r.json().catch(() => ({}));
            const registos: any[] = d?.messages?.records || [];
            const comNumero = registos.find(m => String(m?.key?.remoteJidAlt || m?.key?.senderPn || '').includes('@s.whatsapp.net'));
            if (comNumero) telefone = soDigitos(comNumero.key.remoteJidAlt || comNumero.key.senderPn) || null;
        } catch {
            /* sem resposta da Evolution: tenta-se outra vez daqui a pouco */
        }

        // O que não se descobriu volta a tentar-se em 10 minutos: o contacto pode
        // mandar entretanto uma mensagem que traga o número.
        cache.set(k, { telefone, ate: Date.now() + (telefone ? UM_DIA : DEZ_MIN) });
        return telefone;
    }

    /** Só para os testes. */
    public static limparCache(): void { cache.clear(); }
}
