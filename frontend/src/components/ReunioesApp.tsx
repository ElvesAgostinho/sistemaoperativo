import React, { useState, useEffect, useRef } from 'react';
import { Video, Calendar, Clock, Link as LinkIcon, UserPlus, Play, CheckCircle, FileText, ListTodo, TrendingUp, AlertTriangle, Lightbulb } from 'lucide-react';

interface Reuniao {
    id: number;
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

export default function ReunioesApp({ initialMeetingId }: { initialMeetingId?: string }) {
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

    // Jitsi & Bot
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [transcription, setTranscription] = useState<string>('');
    const [interimTranscription, setInterimTranscription] = useState<string>('');
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);
    const isMeetingActiveRef = useRef<boolean>(false);

    useEffect(() => {
        fetchReunioes();
        fetchColaboradores();
    }, []);

    useEffect(() => {
        if (initialMeetingId) {
            joinMeeting(parseInt(initialMeetingId));
        }
    }, [initialMeetingId]);

    const fetchReunioes = async () => {
        try {
            const res = await fetch('http://127.0.0.1:3001/api/reunioes');
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
            const res = await fetch('http://127.0.0.1:3001/api/hr/employees');
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
            const res = await fetch('http://127.0.0.1:3001/api/reunioes', {
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
                alert('Reunião agendada com sucesso! Links enviados por email (simulação).');
            }
        } catch (e) {
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
            const res = await fetch('http://127.0.0.1:3001/api/reunioes', {
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
            }
        } catch (e) {
            console.error(e);
            alert('Erro ao criar reunião instantânea.');
        } finally {
            setLoading(false);
        }
    };

    const joinMeeting = async (id: number) => {
        try {
            const res = await fetch(`http://127.0.0.1:3001/api/reunioes/${id}`);
            const data = await res.json();
            if (data.success) {
                setActiveReuniao(data.reuniao);
                if (data.reuniao.estado === 'Concluida') {
                    setTarefas(data.tarefas || []);
                    setView('summary');
                } else {
                    setView('room');
                    startListening();
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
            const res = await fetch(`http://127.0.0.1:3001/api/reunioes/${activeReuniao.id}/tarefas`, {
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

    const startListening = () => {
        if (!('webkitSpeechRecognition' in window)) {
            alert("O seu navegador não suporta o bot de IA (use Google Chrome).");
            return;
        }

        isMeetingActiveRef.current = true;
        const SpeechRecognition = (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'pt-PT';

        recognition.onstart = () => {
            setIsListening(true);
        };

        recognition.onresult = (event: any) => {
            let finalTranscript = '';
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript + ' ';
                } else {
                    interim += event.results[i][0].transcript;
                }
            }
            if (finalTranscript) {
                setTranscription(prev => prev + '\n' + finalTranscript.trim());
            }
            setInterimTranscription(interim);
        };

        recognition.onerror = (event: any) => {
            console.error('Erro no Speech Recognition:', event.error);
        };

        recognition.onend = () => {
            // Restart automatically if still in meeting (prevent silence timeouts)
            if (isMeetingActiveRef.current) {
                try {
                    recognition.start();
                } catch(e) {}
            } else {
                setIsListening(false);
            }
        };

        try {
            recognition.start();
        } catch(e) {}
        
        recognitionRef.current = recognition;
    };

    const stopListening = () => {
        isMeetingActiveRef.current = false;
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            setIsListening(false);
        }
    };

    const endMeeting = async () => {
        stopListening();
        if (!activeReuniao) return;

        setLoading(true);
        try {
            const res = await fetch(`http://127.0.0.1:3001/api/reunioes/${activeReuniao.id}/process-transcript`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcricao: transcription || "Reunião curta ou sem áudio detetado." })
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
        // Extract room name from jitsi link
        const roomName = activeReuniao.link_jitsi.split('/').pop();

        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white', color: '#0f172a' }}>
                <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Video size={24} color="#60a5fa" />
                        <h2 style={{ margin: 0, fontSize: '18px' }}>{activeReuniao.titulo}</h2>
                    </div>
                    <button 
                        onClick={endMeeting}
                        disabled={loading}
                        style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                        {loading ? 'A processar Resumo da IA...' : 'Terminar Reunião & Gerar Resumo IA'}
                    </button>
                </div>

                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    {/* Jitsi Iframe */}
                    <div style={{ flex: 1, position: 'relative' }}>
                        <iframe 
                            ref={iframeRef}
                            src={`https://meet.jit.si/${roomName}#userInfo.displayName="Participante BusinessOS"`}
                            allow="camera; microphone; fullscreen; display-capture; autoplay"
                            style={{ width: '100%', height: '100%', border: 'none' }}
                        />
                    </div>

                    {/* AI Copilot Side Panel */}
                    <div style={{ width: '320px', background: '#1f2937', borderLeft: '1px solid #374151', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '16px', borderBottom: '1px solid #374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className={isListening ? "pulse-dot" : ""} style={{ width: '10px', height: '10px', borderRadius: '50%', background: isListening ? '#10b981' : '#6b7280' }}></div>
                            <span style={{ fontWeight: 'bold' }}>Copilot IA (A ouvir...)</span>
                        </div>
                        <div style={{ flex: 1, padding: '16px', overflowY: 'auto', fontSize: '13px', lineHeight: 1.6, color: '#d1d5db', whiteSpace: 'pre-wrap' }}>
                            {transcription === '' && interimTranscription === '' ? (
                                <div style={{ textAlign: 'center', marginTop: '40px', color: '#6b7280' }}>
                                    <Video size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                                    <p>A aguardar que alguém fale...</p>
                                </div>
                            ) : (
                                <div>
                                    {transcription && <div style={{ marginBottom: '8px' }}>{transcription}</div>}
                                    {interimTranscription && <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>{interimTranscription}...</div>}
                                </div>
                            )}
                        </div>
                        <style>{`
                            .pulse-dot {
                                box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
                                animation: pulse 1.5s infinite cubic-bezier(0.66, 0, 0, 1);
                            }
                            @keyframes pulse {
                                to { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
                            }
                        `}</style>
                    </div>
                </div>
            </div>
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
            <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', overflowY: 'auto', height: '100%' }}>
                <button onClick={() => setView('list')} style={{ marginBottom: '20px', background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 'bold' }}>
                    &larr; Voltar às Reuniões
                </button>
                
                <h1 style={{ marginBottom: '8px', color: '#111827' }}>{activeReuniao.titulo} - Ata de Reunião</h1>
                <p style={{ color: '#6b7280', marginBottom: '32px' }}>Realizada a {new Date(activeReuniao.data_hora).toLocaleString('pt-PT')}</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '24px' }}>
                    {/* Coluna Principal: Resumo e Pontos */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        
                        <div style={{ background: 'white', padding: '24px', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#374151' }}>
                                <FileText size={20} color="#3b82f6" /> Resumo Executivo
                            </h3>
                            <div style={{ lineHeight: 1.6, color: '#4b5563', whiteSpace: 'pre-wrap' }}>
                                {activeReuniao.resumo_ia}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                <h4 style={{ color: '#166534', marginTop: 0, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <TrendingUp size={18} /> Pontos Altos
                                </h4>
                                <ul style={{ paddingLeft: '20px', margin: 0, color: '#15803d', fontSize: '14px' }}>
                                    {pAltos.map((p, i) => <li key={i} style={{ marginBottom: '6px' }}>{p}</li>)}
                                    {pAltos.length === 0 && <li>Não detetados</li>}
                                </ul>
                            </div>
                            <div style={{ background: '#fef2f2', padding: '20px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                                <h4 style={{ color: '#991b1b', marginTop: 0, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <AlertTriangle size={18} /> Pontos Baixos
                                </h4>
                                <ul style={{ paddingLeft: '20px', margin: 0, color: '#b91c1c', fontSize: '14px' }}>
                                    {pBaixos.map((p, i) => <li key={i} style={{ marginBottom: '6px' }}>{p}</li>)}
                                    {pBaixos.length === 0 && <li>Não detetados</li>}
                                </ul>
                            </div>
                        </div>

                        <div style={{ background: '#fffbeb', padding: '20px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                            <h4 style={{ color: '#92400e', marginTop: 0, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Lightbulb size={18} /> Recomendações
                            </h4>
                            <ul style={{ paddingLeft: '20px', margin: 0, color: '#b45309', fontSize: '14px' }}>
                                {recs.map((p, i) => <li key={i} style={{ marginBottom: '6px' }}>{p}</li>)}
                                {recs.length === 0 && <li>Não detetadas</li>}
                            </ul>
                        </div>

                    </div>

                    {/* Coluna Secundária: Tarefas */}
                    <div style={{ background: 'white', padding: '24px', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', alignSelf: 'start' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#374151' }}>
                            <ListTodo size={20} color="#10b981" /> Tarefas e Prazos ({tarefas.length})
                        </h3>
                        
                        <form onSubmit={handleCreateTarefa} style={{ marginBottom: '20px', background: '#f9fafb', padding: '16px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                            <h5 style={{ margin: '0 0 12px 0', color: '#4b5563' }}>Adicionar Tarefa Manualmente</h5>
                            <input type="text" value={novaTarefaDescricao} onChange={e => setNovaTarefaDescricao(e.target.value)} required placeholder="Descrição da tarefa..." style={{ width: '100%', padding: '8px', marginBottom: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                <input type="text" value={novaTarefaResp} onChange={e => setNovaTarefaResp(e.target.value)} placeholder="Responsável" style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
                                <input type="text" value={novaTarefaPrazo} onChange={e => setNovaTarefaPrazo(e.target.value)} placeholder="Prazo (ex: Sexta)" style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
                            </div>
                            <button type="submit" disabled={loading} style={{ width: '100%', background: '#10b981', color: 'white', border: 'none', padding: '8px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
                                {loading ? 'A guardar...' : '+ Adicionar Tarefa'}
                            </button>
                        </form>

                        {tarefas.length === 0 ? (
                            <p style={{ color: '#9ca3af', fontSize: '14px' }}>Nenhuma tarefa associada a esta reunião.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {tarefas.map(t => (
                                    <div key={t.id} style={{ padding: '12px', background: '#ffffff', border: '1px solid #e5e7eb', borderLeft: '4px solid #10b981', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                        <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 500, color: '#111827' }}>{t.descricao}</p>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={12} color="#10b981" /> {t.responsavel}</span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> {t.prazo}</span>
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
                                            navigator.clipboard.writeText(`http://localhost:4000/?meetingId=${r.id}`);
                                            alert("Link copiado!");
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
