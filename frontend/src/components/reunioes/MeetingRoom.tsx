import { useEffect, useRef, useState } from 'react';
import { Video, AlertTriangle, Mic, ExternalLink, Users } from 'lucide-react';
import { GravadorSegmentado } from './gravadorSegmentado';
import { linkComNome } from './linkJitsi';

interface MeetingRoomProps {
    reuniaoId: string;
    /** Link da sala no Jitsi público (https://meet.jit.si/<sala>). */
    jitsiUrl: string | null;
    titulo: string;
    participanteNome: string;
    onEnd: () => void;
    endLoading?: boolean;
}

const podeGravarChamada = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices;

/**
 * Sala de reunião do ANFITRIÃO (ReunioesApp). Os convidados não passam por
 * aqui: escrevem o nome na página do link e vão direto para o Jitsi
 * (pages/public/ReuniaoConvidado).
 *
 * A videochamada abre na janela do Jitsi (o meet.jit.si não deixa ser
 * embutido). A gravação para a ata faz-se aqui, toda do lado do anfitrião:
 * o próprio microfone E o som da chamada — o separador do Jitsi, partilhado
 * com áudio. É assim que ficam as vozes de quem está do outro lado, sem
 * depender de nada que o convidado faça. Antes cada um gravava o próprio
 * microfone na página do link: numa reunião de uma hora em que o convidado
 * falou quase sempre, a ata ficou só com o que o anfitrião disse.
 *
 * Tudo em partes de 4 minutos, enviadas logo (ver GravadorSegmentado).
 */
