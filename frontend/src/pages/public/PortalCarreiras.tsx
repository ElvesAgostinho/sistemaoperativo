import React, { useEffect, useMemo, useState } from 'react';
import { Briefcase, MapPin, Clock, Search, ArrowRight, Building2, Wallet } from 'lucide-react';
import { LogoMark } from '../../components/BrandLogo';

const FONT_DISPLAY = "'Manrope', 'Segoe UI', sans-serif";
const FONT_BODY = "'IBM Plex Sans', 'Segoe UI', sans-serif";
const ACCENT = '#017E84';
const ACCENT_SOFT = '#E3F3F1';
const INK = '#16211F';
const INK_MUTED = '#5B6B67';
const BORDER = '#E2E8E6';

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
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_BODY, color: INK_MUTED, backgroundColor: '#FAFCFB' }}>
                A carregar oportunidades...
            </div>
        );
    }
    if (error) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_BODY, color: '#B23A3A', backgroundColor: '#FAFCFB' }}>
                {error}
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#FAFCFB', fontFamily: FONT_BODY, color: INK }}>
            {/* Hero */}
            <header style={{ position: 'relative', background: '#0F1917', color: 'white', padding: '64px 24px 90px', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-15%', left: '-8%', width: '420px', height: '420px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(1,126,132,0.35) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(40px)' }} />
                <div style={{ position: 'absolute', bottom: '-25%', right: '-8%', width: '480px', height: '480px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(183,121,31,0.15) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(40px)' }} />

                <div style={{ position: 'relative', maxWidth: '860px', margin: '0 auto', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '28px' }}>
                        {logoBase64 ? (
                            <img src={logoBase64} alt={empresaNome} style={{ height: '48px', maxWidth: '220px', objectFit: 'contain', borderRadius: '8px', background: 'white', padding: '6px 10px' }} />
                        ) : (
                            <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: ACCENT_SOFT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Building2 size={26} color={ACCENT} />
                            </div>
                        )}
                    </div>
                    <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, margin: '0 0 12px 0', letterSpacing: '-0.01em' }}>
                        Carreiras na {empresaNome}
                    </h1>
                    <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.72)', maxWidth: '560px', margin: '0 auto 32px' }}>
                        Junte-se a uma equipa que está a construir algo real. Vagas abertas agora, com respostas rápidas e um processo transparente.
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'white', borderRadius: '14px', padding: '6px 6px 6px 18px', maxWidth: '480px', margin: '0 auto', boxShadow: '0 12px 32px rgba(0,0,0,0.25)' }}>
                        <Search size={18} color={INK_MUTED} />
                        <input
                            value={busca}
                            onChange={e => setBusca(e.target.value)}
                            placeholder="Pesquisar por cargo, área ou cidade..."
                            style={{ flex: 1, border: 'none', outline: 'none', padding: '10px 4px', fontSize: '14px', fontFamily: FONT_BODY, color: INK }}
                        />
                    </div>
                </div>
            </header>

            {/* Lista de vagas */}
            <main style={{ maxWidth: '760px', margin: '-48px auto 0', padding: '0 24px 80px', position: 'relative' }}>
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
                                onMouseOver={e => e.currentTarget.style.backgroundColor = '#FAFCFB'}
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
        </div>
    );
};

export default PortalCarreiras;
