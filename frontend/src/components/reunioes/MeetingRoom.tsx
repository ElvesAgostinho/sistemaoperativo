import { useEffect, useRef, useState } from 'react';
import { Video, AlertTriangle, Mic } from 'lucide-react';

interface MeetingRoomProps {
    reuniaoId: string;
    /** URL completo da sala Jitsi (auto-hospedada no VPS), já com o token JWT embutido (?jwt=...) — mintado no backend, nunca cru/partilhável. */
    jitsiUrl: string | null;
    titulo: string;
    participanteNome: string;
    participanteTipo: 'host' | 'convidado';
    /** Só o host recebe — mostra o botão de terminar reunião. */
    onEnd?: () => void;
    endLoading?: boolean;
}

const loadJitsiScript = (domain: string): Promise<void> => {
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
        script.src = `https://${domain}/external_api.js`;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = reject;
        document.body.appendChild(script);
    });
};

/**
 * Sala de reunião reutilizável (Jitsi auto-hospedado no VPS, via External API +
 * gravação do próprio microfone no navegador), usada tanto pelo anfitrião
 * autenticado (ReunioesApp) quanto pelo convidado externo sem login
 * (pages/public/ReuniaoConvidado).
 *
 * Em vez de transcrever ao vivo no browser (frágil, só Chrome/Edge), cada
 * participante grava o próprio áudio (MediaRecorder, pedido de microfone
 * independente do que o Jitsi já usa para falar na chamada) e envia um único
 * ficheiro no fim. O backend transcreve com Whisper e gera a ata — ver
 * ReuniaoService.gerarAtaAPartirDeGravacoes.
 */
