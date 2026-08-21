import React, { useState, useEffect } from 'react';
import { Users, CheckCircle, TrendingUp, AlertCircle, Trash2, ExternalLink } from 'lucide-react';
import './AfiliadosApp.css';

const authFetch = (url: string, options: any = {}) => {
  const token = localStorage.getItem('os_auth_token');
  const headers = { ...options.headers, Authorization: `Bearer ${token}` };
  return fetch(url, { ...options, headers });
};

function formatKz(value: number) {
  return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', minimumFractionDigits: 0 }).format(value || 0);
}

export default function AfiliadosApp() {
  const [afiliados, setAfiliados] = useState<any[]>([]);
  const [comissoes, setComissoes] = useState<any[]>([]);
  const [materiais, setMateriais] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'afiliados' | 'comissoes' | 'materiais'>('dashboard');

  const [novoAfiliado, setNovoAfiliado] = useState({
    nome: '', email: '', nif: '', iban: '', codigo_referencia: '', percentagem_comissao: 10, tipo_comissao: 'Vitalicia', senha: ''
  });

  const [novoMaterial, setNovoMaterial] = useState({
    titulo: '', tipo: 'imagem', url: '', descricao: ''
  });

  const fetchData = async () => {
    try {
      const afRes = await authFetch(import.meta.env.VITE_API_URL + '/api/afiliados');
      if (afRes.ok) {
        const afData = await afRes.json();
        setAfiliados(afData.afiliados || []);
      }

      const comRes = await authFetch(import.meta.env.VITE_API_URL + '/api/afiliados/comissoes');
      if (comRes.ok) {
        const comData = await comRes.json();
        setComissoes(comData.comissoes || []);
      }

      const matRes = await authFetch(import.meta.env.VITE_API_URL + '/api/afiliados/materiais');
      if (matRes.ok) {
        const matData = await matRes.json();
        setMateriais(matData.materiais || []);
      }
    } catch (error) {
      console.error('Erro a carregar dados de afiliados', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateAfiliado = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await authFetch(import.meta.env.VITE_API_URL + '/api/afiliados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novoAfiliado)
      });
      if (res.ok) {
        alert('Afiliado criado com sucesso! Envie o link /portal-afiliado e a senha para o parceiro.');
        setNovoAfiliado({ nome: '', email: '', nif: '', iban: '', codigo_referencia: '', percentagem_comissao: 10, tipo_comissao: 'Vitalicia', senha: '' });
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao criar afiliado');
      }
    } catch (error) {
      alert('Erro de ligação ao servidor');
    }
  };

  const handleCreateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await authFetch(import.meta.env.VITE_API_URL + '/api/afiliados/materiais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novoMaterial)
      });
      if (res.ok) {
        setNovoMaterial({ titulo: '', tipo: 'imagem', url: '', descricao: '' });
        fetchData();
      } else {
        alert('Erro ao criar material');
      }
    } catch (error) {
      alert('Erro de ligação');
    }
  };

  const apagarMaterial = async (id: number) => {
    if (!window.confirm('Apagar este material?')) return;
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/api/afiliados/materiais/${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch (error) {
      console.error(error);
    }
  };

  const aprovarComissao = async (id: number) => {
    if (!window.confirm('Tem a certeza que deseja aprovar esta comissão?')) return;
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/api/afiliados/comissoes/${id}/aprovar`, { method: 'POST' });
      if (res.ok) fetchData();
    } catch (error) {
      console.error(error);
    }
  };

  const pagarComissao = async (id: number) => {
    if (!window.confirm('Confirma que já efetuou a transferência bancária para o afiliado?')) return;
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/api/afiliados/comissoes/${id}/pagar`, { method: 'POST' });
      if (res.ok) fetchData();
    } catch (error) {
      console.error(error);
    }
  };

  const totalPago = comissoes.filter(c => c.estado === 'Paga' || c.estado === 'Processada').reduce((acc, curr) => acc + curr.valor_comissao, 0);
  const totalPendente = comissoes.filter(c => c.estado === 'Pendente' || c.estado === 'Aprovada').reduce((acc, curr) => acc + curr.valor_comissao, 0);
  const totalVendasOrigem = comissoes.reduce((acc, curr) => acc + curr.valor_base, 0);

  const TABS: { key: typeof activeTab; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'afiliados', label: 'Gestão de Afiliados' },
    { key: 'comissoes', label: 'Aprovações & Pagamentos' },
    { key: 'materiais', label: 'Materiais de Marketing' },
  ];

  return (
    <div className="affiliates-modern">

      <div className="af-header">
        <h1>Programa de Afiliados e Parcerias</h1>
        <div className="af-pillnav">
          {TABS.map(t => (
            <button key={t.key} className={activeTab === t.key ? 'active' : ''} onClick={() => setActiveTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div className="af-kpi-grid">
          <div className="af-kpi-card">
            <div className="af-kpi-icon"><TrendingUp size={17} /></div>
            <div className="af-kpi-value">{formatKz(totalVendasOrigem)}</div>
            <div className="af-kpi-label">Receita Total</div>
          </div>
          <div className="af-kpi-card">
            <div className="af-kpi-icon"><CheckCircle size={17} /></div>
            <div className="af-kpi-value">{formatKz(totalPago)}</div>
            <div className="af-kpi-label">Comissões Pagas</div>
          </div>
          <div className="af-kpi-card">
            <div className="af-kpi-icon"><AlertCircle size={17} /></div>
            <div className="af-kpi-value">{formatKz(totalPendente)}</div>
            <div className="af-kpi-label">Passivo Pendente</div>
          </div>
          <div className="af-kpi-card">
            <div className="af-kpi-icon"><Users size={17} /></div>
            <div className="af-kpi-value">{afiliados.length}</div>
            <div className="af-kpi-label">Afiliados Ativos</div>
          </div>
        </div>
      )}

      {activeTab === 'afiliados' && (
        <div className="af-split">
          <div className="af-panel">
            <div className="af-panel-title">Adicionar Novo Parceiro</div>
            <form onSubmit={handleCreateAfiliado}>
              <div className="af-field">
                <label>Nome</label>
                <input required type="text" value={novoAfiliado.nome} onChange={e => setNovoAfiliado({...novoAfiliado, nome: e.target.value})} />
              </div>
              <div className="af-field-row">
                <div className="af-field">
                  <label>Email</label>
                  <input required type="email" value={novoAfiliado.email} onChange={e => setNovoAfiliado({...novoAfiliado, email: e.target.value})} />
                </div>
                <div className="af-field">
                  <label>Palavra-passe (Login)</label>
                  <input required type="text" placeholder="Ex: 123456" value={novoAfiliado.senha} onChange={e => setNovoAfiliado({...novoAfiliado, senha: e.target.value})} />
                </div>
              </div>
              <div className="af-field-row">
                <div className="af-field">
                  <label>NIF</label>
                  <input type="text" value={novoAfiliado.nif} onChange={e => setNovoAfiliado({...novoAfiliado, nif: e.target.value})} />
                </div>
                <div className="af-field">
                  <label>Código (Ex: VIP10)</label>
                  <input required type="text" style={{ textTransform: 'uppercase' }} value={novoAfiliado.codigo_referencia} onChange={e => setNovoAfiliado({...novoAfiliado, codigo_referencia: e.target.value.toUpperCase()})} />
                </div>
              </div>
              <div className="af-field">
                <label>IBAN para Pagamentos</label>
                <input type="text" value={novoAfiliado.iban} onChange={e => setNovoAfiliado({...novoAfiliado, iban: e.target.value})} />
              </div>
              <div className="af-field-row">
                <div className="af-field">
                  <label>% Comissão</label>
                  <input required type="number" min="1" max="100" value={novoAfiliado.percentagem_comissao} onChange={e => setNovoAfiliado({...novoAfiliado, percentagem_comissao: Number(e.target.value)})} />
                </div>
                <div className="af-field">
                  <label>Modelo Comissão</label>
                  <select value={novoAfiliado.tipo_comissao} onChange={e => setNovoAfiliado({...novoAfiliado, tipo_comissao: e.target.value})}>
                    <option value="Vitalicia">Vitalícia (Todas as Vendas)</option>
                    <option value="Unica">Apenas na 1ª Venda</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="af-btn af-btn-primary">Criar Afiliado</button>

              <div className="af-hint">
                <strong>Como o afiliado entra?</strong><br />
                Após criar a conta, envie-lhe o link <code>{window.location.origin}/portal-afiliado</code>, juntamente com o seu Email e Palavra-passe configurados acima.
              </div>
            </form>
          </div>

          <div className="af-table-card">
            <table>
              <thead>
                <tr>
                  <th>Afiliado</th>
                  <th>Código</th>
                  <th>Comissão</th>
                  <th>Total Gerado</th>
                </tr>
              </thead>
              <tbody>
                {afiliados.map(a => (
                  <tr key={a.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{a.nome}</div>
                      <div style={{ fontSize: '12px', color: 'var(--af-ink-muted)' }}>{a.email}</div>
                    </td>
                    <td><span className="af-code-chip">{a.codigo_referencia}</span></td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--af-accent)' }}>{a.percentagem_comissao}%</div>
                      <div style={{ fontSize: '12px', color: 'var(--af-ink-muted)' }}>{a.tipo_comissao}</div>
                    </td>
                    <td style={{ fontFamily: 'var(--af-font-mono)', fontVariantNumeric: 'tabular-nums' }}>{formatKz(a.total_gerado)}</td>
                  </tr>
                ))}
                {afiliados.length === 0 && (
                  <tr><td colSpan={4} className="af-empty-row">Nenhum afiliado registado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'comissoes' && (
        <div className="af-table-card">
          <table>
            <thead>
              <tr>
                <th>Afiliado & Cliente</th>
                <th>Negócio (CRM)</th>
                <th>Comissão</th>
                <th>Estado</th>
                <th>Ações de Tesouraria</th>
              </tr>
            </thead>
            <tbody>
              {comissoes.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.afiliado_nome}</div>
                    <div style={{ fontSize: '12px', color: 'var(--af-ink-muted)' }}>Indicou: {c.cliente_nome || 'Desconhecido'}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{c.negocio_titulo}</div>
                    <div style={{ fontSize: '12px', color: 'var(--af-ink-muted)' }}>Base: {formatKz(c.valor_base)}</div>
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--af-accent)', fontFamily: 'var(--af-font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatKz(c.valor_comissao)}
                  </td>
                  <td>
                    {c.estado === 'Pendente' && <span className="af-badge af-badge-warn">Pendente Validação</span>}
                    {c.estado === 'Aprovada' && <span className="af-badge af-badge-info">Aprovada (Por Pagar)</span>}
                    {c.estado === 'Paga' && <span className="af-badge af-badge-good">Paga (Manual)</span>}
                    {c.estado === 'Processada' && <span className="af-badge af-badge-good">Paga Via Salário RH</span>}
                  </td>
                  <td>
                    {c.estado === 'Pendente' && (
                      <button onClick={() => aprovarComissao(c.id)} className="af-btn af-btn-sm">Aprovar Comissão</button>
                    )}
                    {c.estado === 'Aprovada' && c.colaborador_id == null && (
                      <button onClick={() => pagarComissao(c.id)} className="af-btn af-btn-sm af-btn-primary" style={{ width: 'auto' }}>Marcar Transferência Bancária</button>
                    )}
                    {c.estado === 'Aprovada' && c.colaborador_id != null && (
                      <span style={{ fontSize: '12px', color: 'var(--af-ink-muted)' }}>Aguardando Proc. Salarial</span>
                    )}
                  </td>
                </tr>
              ))}
              {comissoes.length === 0 && (
                <tr><td colSpan={5} className="af-empty-row">Nenhuma comissão registada ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'materiais' && (
        <div className="af-split">
          <div className="af-panel">
            <div className="af-panel-title">Adicionar Material</div>
            <form onSubmit={handleCreateMaterial}>
              <div className="af-field">
                <label>Título</label>
                <input required type="text" value={novoMaterial.titulo} onChange={e => setNovoMaterial({...novoMaterial, titulo: e.target.value})} />
              </div>
              <div className="af-field">
                <label>Tipo</label>
                <select value={novoMaterial.tipo} onChange={e => setNovoMaterial({...novoMaterial, tipo: e.target.value})}>
                  <option value="imagem">Imagem (Banner)</option>
                  <option value="video">Vídeo</option>
                  <option value="link">Link / Texto (Copy)</option>
                </select>
              </div>
              <div className="af-field">
                <label>URL / Link para Download</label>
                <input required type="text" placeholder="https://..." value={novoMaterial.url} onChange={e => setNovoMaterial({...novoMaterial, url: e.target.value})} />
              </div>
              <div className="af-field">
                <label>Descrição (Opcional)</label>
                <textarea rows={3} value={novoMaterial.descricao} onChange={e => setNovoMaterial({...novoMaterial, descricao: e.target.value})} />
              </div>
              <button type="submit" className="af-btn af-btn-primary">Disponibilizar Material</button>
            </form>
          </div>

          <div className="af-panel">
            <div className="af-panel-title">Materiais Disponíveis no Portal</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {materiais.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--af-ink-faint)', padding: '32px 0' }}>Sem materiais de marketing adicionados.</div>
              ) : (
                materiais.map((m: any) => (
                  <div key={m.id} className="af-material-row">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                        <span className="af-material-tag">{m.tipo}</span>
                        <h4 style={{ fontSize: '14px' }}>{m.titulo}</h4>
                      </div>
                      {m.descricao && <p style={{ margin: '0 0 6px 0', color: 'var(--af-ink-muted)', fontSize: '13px' }}>{m.descricao}</p>}
                      <a href={m.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', color: 'var(--af-accent)', textDecoration: 'none', fontWeight: 600 }}>
                        <ExternalLink size={12} /> Testar Link / Pré-visualizar
                      </a>
                    </div>
                    <button onClick={() => apagarMaterial(m.id)} className="af-btn af-btn-sm af-btn-danger-soft">
                      <Trash2 size={13} /> Apagar
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
