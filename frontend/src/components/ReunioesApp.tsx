import React, { useState, useEffect } from 'react';
import { Video, Calendar, Clock, Link as LinkIcon, UserPlus, Play, CheckCircle, FileText, ListTodo, TrendingUp, AlertTriangle, Lightbulb } from 'lucide-react';
import MeetingRoom from './reunioes/MeetingRoom';
import './ReunioesApp.css';

interface Reuniao {
    id: string;
    titulo: string;
    data_hora: string;
    link_jitsi: string;
    emails_convidados: string;
    transcricao_raw?: string;
    resumo_ia?: string;
    pontos_altos?: string; // JSON string array
    pontos_baixos?: string;
    recomendacoes?: string;
    estado: string;
}

interface Tarefa {
    id: number;
    descricao: string;
    responsavel: string;
    prazo: string;
    estado: string;
}

const fetchWithAuth = async (url: string, options: any = {}) => {
    const token = localStorage.getItem('os_auth_token');
    return fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        }
    });
};

export default function ReunioesApp({ initialMeetingId, userName }: { initialMeetingId?: string; userName?: string }) {
    const [view, setView] = useState<'list' | 'room' | 'summary'>('list');
    const [reunioes, setReunioes] = useState<Reuniao[]>([]);
    const [activeReuniao, setActiveReuniao] = useState<Reuniao | null>(null);
    const [tarefas, setTarefas] = useState<Tarefa[]>([]);
    const [colaboradores, setColaboradores] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Form
    const [titulo, setTitulo] = useState('');
    const [dataHora, setDataHora] = useState('');
    const [emailsExternos, setEmailsExternos] = useState('');
    const [selectedInternos, setSelectedInternos] = useState<string[]>([]);

    // Nova Tarefa Manual
    const [novaTarefaDescricao, setNovaTarefaDescricao] = useState('');
    const [novaTarefaResp, setNovaTarefaResp] = useState('');
    const [novaTarefaPrazo, setNovaTarefaPrazo] = useState('');

    useEffect(() => {
        fetchReunioes();
        fetchColaboradores();
    }, []);

    useEffect(() => {
        if (initialMeetingId) {
            joinMeeting(initialMeetingId);
        }
    }, [initialMeetingId]);

    const fetchReunioes = async () => {
        try {
            const res = await fetchWithAuth(import.meta.env.VITE_API_URL + '/api/reunioes');
            const data = await res.json();
            if (data.success) {
                setReunioes(data.reunioes);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchColaboradores = async () => {
        try {
            const res = await fetchWithAuth(import.meta.env.VITE_API_URL + '/api/hr/employees');
            const data = await res.json();
            if (data.success) {
                setColaboradores(data.employees.filter((e: any) => e.email)); // Apenas os que têm email
            }
        } catch (e) {
            console.error("Erro ao buscar colaboradores", e);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const allEmails = [
            ...selectedInternos,
            ...emailsExternos.split(',').map(e => e.trim()).filter(e => e)
        ].join(', ');

        try {
            const res = await fetchWithAuth(import.meta.env.VITE_API_URL + '/api/reunioes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ titulo, data_hora: dataHora, emails_convidados: allEmails })
            });
            const data = await res.json();
            if (data.success) {
                setTitulo('');
                setDataHora('');
                setEmailsExternos('');
                setSelectedInternos([]);
                fetchReunioes();
                alert('Reunião agendada com sucesso! Os convites foram enviados por email.');
            } else {
                alert('Erro ao agendar reunião: ' + (data.error || 'Erro desconhecido'));
                console.error(data.error);
            }
        } catch (e: any) {
            alert('Erro de rede ao agendar reunião: ' + e.message);
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateInstant = async () => {
        setLoading(true);
        const agora = new Date();
        const isoStr = agora.toISOString();

        try {
            const res = await fetchWithAuth(import.meta.env.VITE_API_URL + '/api/reunioes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    titulo: `Reunião Rápida - ${agora.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`,
                    data_hora: isoStr,
                    emails_convidados: ''
                })
            });
            const data = await res.json();
            if (data.success) {
                fetchReunioes();
                joinMeeting(data.id);
            } else {
                alert('Erro ao criar reunião instantânea: ' + (data.error || 'Erro desconhecido'));
            }
        } catch (e: any) {
            console.error(e);
            alert('Erro de rede ao criar reunião instantânea: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const joinMeeting = async (id: string) => {
        try {
            const res = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/api/reunioes/${id}`);
            const data = await res.json();
            if (data.success) {
                setActiveReuniao(data.reuniao);
                if (data.reuniao.estado === 'Concluida') {
                    setTarefas(data.tarefas || []);
                    setView('summary');
                } else {
                    // Não arrancar o "Copilot a ouvir" aqui — só quando a videochamada
                    // Jitsi realmente começar (evento videoConferenceJoined, ver useEffect abaixo).
                    setView('room');
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleCreateTarefa = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeReuniao) return;
        setLoading(true);
        try {
            const res = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/api/reunioes/${activeReuniao.id}/tarefas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ descricao: novaTarefaDescricao, responsavel: novaTarefaResp, prazo: novaTarefaPrazo })
            });
            const data = await res.json();
            if (data.success) {
                setTarefas([...tarefas, data.tarefa]);
                setNovaTarefaDescricao('');
                setNovaTarefaResp('');
                setNovaTarefaPrazo('');
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const endMeeting = async () => {
        if (!activeReuniao) return;

        setLoading(true);
        try {
            // A transcrição já não vai no body — o backend reconstrói a partir dos
            // fragmentos guardados por todos os participantes (host + convidados).
            const res = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/api/reunioes/${activeReuniao.id}/process-transcript`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.success) {
                setActiveReuniao({
                    ...activeReuniao,
                    resumo_ia: data.resumo,
                    pontos_altos: JSON.stringify(data.pontos_altos || []),
                    pontos_baixos: JSON.stringify(data.pontos_baixos || []),
                    recomendacoes: JSON.stringify(data.recomendacoes || []),
                    estado: 'Concluida'
                });
                setTarefas(data.tarefas);
                setView('summary');
                fetchReunioes(); // Sincroniza a lista para que a label "Concluída" apareça
            } else {
                alert('Erro ao processar: ' + data.error);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (view === 'room' && activeReuniao) {
        return (
            <MeetingRoom
                reuniaoId={activeReuniao.id}
                roomName={activeReuniao.link_jitsi.split('/').pop() || ''}
                titulo={activeReuniao.titulo}
                participanteNome={userName || 'Anfitrião'}
                participanteTipo="host"
                onEnd={endMeeting}
                endLoading={loading}
            />
        );
    }

    if (view === 'summary' && activeReuniao) {
        let pAltos: string[] = [];
        let pBaixos: string[] = [];
        let recs: string[] = [];
        try { pAltos = JSON.parse(activeReuniao.pontos_altos || '[]'); } catch (e) { }
        try { pBaixos = JSON.parse(activeReuniao.pontos_baixos || '[]'); } catch (e) { }
        try { recs = JSON.parse(activeReuniao.recomendacoes || '[]'); } catch (e) { }

        return (
            <div className="reun-modern">
                <button onClick={() => setView('list')} className="reun-btn-ghost" style={{ marginBottom: '20px' }}>
                    &larr; Voltar às Reuniões
                </button>

                <h1 style={{ marginBottom: '6px', fontSize: '22px' }}>{activeReuniao.titulo} — Ata de Reunião</h1>
                <p style={{ color: 'var(--reun-ink-muted)', margin: '0 0 26px 0', fontSize: '13px' }}>Realizada a {new Date(activeReuniao.data_hora).toLocaleString('pt-PT')}</p>

                <div className="reun-ata-grid">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

                        <div className="reun-ata-card">
                            <h3 className="reun-ata-card-title">
                                <FileText size={17} color="var(--reun-accent)" /> Resumo Executivo
                            </h3>
                            <div style={{ lineHeight: 1.7, color: 'var(--reun-ink)', whiteSpace: 'pre-wrap', fontSize: '13.5px' }}>
                                {activeReuniao.resumo_ia}
                            </div>
                        </div>

                        <div className="reun-ata-subgrid">
                            <div className="reun-ata-card" style={{ background: 'var(--reun-good-bg)', borderColor: 'transparent' }}>
                                <h4 className="reun-ata-card-subtitle" style={{ color: 'var(--reun-good-fg)' }}>
                                    <TrendingUp size={15} /> Pontos Altos
                                </h4>
                                <ul style={{ paddingLeft: '18px', margin: 0, color: 'var(--reun-good-fg)', fontSize: '13px', lineHeight: 1.7 }}>
                                    {pAltos.map((p, i) => <li key={i} style={{ marginBottom: '6px' }}>{p}</li>)}
                                    {pAltos.length === 0 && <li>Não detetados</li>}
                                </ul>
                            </div>
                            <div className="reun-ata-card" style={{ background: 'var(--reun-bad-bg)', borderColor: 'transparent' }}>
                                <h4 className="reun-ata-card-subtitle" style={{ color: 'var(--reun-bad-fg)' }}>
                                    <AlertTriangle size={15} /> Pontos Baixos
                                </h4>
                                <ul style={{ paddingLeft: '18px', margin: 0, color: 'var(--reun-bad-fg)', fontSize: '13px', lineHeight: 1.7 }}>
                                    {pBaixos.map((p, i) => <li key={i} style={{ marginBottom: '6px' }}>{p}</li>)}
                                    {pBaixos.length === 0 && <li>Não detetados</li>}
                                </ul>
                            </div>
                        </div>

                        <div className="reun-ata-card" style={{ background: 'var(--reun-warn-bg)', borderColor: 'transparent' }}>
                            <h4 className="reun-ata-card-subtitle" style={{ color: 'var(--reun-warn-fg)' }}>
                                <Lightbulb size={15} /> Recomendações
                            </h4>
                            <ul style={{ paddingLeft: '18px', margin: 0, color: 'var(--reun-warn-fg)', fontSize: '13px', lineHeight: 1.7 }}>
                                {recs.map((p, i) => <li key={i} style={{ marginBottom: '6px' }}>{p}</li>)}
                                {recs.length === 0 && <li>Não detetadas</li>}
                            </ul>
                        </div>

                    </div>

                    <div className="reun-ata-card" style={{ alignSelf: 'start', minWidth: 0 }}>
                        <h3 className="reun-ata-card-title">
                            <ListTodo size={17} color="var(--reun-accent)" /> Tarefas e Prazos ({tarefas.length})
                        </h3>

                        <form onSubmit={handleCreateTarefa} style={{ marginBottom: '18px', background: 'var(--reun-canvas)', padding: '14px', borderRadius: '12px', border: '1px solid var(--reun-border-soft)' }}>
                            <h5 style={{ margin: '0 0 12px 0', color: 'var(--reun-ink-muted)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Adicionar Tarefa Manualmente</h5>
                            <div className="reun-field" style={{ marginBottom: '10px' }}>
                                <input type="text" value={novaTarefaDescricao} onChange={e => setNovaTarefaDescricao(e.target.value)} required placeholder="Descrição da tarefa..." />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                <input type="text" value={novaTarefaResp} onChange={e => setNovaTarefaResp(e.target.value)} placeholder="Responsável" style={{ flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: '9px', border: '1px solid var(--reun-border)', background: 'var(--reun-surface)', fontSize: '13px' }} />
                                <input type="text" value={novaTarefaPrazo} onChange={e => setNovaTarefaPrazo(e.target.value)} placeholder="Prazo (ex: Sexta)" style={{ flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: '9px', border: '1px solid var(--reun-border)', background: 'var(--reun-surface)', fontSize: '13px' }} />
                            </div>
                            <button type="submit" disabled={loading} className="reun-btn reun-btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                                {loading ? 'A guardar...' : '+ Adicionar Tarefa'}
                            </button>
                        </form>

                        {tarefas.length === 0 ? (
                            <p style={{ color: 'var(--reun-ink-faint)', fontSize: '13px' }}>Nenhuma tarefa associada a esta reunião.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                                {tarefas.map(t => (
                                    <div key={t.id} className="reun-task-item">
                                        <p style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600, color: 'var(--reun-ink)' }}>{t.descricao}</p>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px', color: 'var(--reun-ink-muted)' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><CheckCircle size={12} color="var(--reun-good-fg)" /> {t.responsavel}</span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}><Clock size={12} /> {t.prazo}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // List View
    return (
        <div className="reun-modern">
            <div className="reun-header">
                <div>
                    <h1><span className="reun-header-icon"><Video size={19} /></span> Reuniões Inteligentes</h1>
                    <p>Agende vídeo-chamadas e deixe a IA gerar a ata e as tarefas no final.</p>
                </div>
                <button onClick={handleCreateInstant} disabled={loading} className="reun-btn reun-btn-primary">
                    <Video size={18} /> Reunião Instantânea
                </button>
            </div>

            <div className="reun-layout">

                <div className="reun-panel">
                    <h3 className="reun-panel-title">Nova Reunião</h3>
                    <form onSubmit={handleCreate}>
                        <div className="reun-field">
                            <label>Título da Reunião</label>
                            <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} required placeholder="Ex: Sincronização Semanal" />
                        </div>
                        <div className="reun-field">
                            <label>Data e Hora</label>
                            <input type="datetime-local" value={dataHora} onChange={e => setDataHora(e.target.value)} required />
                        </div>
                        <div className="reun-field">
                            <label>Pessoas de Dentro (Equipa)</label>
                            <div className="reun-checklist">
                                {colaboradores.length === 0 ? (
                                    <span className="reun-checklist-empty">Nenhum colaborador com email registado.</span>
                                ) : (
                                    colaboradores.map(colab => (
                                        <label key={colab.id}>
                                            <input
                                                type="checkbox"
                                                checked={selectedInternos.includes(colab.email)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedInternos([...selectedInternos, colab.email]);
                                                    } else {
                                                        setSelectedInternos(selectedInternos.filter(em => em !== colab.email));
                                                    }
                                                }}
                                            />
                                            {colab.nome} <span style={{ color: 'var(--reun-ink-faint)', fontSize: '11px' }}>({colab.email})</span>
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>
                        <div className="reun-field" style={{ marginBottom: '20px' }}>
                            <label>Pessoas de Fora (Convidados Externos)</label>
                            <textarea value={emailsExternos} onChange={e => setEmailsExternos(e.target.value)} style={{ minHeight: '60px', resize: 'vertical' }} placeholder="joao@cliente.com, parceiro@mail.com" />
                            <p className="reun-field-hint">Separados por vírgula. Eles receberão um link mágico.</p>
                        </div>
                        <button type="submit" disabled={loading} className="reun-btn reun-btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                            {loading ? 'A Agendar...' : 'Agendar Reunião'}
                        </button>
                    </form>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {reunioes.length === 0 ? (
                        <div className="reun-empty-state">
                            <div className="reun-empty-state-icon"><Calendar size={24} /></div>
                            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--reun-ink)', marginBottom: '6px' }}>Sem reuniões agendadas</h3>
                            <p style={{ margin: 0, fontSize: '13px' }}>Crie a sua primeira reunião no formulário ao lado.</p>
                        </div>
                    ) : (
                        reunioes.map(r => (
                            <div key={r.id} className="reun-meeting-card">
                                <div>
                                    <div className="reun-meeting-title">
                                        {r.titulo}
                                        {r.estado === 'Concluida' && <span className="reun-badge reun-badge-good">Concluída (Ata IA Gerada)</span>}
                                        {r.estado === 'Agendada' && <span className="reun-badge reun-badge-info">Agendada</span>}
                                    </div>
                                    <div className="reun-meeting-meta">
                                        <span><Clock size={13} /> {new Date(r.data_hora).toLocaleString('pt-PT')}</span>
                                        <span title={r.emails_convidados}><UserPlus size={13} /> Convidados</span>
                                        <span style={{ cursor: 'pointer', color: 'var(--reun-accent)', fontWeight: 600 }} onClick={() => {
                                            navigator.clipboard.writeText(r.link_jitsi);
                                            alert("Link da reunião copiado!");
                                        }}><LinkIcon size={13} /> Copiar Link</span>
                                    </div>
                                </div>

                                {r.estado === 'Agendada' || r.estado === 'Em Curso' ? (
                                    <button onClick={() => joinMeeting(r.id)} className="reun-btn reun-btn-primary">
                                        <Play size={15} /> Entrar na Sala
                                    </button>
                                ) : (
                                    <button onClick={() => joinMeeting(r.id)} className="reun-btn">
                                        <FileText size={15} /> Ver Ata IA
                                    </button>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
