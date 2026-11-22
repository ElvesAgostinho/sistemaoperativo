import { useEffect, useRef, useState } from 'react';
import { Video, AlertTriangle, Mic, ExternalLink, LogOut, CheckCircle2 } from 'lucide-react';

interface MeetingRoomProps {
    reuniaoId: string;
    /** Link da sala no Jitsi público (https://meet.jit.si/<sala>). */
    jitsiUrl: string | null;
    titulo: string;
    participanteNome: string;
    participanteTipo: 'host' | 'convidado';
    /** Só o host recebe — mostra o botão de terminar reunião. */
    onEnd?: () => void;
    endLoading?: boolean;
}

/**
 * O link da sala com o nome da pessoa já preenchido, para ela não ter de o
 * escrever outra vez no Jitsi.
 */
const linkComNome = (jitsiUrl: string, nome: string): string => {
    const base = jitsiUrl.split('#')[0];
    return `${base}#userInfo.displayName=${encodeURIComponent(JSON.stringify(nome))}`;
};

/**
 * Sala de reunião — usada pelo anfitrião (ReunioesApp) e pelo convidado sem
 * login (pages/public/ReuniaoConvidado).
 *
 * A VIDEOCHAMADA ABRE NUMA JANELA NOVA DO JITSI. Esta página metia o
 * meet.jit.si dentro de si (iframe / External API), e o meet.jit.si deixou de
 * o permitir — a configuração deles tem `disableIframeAPI: true` e quem
 * entrava, anfitrião ou convidado, via um erro. O Jitsi diz que meter o
 * meet.jit.si dentro de outro site "já não é possível"; só o JaaS (pago acima
 * de 25 pessoas por mês) o faz. Abrir na janela do próprio Jitsi é grátis e
 * funciona.
 *
 * A GRAVAÇÃO CONTINUA AQUI. Cada participante grava o próprio microfone nesta
 * página (MediaRecorder) e envia um ficheiro no fim; o backend transcreve com
 * Whisper e gera a ata (ReuniaoService.gerarAtaAPartirDeGravacoes). Por isso
 * esta página tem de ficar aberta durante a reunião, e o fim é um botão — já
 * não há como saber quando a chamada do Jitsi acaba.
 */
