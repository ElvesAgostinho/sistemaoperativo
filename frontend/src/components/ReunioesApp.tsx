import React, { useState, useEffect } from 'react';
import { Video, Calendar, Clock, Link as LinkIcon, UserPlus, Play, CheckCircle, FileText, ListTodo, TrendingUp, AlertTriangle, Lightbulb } from 'lucide-react';
import MeetingRoom from './reunioes/MeetingRoom';

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
                    titulo: `Reunião Rápida - ${agora.toLocaleTimeString('pt-PT', {hour: '2-digit', minute:'2-digit'})}`, 
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
        try { pAltos = JSON.parse(activeReuniao.pontos_altos || '[]'); } catch(e){}
        try { pBaixos = JSON.parse(activeReuniao.pontos_baixos || '[]'); } catch(e){}
        try { recs = JSON.parse(activeReuniao.recomendacoes || '[]'); } catch(e){}

        return (
            <div style={{ padding: '24px 32px 40px', maxWidth: '1200px', margin: '0 auto', overflowY: 'auto', height: '100%' }}>
                <button onClick={() => setView('list')} style={{ marginBottom: '20px', background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', padding: 0 }}>
                    &larr; Voltar às Reuniões
                </button>

                <h1 style={{ margin: '0 0 6px 0', color: '#111827', fontSize: '26px', fontWeight: 700, lineHeight: 1.3 }}>{activeReuniao.titulo} - Ata de Reunião</h1>
                <p style={{ color: '#6b7280', margin: '0 0 28px 0', fontSize: '14px' }}>Realizada a {new Date(activeReuniao.data_hora).toLocaleString('pt-PT')}</p>

                <div className="ata-grid">
                    {/* Coluna Principal: Resumo e Pontos */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>

                        <div className="ata-card">
                            <h3 className="ata-card-title">
                                <FileText size={18} color="#3b82f6" /> Resumo Executivo
                            </h3>
                            <div style={{ lineHeight: 1.6, color: '#4b5563', whiteSpace: 'pre-wrap', fontSize: '14px' }}>
                                {activeReuniao.resumo_ia}
                            </div>
                        </div>

                        <div className="ata-subgrid">
                            <div className="ata-card" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                                <h4 className="ata-card-subtitle" style={{ color: '#166534' }}>
                                    <TrendingUp size={16} /> Pontos Altos
                                </h4>
                                <ul style={{ paddingLeft: '18px', margin: 0, color: '#15803d', fontSize: '13px', lineHeight: 1.6 }}>
                                    {pAltos.map((p, i) => <li key={i} style={{ marginBottom: '6px' }}>{p}</li>)}
                                    {pAltos.length === 0 && <li>Não detetados</li>}
                                </ul>
                            </div>
                            <div className="ata-card" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                                <h4 className="ata-card-subtitle" style={{ color: '#991b1b' }}>
                                    <AlertTriangle size={16} /> Pontos Baixos
                                </h4>
                                <ul style={{ paddingLeft: '18px', margin: 0, color: '#b91c1c', fontSize: '13px', lineHeight: 1.6 }}>
                                    {pBaixos.map((p, i) => <li key={i} style={{ marginBottom: '6px' }}>{p}</li>)}
                                    {pBaixos.length === 0 && <li>Não detetados</li>}
                                </ul>
                            </div>
                        </div>

                        <div className="ata-card" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                            <h4 className="ata-card-subtitle" style={{ color: '#92400e' }}>
                                <Lightbulb size={16} /> Recomendações
                            </h4>
                            <ul style={{ paddingLeft: '18px', margin: 0, color: '#b45309', fontSize: '13px', lineHeight: 1.6 }}>
                                {recs.map((p, i) => <li key={i} style={{ marginBottom: '6px' }}>{p}</li>)}
                                {recs.length === 0 && <li>Não detetadas</li>}
                            </ul>
                        </div>

                    </div>

                    {/* Coluna Secundária: Tarefas */}
                    <div className="ata-card" style={{ alignSelf: 'start', minWidth: 0 }}>
                        <h3 className="ata-card-title">
                            <ListTodo size={18} color="#10b981" /> Tarefas e Prazos ({tarefas.length})
                        </h3>

                        <form onSubmit={handleCreateTarefa} style={{ marginBottom: '20px', background: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                            <h5 style={{ margin: '0 0 12px 0', color: '#4b5563', fontSize: '13px', fontWeight: 600 }}>Adicionar Tarefa Manualmente</h5>
                            <input type="text" value={novaTarefaDescricao} onChange={e => setNovaTarefaDescricao(e.target.value)} required placeholder="Descrição da tarefa..." style={{ width: '100%', padding: '8px 10px', marginBottom: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                <input type="text" value={novaTarefaResp} onChange={e => setNovaTarefaResp(e.target.value)} placeholder="Responsável" style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                                <input type="text" value={novaTarefaPrazo} onChange={e => setNovaTarefaPrazo(e.target.value)} placeholder="Prazo (ex: Sexta)" style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }} />
                            </div>
                            <button type="submit" disabled={loading} style={{ width: '100%', background: '#10b981', color: 'white', border: 'none', padding: '9px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
                                {loading ? 'A guardar...' : '+ Adicionar Tarefa'}
                            </button>
                        </form>

                        {tarefas.length === 0 ? (
                            <p style={{ color: '#9ca3af', fontSize: '13px' }}>Nenhuma tarefa associada a esta reunião.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {tarefas.map(t => (
                                    <div key={t.id} style={{ padding: '12px', background: '#ffffff', border: '1px solid #e5e7eb', borderLeft: '4px solid #10b981', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                        <p style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 500, color: '#111827' }}>{t.descricao}</p>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px', color: '#6b7280' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><CheckCircle size={12} color="#10b981" /> {t.responsavel}</span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}><Clock size={12} /> {t.prazo}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <style>{`
                    .ata-grid {
                        display: grid;
                        grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
                        gap: 20px;
                        align-items: start;
                    }
                    .ata-subgrid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 20px;
                    }
                    .ata-card {
                        background: white;
                        padding: 20px;
                        border-radius: 10px;
                        border: 1px solid #e5e7eb;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                    }
                    .ata-card-title {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin: 0 0 16px 0;
                        color: #374151;
                        font-size: 15px;
                        font-weight: 600;
                    }
                    .ata-card-subtitle {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        margin: 0 0 12px 0;
                        font-size: 14px;
                        font-weight: 600;
                    }
                    @media (max-width: 860px) {
                        .ata-grid {
                            grid-template-columns: 1fr;
                        }
                        .ata-subgrid {
                            grid-template-columns: 1fr;
                        }
                    }
                `}</style>
            </div>
        );
    }

    // List View
    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ margin: '0 0 8px 0', color: '#111827', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Video size={32} color="#3b82f6" /> Reuniões Inteligentes
                    </h1>
                    <p style={{ margin: 0, color: '#6b7280' }}>Agende vídeo-chamadas e deixe a IA gerar a ata e as tarefas no final.</p>
                </div>
                <button 
                    onClick={handleCreateInstant} 
                    disabled={loading}
                    style={{ background: '#10b981', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)' }}
                >
                    <Video size={20} /> Reunião Instantânea
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '32px' }}>
                
                {/* Form Agendar */}
                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ margin: '0 0 20px 0', color: '#1f2937' }}>Nova Reunião</h3>
                    <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: '#4b5563' }}>Título da Reunião</label>
                            <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }} placeholder="Ex: Sincronização Semanal" />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: '#4b5563' }}>Data e Hora</label>
                            <input type="datetime-local" value={dataHora} onChange={e => setDataHora(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: '#4b5563' }}>Pessoas de Dentro (Equipa)</label>
                            <div style={{ maxHeight: '120px', overflowY: 'auto', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px', background: '#f9fafb' }}>
                                {colaboradores.length === 0 ? (
                                    <span style={{ fontSize: '12px', color: '#9ca3af' }}>Nenhum colaborador com email registado.</span>
                                ) : (
                                    colaboradores.map(colab => (
                                        <label key={colab.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '6px', cursor: 'pointer' }}>
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
                                            {colab.nome} <span style={{ color: '#6b7280', fontSize: '11px' }}>({colab.email})</span>
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: '#4b5563' }}>Pessoas de Fora (Convidados Externos)</label>
                            <textarea value={emailsExternos} onChange={e => setEmailsExternos(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', minHeight: '60px' }} placeholder="joao@cliente.com, parceiro@mail.com" />
                            <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Separados por vírgula. Eles receberão um link mágico.</p>
                        </div>
                        <button type="submit" disabled={loading} style={{ background: '#3b82f6', color: 'white', padding: '12px', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}>
                            {loading ? 'A Agendar...' : 'Agendar Reunião'}
                        </button>
                    </form>
                </div>

                {/* Listagem */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {reunioes.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '48px', background: '#f9fafb', borderRadius: '12px', border: '2px dashed #e5e7eb' }}>
                            <Calendar size={48} color="#9ca3af" style={{ marginBottom: '16px' }} />
                            <h3 style={{ color: '#4b5563', margin: '0 0 8px 0' }}>Sem reuniões agendadas</h3>
                            <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Crie a sua primeira reunião no formulário ao lado.</p>
                        </div>
                    ) : (
                        reunioes.map(r => (
                            <div key={r.id} style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                <div>
                                    <h3 style={{ margin: '0 0 8px 0', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {r.titulo}
                                        {r.estado === 'Concluida' && <span style={{ fontSize: '11px', background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '12px', fontWeight: 'normal' }}>Concluída (Ata IA Gerada)</span>}
                                        {r.estado === 'Agendada' && <span style={{ fontSize: '11px', background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '12px', fontWeight: 'normal' }}>Agendada</span>}
                                    </h3>
                                    <div style={{ display: 'flex', gap: '16px', color: '#6b7280', fontSize: '13px' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={14} /> {new Date(r.data_hora).toLocaleString('pt-PT')}</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title={r.emails_convidados}><UserPlus size={14} /> Convidados</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#3b82f6' }} onClick={() => {
                                            navigator.clipboard.writeText(r.link_jitsi);
                                            alert("Link da reunião copiado!");
                                        }}><LinkIcon size={14} /> Copiar Link</span>
                                    </div>
                                </div>
                                
                                {r.estado === 'Agendada' || r.estado === 'Em Curso' ? (
                                    <button onClick={() => joinMeeting(r.id)} style={{ background: '#10b981', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Play size={16} /> Entrar na Sala
                                    </button>
                                ) : (
                                    <button onClick={() => joinMeeting(r.id)} style={{ background: 'transparent', color: '#3b82f6', border: '1px solid #3b82f6', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <FileText size={16} /> Ver Ata IA
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
