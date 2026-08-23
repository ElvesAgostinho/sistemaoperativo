import React, { useEffect, useMemo, useState } from 'react';
import { Briefcase, MapPin, Clock, Search, ArrowRight, Wallet } from 'lucide-react';
import { LogoMark } from '../../components/BrandLogo';

const FONT_DISPLAY = "'Manrope', 'Segoe UI', sans-serif";
const FONT_BODY = "'IBM Plex Sans', 'Segoe UI', sans-serif";
const ACCENT = '#017E84';
const ACCENT_SOFT = '#E3F3F1';
const INK = '#16211F';
const INK_MUTED = '#5B6B67';
const BORDER = '#E2E8E6';
const CANVAS = '#F7FAF9';

interface Vaga {
    id: string;
    titulo: string;
    departamento: string;
    tipo: string;
    localizacao: string;
    descricao: string;
    salario_min?: number;
    salario_max?: number;
    numero_vagas?: number;
    criado_em: string;
}

function formatKz(v: number) {
    return new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 }).format(v);
}

function tempoRelativo(dataIso: string) {
    if (!dataIso) return '';
    const dias = Math.floor((Date.now() - new Date(dataIso).getTime()) / 86400000);
    if (dias <= 0) return 'Publicada hoje';
    if (dias === 1) return 'Publicada há 1 dia';
    if (dias < 30) return `Publicada há ${dias} dias`;
    return `Publicada há ${Math.floor(dias / 30)} mês(es)`;
}

// Representação 3D do próprio logótipo da BusinessOS — construída só com
// transforms CSS reais (perspective + preserve-3d), sem nenhuma imagem.
// As duas fichas brancas sobrepostas espelham o LogoMark (BrandLogo.tsx).
function LogoCube3D() {
    return (
        <div style={{ perspective: '1100px', width: '220px', height: '220px', margin: '0 auto' }}>
            <div className="logo3d-cube">
                <div className="logo3d-face logo3d-front">
                    <div style={{ position: 'relative', width: '128px', height: '128px' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, width: '76px', height: '76px', borderRadius: '20px', background: '#FFFFFF', boxShadow: '0 10px 24px rgba(1,40,42,0.22)' }} />
                        <div style={{ position: 'absolute', left: '48px', top: '48px', width: '76px', height: '76px', borderRadius: '20px', background: '#FFFFFF', opacity: 0.55 }} />
                    </div>
                </div>
                <div className="logo3d-face logo3d-right" />
                <div className="logo3d-face logo3d-bottom" />
            </div>
            <div className="logo3d-shadow" />
            <style>{`
                .logo3d-cube {
                    position: relative; width: 100%; height: 100%;
                    transform-style: preserve-3d;
                    transform: rotateX(20deg) rotateY(-32deg);
                    animation: logo3d-float 7s ease-in-out infinite;
                }
                .logo3d-face { position: absolute; border-radius: 48px; }
                .logo3d-front {
                    width: 220px; height: 220px;
                    background: linear-gradient(135deg, #01A2A8 0%, #017E84 55%, #015A5F 100%);
                    transform: translateZ(26px);
                    display: flex; align-items: center; justify-content: center;
                    box-shadow: inset 0 3px 0 rgba(255,255,255,0.28), inset 0 -30px 50px rgba(0,0,0,0.08);
                }
                .logo3d-right {
                    width: 52px; height: 220px; right: -26px; top: 0;
                    background: linear-gradient(180deg, #014448 0%, #01363A 100%);
                    transform: rotateY(90deg) translateZ(26px);
                    border-radius: 0 48px 48px 0;
                }
                .logo3d-bottom {
                    width: 220px; height: 52px; left: 0; bottom: -26px;
                    background: linear-gradient(90deg, #012B2E 0%, #013438 100%);
                    transform: rotateX(-90deg) translateZ(26px);
                    border-radius: 0 0 48px 48px;
                }
                .logo3d-shadow {
                    width: 200px; height: 34px; margin: 18px auto 0;
                    background: radial-gradient(ellipse, rgba(1,40,42,0.28) 0%, rgba(1,40,42,0) 72%);
                    animation: logo3d-shadow 7s ease-in-out infinite;
                }
                @keyframes logo3d-float {
                    0%, 100% { transform: rotateX(20deg) rotateY(-32deg) translateY(0px); }
                    50% { transform: rotateX(15deg) rotateY(-26deg) translateY(-16px); }
                }
                @keyframes logo3d-shadow {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(0.86); opacity: 0.7; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .logo3d-cube, .logo3d-shadow { animation: none; }
                }
            `}</style>
        </div>
    );
}

