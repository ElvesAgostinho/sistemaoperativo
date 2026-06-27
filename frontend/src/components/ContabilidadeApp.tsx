import { useState, useEffect } from 'react';
import { BookOpen, Calendar, FileText, Plus, Save, TrendingUp, DollarSign } from 'lucide-react';

export default function ContabilidadeApp() {
    const [activeTab, setActiveTab] = useState<'contas'|'diarios'|'lancamentos'|'balancete'>('contas');
    
    // Estados para carregar dados
    const [contas, setContas] = useState<any[]>([]);
    const [diarios, setDiarios] = useState<any[]>([]);
    const [exercicios, setExercicios] = useState<any[]>([]);
    const [lancamentos, setLancamentos] = useState<any[]>([]);
    const [balancete, setBalancete] = useState<any[]>([]);

    const [loading, setLoading] = useState(true);

    const apiBase = '/api/accounting';

    useEffect(() => {
        carregarDadosBase();
    }, []);

    const carregarDadosBase = async () => {
        setLoading(true);
        try {
            const resC = await fetch(`${apiBase}/contas`);
            const dataC = await resC.json();
            if(dataC.success) setContas(dataC.contas);

            const resD = await fetch(`${apiBase}/diarios`);
            const dataD = await resD.json();
            if(dataD.success) setDiarios(dataD.diarios);

            const resE = await fetch(`${apiBase}/exercicios`);
            const dataE = await resE.json();
            if(dataE.success) {
                setExercicios(dataE.exercicios);
                // Se houver exercicios, carregar balancete do primeiro
                if (dataE.exercicios.length > 0) {
                    carregarLancamentos(dataE.exercicios[0].id);
                    carregarBalancete(dataE.exercicios[0].id);
                }
            }
        } catch(e) {
            console.error(e);
        }
        setLoading(false);
    };

    const carregarLancamentos = async (ex_id: number) => {
        try {
            const res = await fetch(`${apiBase}/lancamentos?exercicio_id=${ex_id}`);
            const data = await res.json();
            if(data.success) setLancamentos(data.lancamentos);
        } catch(e) {}
    };

    const carregarBalancete = async (ex_id: number) => {
        try {
            const res = await fetch(`${apiBase}/balancete?exercicio_id=${ex_id}`);
            const data = await res.json();
            if(data.success) setBalancete(data.balancete);
        } catch(e) {}
    };

    // UI Helpers
    const formatAOA = (num: number) => new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(num || 0);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', height: '100%' }}>
            {/* Header */}
            <div style={{ padding: '24px 32px', backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '12px' }}>
                    <BookOpen size={32} color="#0f172a" />
                </div>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#0f172a', margin: 0 }}>Contabilidade ERP</h1>
                    <p style={{ color: '#64748b', margin: '4px 0 0 0', fontSize: '14px' }}>Gestão contabilística profissional baseada em partidas dobradas</p>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', padding: '0 32px', backgroundColor: 'white', borderBottom: '1px solid #e2e8f0' }}>
                <div onClick={() => setActiveTab('contas')} style={{ padding: '16px 24px', cursor: 'pointer', borderBottom: activeTab === 'contas' ? '2px solid #0f172a' : '2px solid transparent', color: activeTab === 'contas' ? '#0f172a' : '#64748b', fontWeight: activeTab === 'contas' ? 600 : 400 }}>
                    Plano de Contas
                </div>
                <div onClick={() => setActiveTab('diarios')} style={{ padding: '16px 24px', cursor: 'pointer', borderBottom: activeTab === 'diarios' ? '2px solid #0f172a' : '2px solid transparent', color: activeTab === 'diarios' ? '#0f172a' : '#64748b', fontWeight: activeTab === 'diarios' ? 600 : 400 }}>
                    Diários e Exercícios
                </div>
                <div onClick={() => setActiveTab('lancamentos')} style={{ padding: '16px 24px', cursor: 'pointer', borderBottom: activeTab === 'lancamentos' ? '2px solid #0f172a' : '2px solid transparent', color: activeTab === 'lancamentos' ? '#0f172a' : '#64748b', fontWeight: activeTab === 'lancamentos' ? 600 : 400 }}>
                    Lançamentos
                </div>
                <div onClick={() => setActiveTab('balancete')} style={{ padding: '16px 24px', cursor: 'pointer', borderBottom: activeTab === 'balancete' ? '2px solid #0f172a' : '2px solid transparent', color: activeTab === 'balancete' ? '#0f172a' : '#64748b', fontWeight: activeTab === 'balancete' ? 600 : 400 }}>
                    Balancete
                </div>
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
                {loading ? <p>Carregando dados contabilísticos...</p> : (
                    <>
                        {activeTab === 'contas' && <PlanosDeContas contas={contas} refresh={carregarDadosBase} />}
                        {activeTab === 'diarios' && <DiariosExercicios diarios={diarios} exercicios={exercicios} refresh={carregarDadosBase} />}
                        {activeTab === 'lancamentos' && <Lancamentos 
                            lancamentos={lancamentos} 
                            diarios={diarios} 
                            exercicios={exercicios} 
                            contas={contas}
                            refresh={() => exercicios.length > 0 && carregarLancamentos(exercicios[0].id)} 
                        />}
                        {activeTab === 'balancete' && <Balancete balancete={balancete} formatAOA={formatAOA} />}
                    </>
                )}
            </div>
        </div>
    );
}

