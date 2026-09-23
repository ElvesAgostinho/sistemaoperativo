/**
 * Templates de WhatsApp (modelos de mensagem).
 *
 * Um template é a mensagem estruturada da Meta: cabeçalho (texto ou
 * multimédia), corpo com variáveis {{1}}, {{2}}, rodapé e botões. Na API
 * OFICIAL (Meta Cloud) um template só pode ser enviado depois de aprovado pela
 * Meta — é a Meta que decide, não nós; aqui só submetemos e acompanhamos o
 * estado. Na API NÃO OFICIAL (Evolution/QR) não existem templates: o mesmo
 * modelo é enviado como mensagem normal (multimédia + texto formatado + opções
 * numeradas), para o cliente ver o mesmo conteúdo.
 */
import { supabase } from '../lib/supabaseClient';

export type TipoCabecalho = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
export interface BotaoTemplate {
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
    text: string;
    url?: string;
    phone_number?: string;
}
export interface TemplateEntrada {
    name: string;
    language: string;
    category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
    header?: { format: TipoCabecalho; text?: string; exemplo?: string };
    body: string;
    footer?: string;
    buttons?: BotaoTemplate[];
    exemplos?: string[];            // valores de exemplo para {{1}}, {{2}}... (a Meta exige)
}

const GRAPH = 'https://graph.facebook.com/v20.0';
const CATEGORIAS = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];

export class WhatsAppTemplateService {
    // ============================================================
    // VALIDAÇÃO (as regras da Meta, verificadas antes de submeter)
    // ============================================================
    public static validar(t: TemplateEntrada): string | null {
        const nome = String(t.name || '').trim();
        if (!/^[a-z0-9_]{1,512}$/.test(nome)) return 'O nome só pode ter letras minúsculas, números e _ (ex: promocao_natal).';
        if (!CATEGORIAS.includes(t.category)) return 'Categoria inválida.';
        if (!String(t.language || '').trim()) return 'Escolha o idioma.';

        const corpo = String(t.body || '').trim();
        if (!corpo) return 'O corpo da mensagem é obrigatório.';
        if (corpo.length > 1024) return 'O corpo não pode passar de 1024 caracteres.';

        // Variáveis: têm de ser {{1}}, {{2}}... seguidas, sem saltos.
        const vars = [...corpo.matchAll(/{{\s*(\d+)\s*}}/g)].map(m => Number(m[1]));
        const unicas = Array.from(new Set(vars)).sort((a, b) => a - b);
        if (unicas.some((n, i) => n !== i + 1)) return 'As variáveis têm de ser {{1}}, {{2}}, {{3}}… seguidas e sem saltos.';
        if (/^\s*{{\s*\d+\s*}}/.test(corpo) || /{{\s*\d+\s*}}\s*$/.test(corpo)) return 'O corpo não pode começar nem terminar com uma variável (regra da Meta).';
        if (/{{\s*\d+\s*}}\s*{{\s*\d+\s*}}/.test(corpo)) return 'Não pode ter duas variáveis seguidas sem texto entre elas.';
        if (unicas.length > 0 && (t.exemplos || []).filter(e => String(e || '').trim()).length < unicas.length) {
            return `Dê um exemplo para cada variável (${unicas.length}) — a Meta recusa o template sem exemplos.`;
        }

        if (t.header?.format === 'TEXT') {
            const h = String(t.header.text || '').trim();
            if (!h) return 'Escreva o texto do cabeçalho (ou escolha "sem cabeçalho").';
            if (h.length > 60) return 'O cabeçalho não pode passar de 60 caracteres.';
            const hv = [...h.matchAll(/{{\s*(\d+)\s*}}/g)];
            if (hv.length > 1) return 'O cabeçalho de texto só pode ter uma variável.';
            if (hv.length === 1 && !String(t.header.exemplo || '').trim()) return 'Dê um exemplo para a variável do cabeçalho.';
        }
        if (t.footer && t.footer.length > 60) return 'O rodapé não pode passar de 60 caracteres.';

        const botoes = t.buttons || [];
        if (botoes.length > 10) return 'Demasiados botões.';
        const rapidos = botoes.filter(b => b.type === 'QUICK_REPLY');
        const acoes = botoes.filter(b => b.type !== 'QUICK_REPLY');
        if (rapidos.length > 3) return 'No máximo 3 botões de resposta rápida.';
        if (acoes.length > 2) return 'No máximo 2 botões de ação (link ou telefone).';
        if (rapidos.length > 0 && acoes.length > 0) return 'Não misture botões de resposta rápida com botões de ação no mesmo template.';
        for (const b of botoes) {
            if (!String(b.text || '').trim()) return 'Todos os botões precisam de texto.';
            if (b.text.length > 25) return 'O texto de um botão não pode passar de 25 caracteres.';
            if (b.type === 'URL' && !/^https?:\/\/.+/.test(String(b.url || ''))) return 'O botão de link precisa de um endereço que comece por http:// ou https://.';
            if (b.type === 'PHONE_NUMBER' && !/^\+?\d{6,20}$/.test(String(b.phone_number || '').replace(/\s/g, ''))) return 'O botão de telefone precisa de um número válido.';
        }
        return null;
    }

