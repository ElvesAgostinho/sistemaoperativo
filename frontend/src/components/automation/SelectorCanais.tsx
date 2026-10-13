import { useState, useEffect } from 'react';
import { Check, Loader } from 'lucide-react';

/**
 * Em que números é que este fluxo responde.
 *
 * Uma empresa pode ter o número antigo ligado por QR code e o novo pela API
 * oficial. Sem escolher, um fluxo responde nos dois — o que é o que faz sentido
 * quando só há um número, e deixa de fazer quando há dois: o atendimento de um
 * passa a responder a quem escreveu para o outro.
 *
 * Nenhum escolhido quer dizer "todos", de propósito. Um fluxo que ficasse mudo
 * por omissão era pior do que um fluxo a responder de mais, e nenhum dos fluxos
 * já criados tem este campo.
 */
export interface CanalDaEmpresa {
    id: string;
    nome: string;
    provider: string;
    status: string;
    numero: string | null;
}

export default function SelectorCanais({ escolhidos, aoMudar }: {
    escolhidos: string[];
    aoMudar: (ids: string[]) => void;
}) {
    const [canais, setCanais] = useState<CanalDaEmpresa[] | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const r = await fetch(`${import.meta.env.VITE_API_URL}/api/whatsapp/canais`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('os_auth_token')}` },
                });
                const d = await r.json();
                if (d.success) setCanais(d.canais || []);
                else setCanais([]);
            } catch {
                setCanais([]);
            }
        })();
    }, []);

    if (canais === null) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: '#8696A0', padding: '8px 0' }}>
                <Loader size={13} className="girar" /> a ver os números…
            </div>
        );
    }

    // Com um número só não há nada a escolher, e mostrar a pergunta era dar
    // trabalho a quem não tem decisão nenhuma para tomar.
    if (canais.length < 2) return null;

    const alternar = (id: string) => {
        aoMudar(escolhidos.includes(id) ? escolhidos.filter(x => x !== id) : [...escolhidos, id]);
    };

    const todos = escolhidos.length === 0;

    return (
        <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.04em', color: '#475569', marginBottom: '7px' }}>
                EM QUE NÚMEROS RESPONDE
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {canais.map(c => {
                    const ligado = todos || escolhidos.includes(c.id);
                    return (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => alternar(c.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '9px', width: '100%',
                                padding: '9px 10px', borderRadius: '8px', cursor: 'pointer',
                                border: `1px solid ${ligado ? '#9FC4CC' : '#E2E8F0'}`,
                                background: ligado ? '#F4FAFB' : '#fff',
                                fontFamily: 'inherit', textAlign: 'left',
                            }}
                        >
                            <span style={{
                                width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
                                display: 'grid', placeItems: 'center',
                                border: `1px solid ${ligado ? '#0E5A6B' : '#CBD5E1'}`,
                                background: ligado ? '#0E5A6B' : '#fff',
                            }}>
                                {ligado && <Check size={12} color="#fff" />}
                            </span>

                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#1D2D3E' }}>
                                    {c.nome}
                                </span>
                                <span style={{ display: 'block', fontSize: '11px', color: '#8696A0' }}>
                                    {c.provider === 'meta' ? 'API oficial — botões e menus a clicar' : 'Ligado por QR code — lista numerada'}
                                </span>
                            </span>

                            {c.status !== 'connected' && (
                                <span style={{
                                    fontSize: '10.5px', fontWeight: 700, padding: '2px 7px', borderRadius: '999px',
                                    background: '#FEF3C7', color: '#92400E', flexShrink: 0,
                                }}>
                                    por ligar
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            <div style={{ marginTop: '6px', fontSize: '11px', color: '#8696A0', lineHeight: 1.6 }}>
                {todos
                    ? 'Sem nenhum escolhido, este fluxo responde em todos os números.'
                    : escolhidos.length === canais.length
                        ? 'Responde em todos.'
                        : 'Só responde no que está marcado — quem escrever para o outro não entra neste fluxo.'}
            </div>

            <style>{`.girar { animation: girar 1s linear infinite; } @keyframes girar { 100% { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
