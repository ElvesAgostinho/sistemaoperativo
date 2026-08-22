import { useEffect, useRef, useState } from 'react';
import { Video, AlertTriangle } from 'lucide-react';

interface MeetingRoomProps {
    reuniaoId: string;
    /** URL completo da sala Daily.co, já com o token de acesso embutido (?t=...) — mintado no backend, nunca cru/partilhável. */
    dailyUrl: string | null;
    titulo: string;
    participanteNome: string;
    participanteTipo: 'host' | 'convidado';
    /** Só o host recebe — mostra o botão de terminar reunião. */
    onEnd?: () => void;
    endLoading?: boolean;
}

/**
 * Sala de reunião reutilizável (Daily.co Prebuilt via iframe + legendas ao vivo
 * por transcrição de voz no browser), usada tanto pelo anfitrião autenticado
 * (ReunioesApp) quanto pelo convidado externo sem login (pages/public/ReuniaoConvidado).
 *
 * A videochamada em si (grelha, mudo, câmara, partilha de ecrã) e a gravação em
 * nuvem são inteiramente geridas pela Daily — este componente só embebe o iframe
 * e mantém, à parte, um painel de legendas ao vivo. Essas legendas são só uma
 * pré-visualização: a ata definitiva é gerada a partir da gravação real (Whisper),
 * processada pelo backend depois da reunião terminar — ver dailyRoutes.ts.
 */
export default function MeetingRoom({ reuniaoId, dailyUrl, titulo, participanteNome, participanteTipo, onEnd, endLoading }: MeetingRoomProps) {
    const [transcription, setTranscription] = useState('');
    const [interimTranscription, setInterimTranscription] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [speechUnsupported, setSpeechUnsupported] = useState(false);
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
        // Sem evento externo do Daily para "entrei na chamada" (abordagem de iframe
        // simples, sem o SDK @daily-co/daily-js) — arranca as legendas ao vivo assim
        // que o iframe existe, para aproximar o mais possível.
        startListening();
        return () => stopListening();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dailyUrl]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white', color: '#0f172a' }}>
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8E6', background: '#F5F8F7', fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif" }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: '#E3F3F1', color: '#017E84', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Video size={18} />
                    </div>
                    <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, fontFamily: "'Manrope', sans-serif", color: '#16211F' }}>{titulo}</h2>
                </div>
                {onEnd && (
                    <button
                        onClick={onEnd}
                        disabled={endLoading}
                        style={{ background: '#B23A3A', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '10px', fontWeight: 700, fontSize: '13.5px', cursor: endLoading ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                    >
                        {endLoading ? 'A processar...' : 'Terminar Reunião'}
                    </button>
                )}
            </div>

            {!dailyUrl && (
                <div style={{ padding: '10px 16px', background: '#fef2f2', color: '#991b1b', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #fecaca' }}>
                    <AlertTriangle size={16} /> Não foi possível gerar o acesso à sala. Recarregue a página ou contacte o suporte.
                </div>
            )}
            {speechUnsupported && (
                <div style={{ padding: '10px 16px', background: '#fffbeb', color: '#92400e', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #fde68a' }}>
                    <AlertTriangle size={16} /> O seu navegador não suporta legendas ao vivo (use Google Chrome ou Edge). A videochamada e a gravação continuam normalmente — a ata final é gerada a partir da gravação, não depende disto.
                </div>
            )}

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Daily.co Prebuilt, via iframe simples — grelha, mudo, câmara, partilha de ecrã e gravação em nuvem já vêm todos prontos */}
                <div style={{ flex: 1, position: 'relative' }}>
                    {dailyUrl && (
                        <iframe
                            src={dailyUrl}
                            allow="camera; microphone; fullscreen; display-capture; autoplay"
                            style={{ width: '100%', height: '100%', border: 'none' }}
                        />
                    )}
                </div>

                {/* Painel de legendas ao vivo — pré-visualização, não é a fonte da ata final */}
                <div style={{ width: '320px', background: '#16211F', borderLeft: '1px solid #2A3B37', display: 'flex', flexDirection: 'column', fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif" }}>
                    <div style={{ padding: '16px', borderBottom: '1px solid #2A3B37' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className={isListening ? 'pulse-dot' : ''} style={{ width: '9px', height: '9px', borderRadius: '50%', background: isListening ? '#2CB5B0' : '#5B6B67' }}></div>
                            <span style={{ fontWeight: 700, fontFamily: "'Manrope', sans-serif", fontSize: '13.5px' }}>Legendas ao vivo</span>
                        </div>
                        <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#8b9a96', lineHeight: 1.4 }}>
                            Pré-visualização — a ata final é gerada a partir da gravação.
                        </p>
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
                            box-shadow: 0 0 0 0 rgba(44, 181, 176, 0.6);
                            animation: pulse 1.5s infinite cubic-bezier(0.66, 0, 0, 1);
                        }
                        @keyframes pulse {
                            to { box-shadow: 0 0 0 10px rgba(44, 181, 176, 0); }
                        }
                    `}</style>
                </div>
            </div>
        </div>
    );
}