export default function MeetingRoom({ reuniaoId, jitsiUrl, titulo, participanteNome, onEnd, endLoading }: MeetingRoomProps) {
    const [entrou, setEntrou] = useState(false);
    const [, setTique] = useState(0);
    const atualizar = () => setTique(t => t + 1);

    const micRef = useRef<GravadorSegmentado | null>(null);
    const salaRef = useRef<GravadorSegmentado | null>(null);
    const partilhaRef = useRef<MediaStream | null>(null);
    const [erroMic, setErroMic] = useState('');
    const [estadoSala, setEstadoSala] = useState<'por_ligar' | 'a_gravar' | 'sem_audio' | 'parou' | 'nao_suportado'>(podeGravarChamada() ? 'por_ligar' : 'nao_suportado');
    const [aTerminar, setATerminar] = useState(false);

    const aGravar = !!(micRef.current?.aGravar || salaRef.current?.aGravar);
    const aEnviar = !!(micRef.current?.aEnviar || salaRef.current?.aEnviar);

    const iniciarMicrofone = async () => {
        if (micRef.current?.aGravar) return;
        if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setErroMic('Este navegador não consegue gravar áudio.');
            return;
        }
        try {
            // Pedido de microfone desta página — independente do que o Jitsi
            // pede na janela dele. O navegador lembra-se a partir da primeira vez.
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
            const g = new GravadorSegmentado(stream, reuniaoId, participanteNome, 'host');
            g.aoMudar = atualizar;
            g.iniciar();
            micRef.current = g;
            setErroMic('');
        } catch {
            setErroMic('O microfone não foi autorizado — a sua voz não fica gravada para a ata.');
        }
    };

    /**
     * O som da chamada. O navegador pergunta o que partilhar: escolhe-se o
     * separador do Jitsi, com "Partilhar áudio do separador".
     */
    const gravarChamada = async () => {
        try {
            const md: any = navigator.mediaDevices;
            const partilha: MediaStream = await md.getDisplayMedia({
                video: true,   // o Chrome não deixa pedir só áudio; o vídeo não é gravado
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                preferCurrentTab: false,
                selfBrowserSurface: 'exclude',
                surfaceSwitching: 'include',
                systemAudio: 'include',
            });
            const faixas = partilha.getAudioTracks();
            if (!faixas.length) {
                partilha.getTracks().forEach(t => t.stop());
                setEstadoSala('sem_audio');
                return;
            }
            const g = new GravadorSegmentado(new MediaStream(faixas), reuniaoId, 'Participantes da chamada', 'sala');
            g.aoMudar = atualizar;
            g.iniciar();
            salaRef.current = g;
            partilhaRef.current = partilha;
            setEstadoSala('a_gravar');
            // "Parar partilha" no navegador: a gravação da chamada acaba aí.
            faixas[0].addEventListener('ended', async () => {
                await g.parar();
                partilha.getTracks().forEach(t => t.stop());
                setEstadoSala(s => (s === 'a_gravar' ? 'parou' : s));
            });
        } catch {
            // Cancelou a escolha: fica como estava, pode tentar outra vez.
        }
    };

    const abrirVideochamada = () => {
        if (!jitsiUrl) return;
        // Abre JÁ, dentro do clique: depois de um await o navegador bloqueava-a.
        window.open(linkComNome(jitsiUrl, participanteNome), '_blank', 'noopener');
        setEntrou(true);
        iniciarMicrofone();
    };

    const pararTudo = async () => {
        await Promise.all([micRef.current?.parar(), salaRef.current?.parar()]);
        micRef.current?.libertar();
        salaRef.current?.libertar();
        partilhaRef.current?.getTracks().forEach(t => t.stop());
    };

    // Fechar esta página a meio corta a gravação — o navegador pergunta antes.
    useEffect(() => {
        if (!aGravar && !aEnviar) return;
        const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', avisar);
        return () => window.removeEventListener('beforeunload', avisar);
    }, [aGravar, aEnviar]);

    // Sair do ecrã da reunião dentro do sistema também envia o que se gravou.
    useEffect(() => () => { pararTudo(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleEndClick = async () => {
        setATerminar(true);
        try {
            await pararTudo();   // as últimas partes chegam ANTES de se pedir a ata
        } finally {
            setATerminar(false);
        }
        onEnd();
    };

    const botao = (cor: string, fundo: string, borda = fundo) => ({
        background: fundo, color: cor, border: `1px solid ${borda}`, padding: '11px 20px', borderRadius: '10px',
        fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit',
        display: 'inline-flex', alignItems: 'center', gap: '8px',
    } as React.CSSProperties);

    const linhaEstado = (ok: boolean, texto: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: ok ? '#107E3E' : '#92400e' }}>
            {ok ? <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#B23A3A', display: 'inline-block' }} /> : <AlertTriangle size={14} />}
            {texto}
        </div>
    );

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
                    {entrou && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#54656f' }}>
                            <div className={aGravar ? 'pulse-dot' : ''} style={{ width: '8px', height: '8px', borderRadius: '50%', background: aGravar ? '#B23A3A' : '#94a3b8' }}></div>
                            <Mic size={13} />
                            {aEnviar && !aGravar ? 'A enviar a gravação...' : aGravar ? 'A gravar para a ata' : 'Gravação parada'}
                        </div>
                    )}
                    <button
                        onClick={handleEndClick}
                        disabled={endLoading || aTerminar}
                        style={{ background: '#B23A3A', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '10px', fontWeight: 700, fontSize: '13.5px', cursor: endLoading || aTerminar ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                    >
                        {aTerminar ? 'A enviar a gravação...' : endLoading ? 'A gerar a ata...' : 'Terminar Reunião'}
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif", overflowY: 'auto' }}>
                <div style={{ maxWidth: '560px', width: '100%', textAlign: 'center', color: '#334155', fontSize: '14px', lineHeight: 1.65 }}>
                    {!jitsiUrl ? (
                        <div style={{ color: '#991b1b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <AlertTriangle size={16} /> Não foi possível obter o link da sala. Recarregue a página ou contacte o suporte.
                        </div>
                    ) : !entrou ? (
                        <>
                            <Video size={40} color="#0E5A6B" />
                            <h3 style={{ margin: '12px 0 6px', color: '#16211F' }}>A videochamada abre numa janela nova</h3>
                            <p style={{ margin: '0 0 18px' }}>
                                Ao entrar, <b>deixe esta página aberta</b>: é aqui que se grava a reunião para a ata.
                            </p>
                            <button onClick={abrirVideochamada} style={botao('#fff', '#0E5A6B')}>
                                <ExternalLink size={16} /> Entrar na videochamada
                            </button>
                            <p style={{ margin: '18px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                                No Jitsi, quem abre a reunião tem de entrar com uma conta <b>Google, GitHub ou Facebook</b> para a começar. Os convidados entram a seguir.
                            </p>
                        </>
                    ) : (
                        <>
                            <h3 style={{ margin: '0 0 14px', color: '#16211F' }}>A reunião está aberta na outra janela</h3>

                            {/* O que está a ser gravado, à vista. */}
                            <div style={{ textAlign: 'left', border: '1px solid #E2E8E6', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {micRef.current?.aGravar
                                    ? linhaEstado(true, 'A gravar a sua voz (microfone)')
                                    : linhaEstado(false, erroMic || 'A pedir o microfone...')}
                                {estadoSala === 'a_gravar'
                                    ? linhaEstado(true, 'A gravar o que os outros dizem (som da chamada)')
                                    : estadoSala === 'nao_suportado'
                                        ? linhaEstado(false, 'Este navegador não grava o som da chamada — use o Chrome ou o Edge num computador.')
                                        : estadoSala === 'sem_audio'
                                            ? linhaEstado(false, 'Partilhou sem áudio: carregue outra vez e ligue "Partilhar áudio do separador".')
                                            : estadoSala === 'parou'
                                                ? linhaEstado(false, 'Parou a partilha: as vozes dos outros deixaram de ser gravadas.')
                                                : linhaEstado(false, 'As vozes dos outros ainda NÃO estão a ser gravadas.')}
                            </div>

                            {estadoSala !== 'a_gravar' && estadoSala !== 'nao_suportado' && (
                                <div style={{ background: '#FFF8E6', border: '1px solid #F5D78A', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', textAlign: 'left' }}>
                                    <div style={{ fontWeight: 700, color: '#16211F', marginBottom: '6px' }}>Para a ata ter o que os outros dizem:</div>
                                    <ol style={{ margin: '0 0 12px', paddingLeft: '18px', fontSize: '13px' }}>
                                        <li>Carregue no botão abaixo.</li>
                                        <li>Na janela do navegador, escolha <b>"Separador"</b> e o separador do Jitsi (<b>meet.jit.si</b>).</li>
                                        <li>Confirme que <b>"Partilhar também o áudio do separador"</b> está ligado e carregue em <b>Partilhar</b>.</li>
                                    </ol>
                                    <button onClick={gravarChamada} style={botao('#fff', '#0E5A6B')}>
                                        <Users size={16} /> Gravar o que os outros dizem
                                    </button>
                                </div>
                            )}

                            <p style={{ margin: '0 0 16px' }}>
                                <b>Não feche esta página</b> até ao fim — é ela que grava a reunião.
                            </p>
                            <button onClick={() => window.open(linkComNome(jitsiUrl, participanteNome), '_blank', 'noopener')} style={botao('#0E5A6B', '#fff', '#9FC4CC')}>
                                <ExternalLink size={16} /> Abrir a videochamada outra vez
                            </button>
                            <p style={{ margin: '16px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                                No fim, carregue em <b>Terminar Reunião</b> (em cima): a gravação é enviada e a ata é gerada.
                            </p>
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