const PortalCarreiras = () => {
    const pathnameParts = window.location.pathname.split('/');
    const empresa_id = pathnameParts[2];

    const [vagas, setVagas] = useState<Vaga[]>([]);
    const [empresaNome, setEmpresaNome] = useState('Nossa Empresa');
    const [logoBase64, setLogoBase64] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busca, setBusca] = useState('');

    const navigateTo = (url: string) => { window.location.href = url; };

    useEffect(() => {
        const fetchVagas = async () => {
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/public/vagas/${empresa_id}`);
                const data = await res.json();
                if (data.success) {
                    setVagas(data.vagas || []);
                    if (data.empresaNome) setEmpresaNome(data.empresaNome);
                    if (data.logoBase64) setLogoBase64(data.logoBase64);
                } else {
                    setError('Não foi possível carregar as vagas.');
                }
            } catch (err) {
                setError('Erro de conexão ao servidor.');
            } finally {
                setLoading(false);
            }
        };
        if (empresa_id) fetchVagas(); else { setError('Empresa não especificada.'); setLoading(false); }
    }, [empresa_id]);

    const vagasFiltradas = useMemo(() => {
        const termo = busca.trim().toLowerCase();
        if (!termo) return vagas;
        return vagas.filter(v => [v.titulo, v.departamento, v.localizacao].filter(Boolean).some(campo => campo.toLowerCase().includes(termo)));
    }, [vagas, busca]);

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_BODY, color: INK_MUTED, backgroundColor: 'white' }}>
                A carregar oportunidades...
            </div>
        );
    }
    if (error) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_BODY, color: '#B23A3A', backgroundColor: 'white' }}>
                {error}
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', backgroundColor: 'white', fontFamily: FONT_BODY, color: INK }}>
            {/* Barra superior simples, ao estilo de um job board profissional */}
            <div style={{ borderBottom: `1px solid ${BORDER}`, padding: '16px 24px' }}>
                <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {logoBase64 ? (
                        <img src={logoBase64} alt={empresaNome} style={{ height: '30px', maxWidth: '160px', objectFit: 'contain' }} />
                    ) : (
                        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: '15px', color: INK }}>{empresaNome}</span>
                    )}
                    <span style={{ color: INK_MUTED, fontSize: '13px' }}>· Carreiras</span>
                </div>
            </div>

            {/* Hero */}
            <header style={{ backgroundColor: CANVAS, borderBottom: `1px solid ${BORDER}`, padding: '56px 24px' }}>
                <div className="portal-hero-grid" style={{ maxWidth: '1080px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: '48px', alignItems: 'center' }}>
                    <div>
                        <span style={{ display: 'inline-block', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: ACCENT, background: ACCENT_SOFT, padding: '5px 12px', borderRadius: '20px', marginBottom: '18px' }}>
                            Estamos a contratar
                        </span>
                        <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(28px, 3.4vw, 40px)', fontWeight: 800, margin: '0 0 14px 0', letterSpacing: '-0.01em', lineHeight: 1.15 }}>
                            Carreiras na {empresaNome}
                        </h1>
                        <p style={{ fontSize: '15.5px', color: INK_MUTED, maxWidth: '480px', margin: '0 0 30px 0', lineHeight: 1.6 }}>
                            Junte-se a uma equipa que está a construir algo real. Vagas abertas agora, com respostas rápidas e um processo transparente.
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'white', border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '4px 4px 4px 16px', maxWidth: '440px', boxShadow: '0 2px 10px rgba(15,23,20,0.05)' }}>
                            <Search size={17} color={INK_MUTED} />
                            <input
                                value={busca}
                                onChange={e => setBusca(e.target.value)}
                                placeholder="Pesquisar por cargo, área ou cidade..."
                                style={{ flex: 1, border: 'none', outline: 'none', padding: '11px 4px', fontSize: '13.5px', fontFamily: FONT_BODY, color: INK, background: 'transparent' }}
                            />
                        </div>
                    </div>

                    <div className="portal-hero-cube">
                        <LogoCube3D />
                    </div>
                </div>
            </header>

            {/* Lista de vagas */}
            <main style={{ maxWidth: '760px', margin: '0 auto', padding: '48px 24px 80px' }}>
                <div style={{ background: 'white', border: `1px solid ${BORDER}`, borderRadius: '16px', boxShadow: '0 4px 24px rgba(15,23,20,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '20px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: '15px', color: INK }}>
                            {vagasFiltradas.length} vaga{vagasFiltradas.length === 1 ? '' : 's'} em aberto
                        </span>
                    </div>

                    {vagasFiltradas.length === 0 ? (
                        <div style={{ padding: '56px 24px', textAlign: 'center', color: INK_MUTED, fontSize: '14px' }}>
                            {vagas.length === 0 ? 'Neste momento não há vagas abertas. Volte a visitar em breve!' : 'Nenhuma vaga encontrada para essa pesquisa.'}
                        </div>
                    ) : (
                        vagasFiltradas.map((vaga, i) => (
                            <div
                                key={vaga.id}
                                onClick={() => navigateTo(`/carreiras/${empresa_id}/vaga/${vaga.id}`)}
                                style={{ padding: '22px 24px', borderBottom: i === vagasFiltradas.length - 1 ? 'none' : `1px solid ${BORDER}`, cursor: 'pointer', transition: 'background-color 0.15s' }}
                                onMouseOver={e => e.currentTarget.style.backgroundColor = CANVAS}
                                onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: '17px', fontWeight: 700, color: INK, margin: '0 0 8px 0' }}>{vaga.titulo}</h3>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '13px', color: INK_MUTED, marginBottom: '10px' }}>
                                            {vaga.departamento && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Briefcase size={13} /> {vaga.departamento}</span>}
                                            {vaga.localizacao && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><MapPin size={13} /> {vaga.localizacao}</span>}
                                            {(vaga.salario_min || vaga.salario_max) && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <Wallet size={13} />
                                                    {vaga.salario_min && vaga.salario_max ? `${formatKz(vaga.salario_min)} – ${formatKz(vaga.salario_max)} Kz` : `Até ${formatKz(vaga.salario_max || vaga.salario_min!)} Kz`}
                                                </span>
                                            )}
                                        </div>
                                        {vaga.descricao && (
                                            <p style={{ fontSize: '13.5px', color: INK_MUTED, margin: '0 0 10px 0', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                {vaga.descricao}
                                            </p>
                                        )}
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: ACCENT, background: ACCENT_SOFT, padding: '3px 9px', borderRadius: '20px' }}>{vaga.tipo || 'Tempo Inteiro'}</span>
                                            <span style={{ fontSize: '12px', color: INK_MUTED, display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {tempoRelativo(vaga.criado_em)}</span>
                                        </div>
                                    </div>
                                    <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: ACCENT_SOFT, color: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <ArrowRight size={16} />
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div style={{ textAlign: 'center', marginTop: '32px', fontSize: '12px', color: INK_MUTED, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <LogoMark size={16} /> Portal de carreiras criado com BusinessOS
                </div>
            </main>

            <style>{`
                @media (max-width: 820px) {
                    .portal-hero-grid { grid-template-columns: 1fr !important; text-align: center; }
                    .portal-hero-grid > div:first-child { display: flex; flex-direction: column; align-items: center; }
                    .portal-hero-cube { order: -1; }
                }
            `}</style>
        </div>
    );
};

export default PortalCarreiras;