export default function MeetingRoom({ reuniaoId, jitsiUrl, titulo, participanteNome, participanteTipo, onEnd, endLoading }: MeetingRoomProps) {
    const jitsiContainerRef = useRef<HTMLDivElement>(null);
    const jitsiApiRef = useRef<any>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingUnsupported, setRecordingUnsupported] = useState(false);
    const [uploadingRecording, setUploadingRecording] = useState(false);
    const [jitsiError, setJitsiError] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);

    const enviarGravacao = async (): Promise<void> => {
        if (chunksRef.current.length === 0) return;
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];

        const formData = new FormData();
        formData.append('audio', blob, `gravacao-${reuniaoId}.webm`);
        formData.append('participante_nome', participanteNome);
        formData.append('participante_tipo', participanteTipo);

        setUploadingRecording(true);
        try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/public/reuniao/${reuniaoId}/gravacao`, {
                method: 'POST',
                body: formData
            });
        } catch (e) {
            console.error('[MeetingRoom] Erro ao enviar gravação de áudio:', e);
        } finally {
            setUploadingRecording(false);
        }
    };

    const iniciarGravacao = async () => {
        if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setRecordingUnsupported(true);
            return;
        }
        try {
            // Pedido de microfone próprio desta página — independente do que o
            // Jitsi já pede dentro do seu próprio iframe para a pessoa falar na
            // chamada. É normal aparecerem dois pedidos de permissão.
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
            recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            recorder.onstart = () => setIsRecording(true);
            recorder.onstop = () => setIsRecording(false);
            recorder.start();
            mediaRecorderRef.current = recorder;
        } catch (e) {
            console.error('[MeetingRoom] Não foi possível iniciar a gravação do microfone:', e);
            setRecordingUnsupported(true);
        }
    };

    const pararGravacaoEEnviar = async (): Promise<void> => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state === 'inactive') return;

        await new Promise<void>((resolve) => {
            recorder.onstop = () => { setIsRecording(false); resolve(); };
            recorder.stop();
        });

        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        await enviarGravacao();
    };

    useEffect(() => {
        if (!jitsiContainerRef.current || !jitsiUrl) return;
        let disposed = false;

        let domain = '';
        let roomName = '';
        let jwt: string | undefined;
        try {
            const parsed = new URL(jitsiUrl);
            domain = parsed.hostname;
            roomName = parsed.pathname.replace(/^\//, '');
            jwt = parsed.searchParams.get('jwt') || undefined;
        } catch {
            setJitsiError('Link de acesso à sala inválido.');
            return;
        }

        loadJitsiScript(domain).then(() => {
            if (disposed || !jitsiContainerRef.current) return;
            const JitsiMeetExternalAPI = (window as any).JitsiMeetExternalAPI;
            const api = new JitsiMeetExternalAPI(domain, {
                roomName,
                jwt,
                parentNode: jitsiContainerRef.current,
                width: '100%',
                height: '100%',
                configOverwrite: { prejoinPageEnabled: false },
                userInfo: { displayName: participanteNome }
            });
            jitsiApiRef.current = api;

            api.addListener('videoConferenceJoined', () => {
                iniciarGravacao();
            });
            api.addListener('videoConferenceLeft', () => {
                pararGravacaoEEnviar();
            });
            api.addListener('readyToClose', () => {
                pararGravacaoEEnviar();
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
            pararGravacaoEEnviar();
            if (jitsiApiRef.current) {
                jitsiApiRef.current.dispose();
                jitsiApiRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jitsiUrl]);

    const handleEndClick = async () => {
        await pararGravacaoEEnviar();
        onEnd?.();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white', color: '#0f172a' }}>
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8E6', background: '#F5F8F7', fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif" }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: '#E3F3F1', color: '#017E84', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Video size={18} />
                    </div>
                    <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, fontFamily: "'Manrope', sans-serif", color: '#16211F' }}>{titulo}</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    {!recordingUnsupported && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#54656f' }}>
                            <div className={isRecording ? 'pulse-dot' : ''} style={{ width: '8px', height: '8px', borderRadius: '50%', background: isRecording ? '#B23A3A' : '#94a3b8' }}></div>
                            <Mic size={13} />
                            {uploadingRecording ? 'A enviar gravação...' : isRecording ? 'A gravar áudio para a ata' : 'Gravação parada'}
                        </div>
                    )}
                    {onEnd && (
                        <button
                            onClick={handleEndClick}
                            disabled={endLoading}
                            style={{ background: '#B23A3A', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '10px', fontWeight: 700, fontSize: '13.5px', cursor: endLoading ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                        >
                            {endLoading ? 'A processar...' : 'Terminar Reunião'}
                        </button>
                    )}
                </div>
            </div>

            {jitsiError && (
                <div style={{ padding: '10px 16px', background: '#fef2f2', color: '#991b1b', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #fecaca' }}>
                    <AlertTriangle size={16} /> {jitsiError}
                </div>
            )}
            {recordingUnsupported && (
                <div style={{ padding: '10px 16px', background: '#fffbeb', color: '#92400e', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #fde68a' }}>
                    <AlertTriangle size={16} /> Não foi possível gravar o seu áudio para a ata (navegador sem suporte, ou microfone recusado). A videochamada continua normalmente — se outra pessoa na reunião conseguir gravar, a ata ainda é gerada a partir da parte dela.
                </div>
            )}

            <div style={{ flex: 1, position: 'relative' }}>
                <div ref={jitsiContainerRef} style={{ width: '100%', height: '100%' }} />
                {!jitsiUrl && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#991b1b', fontSize: '13px', gap: '8px' }}>
                        <AlertTriangle size={16} /> Não foi possível gerar o acesso à sala. Recarregue a página ou contacte o suporte.
                    </div>
                )}
            </div>

            <style>{`
                .pulse-dot {
                    box-shadow: 0 0 0 0 rgba(178, 58, 58, 0.5);
                    animation: pulse 1.5s infinite cubic-bezier(0.66, 0, 0, 1);
                }
                @keyframes pulse {
                    to { box-shadow: 0 0 0 8px rgba(178, 58, 58, 0); }
                }
            `}</style>
        </div>
    );
}