    /** Converte o nosso formato simples nos "components" da Meta. */
    public static componentesDe(t: TemplateEntrada): any[] {
        const components: any[] = [];
        if (t.header && t.header.format !== 'NONE') {
            if (t.header.format === 'TEXT') {
                const c: any = { type: 'HEADER', format: 'TEXT', text: t.header.text };
                if (/{{\s*\d+\s*}}/.test(String(t.header.text || ''))) c.example = { header_text: [t.header.exemplo || ''] };
                components.push(c);
            } else {
                // Cabeçalho multimédia: a Meta aceita um exemplo por URL/handle.
                const c: any = { type: 'HEADER', format: t.header.format };
                if (t.header.exemplo) c.example = { header_url: [t.header.exemplo] };
                components.push(c);
            }
        }
        const corpo: any = { type: 'BODY', text: t.body };
        const nVars = new Set([...String(t.body).matchAll(/{{\s*(\d+)\s*}}/g)].map(m => m[1])).size;
        if (nVars > 0) corpo.example = { body_text: [(t.exemplos || []).slice(0, nVars)] };
        components.push(corpo);
        if (t.footer) components.push({ type: 'FOOTER', text: t.footer });
        if (t.buttons && t.buttons.length > 0) {
            components.push({
                type: 'BUTTONS',
                buttons: t.buttons.map(b => b.type === 'URL' ? { type: 'URL', text: b.text, url: b.url }
                    : b.type === 'PHONE_NUMBER' ? { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number }
                    : { type: 'QUICK_REPLY', text: b.text })
            });
        }
        return components;
    }

    /** O caminho inverso: dos components da Meta para o nosso formato (edição/pré-visualização). */
    public static entradaDe(componentes: any[]): Partial<TemplateEntrada> {
        const c = Array.isArray(componentes) ? componentes : [];
        const header = c.find(x => String(x.type).toUpperCase() === 'HEADER');
        const body = c.find(x => String(x.type).toUpperCase() === 'BODY');
        const footer = c.find(x => String(x.type).toUpperCase() === 'FOOTER');
        const buttons = c.find(x => String(x.type).toUpperCase() === 'BUTTONS');
        return {
            header: header ? { format: String(header.format || 'TEXT').toUpperCase() as TipoCabecalho, text: header.text, exemplo: header.example?.header_text?.[0] || header.example?.header_url?.[0] } : { format: 'NONE' },
            body: body?.text || '',
            footer: footer?.text || '',
            buttons: (buttons?.buttons || []).map((b: any) => ({ type: String(b.type).toUpperCase(), text: b.text, url: b.url, phone_number: b.phone_number })),
            exemplos: body?.example?.body_text?.[0] || []
        };
    }

    // ============================================================
    // META (Cloud API)
    // ============================================================
    private static async wabaIdDe(channel: any): Promise<string | null> {
        const { phoneNumberId, accessToken, wabaId } = channel.credentials || {};
        if (wabaId) return wabaId;
        try {
            const r = await fetch(`${GRAPH}/${phoneNumberId}?fields=whatsapp_business_api_data`, { headers: { Authorization: `Bearer ${accessToken}` } });
            const d = await r.json();
            return d.whatsapp_business_api_data?.link?.id || null;
        } catch { return null; }
    }