// ---------------- SUBSCREENS ----------------

function PlanosDeContas({ contas, refresh }: { contas: any[], refresh: () => void }) {
    const [open, setOpen] = useState(false);
    
    const handleSubmit = async (e: any) => {
        e.preventDefault();
        const data = {
            conta: e.target.conta.value,
            descricao: e.target.descricao.value,
            tipo: e.target.tipo.value,
            natureza: e.target.natureza.value
        };
        await fetch('/api/accounting/contas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        setOpen(false);
        refresh();
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2>Plano de Contas</h2>
                <button onClick={() => setOpen(true)} style={{ padding: '8px 16px', background: '#0f172a', color: 'white', borderRadius: '6px', border: 'none', cursor: 'pointer', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Plus size={16}/> Nova Conta
                </button>
            </div>
            
            {open && (
                <div style={{ background: 'white', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                    <h3>Nova Conta</h3>
                    <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Nº Conta</label>
                            <input name="conta" required style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} placeholder="Ex: 11.1" />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Descrição</label>
                            <input name="descricao" required style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} placeholder="Caixa Central" />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Tipo</label>
                            <select name="tipo" style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                                <option>Activo</option><option>Passivo</option><option>Capital</option><option>Proveito</option><option>Custo</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Natureza</label>
                            <select name="natureza" style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                                <option>Devedora</option><option>Credora</option>
                            </select>
                        </div>
                        <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button type="button" onClick={() => setOpen(false)} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                            <button type="submit" style={{ padding: '8px 16px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Guardar Conta</button>
                        </div>
                    </form>
                </div>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <thead style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <tr>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569' }}>Conta</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569' }}>Descrição</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569' }}>Tipo</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569' }}>Natureza</th>
                    </tr>
                </thead>
                <tbody>
                    {contas.map(c => (
                        <tr key={c.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '12px 16px', fontWeight: 500 }}>{c.conta}</td>
                            <td style={{ padding: '12px 16px' }}>{c.descricao}</td>
                            <td style={{ padding: '12px 16px' }}>{c.tipo}</td>
                            <td style={{ padding: '12px 16px' }}>{c.natureza}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function DiariosExercicios({ diarios, exercicios, refresh }: { diarios: any[], exercicios: any[], refresh: () => void }) {
    const handleExercicio = async (e: any) => {
        e.preventDefault();
        await fetch('/api/accounting/exercicios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ano: e.target.ano.value })
        });
        refresh();
    };

    const handleDiario = async (e: any) => {
        e.preventDefault();
        await fetch('/api/accounting/diarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo: e.target.codigo.value, descricao: e.target.descricao.value })
        });
        refresh();
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
            <div>
                <h2>Exercícios Fiscais</h2>
                <form onSubmit={handleExercicio} style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                    <input name="ano" type="number" required placeholder="Ano (ex: 2026)" style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}/>
                    <button type="submit" style={{ padding: '8px 16px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Abrir Ano</button>
                </form>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {exercicios.map(ex => (
                        <li key={ex.id} style={{ padding: '12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 'bold' }}>Ano Fiscal {ex.ano}</span>
                            <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>{ex.estado}</span>
                        </li>
                    ))}
                </ul>
            </div>
            <div>
                <h2>Diários de Lançamento</h2>
                <form onSubmit={handleDiario} style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                    <input name="codigo" required placeholder="Cód (ex: 11)" style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', width: '80px' }}/>
                    <input name="descricao" required placeholder="Descrição (ex: Vendas)" style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', flex: 1 }}/>
                    <button type="submit" style={{ padding: '8px 16px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Criar Diário</button>
                </form>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {diarios.map(d => (
                        <li key={d.id} style={{ padding: '12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '8px' }}>
                            <strong>{d.codigo}</strong> - {d.descricao}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function Lancamentos({ lancamentos, diarios, exercicios, contas, refresh }: { lancamentos: any[], diarios: any[], exercicios: any[], contas: any[], refresh: () => void }) {
    const [open, setOpen] = useState(false);
    const [linhas, setLinhas] = useState<any[]>([{ conta_id: '', debito: 0, credito: 0 }, { conta_id: '', debito: 0, credito: 0 }]);

    const totalDebito = linhas.reduce((acc, l) => acc + Number(l.debito || 0), 0);
    const totalCredito = linhas.reduce((acc, l) => acc + Number(l.credito || 0), 0);
    const isBalanced = totalDebito === totalCredito && totalDebito > 0;

    const handleSubmit = async (e: any) => {
        e.preventDefault();
        if(!isBalanced) return alert('Partida dobrada inválida. Débitos e Créditos devem ser iguais.');
        
        const data = {
            diario_id: e.target.diario_id.value,
            exercicio_id: e.target.exercicio_id.value,
            data_lancamento: e.target.data_lancamento.value,
            descricao: e.target.descricao.value,
            documento_referencia: e.target.documento_referencia.value,
            linhas: linhas
        };

        const res = await fetch('/api/accounting/lancamentos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if(result.success) {
            setOpen(false);
            refresh();
            setLinhas([{ conta_id: '', debito: 0, credito: 0 }, { conta_id: '', debito: 0, credito: 0 }]);
        } else {
            alert("Erro: " + result.error);
        }
    };

    return (
        <div>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2>Lançamentos Contabilísticos</h2>
                <button onClick={() => setOpen(true)} style={{ padding: '8px 16px', background: '#0f172a', color: 'white', borderRadius: '6px', border: 'none', cursor: 'pointer', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Plus size={16}/> Novo Lançamento
                </button>
            </div>

            {open && (
                <div style={{ background: 'white', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                    <h3>Novo Lançamento (Partida Dobrada)</h3>
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Exercício</label>
                                <select name="exercicio_id" required style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                                    {exercicios.map(ex => <option key={ex.id} value={ex.id}>{ex.ano}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Diário</label>
                                <select name="diario_id" required style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                                    {diarios.map(d => <option key={d.id} value={d.id}>{d.codigo} - {d.descricao}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Data</label>
                                <input name="data_lancamento" type="date" required defaultValue={new Date().toISOString().split('T')[0]} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Documento</label>
                                <input name="documento_referencia" placeholder="Fatura Nº 123" style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                            </div>
                            <div style={{ gridColumn: 'span 4' }}>
                                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Descrição Lançamento</label>
                                <input name="descricao" required placeholder="Venda de Mercadorias..." style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                            </div>
                        </div>

                        <h4>Linhas (Itens do Diário)</h4>
                        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            {linhas.map((l, index) => (
                                <div key={index} style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                                    <select 
                                        value={l.conta_id} 
                                        onChange={e => {
                                            const newL = [...linhas];
                                            newL[index].conta_id = e.target.value;
                                            setLinhas(newL);
                                        }}
                                        required 
                                        style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                    >
                                        <option value="">Selecione a Conta...</option>
                                        {contas.map(c => <option key={c.id} value={c.id}>{c.conta} - {c.descricao}</option>)}
                                    </select>
                                    <input 
                                        type="number" 
                                        placeholder="Débito" 
                                        value={l.debito || ''}
                                        onChange={e => {
                                            const newL = [...linhas];
                                            newL[index].debito = Number(e.target.value);
                                            setLinhas(newL);
                                        }}
                                        style={{ width: '150px', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                    />
                                    <input 
                                        type="number" 
                                        placeholder="Crédito" 
                                        value={l.credito || ''}
                                        onChange={e => {
                                            const newL = [...linhas];
                                            newL[index].credito = Number(e.target.value);
                                            setLinhas(newL);
                                        }}
                                        style={{ width: '150px', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                            ))}
                            <button type="button" onClick={() => setLinhas([...linhas, { conta_id: '', debito: 0, credito: 0 }])} style={{ background: 'none', border: '1px dashed #94a3b8', color: '#475569', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', width: '100%' }}>
                                + Adicionar Linha
                            </button>
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px' }}>
                            <div>
                                <span style={{ marginRight: '24px', color: totalDebito === totalCredito ? 'inherit' : 'red' }}>Total Débitos: <strong>{totalDebito}</strong></span>
                                <span style={{ color: totalDebito === totalCredito ? 'inherit' : 'red' }}>Total Créditos: <strong>{totalCredito}</strong></span>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="button" onClick={() => setOpen(false)} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                                <button type="submit" disabled={!isBalanced} style={{ padding: '8px 16px', background: isBalanced ? '#0ea5e9' : '#94a3b8', color: 'white', border: 'none', borderRadius: '6px', cursor: isBalanced ? 'pointer' : 'not-allowed' }}>Gravar Lançamento</button>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {lancamentos.map(lanc => (
                    <div key={lanc.id} style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                            <div>
                                <strong style={{ color: '#0f172a' }}>LAN Nº {lanc.id} - {lanc.descricao}</strong>
                                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                                    Diário {lanc.diario_codigo} | Data: {lanc.data_lancamento} | Doc: {lanc.documento_referencia || 'N/A'}
                                </div>
                            </div>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                            <tbody>
                                {lanc.linhas?.map((linha: any, i: number) => (
                                    <tr key={linha.id} style={{ borderBottom: i === lanc.linhas.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '8px 16px' }}>{linha.conta} - {linha.conta_descricao}</td>
                                        <td style={{ padding: '8px 16px', textAlign: 'right', color: linha.debito > 0 ? '#0f172a' : '#cbd5e1' }}>{linha.debito > 0 ? linha.debito : ''}</td>
                                        <td style={{ padding: '8px 16px', textAlign: 'right', color: linha.credito > 0 ? '#0f172a' : '#cbd5e1' }}>{linha.credito > 0 ? linha.credito : ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}
                {lancamentos.length === 0 && <p style={{ color: '#64748b', textAlign: 'center', marginTop: '40px' }}>Sem lançamentos efetuados.</p>}
            </div>
        </div>
    );
}

function Balancete({ balancete, formatAOA }: { balancete: any[], formatAOA: (v: number) => string }) {
    
    let totalD = 0, totalC = 0, totalS = 0;
    balancete.forEach(b => {
        totalD += b.total_debito;
        totalC += b.total_credito;
        totalS += b.saldo;
    });

    return (
        <div>
            <h2>Balancete de Verificação</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <thead style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <tr>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569' }}>Conta</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569' }}>Descrição</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', color: '#475569' }}>Débito Acumulado</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', color: '#475569' }}>Crédito Acumulado</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', color: '#475569' }}>Saldo</th>
                    </tr>
                </thead>
                <tbody>
                    {balancete.map((b, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '12px 16px', fontWeight: 500 }}>{b.conta}</td>
                            <td style={{ padding: '12px 16px' }}>{b.descricao}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>{formatAOA(b.total_debito)}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>{formatAOA(b.total_credito)}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', color: b.saldo > 0 ? '#16a34a' : (b.saldo < 0 ? '#dc2626' : 'inherit') }}>
                                {formatAOA(b.saldo)}
                            </td>
                        </tr>
                    ))}
                    <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
                        <td colSpan={2} style={{ padding: '12px 16px', textAlign: 'right' }}>TOTAIS:</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>{formatAOA(totalD)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>{formatAOA(totalC)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>{formatAOA(totalS)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
