import { Request } from 'express';
import { getSupabase } from '../lib/supabaseClient';
import { MediaUploadService } from './MediaUploadService';
import { PdfService } from './PdfService';

/**
 * Produtos e Vendas — para as microempresas que vendem produtos.
 *
 * - Cada COMPRA sobe o stock e entra nas Transações como saída ("Compra de
 *   mercadoria"), com a fatura do fornecedor anexada.
 * - Cada VENDA desce o stock e entra nas Transações como entrada ("Vendas"),
 *   e tem um comprovativo em PDF que NÃO é uma fatura.
 * - Vender sem stock não é impedido: avisa, e o stock fica negativo. É o que
 *   o dono pediu — às vezes vende-se o que ainda não se registou.
 */

export interface Ficheiro { buffer: Buffer; originalname: string; mimetype: string }

export interface LinhaVenda { produto_id: number | string; quantidade: number | string; preco_unitario?: number | string | null }

/** "1 500,50" → 1500.5; vazio ou lixo → NaN. */
export const numero = (v: any): number => {
    if (v === null || v === undefined || v === '') return NaN;
    if (typeof v === 'number') return v;
    const t = String(v).trim().replace(/\s/g, '');
    // "1.500,50" (pt) → "1500.50"; "1500.50" fica igual.
    const limpo = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    const n = Number(limpo);
    return Number.isFinite(n) ? n : NaN;
};

