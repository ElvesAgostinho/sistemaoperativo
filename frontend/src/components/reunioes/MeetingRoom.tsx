import { useEffect, useRef, useState } from 'react';
import { Video, AlertTriangle } from 'lucide-react';

interface MeetingRoomProps {
    reuniaoId: string;
    roomName: string;
    titulo: string;
    participanteNome: string;
    participanteTipo: 'host' | 'convidado';
    /** Só o host recebe — mostra o botão de terminar reunião e gerar o resumo IA. */
    onEnd?: () => void;
    endLoading?: boolean;
}

const loadJitsiScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        if ((window as any).JitsiMeetExternalAPI) return resolve();
        const existing = document.getElementById('jitsi-external-api-script');
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', reject);
            return;
        }
        const script = document.createElement('script');
        script.id = 'jitsi-external-api-script';
        script.src = 'https://meet.jit.si/external_api.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = reject;
        document.body.appendChild(script);
    });
};

/**
 * Sala de reunião reutilizável (Jitsi + Copilot IA por transcrição de voz), usada
 * tanto pelo anfitrião autenticado (ReunioesApp) quanto pelo convidado externo sem
 * login (pages/public/ReuniaoConvidado). Cada participante que entra por aqui grava
 * a sua própria transcrição local e envia fragmentos ao backend — é isso que faz a
 * ata final incluir todos os participantes, não só quem criou a reunião.
 */
export default function MeetingRoom({ reuniaoId, roomName, titulo, participanteNome, participanteTipo, onEnd, endLoading }: MeetingRoomProps) {
    const jitsiContainerRef = useRef<HTMLDivElement>(null);
    const jitsiApiRef = useRef<any>(null);
    const [transcription, setTranscription] = useState('');
    const [interimTranscription, setInterimTranscription] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [speechUnsupported, setSpeechUnsupported] = useState(false);
    const [jitsiError, setJitsiError] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);
    const isMeetingActiveRef = useRef(false);

    const postFragmento = async (fragmento: string) => {
        if (!fragmento.trim()) return;
        try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/public/reuniao/${reuniaoId}/fragmento`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ participante_nome: participanteNome, participante_tipo: participanteTipo, fragmento })
            });
        } catch (e) {
            console.error('[MeetingRoom] Erro ao guardar fragmento de transcrição:', e);
        }
    };

    const startListening = () => {
        if (!('webkitSpeechRecognition' in window)) {
            setSpeechUnsupported(true);
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
                postFragmento(finalTranscript.trim());
            }
            setInterimTranscription(interim);
        };

        recognition.onerror = (event: any) => {
            console.error('Erro no Speech Recognition:', event.error);
        };

        recognition.onend = () => {
            // Reinicia automaticamente se a reunião ainda estiver ativa (evita cortes por silêncio)
            if (isMeetingActiveRef.current) {
                try {
                    recognition.start();
                } catch (e) {}
            } else {
                setIsListening(false);
            }
        };

        try {
            recognition.start();
        } catch (e) {}

        recognitionRef.current = recognition;
    };

    const stopListening = () => {
        isMeetingActiveRef.current = false;
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            setIsListening(false);
        }
    };

    useEffect(() => {
        if (!jitsiContainerRef.current) return;
        let disposed = false;

        loadJitsiScript().then(() => {
            if (disposed || !jitsiContainerRef.current) return;
            const JitsiMeetExternalAPI = (window as any).JitsiMeetExternalAPI;
            const api = new JitsiMeetExternalAPI('meet.jit.si', {
                roomName,
                parentNode: jitsiContainerRef.current,
                width: '100%',
                height: '100%',
                configOverwrite: { prejoinPageEnabled: false },
                userInfo: { displayName: participanteNome }
            });
            jitsiApiRef.current = api;

            api.addListener('videoConferenceJoined', () => {
                startListening();
            });
            api.addListener('videoConferenceLeft', () => {
                stopListening();
            });
            api.addListener('readyToClose', () => {
                stopListening();
            });
            api.addListener('errorOccurred', (e: any) => {
                console.error('[Jitsi] errorOccurred:', e);
                setJitsiError('Ocorreu um erro na videochamada. Tente recarregar a página.');
            });
            api.addListener('connectionFailed', () => {
                setJitsiError('Falha na ligação à videochamada. Verifique a sua rede e tente novamente.');
            });
        }).catch((e: any) => {
            console.error('Erro ao carregar a Jitsi External API:', e);
            setJitsiError('Não foi possível carregar a videochamada. Verifique a sua ligação à internet.');
        });

        return () => {
            disposed = true;
            stopListening();
            if (jitsiApiRef.current) {
                jitsiApiRef.current.dispose();
                jitsiApiRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomName]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white', color: '#0f172a' }}>
            <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Video size={24} color="#60a5fa" />
                    <h2 style={{ margin: 0, fontSize: '18px' }}>{titulo}</h2>
                </div>
                {onEnd && (
                    <button
                        onClick={onEnd}
                        disabled={endLoading}
                        style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: endLoading ? 'wait' : 'pointer' }}
                    >
                        {endLoading ? 'A processar Resumo da IA...' : 'Terminar Reunião & Gerar Resumo IA'}
                    </button>
                )}
            </div>

            {jitsiError && (
                <div style={{ padding: '10px 16px', background: '#fef2f2', color: '#991b1b', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #fecaca' }}>
                    <AlertTriangle size={16} /> {jitsiError}
                </div>
            )}
            {speechUnsupported && (
                <div style={{ padding: '10px 16px', background: '#fffbeb', color: '#92400e', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #fde68a' }}>
                    <AlertTriangle size={16} /> O seu navegador não suporta transcrição automática (use Google Chrome ou Edge). A videochamada continua normalmente, mas esta sessão não será incluída na ata.
                </div>
            )}

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Jitsi (via External API) */}
                <div style={{ flex: 1, position: 'relative' }}>
                    <div ref={jitsiContainerRef} style={{ width: '100%', height: '100%' }} />
                </div>

                {/* AI Copilot Side Panel */}
                <div style={{ width: '320px', background: '#1f2937', borderLeft: '1px solid #374151', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '16px', borderBottom: '1px solid #374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className={isListening ? 'pulse-dot' : ''} style={{ width: '10px', height: '10px', borderRadius: '50%', background: isListening ? '#10b981' : '#6b7280' }}></div>
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
