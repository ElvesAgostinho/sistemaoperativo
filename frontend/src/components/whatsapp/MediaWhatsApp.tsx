import { useRef, useState } from 'react';
import { Play, Pause, FileText, Download } from 'lucide-react';

/**
 * Multimedia com o aspecto do WhatsApp.
 *
 * Isto vivia dentro do WhatsAppChatApp e so servia a conversa. Quando o editor
 * de blocos passou a deixar carregar ficheiros, era preciso o mesmo aspecto la
 * — e a escolha era copiar ou partilhar. Copiado, os dois sitios divergiam a
 * primeira alteracao; e ja gastei esta semana a consertar duas copias da mesma
 * regra que tinham deixado de concordar.
 *
 * Quem configura um fluxo tem de ver exactamente o que o cliente vai receber.
 * E por isso que a pre-visualizacao do painel e a bolha da conversa sao, agora,
 * literalmente o mesmo codigo.
 */

export type TipoMedia = 'imagem' | 'video' | 'audio' | 'documento';

/** Que tipo de ficheiro e este, pela extensao do endereco. */
export function tipoPeloEndereco(url: string): TipoMedia {
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'imagem';
    if (['mp4', 'mpeg', 'mov', 'avi', 'webm'].includes(ext)) return 'video';
    if (['ogg', 'mp3', 'wav', 'm4a', 'aac'].includes(ext)) return 'audio';
    return 'documento';
}

/** O nome do ficheiro que esta no fim do endereco, legivel. */
export function nomeDoEndereco(url: string): string {
    const bruto = url.split('/').pop()?.split('?')[0] || 'ficheiro';
    try {
        // Os ficheiros carregados levam um carimbo de tempo a frente, para nao
        // se substituirem uns aos outros. Mostrar "1791850143992_Contrato.pdf"
        // a quem so quer ver "Contrato.pdf" nao serve de nada.
        return decodeURIComponent(bruto).replace(/^\d{10,}_/, '');
    } catch {
        return bruto;
    }
}

// Nota de voz com "ar" de WhatsApp (botão redondo + barra de progresso),
// em vez do leitor genérico do navegador (<audio controls>) — o pedido foi
// explicitamente que o áudio enviado pelos nós do Autopilot (e qualquer
// áudio na conversa) tivesse o mesmo aspecto do WhatsApp real, natural.
export function VoiceNotePlayer({ src, outbound }: { src: string; outbound: boolean }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    const toggle = () => {
        const el = audioRef.current;
        if (!el) return;
        if (playing) { el.pause(); } else { el.play().catch(() => {}); }
    };

    const formatTime = (s: number) => {
        if (!isFinite(s) || s < 0) return '0:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60).toString().padStart(2, '0');
        return `${m}:${sec}`;
    };

    const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
    const accent = outbound ? '#0E5A6B' : '#25D366';

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', minWidth: '220px' }}>
            <audio
                ref={audioRef}
                src={src}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
                onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
                style={{ display: 'none' }}
            />
            <button
                onClick={toggle}
                style={{
                    width: '34px', height: '34px', borderRadius: '50%', border: 'none', flexShrink: 0,
                    backgroundColor: accent, color: 'white', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', cursor: 'pointer'
                }}
                aria-label={playing ? 'Pausar' : 'Reproduzir'}
            >
                {playing ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" style={{ marginLeft: '2px' }} />}
            </button>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ position: 'relative', height: '3px', borderRadius: '2px', backgroundColor: 'rgba(11,20,26,0.15)' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progress * 100}%`, borderRadius: '2px', backgroundColor: accent }} />
                    <div style={{ position: 'absolute', top: '-3.5px', left: `calc(${progress * 100}% - 4px)`, width: '9px', height: '9px', borderRadius: '50%', backgroundColor: accent }} />
                </div>
                <span style={{ fontSize: '11px', color: '#5B738B' }}>{formatTime(playing || currentTime > 0 ? currentTime : duration)}</span>
            </div>
        </div>
    );
}


/**
 * Um documento como o WhatsApp o mostra: um cartao com o icone, o nome e a
 * extensao — e nao um link sublinhado, que era o que havia e nao se parecia
 * nada com o WhatsApp.
 */
export function CartaoDocumento({ url, nome }: { url: string; nome?: string }) {
    const nomeFinal = nome || nomeDoEndereco(url);
    const ext = (nomeFinal.split('.').pop() || '').toUpperCase().slice(0, 4);

    return (
        <a
            href={url} target="_blank" rel="noreferrer"
            style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '9px 11px', borderRadius: '6px', textDecoration: 'none',
                background: 'rgba(11,20,26,0.04)', border: '1px solid rgba(11,20,26,0.08)',
                minWidth: '200px', maxWidth: '100%',
            }}
        >
            <div style={{
                width: '34px', height: '34px', borderRadius: '5px', flexShrink: 0,
                background: '#fff', border: '1px solid rgba(11,20,26,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <FileText size={17} color="#D13438" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: '13px', color: '#111b21', fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {nomeFinal}
                </div>
                {ext && (
                    <div style={{ fontSize: '11px', color: '#667781', marginTop: '1px' }}>{ext}</div>
                )}
            </div>
            <Download size={15} color="#667781" style={{ flexShrink: 0 }} />
        </a>
    );
}

/**
 * O ficheiro desenhado como chega ao WhatsApp, seja qual for o tipo.
 *
 * `outbound` so muda a cor do leitor de voz (verde a receber, o nosso azul a
 * enviar), tal como na conversa.
 */
export default function MediaWhatsApp({ url, nome, outbound = true, tipo }: {
    url: string;
    nome?: string;
    outbound?: boolean;
    /** Forcar o tipo. Sem isto, adivinha-se pela extensao. */
    tipo?: TipoMedia;
}) {
    if (!url) return null;
    const t = tipo || tipoPeloEndereco(url);

    if (t === 'imagem') {
        return (
            <img
                src={url} alt={nome || ''}
                onClick={() => window.open(url, '_blank')}
                style={{
                    maxWidth: '100%', maxHeight: '320px', borderRadius: '6px',
                    cursor: 'pointer', display: 'block',
                }}
            />
        );
    }

    if (t === 'video') {
        return (
            <video
                src={url} controls
                style={{ maxWidth: '100%', maxHeight: '320px', borderRadius: '6px', display: 'block' }}
            />
        );
    }

    if (t === 'audio') return <VoiceNotePlayer src={url} outbound={outbound} />;

    return <CartaoDocumento url={url} nome={nome} />;
}