const hoje = () => new Date().toISOString().split('T')[0];
const dataValida = (d: any) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : hoje());
const texto = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export class ProdutosService {

    private static ctx(req: Request) {
        const empresaId = String((req as any).user?.empresa_id || '');
        if (!empresaId) throw new Error('Utilizador sem empresa associada.');
        return { supabase: getSupabase(req), empresaId };
    }

    // ============================================================
    // PRODUTOS
    // ============================================================

    /** Os produtos com o que custaram, o que venderam e o lucro. */
    public static async listar(req: Request) {
        const { supabase, empresaId } = this.ctx(req);
        const [prods, compras, itens, vendas] = await Promise.all([
            supabase.from('produtos').select('*').eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
            supabase.from('produtos_compras').select('produto_id, quantidade, total').eq('empresa_id', empresaId),
            supabase.from('vendas_itens').select('venda_id, produto_id, quantidade, total, custo_unitario').eq('empresa_id', empresaId),
            supabase.from('vendas').select('id, estado').eq('empresa_id', empresaId),
        ]);
        for (const r of [prods, compras, itens, vendas]) if (r.error) throw r.error;

        const anuladas = new Set((vendas.data || []).filter((v: any) => v.estado === 'Anulada').map((v: any) => String(v.id)));
        const soma: Record<string, { gasto: number; qtdComprada: number; vendido: number; qtdVendida: number; custoVendido: number }> = {};
        const de = (id: any) => (soma[String(id)] = soma[String(id)] || { gasto: 0, qtdComprada: 0, vendido: 0, qtdVendida: 0, custoVendido: 0 });

        for (const c of compras.data || []) {
            const s = de(c.produto_id);
            s.gasto += Number(c.total) || 0;
            s.qtdComprada += Number(c.quantidade) || 0;
        }
        for (const i of itens.data || []) {
            if (!i.produto_id || anuladas.has(String(i.venda_id))) continue;
            const s = de(i.produto_id);
            s.vendido += Number(i.total) || 0;
            s.qtdVendida += Number(i.quantidade) || 0;
            s.custoVendido += (Number(i.quantidade) || 0) * (Number(i.custo_unitario) || 0);
        }

        return (prods.data || []).map((p: any) => {
            const s = soma[String(p.id)] || { gasto: 0, qtdComprada: 0, vendido: 0, qtdVendida: 0, custoVendido: 0 };
            return {
                ...p,
                total_gasto_compras: s.gasto,
                quantidade_comprada: s.qtdComprada,
                total_vendido: s.vendido,
                quantidade_vendida: s.qtdVendida,
                lucro: s.vendido - s.custoVendido,
                valor_em_stock: Math.max(0, Number(p.stock) || 0) * (Number(p.preco_custo) || 0),
            };
        });
    }

    /**
     * Cadastrar um produto. Se vier com quantidade inicial, essa quantidade é
     * registada como a primeira compra — com o custo e a fatura — e entra nas
     * despesas, a não ser que se diga que não (stock que já se tinha antes).
     */
    public static async criar(req: Request, dados: any, foto?: Ficheiro, fatura?: Ficheiro) {
        const { supabase, empresaId } = this.ctx(req);
        const nome = texto(dados.nome);
        if (!nome) throw new Error('O nome do produto é obrigatório.');
        const precoVenda = numero(dados.preco_venda);
        if (!(precoVenda >= 0)) throw new Error('Indique o preço de venda.');
        const qtdInicial = numero(dados.quantidade_inicial);
        const custo = numero(dados.custo_unitario);
        if (qtdInicial > 0 && !(custo >= 0)) throw new Error('Indique quanto custou cada unidade.');

        let foto_url: string | null = null;
        if (foto) foto_url = (await MediaUploadService.upload(foto.buffer, foto.originalname, foto.mimetype, 'produtos', empresaId)).url;

        const stockMin = numero(dados.stock_minimo);
        const { data, error } = await supabase.from('produtos').insert({
            empresa_id: empresaId, nome, codigo: texto(dados.codigo), descricao: texto(dados.descricao), foto_url,
            preco_venda: precoVenda, preco_custo: custo >= 0 ? custo : 0, stock: 0,
            stock_minimo: stockMin >= 0 ? stockMin : null,
        }).select('id').single();
        if (error) throw error;

        if (qtdInicial > 0) {
            await this.registarCompra(req, data.id, {
                quantidade: qtdInicial, custo_unitario: custo, fornecedor: dados.fornecedor, data: dados.data,
                forma_pagamento: dados.forma_pagamento, registar_despesa: dados.registar_despesa,
            }, fatura);
        }
        return data.id;
    }

    /**
     * Mudar os dados do produto. O stock só muda por aqui como ACERTO (perdas,
     * contagem) — as compras e as vendas mexem nele sozinhas.
     */
    public static async atualizar(req: Request, id: number, dados: any, foto?: Ficheiro) {
        const { supabase, empresaId } = this.ctx(req);
        const { data: atual, error: e1 } = await supabase.from('produtos').select('*').eq('id', id).eq('empresa_id', empresaId).maybeSingle();
        if (e1) throw e1;
        if (!atual) throw new Error('Produto não encontrado.');

        const patch: any = {};
        if (dados.nome !== undefined) {
            const nome = texto(dados.nome);
            if (!nome) throw new Error('O nome do produto é obrigatório.');
            patch.nome = nome;
        }
        if (dados.codigo !== undefined) patch.codigo = texto(dados.codigo);
        if (dados.descricao !== undefined) patch.descricao = texto(dados.descricao);
        if (dados.preco_venda !== undefined) {
            const v = numero(dados.preco_venda);
            if (!(v >= 0)) throw new Error('Preço de venda inválido.');
            patch.preco_venda = v;
        }
        if (dados.stock_minimo !== undefined) {
            const v = numero(dados.stock_minimo);
            patch.stock_minimo = v >= 0 ? v : null;
        }
        if (dados.stock !== undefined && dados.stock !== '') {
            const v = numero(dados.stock);
            if (!Number.isFinite(v)) throw new Error('Stock inválido.');
            patch.stock = v;
        }
        if (foto) {
            patch.foto_url = (await MediaUploadService.upload(foto.buffer, foto.originalname, foto.mimetype, 'produtos', empresaId)).url;
        }
        if (Object.keys(patch).length === 0) return;

        const { error } = await supabase.from('produtos').update(patch).eq('id', id).eq('empresa_id', empresaId);
        if (error) throw error;
        if (foto && atual.foto_url) await MediaUploadService.apagar(atual.foto_url, 'produtos', empresaId);
    }

    /** Sai da lista, mas fica nas vendas e compras já feitas. */
    public static async apagar(req: Request, id: number) {
        const { supabase, empresaId } = this.ctx(req);
        const { data, error } = await supabase.from('produtos').update({ ativo: false }).eq('id', id).eq('empresa_id', empresaId).select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Produto não encontrado.');
    }

    // ============================================================
    // COMPRAS
    // ============================================================

    public static async registarCompra(req: Request, produtoId: number, dados: any, fatura?: Ficheiro) {
        const { supabase, empresaId } = this.ctx(req);
        const quantidade = numero(dados.quantidade);
        const custo = numero(dados.custo_unitario);
        if (!(quantidade > 0)) throw new Error('A quantidade comprada tem de ser maior que zero.');
        if (!(custo >= 0)) throw new Error('Indique quanto custou cada unidade.');

        const { data: produto, error: e1 } = await supabase.from('produtos').select('id, nome').eq('id', produtoId).eq('empresa_id', empresaId).maybeSingle();
        if (e1) throw e1;
        if (!produto) throw new Error('Produto não encontrado.');

        const total = Math.round(quantidade * custo * 100) / 100;
        const data = dataValida(dados.data);
        const fornecedor = texto(dados.fornecedor);

        let fatura_path: string | null = null;
        if (fatura) fatura_path = await MediaUploadService.guardarDocumento(fatura.buffer, empresaId, fatura.originalname, fatura.mimetype);

        const { data: compra, error: e2 } = await supabase.from('produtos_compras').insert({
            empresa_id: empresaId, produto_id: produtoId, quantidade, custo_unitario: custo, total, fornecedor, data,
            fatura_path, fatura_nome: fatura?.originalname || null,
        }).select('id').single();
        if (e2) throw e2;

        // O stock sobe numa só instrução no servidor — sem perder unidades
        // quando outra venda do mesmo produto acontece ao mesmo tempo.
        const { data: stock, error: e3 } = await supabase.rpc('ajustar_stock_produto', { p_produto_id: produtoId, p_delta: quantidade });
        if (e3) {
            await supabase.from('produtos_compras').delete().eq('id', compra.id).eq('empresa_id', empresaId);
            throw e3;
        }
        await supabase.from('produtos').update({ preco_custo: custo }).eq('id', produtoId).eq('empresa_id', empresaId);

        // A despesa, nas Transações. "Não registar" é para o stock que já se
        // tinha antes de usar o sistema — esse dinheiro já foi gasto há muito.
        const registar = !(dados.registar_despesa === false || dados.registar_despesa === 'false');
        if (registar && total > 0) {
            const { data: t, error: e4 } = await supabase.from('financeiro_transacoes').insert({
                empresa_id: empresaId, tipo: 'saida', categoria: 'Compra de mercadoria',
                descricao: `Compra: ${quantidade} × ${produto.nome}${fornecedor ? ` — ${fornecedor}` : ''}`,
                valor: total, data, estado: 'Pago', forma_pagamento: texto(dados.forma_pagamento),
                origem: 'produtos', referencia_tipo: 'compra_produto', referencia_id: String(compra.id),
                // O anexo vive no bucket privado: o ecrã das Transações pede um
                // link temporário quando o prefixo é "documentos:".
                anexo_path: fatura_path ? `documentos:${fatura_path}` : null,
                anexo_nome: fatura?.originalname || null,
            }).select('id').single();
            if (e4) throw e4;
            await supabase.from('produtos_compras').update({ transacao_id: t.id }).eq('id', compra.id).eq('empresa_id', empresaId);
        }

        return { id: compra.id, total, stock: Array.isArray(stock) ? stock[0] : stock };
    }

    public static async listarCompras(req: Request, produtoId: number) {
        const { supabase, empresaId } = this.ctx(req);
        const { data, error } = await supabase.from('produtos_compras').select('*')
            .eq('empresa_id', empresaId).eq('produto_id', produtoId).order('data', { ascending: false }).order('id', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    // ============================================================
    // VENDAS
    // ============================================================

    /**
     * Uma venda, com um ou vários produtos. Devolve os avisos de stock — a
     * venda fica registada na mesma.
     */
    public static async registarVenda(req: Request, dados: any) {
        const { supabase, empresaId } = this.ctx(req);
        const linhasBrutas: LinhaVenda[] = Array.isArray(dados.itens) ? dados.itens : [];
        const linhas = linhasBrutas
            .map(l => ({ produto_id: Number(l.produto_id), quantidade: numero(l.quantidade), preco: numero(l.preco_unitario) }))
            .filter(l => l.produto_id);
        if (linhas.length === 0) throw new Error('Escolha pelo menos um produto.');
        if (linhas.some(l => !(l.quantidade > 0))) throw new Error('A quantidade de cada produto tem de ser maior que zero.');

        const ids = [...new Set(linhas.map(l => l.produto_id))];
        const { data: produtos, error: e1 } = await supabase.from('produtos').select('id, nome, preco_venda, preco_custo, stock')
            .eq('empresa_id', empresaId).in('id', ids);
        if (e1) throw e1;
        const porId = new Map((produtos || []).map((p: any) => [Number(p.id), p]));
        const emFalta = ids.filter(id => !porId.has(id));
        if (emFalta.length) throw new Error('Um dos produtos já não existe. Atualize a página e tente de novo.');

        const itens = linhas.map(l => {
            const p: any = porId.get(l.produto_id);
            const preco = l.preco >= 0 ? l.preco : Number(p.preco_venda) || 0;
            return {
                produto_id: l.produto_id, produto_nome: p.nome, quantidade: l.quantidade,
                preco_unitario: preco, custo_unitario: Number(p.preco_custo) || 0,
                total: Math.round(l.quantidade * preco * 100) / 100,
            };
        });
        const total = Math.round(itens.reduce((a, i) => a + i.total, 0) * 100) / 100;

        // Avisa, não impede.
        const pedido: Record<number, number> = {};
        for (const i of itens) pedido[i.produto_id] = (pedido[i.produto_id] || 0) + i.quantidade;
        const avisos: string[] = [];
        for (const [id, qtd] of Object.entries(pedido)) {
            const p: any = porId.get(Number(id));
            const stock = Number(p.stock) || 0;
            if (qtd > stock) avisos.push(`"${p.nome}": havia ${stock} em stock e venderam-se ${qtd} — o stock ficou em ${stock - qtd}.`);
        }

        const venda = await this.criarVendaComNumero(supabase, empresaId, {
            data: dataValida(dados.data), cliente_nome: texto(dados.cliente_nome),
            cliente_telefone: texto(dados.cliente_telefone), forma_pagamento: texto(dados.forma_pagamento), total,
        });

        const { error: e2 } = await supabase.from('vendas_itens').insert(itens.map(i => ({ ...i, venda_id: venda.id, empresa_id: empresaId })));
        if (e2) {
            await supabase.from('vendas').delete().eq('id', venda.id).eq('empresa_id', empresaId);
            throw e2;
        }

        for (const [id, qtd] of Object.entries(pedido)) {
            const { error } = await supabase.rpc('ajustar_stock_produto', { p_produto_id: Number(id), p_delta: -qtd });
            if (error) console.error(`[Vendas] Stock do produto ${id} não desceu na venda ${venda.id}:`, error.message);
        }

        if (total > 0) {
            const { data: t, error: e3 } = await supabase.from('financeiro_transacoes').insert({
                empresa_id: empresaId, tipo: 'entrada', categoria: 'Vendas',
                descricao: `Venda nº ${String(venda.numero).padStart(4, '0')}${venda.cliente_nome ? ` — ${venda.cliente_nome}` : ''}`,
                valor: total, data: venda.data, estado: 'Pago', forma_pagamento: venda.forma_pagamento,
                origem: 'vendas', referencia_tipo: 'venda', referencia_id: String(venda.id),
            }).select('id').single();
            if (e3) console.error(`[Vendas] A venda ${venda.id} não entrou nas Transações:`, e3.message);
            else await supabase.from('vendas').update({ transacao_id: t.id }).eq('id', venda.id).eq('empresa_id', empresaId);
        }

        // O comprovativo. Se falhar, a venda está feita na mesma — o PDF faz-se
        // quando alguém o pedir.
        try {
            await this.gerarEGuardarPdf(supabase, empresaId, venda, itens);
        } catch (e: any) {
            console.error(`[Vendas] Comprovativo da venda ${venda.id} não gerado:`, e?.message);
        }

        return { id: venda.id, numero: venda.numero, total, avisos };
    }

    /** O número seguinte da empresa. Duas vendas ao mesmo tempo: a segunda tenta o próximo. */
    private static async criarVendaComNumero(supabase: any, empresaId: string, campos: any) {
        for (let tentativa = 0; tentativa < 5; tentativa++) {
            const { data: ultima } = await supabase.from('vendas').select('numero')
                .eq('empresa_id', empresaId).order('numero', { ascending: false }).limit(1).maybeSingle();
            const proximo = (Number(ultima?.numero) || 0) + 1;
            const { data, error } = await supabase.from('vendas')
                .insert({ empresa_id: empresaId, numero: proximo, estado: 'Concluida', ...campos })
                .select('*').single();
            if (!error) return data;
            if (error.code !== '23505') throw error;   // 23505: o número já foi usado
        }
        throw new Error('Não foi possível numerar a venda. Tente de novo.');
    }

    private static async gerarEGuardarPdf(supabase: any, empresaId: string, venda: any, itens: any[]): Promise<Buffer> {
        const buffer = await PdfService.gerarComprovativoVendaPdf(venda, itens, empresaId);
        const nome = `Comprovativo_Venda_${String(venda.numero).padStart(4, '0')}.pdf`;
        const caminho = await MediaUploadService.guardarDocumento(buffer, empresaId, nome, 'application/pdf');
        await supabase.from('vendas').update({ pdf_path: caminho }).eq('id', venda.id).eq('empresa_id', empresaId);
        return buffer;
    }

    public static async listarVendas(req: Request) {
        const { supabase, empresaId } = this.ctx(req);
        const { data, error } = await supabase.from('vendas').select('*, vendas_itens(*)')
            .eq('empresa_id', empresaId).order('numero', { ascending: false }).limit(300);
        if (error) throw error;
        return data || [];
    }

    private static async vendaComItens(supabase: any, empresaId: string, id: number) {
        const { data: venda, error } = await supabase.from('vendas').select('*').eq('id', id).eq('empresa_id', empresaId).maybeSingle();
        if (error) throw error;
        if (!venda) throw new Error('Venda não encontrada.');
        const { data: itens, error: e2 } = await supabase.from('vendas_itens').select('*').eq('venda_id', id).eq('empresa_id', empresaId).order('id');
        if (e2) throw e2;
        return { venda, itens: itens || [] };
    }

    /** O PDF do comprovativo (gera-o se ainda não existir). */
    public static async pdfDaVenda(req: Request, id: number): Promise<{ buffer: Buffer; nome: string; venda: any }> {
        const { supabase, empresaId } = this.ctx(req);
        const { venda, itens } = await this.vendaComItens(supabase, empresaId, id);
        const nome = `Comprovativo_Venda_${String(venda.numero).padStart(4, '0')}.pdf`;
        if (venda.pdf_path) {
            try {
                return { buffer: await MediaUploadService.descarregarDocumento(venda.pdf_path), nome, venda };
            } catch { /* perdeu-se: gera-se outra vez */ }
        }
        return { buffer: await this.gerarEGuardarPdf(supabase, empresaId, venda, itens), nome, venda };
    }

    /** Link temporário para abrir/descarregar o comprovativo. */
    public static async linkPdf(req: Request, id: number): Promise<string> {
        const { supabase, empresaId } = this.ctx(req);
        let { venda } = await this.vendaComItens(supabase, empresaId, id);
        if (!venda.pdf_path) {
            await this.pdfDaVenda(req, id);
            ({ venda } = await this.vendaComItens(supabase, empresaId, id));
        }
        const url = await MediaUploadService.assinarDocumento(venda.pdf_path, 600);
        if (!url) throw new Error('Não foi possível abrir o comprovativo.');
        return url;
    }

    /**
     * Anular uma venda feita por engano: o stock volta, a entrada sai das
     * Transações, e a venda fica na lista marcada como anulada (o número não
     * se reutiliza — um comprovativo já entregue tem de continuar a bater).
     */
    public static async anularVenda(req: Request, id: number) {
        const { supabase, empresaId } = this.ctx(req);
        const { venda, itens } = await this.vendaComItens(supabase, empresaId, id);
        if (venda.estado === 'Anulada') return;

        const { data: mudou, error } = await supabase.from('vendas').update({ estado: 'Anulada' })
            .eq('id', id).eq('empresa_id', empresaId).eq('estado', 'Concluida').select('id');
        if (error) throw error;
        if (!mudou || mudou.length === 0) return;   // outra pessoa anulou-a entretanto

        for (const i of itens) {
            if (!i.produto_id) continue;
            const { error: e } = await supabase.rpc('ajustar_stock_produto', { p_produto_id: i.produto_id, p_delta: Number(i.quantidade) });
            if (e) console.error(`[Vendas] Stock do produto ${i.produto_id} não voltou ao anular a venda ${id}:`, e.message);
        }
        if (venda.transacao_id) {
            await supabase.from('financeiro_transacoes').delete().eq('id', venda.transacao_id).eq('empresa_id', empresaId);
        }
    }

    /**
     * Enviar o comprovativo ao cliente por WhatsApp.
     *
     * Vai pelo número da Evolution quando a empresa o tem: pela API oficial da
     * Meta, um documento a quem não escreveu nas últimas 24 horas é recusado.
     */
    public static async enviarWhatsApp(req: Request, id: number, telefoneBruto: string) {
        const { supabase, empresaId } = this.ctx(req);
        const telefone = String(telefoneBruto || '').replace(/\D/g, '');
        if (telefone.length < 9) throw new Error('Indique o número de WhatsApp do cliente.');

        const { data: canais, error } = await supabase.from('wa_channels').select('id, provider, status').eq('empresa_id', empresaId);
        if (error) throw error;
        const ligados = (canais || []).filter((c: any) => c.status === 'connected');
        const canal = ligados.find((c: any) => c.provider === 'evolution') || ligados[0];
        if (!canal) throw new Error('A empresa não tem nenhum WhatsApp ligado.');

        const { buffer, nome, venda } = await this.pdfDaVenda(req, id);
        const { WhatsAppChannelManager } = require('./WhatsAppChannelManager');
        const ok = await WhatsAppChannelManager.sendMediaMessage(
            supabase, canal.id, telefone, `data:application/pdf;base64,${buffer.toString('base64')}`, nome,
            `Comprovativo da venda nº ${String(venda.numero).padStart(4, '0')}. Este documento não é uma fatura.`,
        );
        if (!ok) throw new Error('O WhatsApp não aceitou o envio. Confirme o número e tente de novo.');

        if (!venda.cliente_telefone) {
            await supabase.from('vendas').update({ cliente_telefone: telefone }).eq('id', id).eq('empresa_id', empresaId);
        }
    }

    // ============================================================
    // FICHEIROS PRIVADOS (faturas de compra)
    // ============================================================

    /** Link temporário para um ficheiro do bucket privado — só da própria empresa. */
    public static async linkFicheiro(req: Request, caminho: string): Promise<string> {
        const { empresaId } = this.ctx(req);
        const limpo = String(caminho || '').replace(/^documentos:/, '');
        if (!limpo.startsWith(`${empresaId}/`) || limpo.includes('..')) throw new Error('Ficheiro não encontrado.');
        const url = await MediaUploadService.assinarDocumento(limpo, 600);
        if (!url) throw new Error('Não foi possível abrir o ficheiro.');
        return url;
    }
}
