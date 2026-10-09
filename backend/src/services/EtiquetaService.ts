import { supabase } from '../lib/supabaseClient';

export interface Etiqueta {
    id: string;
    nome: string;
    cor: string;
    descricao?: string | null;
}

/** Paleta de arranque: cores distintas e legíveis sobre branco. */
const CORES = ['#0E5A6B', '#107E3E', '#C9992E', '#BB0000', '#6d28d9', '#0369a1', '#be123c', '#8A4B0B'];

/**
 * As etiquetas da empresa.
 *
 * Antes eram texto livre: cada sítio escrevia o que queria e "VIP" e "vip"
 * ficavam como duas etiquetas distintas. Agora há uma lista verdadeira, e tudo
 * o que mexe em etiquetas passa por aqui — incluindo os fluxos do Autopilot,
 * para que uma etiqueta criada por um fluxo apareça na lista como qualquer outra.
 */
export class EtiquetaService {

    /** Compara como as pessoas comparam: sem distinguir maiúsculas nem espaços à volta. */
    public static mesma(a: string, b: string): boolean {
        return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    }

    public static async listar(empresaId: string, client: any = supabase): Promise<Etiqueta[]> {
        const { data, error } = await client.from('etiquetas')
            .select('id, nome, cor, descricao').eq('empresa_id', empresaId).order('nome');
        if (error) throw error;
        return data || [];
    }

    public static async criar(
        empresaId: string,
        nome: string,
        opcoes: { cor?: string; descricao?: string; criadoPor?: string } = {},
        client: any = supabase
    ): Promise<Etiqueta> {
        const limpo = String(nome || '').trim();
        if (!limpo) throw new Error('Dê um nome à etiqueta.');
        if (limpo.length > 40) throw new Error('O nome da etiqueta é demasiado comprido (máximo 40 caracteres).');

        // Se já existe (escrita de outra maneira), devolve-se a que existe em vez
        // de rebentar: quem está a criar quer a etiqueta, não a mensagem de erro.
        const jaExiste = (await EtiquetaService.listar(empresaId, client))
            .find(e => EtiquetaService.mesma(e.nome, limpo));
        if (jaExiste) return jaExiste;

        const { count } = await client.from('etiquetas')
            .select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId);
        const cor = opcoes.cor || CORES[(count || 0) % CORES.length];

        const { data, error } = await client.from('etiquetas').insert({
            empresa_id: empresaId, nome: limpo, cor,
            descricao: opcoes.descricao || null, criado_por: opcoes.criadoPor || null
        }).select('id, nome, cor, descricao').single();
        if (error) throw error;
        return data;
    }

    /**
     * Apaga a etiqueta do catálogo e, se pedido, tira-a dos contactos que a têm.
     * Deixar a etiqueta pendurada nos contactos depois de a apagar da lista era
     * voltar ao texto livre pela porta do lado.
     */
    public static async apagar(
        empresaId: string, id: string,
        opcoes: { tirarDosContactos?: boolean } = {},
        client: any = supabase
    ): Promise<{ nome: string; contactosAfetados: number }> {
        const { data: etiqueta } = await client.from('etiquetas')
            .select('id, nome').eq('id', id).eq('empresa_id', empresaId).maybeSingle();
        if (!etiqueta) throw new Error('Etiqueta não encontrada.');

        let afetados = 0;
        if (opcoes.tirarDosContactos) {
            const { data: clientes } = await client.from('clientes')
                .select('id, tags').eq('empresa_id', empresaId);
            for (const c of (clientes || [])) {
                const tags: string[] = c.tags || [];
                if (!tags.some((t: string) => EtiquetaService.mesma(t, etiqueta.nome))) continue;
                await client.from('clientes')
                    .update({ tags: tags.filter((t: string) => !EtiquetaService.mesma(t, etiqueta.nome)) })
                    .eq('id', c.id);
                afetados++;
            }
        }

        const { error } = await client.from('etiquetas').delete().eq('id', id).eq('empresa_id', empresaId);
        if (error) throw error;
        return { nome: etiqueta.nome, contactosAfetados: afetados };
    }

    /** Quantos contactos têm cada etiqueta — para a lista avisar antes de apagar. */
    public static async contagens(empresaId: string, client: any = supabase): Promise<Record<string, number>> {
        const { data } = await client.from('clientes').select('tags').eq('empresa_id', empresaId);
        const contas: Record<string, number> = {};
        for (const linha of (data || [])) {
            for (const t of (linha.tags || [])) {
                const chave = String(t).trim().toLowerCase();
                if (chave) contas[chave] = (contas[chave] || 0) + 1;
            }
        }
        return contas;
    }

    /**
     * Garante que estes nomes existem no catálogo. É o que mantém a lista
     * completa quando um fluxo do Autopilot inventa uma etiqueta nova: ela passa
     * a aparecer em Definições como qualquer outra, em vez de ficar escondida
     * dentro dos contactos.
     */
    public static async garantirExistem(empresaId: string, nomes: string[], client: any = supabase): Promise<void> {
        const existentes = await EtiquetaService.listar(empresaId, client);
        for (const nome of nomes) {
            const limpo = String(nome || '').trim();
            if (!limpo) continue;
            if (existentes.some(e => EtiquetaService.mesma(e.nome, limpo))) continue;
            try {
                const nova = await EtiquetaService.criar(empresaId, limpo, {}, client);
                existentes.push(nova);
            } catch (e: any) {
                console.warn(`[Etiquetas] Não foi possível registar "${limpo}": ${e?.message || e}`);
            }
        }
    }

    /**
     * Põe e tira etiquetas de um contacto, numa só operação.
     *
     * Usa sempre o nome como está no catálogo: se o contacto tinha "vip" e a
     * empresa chama-lhe "VIP", fica "VIP". Sem isto, o mesmo contacto acabava
     * com as duas versões.
     */
    public static async aplicarNoContacto(
        empresaId: string,
        clienteId: number | string,
        mudancas: { adicionar?: string[]; remover?: string[] },
        client: any = supabase
    ): Promise<string[]> {
        const { data: cliente } = await client.from('clientes')
            .select('id, tags').eq('id', clienteId).eq('empresa_id', empresaId).maybeSingle();
        if (!cliente) throw new Error('Contacto não encontrado.');

        const adicionar = (mudancas.adicionar || []).map(t => String(t).trim()).filter(Boolean);
        const remover = (mudancas.remover || []).map(t => String(t).trim()).filter(Boolean);

        if (adicionar.length) await EtiquetaService.garantirExistem(empresaId, adicionar, client);
        const catalogo = await EtiquetaService.listar(empresaId, client);
        const canonico = (nome: string) => catalogo.find(e => EtiquetaService.mesma(e.nome, nome))?.nome || String(nome).trim();

        let tags: string[] = (cliente.tags || []).map((t: string) => canonico(t));
        tags = tags.filter(t => !remover.some(r => EtiquetaService.mesma(r, t)));
        for (const a of adicionar) {
            const nome = canonico(a);
            if (!tags.some(t => EtiquetaService.mesma(t, nome))) tags.push(nome);
        }
        // Duplicados que já viessem de trás (ex: "vip" e "VIP" no mesmo contacto).
        tags = tags.filter((t, i) => tags.findIndex(x => EtiquetaService.mesma(x, t)) === i);

        const { error } = await client.from('clientes').update({ tags }).eq('id', cliente.id);
        if (error) throw error;
        return tags;
    }
}
