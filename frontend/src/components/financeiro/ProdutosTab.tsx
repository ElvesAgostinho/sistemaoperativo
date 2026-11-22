import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Trash2, Pencil, ShoppingCart, PackagePlus, Package, Boxes, TrendingUp, AlertCircle,
  FileText, Send, X, Paperclip, Ban, Loader2, CheckCircle2, ImageIcon,
} from 'lucide-react';

/**
 * Produtos e Vendas — para as microempresas que vendem produtos.
 *
 * Cadastra-se o produto (com foto). Cada compra sobe o stock e entra nas
 * despesas com a fatura; cada venda desce o stock, entra nas receitas e tem
 * um comprovativo em PDF — que NÃO é uma fatura. Vender sem stock avisa, mas
 * não impede.
 */

const API = import.meta.env.VITE_API_URL;
const token = () => localStorage.getItem('os_auth_token') || '';
const authFetch = (url: string, options: any = {}) =>
  fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token()}` } });

function formatKz(value: number) {
  return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(Number(value) || 0);
}
const hoje = () => new Date().toISOString().split('T')[0];
const num = (v: any) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const nComprovativo = (n: number) => String(n).padStart(4, '0');
const FORMAS = ['Numerário', 'Multicaixa / TPA', 'Transferência Bancária', 'Outro'];

/**
 * Abre um link que só se sabe depois de perguntar ao servidor. A janela abre
 * JÁ, dentro do clique — depois de um await o navegador bloqueava-a como
 * pop-up — e só depois recebe o endereço.
 */
async function abrirLinkDoServidor(caminho: string) {
  const janela = window.open('', '_blank');
  try {
    const r = await authFetch(`${API}${caminho}`);
    const d = await r.json();
    if (!d.success) throw new Error(d.error || 'Não foi possível abrir o ficheiro.');
    if (janela) janela.location.href = d.url; else window.location.href = d.url;
  } catch (e: any) {
    janela?.close();
    alert(e.message);
  }
}

interface Produto {
  id: number; nome: string; codigo?: string; foto_url?: string; preco_custo: number; preco_venda: number;
  stock: number; stock_minimo?: number | null; total_gasto_compras: number; total_vendido: number;
  quantidade_vendida: number; lucro: number; valor_em_stock: number;
}

const stockBaixo = (p: Produto) => p.stock <= 0 || (p.stock_minimo != null && p.stock <= Number(p.stock_minimo));

export default function ProdutosTab() {
  const [vista, setVista] = useState<'produtos' | 'vendas'>('produtos');
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [vendas, setVendas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [indisponivel, setIndisponivel] = useState('');

  const [produtoModal, setProdutoModal] = useState<Produto | 'novo' | null>(null);
  const [compraModal, setCompraModal] = useState<Produto | null>(null);
  const [vendaModal, setVendaModal] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [whatsVenda, setWhatsVenda] = useState<any>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [rp, rv] = await Promise.all([authFetch(`${API}/api/financeiro/produtos`), authFetch(`${API}/api/financeiro/vendas`)]);
      const dp = await rp.json(); const dv = await rv.json();
      if (rp.status === 503) { setIndisponivel(dp.error); return; }
      if (dp.success) setProdutos(dp.produtos || []);
      if (dv.success) setVendas(dv.vendas || []);
    } catch {
      /* sem ligação: a lista fica como estava */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const kpis = useMemo(() => ({
    valorStock: produtos.reduce((a, p) => a + (Number(p.valor_em_stock) || 0), 0),
    vendido: produtos.reduce((a, p) => a + (Number(p.total_vendido) || 0), 0),
    lucro: produtos.reduce((a, p) => a + (Number(p.lucro) || 0), 0),
    baixo: produtos.filter(stockBaixo).length,
  }), [produtos]);

  const apagarProduto = async (p: Produto) => {
    if (!confirm(`Tirar "${p.nome}" da lista? As vendas e compras já feitas continuam guardadas.`)) return;
    const r = await authFetch(`${API}/api/financeiro/produtos/${p.id}`, { method: 'DELETE' });
    const d = await r.json();
    if (!d.success) alert(d.error); else carregar();
  };

  const anularVenda = async (v: any) => {
    if (!confirm(`Anular a venda nº ${nComprovativo(v.numero)}? O stock volta e a receita sai das Transações. A venda fica na lista, marcada como anulada.`)) return;
    const r = await authFetch(`${API}/api/financeiro/vendas/${v.id}/anular`, { method: 'POST' });
    const d = await r.json();
    if (!d.success) alert(d.error); else carregar();
  };

  if (indisponivel) {
    return (
      <div className="fin-panel" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <AlertCircle size={18} color="var(--fin-warn-fg)" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '13.5px', lineHeight: 1.6 }}>{indisponivel}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="fin-kpi-grid">
        <div className="fin-kpi-card">
          <div className="fin-kpi-icon"><Boxes size={16} /></div>
          <div className="fin-kpi-value">{formatKz(kpis.valorStock)}</div>
          <div className="fin-kpi-label">Valor em stock ({produtos.length} produtos)</div>
        </div>
        <div className="fin-kpi-card">
          <div className="fin-kpi-icon good"><ShoppingCart size={16} /></div>
          <div className="fin-kpi-value">{formatKz(kpis.vendido)}</div>
          <div className="fin-kpi-label">Total vendido</div>
        </div>
        <div className="fin-kpi-card">
          <div className="fin-kpi-icon good"><TrendingUp size={16} /></div>
          <div className="fin-kpi-value">{formatKz(kpis.lucro)}</div>
          <div className="fin-kpi-label">Lucro das vendas</div>
        </div>
        <div className="fin-kpi-card">
          <div className="fin-kpi-icon warn"><AlertCircle size={16} /></div>
          <div className="fin-kpi-value">{kpis.baixo}</div>
          <div className="fin-kpi-label">Com stock baixo</div>
        </div>
      </div>

      <div className="fin-toolbar">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="fin-btn fin-btn-primary" onClick={() => setVendaModal(true)} disabled={produtos.length === 0}><ShoppingCart size={16} /> Registar venda</button>
          <button className="fin-btn" onClick={() => setProdutoModal('novo')}><Plus size={16} /> Novo produto</button>
        </div>
        <div className="fin-subnav" style={{ marginBottom: 0 }}>
          <button className={vista === 'produtos' ? 'active' : ''} onClick={() => setVista('produtos')}>Produtos</button>
          <button className={vista === 'vendas' ? 'active' : ''} onClick={() => setVista('vendas')}>Vendas</button>
        </div>
      </div>

      {vista === 'produtos' ? (
        <div className="fin-table-card" style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Produto</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Preço de venda</th>
                <th style={{ textAlign: 'right' }}>Gasto em compras</th><th style={{ textAlign: 'right' }}>Vendido</th>
                <th style={{ textAlign: 'right' }}>Lucro</th><th style={{ textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="fin-empty-row">A carregar...</td></tr>}
              {!loading && produtos.length === 0 && <tr><td colSpan={7} className="fin-empty-row">Ainda não há produtos. Clique em "Novo produto" para cadastrar o primeiro.</td></tr>}
              {!loading && produtos.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {p.foto_url
                        ? <img src={p.foto_url} alt="" style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--fin-border-soft)' }} />
                        : <div style={{ width: 38, height: 38, borderRadius: '4px', background: 'var(--fin-canvas)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fin-ink-faint)' }}><Package size={16} /></div>}
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.nome}</div>
                        {p.codigo && <div style={{ fontSize: '11.5px', color: 'var(--fin-ink-muted)' }}>{p.codigo}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {stockBaixo(p)
                      ? <span className="fin-badge fin-badge-warn" title={p.stock_minimo != null ? `Mínimo: ${p.stock_minimo}` : ''}>{Number(p.stock)}</span>
                      : <span style={{ fontWeight: 600 }}>{Number(p.stock)}</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>{formatKz(p.preco_venda)}</td>
                  <td style={{ textAlign: 'right' }}>{formatKz(p.total_gasto_compras)}</td>
                  <td style={{ textAlign: 'right' }}>{formatKz(p.total_vendido)}<div style={{ fontSize: '11px', color: 'var(--fin-ink-muted)' }}>{Number(p.quantidade_vendida)} un.</div></td>
                  <td style={{ textAlign: 'right' }}><span className={`fin-num ${p.lucro >= 0 ? 'entrada' : 'saida'}`}>{formatKz(p.lucro)}</span></td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <button onClick={() => setCompraModal(p)} title="Registar compra (repor stock)" style={iconeBtn('var(--fin-accent)')}><PackagePlus size={16} /></button>
                      <button onClick={() => setProdutoModal(p)} title="Editar" style={iconeBtn('var(--fin-ink-muted)')}><Pencil size={15} /></button>
                      <button onClick={() => apagarProduto(p)} title="Tirar da lista" style={iconeBtn('var(--fin-bad-fg)')}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="fin-table-card" style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Nº</th><th>Data</th><th>Cliente</th><th>Produtos</th><th style={{ textAlign: 'right' }}>Total</th>
                <th>Pagamento</th><th style={{ textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {!loading && vendas.length === 0 && <tr><td colSpan={7} className="fin-empty-row">Ainda não há vendas registadas.</td></tr>}
              {vendas.map(v => (
                <tr key={v.id} style={v.estado === 'Anulada' ? { opacity: 0.55 } : undefined}>
                  <td style={{ fontWeight: 700 }}>{nComprovativo(v.numero)}</td>
                  <td>{new Date(`${v.data}T12:00:00`).toLocaleDateString('pt-PT')}</td>
                  <td>{v.cliente_nome || '—'}</td>
                  <td style={{ fontSize: '12.5px' }}>{(v.vendas_itens || []).map((i: any) => `${Number(i.quantidade)}× ${i.produto_nome}`).join(', ')}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="fin-num entrada">{formatKz(v.total)}</span>
                    {v.estado === 'Anulada' && <div><span className="fin-badge fin-badge-warn">Anulada</span></div>}
                  </td>
                  <td>{v.forma_pagamento || '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <button onClick={() => abrirLinkDoServidor(`/api/financeiro/vendas/${v.id}/pdf`)} title="Abrir comprovativo (PDF)" style={iconeBtn('var(--fin-accent)')}><FileText size={16} /></button>
                      {v.estado !== 'Anulada' && (
                        <>
                          <button onClick={() => setWhatsVenda(v)} title="Enviar ao cliente por WhatsApp" style={iconeBtn('#128C4A')}><Send size={15} /></button>
                          <button onClick={() => anularVenda(v)} title="Anular venda" style={iconeBtn('var(--fin-bad-fg)')}><Ban size={15} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {produtoModal && (
        <ProdutoModal produto={produtoModal === 'novo' ? null : produtoModal} onClose={() => setProdutoModal(null)} onSaved={() => { setProdutoModal(null); carregar(); }} />
      )}
      {compraModal && (
        <CompraModal produto={compraModal} onClose={() => setCompraModal(null)} onSaved={() => { setCompraModal(null); carregar(); }} />
      )}
      {vendaModal && (
        <VendaModal produtos={produtos} onClose={() => setVendaModal(false)} onSaved={r => { setVendaModal(false); setResultado(r); carregar(); }} />
      )}
      {resultado && (
        <ResultadoVenda resultado={resultado} onClose={() => setResultado(null)} onWhatsApp={() => { setWhatsVenda({ id: resultado.id, numero: resultado.numero, cliente_telefone: resultado.cliente_telefone }); setResultado(null); }} />
      )}
      {whatsVenda && (
        <WhatsAppModal venda={whatsVenda} onClose={() => setWhatsVenda(null)} onSent={() => { setWhatsVenda(null); carregar(); }} />
      )}
    </div>
  );
}

const iconeBtn = (cor: string): React.CSSProperties => ({ background: 'none', border: 'none', cursor: 'pointer', color: cor, padding: 0, display: 'flex' });

function Modal({ titulo, largura = 520, onClose, children }: { titulo: string; largura?: number; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fin-modal-overlay">
      <div className="fin-modal-card" style={{ width: `min(${largura}px, 94vw)` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h3 style={{ flex: 1 }}>{titulo}</h3>
          <button onClick={onClose} style={{ ...iconeBtn('var(--fin-ink-muted)'), marginLeft: '10px' }} title="Fechar"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// PRODUTO (novo / editar)
// ============================================================
function ProdutoModal({ produto, onClose, onSaved }: { produto: Produto | null; onClose: () => void; onSaved: () => void }) {
  const novo = !produto;
  const [f, setF] = useState({
    nome: produto?.nome || '', codigo: produto?.codigo || '', preco_venda: produto ? String(produto.preco_venda) : '',
    stock_minimo: produto?.stock_minimo != null ? String(produto.stock_minimo) : '', stock: produto ? String(produto.stock) : '',
    quantidade_inicial: '', custo_unitario: '', fornecedor: '', registar_despesa: true,
  });
  const [foto, setFoto] = useState<File | null>(null);
  const [fatura, setFatura] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const preview = useMemo(() => (foto ? URL.createObjectURL(foto) : produto?.foto_url || ''), [foto, produto]);
  const totalCompra = num(f.quantidade_inicial) * num(f.custo_unitario);

  const gravar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('nome', f.nome);
      fd.append('codigo', f.codigo);
      fd.append('preco_venda', f.preco_venda);
      fd.append('stock_minimo', f.stock_minimo);
      if (foto) fd.append('foto', foto);
      if (novo) {
        fd.append('quantidade_inicial', f.quantidade_inicial);
        fd.append('custo_unitario', f.custo_unitario);
        fd.append('fornecedor', f.fornecedor);
        fd.append('registar_despesa', String(f.registar_despesa));
        if (fatura) fd.append('fatura', fatura);
      } else if (f.stock !== String(produto!.stock)) {
        fd.append('stock', f.stock);
      }
      const r = await authFetch(`${API}/api/financeiro/produtos${novo ? '' : `/${produto!.id}`}`, { method: novo ? 'POST' : 'PUT', body: fd });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      onSaved();
    } catch (err: any) {
      alert(err.message || 'Não foi possível gravar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal titulo={novo ? 'Novo produto' : `Editar — ${produto!.nome}`} onClose={onClose}>
      <form onSubmit={gravar}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '14px' }}>
          {preview
            ? <img src={preview} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--fin-border)' }} />
            : <div style={{ width: 72, height: 72, borderRadius: '6px', background: 'var(--fin-canvas)', border: '1px dashed var(--fin-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fin-ink-faint)' }}><ImageIcon size={22} /></div>}
          <div className="fin-field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Foto do produto (opcional)</label>
            <input type="file" accept="image/*" onChange={e => setFoto(e.target.files?.[0] || null)} />
          </div>
        </div>

        <div className="fin-field">
          <label>Nome *</label>
          <input required value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="Ex: Sabonete 100g" />
        </div>
        <div className="fin-field-row">
          <div className="fin-field">
            <label>Preço de venda (Kz) *</label>
            <input required type="number" min="0" step="any" value={f.preco_venda} onChange={e => setF({ ...f, preco_venda: e.target.value })} />
          </div>
          <div className="fin-field">
            <label>Código (opcional)</label>
            <input value={f.codigo} onChange={e => setF({ ...f, codigo: e.target.value })} placeholder="Ex: SAB-100" />
          </div>
        </div>
        <div className="fin-field-row">
          <div className="fin-field">
            <label>Avisar quando o stock chegar a</label>
            <input type="number" min="0" step="any" value={f.stock_minimo} onChange={e => setF({ ...f, stock_minimo: e.target.value })} placeholder="Ex: 5" />
          </div>
          {!novo && (
            <div className="fin-field">
              <label>Stock atual (acerto)</label>
              <input type="number" step="any" value={f.stock} onChange={e => setF({ ...f, stock: e.target.value })} />
            </div>
          )}
        </div>
        {!novo && (
          <div style={{ fontSize: '11.5px', color: 'var(--fin-ink-muted)', marginTop: '-6px', marginBottom: '12px', lineHeight: 1.5 }}>
            O stock muda sozinho com as compras e as vendas. Mude-o aqui só para acertar (perdas, contagem).
          </div>
        )}

        {novo && (
          <div style={{ borderTop: '1px solid var(--fin-border-soft)', paddingTop: '14px', marginTop: '4px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fin-ink-muted)', marginBottom: '10px' }}>STOCK INICIAL (OPCIONAL) — O QUE COMPROU</div>
            <div className="fin-field-row">
              <div className="fin-field">
                <label>Quantidade</label>
                <input type="number" min="0" step="any" value={f.quantidade_inicial} onChange={e => setF({ ...f, quantidade_inicial: e.target.value })} />
              </div>
              <div className="fin-field">
                <label>Custo por unidade (Kz)</label>
                <input type="number" min="0" step="any" value={f.custo_unitario} onChange={e => setF({ ...f, custo_unitario: e.target.value })} required={num(f.quantidade_inicial) > 0} />
              </div>
            </div>
            {num(f.quantidade_inicial) > 0 && (
              <>
                <div className="fin-field">
                  <label>Fornecedor (opcional)</label>
                  <input value={f.fornecedor} onChange={e => setF({ ...f, fornecedor: e.target.value })} />
                </div>
                <div className="fin-field">
                  <label>Fatura da compra (opcional)</label>
                  <input type="file" accept="image/*,.pdf" onChange={e => setFatura(e.target.files?.[0] || null)} />
                </div>
                <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', marginBottom: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={f.registar_despesa} onChange={e => setF({ ...f, registar_despesa: e.target.checked })} />
                  Registar esta compra nas despesas ({formatKz(totalCompra)})
                </label>
                {!f.registar_despesa && (
                  <div style={{ fontSize: '11.5px', color: 'var(--fin-ink-muted)', marginBottom: '10px' }}>Para stock que já tinha antes de usar o sistema: entra no stock, mas não conta como gasto agora.</div>
                )}
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          <button type="button" className="fin-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="fin-btn fin-btn-primary" disabled={saving}>{saving ? 'A gravar...' : 'Gravar produto'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// COMPRA (repor stock), com o histórico das compras
// ============================================================
function CompraModal({ produto, onClose, onSaved }: { produto: Produto; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ quantidade: '', custo_unitario: String(produto.preco_custo || ''), fornecedor: '', data: hoje(), forma_pagamento: FORMAS[0], registar_despesa: true });
  const [fatura, setFatura] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [compras, setCompras] = useState<any[] | null>(null);
  const total = num(f.quantidade) * num(f.custo_unitario);

  useEffect(() => {
    authFetch(`${API}/api/financeiro/produtos/${produto.id}/compras`).then(r => r.json()).then(d => setCompras(d.success ? d.compras : [])).catch(() => setCompras([]));
  }, [produto.id]);

  const gravar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, String(v)));
      if (fatura) fd.append('fatura', fatura);
      const r = await authFetch(`${API}/api/financeiro/produtos/${produto.id}/compras`, { method: 'POST', body: fd });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      onSaved();
    } catch (err: any) {
      alert(err.message || 'Não foi possível gravar a compra.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal titulo={`Compra — ${produto.nome}`} onClose={onClose}>
      <form onSubmit={gravar}>
        <div className="fin-field-row">
          <div className="fin-field">
            <label>Quantidade comprada *</label>
            <input required type="number" min="0" step="any" value={f.quantidade} onChange={e => setF({ ...f, quantidade: e.target.value })} />
          </div>
          <div className="fin-field">
            <label>Custo por unidade (Kz) *</label>
            <input required type="number" min="0" step="any" value={f.custo_unitario} onChange={e => setF({ ...f, custo_unitario: e.target.value })} />
          </div>
        </div>
        <div className="fin-field-row">
          <div className="fin-field">
            <label>Fornecedor</label>
            <input value={f.fornecedor} onChange={e => setF({ ...f, fornecedor: e.target.value })} />
          </div>
          <div className="fin-field">
            <label>Data</label>
            <input type="date" value={f.data} onChange={e => setF({ ...f, data: e.target.value })} />
          </div>
        </div>
        <div className="fin-field-row">
          <div className="fin-field">
            <label>Forma de pagamento</label>
            <select value={f.forma_pagamento} onChange={e => setF({ ...f, forma_pagamento: e.target.value })}>
              {FORMAS.map(x => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div className="fin-field">
            <label>Fatura da compra</label>
            <input type="file" accept="image/*,.pdf" onChange={e => setFatura(e.target.files?.[0] || null)} />
          </div>
        </div>
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', marginBottom: '6px', cursor: 'pointer' }}>
          <input type="checkbox" checked={f.registar_despesa} onChange={e => setF({ ...f, registar_despesa: e.target.checked })} />
          Registar nas despesas
        </label>
        <div style={{ fontSize: '14px', fontWeight: 700, margin: '10px 0 4px' }}>Total da compra: {formatKz(total)}</div>
        <div style={{ fontSize: '11.5px', color: 'var(--fin-ink-muted)' }}>O stock sobe de {Number(produto.stock)} para {Number(produto.stock) + num(f.quantidade)}.</div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
          <button type="button" className="fin-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="fin-btn fin-btn-primary" disabled={saving}>{saving ? 'A gravar...' : 'Registar compra'}</button>
        </div>
      </form>

      <div style={{ borderTop: '1px solid var(--fin-border-soft)', marginTop: '18px', paddingTop: '12px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fin-ink-muted)', marginBottom: '8px' }}>COMPRAS ANTERIORES</div>
        {compras === null && <div style={{ fontSize: '12.5px', color: 'var(--fin-ink-muted)' }}><Loader2 size={13} className="animate-spin" /> A carregar...</div>}
        {compras && compras.length === 0 && <div style={{ fontSize: '12.5px', color: 'var(--fin-ink-muted)' }}>Ainda não há compras deste produto.</div>}
        {compras && compras.map(c => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12.5px', padding: '6px 0', borderBottom: '1px solid var(--fin-border-soft)' }}>
            <span>{new Date(`${c.data}T12:00:00`).toLocaleDateString('pt-PT')} · {Number(c.quantidade)} × {formatKz(c.custo_unitario)}{c.fornecedor ? ` · ${c.fornecedor}` : ''}</span>
            <span style={{ display: 'flex', gap: '10px', alignItems: 'center', whiteSpace: 'nowrap' }}>
              <b>{formatKz(c.total)}</b>
              {c.fatura_path && (
                <button className="fin-attach-link" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onClick={() => abrirLinkDoServidor(`/api/financeiro/ficheiro?caminho=${encodeURIComponent(c.fatura_path)}`)}>
                  <Paperclip size={12} /> Fatura
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ============================================================
// VENDA (um ou vários produtos)
// ============================================================
function VendaModal({ produtos, onClose, onSaved }: { produtos: Produto[]; onClose: () => void; onSaved: (r: any) => void }) {
  const [linhas, setLinhas] = useState<{ produto_id: string; quantidade: string; preco: string }[]>([{ produto_id: '', quantidade: '1', preco: '' }]);
  const [cliente, setCliente] = useState({ nome: '', telefone: '' });
  const [forma, setForma] = useState(FORMAS[0]);
  const [data, setData] = useState(hoje());
  const [saving, setSaving] = useState(false);
  const porId = useMemo(() => new Map(produtos.map(p => [String(p.id), p])), [produtos]);

  const mudar = (i: number, patch: Partial<{ produto_id: string; quantidade: string; preco: string }>) =>
    setLinhas(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const escolher = (i: number, id: string) => mudar(i, { produto_id: id, preco: id ? String(porId.get(id)?.preco_venda ?? '') : '' });

  const total = linhas.reduce((a, l) => a + num(l.quantidade) * num(l.preco), 0);

  // Quanto se está a vender de cada produto, somando as linhas repetidas.
  const pedidos = useMemo(() => {
    const m = new Map<string, number>();
    linhas.forEach(l => { if (l.produto_id) m.set(l.produto_id, (m.get(l.produto_id) || 0) + num(l.quantidade)); });
    return m;
  }, [linhas]);
  const semStock = [...pedidos.entries()].filter(([id, q]) => q > (Number(porId.get(id)?.stock) || 0));

  const gravar = async (e: React.FormEvent) => {
    e.preventDefault();
    const validas = linhas.filter(l => l.produto_id && num(l.quantidade) > 0);
    if (validas.length === 0) { alert('Escolha pelo menos um produto.'); return; }
    setSaving(true);
    try {
      const r = await authFetch(`${API}/api/financeiro/vendas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens: validas.map(l => ({ produto_id: Number(l.produto_id), quantidade: num(l.quantidade), preco_unitario: num(l.preco) })),
          cliente_nome: cliente.nome, cliente_telefone: cliente.telefone, forma_pagamento: forma, data,
        }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      onSaved({ ...d, cliente_telefone: cliente.telefone });
    } catch (err: any) {
      alert(err.message || 'Não foi possível registar a venda.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal titulo="Registar venda" largura={640} onClose={onClose}>
      <form onSubmit={gravar}>
        {linhas.map((l, i) => {
          const p = porId.get(l.produto_id);
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.2fr) minmax(0, 0.8fr) minmax(0, 1.1fr) auto', gap: '8px', alignItems: 'end', marginBottom: '8px' }}>
              <div className="fin-field" style={{ marginBottom: 0 }}>
                {i === 0 && <label>Produto</label>}
                <select value={l.produto_id} onChange={e => escolher(i, e.target.value)}>
                  <option value="">Escolher...</option>
                  {produtos.map(x => <option key={x.id} value={x.id}>{x.nome} (stock: {Number(x.stock)})</option>)}
                </select>
              </div>
              <div className="fin-field" style={{ marginBottom: 0 }}>
                {i === 0 && <label>Qtd</label>}
                <input type="number" min="0" step="any" value={l.quantidade} onChange={e => mudar(i, { quantidade: e.target.value })} />
              </div>
              <div className="fin-field" style={{ marginBottom: 0 }}>
                {i === 0 && <label>Preço unit. (Kz)</label>}
                <input type="number" min="0" step="any" value={l.preco} onChange={e => mudar(i, { preco: e.target.value })} placeholder={p ? String(p.preco_venda) : ''} />
              </div>
              <button type="button" title="Tirar esta linha" onClick={() => setLinhas(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)}
                style={{ ...iconeBtn('var(--fin-bad-fg)'), paddingBottom: '10px' }}><X size={16} /></button>
            </div>
          );
        })}
        <button type="button" className="fin-btn fin-btn-sm" onClick={() => setLinhas(ls => [...ls, { produto_id: '', quantidade: '1', preco: '' }])} style={{ marginBottom: '12px' }}>
          <Plus size={14} /> Adicionar produto
        </button>

        {semStock.length > 0 && (
          <div style={{ padding: '9px 12px', background: 'var(--fin-warn-bg)', color: 'var(--fin-warn-fg)', borderRadius: '2px', fontSize: '12.5px', marginBottom: '12px', lineHeight: 1.6 }}>
            {semStock.map(([id, q]) => {
              const p = porId.get(id)!;
              return <div key={id}><b>{p.nome}</b>: só há {Number(p.stock)} em stock e está a vender {q}. A venda regista-se na mesma e o stock fica em {Number(p.stock) - q}.</div>;
            })}
          </div>
        )}

        <div className="fin-field-row">
          <div className="fin-field">
            <label>Cliente (opcional)</label>
            <input value={cliente.nome} onChange={e => setCliente({ ...cliente, nome: e.target.value })} placeholder="Nome" />
          </div>
          <div className="fin-field">
            <label>WhatsApp do cliente (opcional)</label>
            <input value={cliente.telefone} onChange={e => setCliente({ ...cliente, telefone: e.target.value })} placeholder="Ex: 923 000 000" />
          </div>
        </div>
        <div className="fin-field-row">
          <div className="fin-field">
            <label>Forma de pagamento</label>
            <select value={forma} onChange={e => setForma(e.target.value)}>{FORMAS.map(x => <option key={x}>{x}</option>)}</select>
          </div>
          <div className="fin-field">
            <label>Data</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '17px', fontWeight: 800 }}>Total: {formatKz(total)}</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="fin-btn" onClick={onClose}>Cancelar</button>
            <button type="submit" className="fin-btn fin-btn-primary" disabled={saving}>{saving ? 'A registar...' : 'Registar venda'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function ResultadoVenda({ resultado, onClose, onWhatsApp }: { resultado: any; onClose: () => void; onWhatsApp: () => void }) {
  return (
    <Modal titulo={`Venda nº ${nComprovativo(resultado.numero)} registada`} largura={460} onClose={onClose}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
        <CheckCircle2 size={22} color="var(--fin-good-fg)" />
        <div style={{ fontSize: '14px' }}>Total: <b>{formatKz(resultado.total)}</b>. O stock foi atualizado e a venda entrou nas Transações.</div>
      </div>
      {(resultado.avisos || []).length > 0 && (
        <div style={{ padding: '9px 12px', background: 'var(--fin-warn-bg)', color: 'var(--fin-warn-fg)', borderRadius: '2px', fontSize: '12.5px', marginBottom: '12px', lineHeight: 1.6 }}>
          {resultado.avisos.map((a: string, i: number) => <div key={i}>{a}</div>)}
        </div>
      )}
      <div style={{ fontSize: '12.5px', color: 'var(--fin-ink-muted)', marginBottom: '14px', lineHeight: 1.6 }}>
        O comprovativo fica guardado no sistema. Dar uma cópia ao cliente é opcional — e o comprovativo diz que <b>não é uma fatura</b>.
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button className="fin-btn fin-btn-primary" onClick={() => abrirLinkDoServidor(`/api/financeiro/vendas/${resultado.id}/pdf`)}><FileText size={15} /> Abrir comprovativo</button>
        <button className="fin-btn" onClick={onWhatsApp}><Send size={15} /> Enviar por WhatsApp</button>
        <button className="fin-btn" onClick={onClose}>Fechar</button>
      </div>
    </Modal>
  );
}

function WhatsAppModal({ venda, onClose, onSent }: { venda: any; onClose: () => void; onSent: () => void }) {
  const [telefone, setTelefone] = useState(venda.cliente_telefone || '');
  const [aEnviar, setAEnviar] = useState(false);
  const [feito, setFeito] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setAEnviar(true);
    try {
      const r = await authFetch(`${API}/api/financeiro/vendas/${venda.id}/whatsapp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telefone }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      setFeito(true);
    } catch (err: any) {
      alert(err.message || 'Não foi possível enviar.');
    } finally {
      setAEnviar(false);
    }
  };

  return (
    <Modal titulo={`Enviar comprovativo nº ${nComprovativo(venda.numero)}`} largura={420} onClose={feito ? onSent : onClose}>
      {feito ? (
        <>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '14px', marginBottom: '14px' }}>
            <CheckCircle2 size={22} color="var(--fin-good-fg)" /> Enviado para {telefone}.
          </div>
          <button className="fin-btn fin-btn-primary" onClick={onSent}>Fechar</button>
        </>
      ) : (
        <form onSubmit={enviar}>
          <div className="fin-field">
            <label>WhatsApp do cliente</label>
            <input required autoFocus value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="Ex: 923 000 000" />
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--fin-ink-muted)', marginBottom: '12px' }}>O PDF vai pelo WhatsApp da empresa, com a nota de que não é uma fatura.</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="fin-btn" onClick={onClose}>Cancelar</button>
            <button type="submit" className="fin-btn fin-btn-primary" disabled={aEnviar}>{aEnviar ? 'A enviar...' : 'Enviar'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