    /** Submete o template à Meta. Fica PENDING até a Meta decidir (costuma demorar minutos a horas). */
    public static async submeterNaMeta(channel: any, t: TemplateEntrada): Promise<{ ok: boolean; erro?: string; id?: string; status?: string }> {
        const wabaId = await this.wabaIdDe(channel);
        if (!wabaId) return { ok: false, erro: 'Não foi possível encontrar a conta WhatsApp Business (WABA) deste número.' };
        const { accessToken } = channel.credentials || {};
        try {
            const r = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ name: t.name, language: t.language, category: t.category, components: this.componentesDe(t) })
            });
            const d = await r.json();
            if (d.error) return { ok: false, erro: d.error.error_user_msg || d.error.message || 'A Meta recusou o template.' };
            return { ok: true, id: d.id, status: d.status || 'PENDING' };
        } catch (e: any) {
            return { ok: false, erro: `Não foi possível falar com a Meta: ${e.message}` };
        }
    }

    public static async apagarNaMeta(channel: any, nome: string): Promise<{ ok: boolean; erro?: string }> {
        const wabaId = await this.wabaIdDe(channel);
        if (!wabaId) return { ok: false, erro: 'WABA não encontrada.' };
        const { accessToken } = channel.credentials || {};
        try {
            const r = await fetch(`${GRAPH}/${wabaId}/message_templates?name=${encodeURIComponent(nome)}`, {
                method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }
            });
            const d = await r.json();
            if (d.error) return { ok: false, erro: d.error.message };
            return { ok: true };
        } catch (e: any) {
            return { ok: false, erro: e.message };
        }
    }

    /** Traz todos os templates da Meta (com o estado real) para a nossa tabela. */
    public static async sincronizar(channel: any, empresaId: string): Promise<{ ok: boolean; erro?: string; total?: number }> {
        const wabaId = await this.wabaIdDe(channel);
        if (!wabaId) return { ok: false, erro: 'Não foi possível encontrar a conta WhatsApp Business (WABA) deste número.' };
        const { accessToken } = channel.credentials || {};
        try {
            const r = await fetch(`${GRAPH}/${wabaId}/message_templates?limit=200&fields=name,status,category,language,components,id,rejected_reason`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const d = await r.json();
            if (d.error) return { ok: false, erro: d.error.message };
            const lista = d.data || [];
            // Substitui os que vieram da Meta; os rascunhos locais ficam.
            await supabase.from('wa_templates').delete().eq('channel_id', channel.id).eq('origem', 'meta');
            if (lista.length > 0) {
                await supabase.from('wa_templates').insert(lista.map((t: any) => ({
                    empresa_id: empresaId, channel_id: channel.id, name: t.name, language: t.language,
                    category: t.category, status: t.status, components: t.components,
                    meta_id: t.id, motivo_rejeicao: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null, origem: 'meta'
                })));
            }
            return { ok: true, total: lista.length };
        } catch (e: any) {
            return { ok: false, erro: e.message };
        }
    }

    // ============================================================
    // ENVIO
    // ============================================================
    /**
     * Texto equivalente ao template, para canais sem templates (Evolution/QR) e
     * para a pré-visualização. Substitui {{1}}, {{2}}… pelos valores dados.
     */
    public static renderizarTexto(componentes: any[], params: string[] = []): { texto: string; media?: { tipo: string; url?: string } } {
        const t = this.entradaDe(componentes);
        const sub = (s: string) => String(s || '').replace(/{{\s*(\d+)\s*}}/g, (_, n) => params[Number(n) - 1] ?? '');
        const partes: string[] = [];
        if (t.header?.format === 'TEXT' && t.header.text) partes.push(`*${sub(t.header.text)}*`);
        if (t.body) partes.push(sub(t.body));
        if (t.footer) partes.push(`_${t.footer}_`);
        const botoes = t.buttons || [];
        if (botoes.length > 0) {
            partes.push(botoes.map((b, i) => {
                if (b.type === 'URL') return `🔗 ${b.text}: ${b.url}`;
                if (b.type === 'PHONE_NUMBER') return `📞 ${b.text}: ${b.phone_number}`;
                return `${i + 1} - ${b.text}`;
            }).join('\n'));
        }
        const media = t.header && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(t.header.format || '')
            ? { tipo: String(t.header.format).toLowerCase(), url: t.header.exemplo }
            : undefined;
        return { texto: partes.join('\n\n'), media };
    }

    /**
     * Envia o template pelo canal certo:
     *  - Meta: mensagem de template a sério (só funciona se estiver APPROVED);
     *  - Evolution: o mesmo conteúdo como mensagem normal (multimédia + texto).
     */
    public static async enviar(supabaseClient: any, channel: any, telefone: string, template: any, params: string[] = [], mediaUrl?: string): Promise<{ ok: boolean; erro?: string; id?: string; textoEnviado: string }> {
        const { texto, media } = this.renderizarTexto(template.components || [], params);
        const { WhatsAppChannelManager } = require('./WhatsAppChannelManager');

        if (channel.provider === 'meta') {
            if (template.status && template.status !== 'APPROVED') {
                return { ok: false, erro: `Este template está "${template.status}" na Meta — só os aprovados podem ser enviados.`, textoEnviado: texto };
            }
            const r = await WhatsAppChannelManager.sendTemplateMessage(supabaseClient, channel.id, telefone, template.name, template.language, params);
            const ok = r === true || (typeof r === 'string' && !r.startsWith('ERROR:'));
            return { ok, erro: ok ? undefined : String(r).replace(/^ERROR: /, ''), id: typeof r === 'string' ? r : undefined, textoEnviado: texto };
        }

        // Canal não oficial: não há templates — envia-se o mesmo conteúdo.
        const url = mediaUrl || media?.url;
        if (url && media) {
            const enviado = await WhatsAppChannelManager.sendMediaMessage(supabaseClient, channel.id, telefone, url, `template.${media.tipo === 'document' ? 'pdf' : media.tipo === 'video' ? 'mp4' : 'jpg'}`, texto);
            const ok = enviado === true || (typeof enviado === 'string' && !String(enviado).startsWith('ERROR:'));
            return { ok, erro: ok ? undefined : 'Falha ao enviar o anexo do template.', textoEnviado: texto };
        }
        const enviado = await WhatsAppChannelManager.sendMessage(supabaseClient, channel.id, telefone, texto);
        const ok = enviado === true || (typeof enviado === 'string' && !String(enviado).startsWith('ERROR:'));
        return { ok, erro: ok ? undefined : 'Falha ao enviar a mensagem.', id: typeof enviado === 'string' ? enviado : undefined, textoEnviado: texto };
    }
}