export default function MeetingRoom({ reuniaoId, jitsiUrl, titulo, participanteNome, participanteTipo, onEnd, endLoading }: MeetingRoomProps) {
    const [entrou, setEntrou] = useState(false);
    const [saiu, setSaiu] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingUnsupported, setRecordingUnsupported] = useState(false);
    const [uploadingRecording, setUploadingRecording] = useState(false);
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
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') return;
        if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setRecordingUnsupported(true);
            return;
        }
        try {
            // Pedido de microfone próprio desta página — independente do que o
            // Jitsi pede na janela dele para a pessoa falar na chamada. É normal
            // aparecerem dois pedidos de permissão.
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

    const abrirVideochamada = () => {
        if (!jitsiUrl) return;
        // Abre JÁ, ainda dentro do clique: depois de um `await` o navegador
        // trataria a janela como pop-up e bloqueava-a.
        window.open(linkComNome(jitsiUrl, participanteNome), '_blank', 'noopener');
        setEntrou(true);
        iniciarGravacao();
    };

    // Fechar esta página a meio perde a gravação — o navegador pergunta antes.
    useEffect(() => {
        if (!isRecording) return;
        const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', avisar);
        return () => window.removeEventListener('beforeunload', avisar);
    }, [isRecording]);

    // Sair do ecrã da reunião dentro do sistema também envia o que se gravou.
    useEffect(() => () => { pararGravacaoEEnviar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleEndClick = async () => {
        await pararGravacaoEEnviar();
        onEnd?.();
    };

    const sairComoConvidado = async () => {
        await pararGravacaoEEnviar();
        setSaiu(true);
    };

    const botao = (cor: string, fundo: string, borda = fundo) => ({
        background: fundo, color: cor, border: `1px solid ${borda}`, padding: '11px 20px', borderRadius: '10px',
        fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit',
        display: 'inline-flex', alignItems: 'center', gap: '8px',
    } as React.CSSProperties);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white', color: '#0f172a' }}>
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', borderBottom: '1px solid #E2E8E6', background: '#F5F8F7', fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif" }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: '#E3F3F1', color: '#0E5A6B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Video size={18} />
                    </div>
                    <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, fontFamily: "'Manrope', sans-serif", color: '#16211F' }}>{titulo}</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    {entrou && !recordingUnsupported && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#54656f' }}>
                            <div className={isRecording ? 'pulse-dot' : ''} style={{ width: '8px', height: '8px', borderRadius: '50%', background: isRecording ? '#B23A3A' : '#94a3b8' }}></div>
                            <Mic size={13} />
                            {uploadingRecording ? 'A enviar gravação...' : isRecording ? 'A gravar áudio para a ata' : 'Gravação parada'}
                        </div>
                    )}
                    {onEnd && (
                        <button
                            onClick={handleEndClick}
                            disabled={endLoading || uploadingRecording}
                            style={{ background: '#B23A3A', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '10px', fontWeight: 700, fontSize: '13.5px', cursor: endLoading ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                        >
                            {endLoading || uploadingRecording ? 'A processar...' : 'Terminar Reunião'}
                        </button>
                    )}
                </div>
            </div>

            {recordingUnsupported && (
                <div style={{ padding: '10px 16px', background: '#fffbeb', color: '#92400e', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #fde68a' }}>
                    <AlertTriangle size={16} /> Não foi possível gravar o seu áudio para a ata (navegador sem suporte, ou microfone recusado). A videochamada continua normalmente — se outra pessoa na reunião conseguir gravar, a ata ainda é gerada a partir da parte dela.
                </div>
            )}

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif" }}>
                <div style={{ maxWidth: '520px', width: '100%', textAlign: 'center', color: '#334155', fontSize: '14px', lineHeight: 1.65 }}>
                    {!jitsiUrl ? (
                        <div style={{ color: '#991b1b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <AlertTriangle size={16} /> Não foi possível obter o link da sala. Recarregue a página ou contacte o suporte.
                        </div>
                    ) : saiu ? (
                        <>
                            <CheckCircle2 size={40} color="#107E3E" />
                            <h3 style={{ margin: '12px 0 6px', color: '#16211F' }}>Obrigado por participar</h3>
                            <p style={{ margin: 0 }}>A sua parte da gravação foi enviada para a ata. Já pode fechar esta página.</p>
                        </>
                    ) : !entrou ? (
                        <>
                            <Video size={40} color="#0E5A6B" />
                            <h3 style={{ margin: '12px 0 6px', color: '#16211F' }}>A videochamada abre numa janela nova</h3>
                            <p style={{ margin: '0 0 18px' }}>
                                Ao entrar, <b>deixe esta página aberta</b>: é aqui que se grava o seu áudio para a ata da reunião.
                            </p>
                            <button onClick={abrirVideochamada} style={botao('#fff', '#0E5A6B')}>
                                <ExternalLink size={16} /> Entrar na videochamada
                            </button>
                            {participanteTipo === 'host' ? (
                                <p style={{ margin: '18px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                                    No Jitsi, quem abre a reunião tem de entrar com uma conta <b>Google, GitHub ou Facebook</b> para a começar. Os convidados entram a seguir.
                                </p>
                            ) : (
                                <p style={{ margin: '18px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                                    Se o Jitsi disser que está à espera do anfitrião, aguarde — entra assim que ele começar a reunião.
                                </p>
                            )}
                        </>
                    ) : (
                        <>
                            <Mic size={40} color={isRecording ? '#B23A3A' : '#0E5A6B'} />
                            <h3 style={{ margin: '12px 0 6px', color: '#16211F' }}>A reunião está aberta na outra janela</h3>
                            <p style={{ margin: '0 0 18px' }}>
                                <b>Não feche esta página</b> até ao fim da reunião — é ela que grava o seu áudio para a ata.
                            </p>
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                <button onClick={() => window.open(linkComNome(jitsiUrl, participanteNome), '_blank', 'noopener')} style={botao('#0E5A6B', '#fff', '#9FC4CC')}>
                                    <ExternalLink size={16} /> Abrir a videochamada outra vez
                                </button>
                                {participanteTipo === 'convidado' && (
                                    <button onClick={sairComoConvidado} disabled={uploadingRecording} style={botao('#fff', '#B23A3A')}>
                                        <LogOut size={16} /> {uploadingRecording ? 'A enviar...' : 'Sair e enviar a minha gravação'}
                                    </button>
                                )}
                            </div>
                            {participanteTipo === 'host' && (
                                <p style={{ margin: '18px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                                    No fim, carregue em <b>Terminar Reunião</b> (em cima): a gravação é enviada e o resumo é gerado.
                                </p>
                            )}
                        </>
                    )}
                </div>
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
