import React, { useEffect, useMemo, useState } from 'react';
import { Briefcase, MapPin, Clock, Search, ArrowRight, Wallet } from 'lucide-react';

const FONT_DISPLAY = "'Roboto', 'Segoe UI', sans-serif";
const FONT_BODY = "'Roboto', 'Segoe UI', sans-serif";
const ACCENT = '#0E5A6B';
const ACCENT_SOFT = '#E1EEF0';
const INK = '#1D2D3E';
const INK_MUTED = '#5B738B';
const BORDER = '#D5D7DA';
const CANVAS = '#F5F6F7';
const SHELL = '#0A3B47';

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
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_BODY, color: INK_MUTED, backgroundColor: 'white' }}>
                A carregar oportunidades...
            </div>
        );
    }
    if (error) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_BODY, color: '#BB0000', backgroundColor: 'white' }}>
                {error}
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', backgroundColor: 'white', fontFamily: FONT_BODY, color: INK }}>
            {/* Barra superior */}
            <div style={{ backgroundColor: SHELL, padding: '16px 24px' }}>
                <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {logoBase64 ? (
                        <img src={logoBase64} alt={empresaNome} style={{ height: '26px', maxWidth: '160px', objectFit: 'contain' }} />
                    ) : (
                        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: '15px', color: 'white' }}>{empresaNome}</span>
                    )}
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>· Carreiras</span>
                </div>
            </div>

            {/* Cabeçalho sóbrio */}
            <header style={{ backgroundColor: CANVAS, borderBottom: `1px solid ${BORDER}`, padding: '40px 24px' }}>
                <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                    <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: '24px', fontWeight: 700, margin: '0 0 8px 0' }}>
                        Carreiras na {empresaNome}
                    </h1>
                    <p style={{ fontSize: '14px', color: INK_MUTED, maxWidth: '560px', margin: '0 0 22px 0', lineHeight: 1.6 }}>
                        Junte-se a uma equipa que está a construir algo real. Vagas abertas agora, com respostas rápidas e um processo transparente.
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', border: `1px solid ${BORDER}`, padding: '2px 2px 2px 14px', maxWidth: '440px' }}>
                        <Search size={16} color={INK_MUTED} />
                        <input
                            value={busca}
                            onChange={e => setBusca(e.target.value)}
                            placeholder="Pesquisar por cargo, área ou cidade..."
                            style={{ flex: 1, border: 'none', outline: 'none', padding: '10px 4px', fontSize: '13.5px', fontFamily: FONT_BODY, color: INK, background: 'transparent' }}
                        />
                    </div>
                </div>
            </header>

            {/* Lista de vagas */}
            <main style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px 80px' }}>
                <div style={{ background: 'white', border: `1px solid ${BORDER}` }}>
                    <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, backgroundColor: CANVAS }}>
                        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.03em', color: INK_MUTED }}>
                            {vagasFiltradas.length} vaga{vagasFiltradas.length === 1 ? '' : 's'} em aberto
                        </span>
                    </div>

                    {vagasFiltradas.length === 0 ? (
                        <div style={{ padding: '48px 24px', textAlign: 'center', color: INK_MUTED, fontSize: '14px' }}>
                            {vagas.length === 0 ? 'Neste momento não há vagas abertas. Volte a visitar em breve!' : 'Nenhuma vaga encontrada para essa pesquisa.'}
                        </div>
                    ) : (
                        vagasFiltradas.map((vaga, i) => (
                            <div
                                key={vaga.id}
                                onClick={() => navigateTo(`/carreiras/${empresa_id}/vaga/${vaga.id}`)}
                                style={{ padding: '18px 20px', borderBottom: i === vagasFiltradas.length - 1 ? 'none' : `1px solid ${BORDER}`, cursor: 'pointer', transition: 'background-color 0.1s' }}
                                onMouseOver={e => e.currentTarget.style.backgroundColor = CANVAS}
                                onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: '15px', fontWeight: 700, color: INK, margin: '0 0 7px 0' }}>{vaga.titulo}</h3>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '12.5px', color: INK_MUTED, marginBottom: '9px' }}>
                                            {vaga.departamento && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Briefcase size={12} /> {vaga.departamento}</span>}
                                            {vaga.localizacao && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><MapPin size={12} /> {vaga.localizacao}</span>}
                                            {(vaga.salario_min || vaga.salario_max) && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <Wallet size={12} />
                                                    {vaga.salario_min && vaga.salario_max ? `${formatKz(vaga.salario_min)} – ${formatKz(vaga.salario_max)} Kz` : `Até ${formatKz(vaga.salario_max || vaga.salario_min!)} Kz`}
                                                </span>
                                            )}
                                        </div>
                                        {vaga.descricao && (
                                            <p style={{ fontSize: '13px', color: INK_MUTED, margin: '0 0 9px 0', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                {vaga.descricao}
                                            </p>
                                        )}
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <span style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: ACCENT, background: ACCENT_SOFT, padding: '2px 8px' }}>{vaga.tipo || 'Tempo Inteiro'}</span>
                                            <span style={{ fontSize: '11.5px', color: INK_MUTED, display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={10} /> {tempoRelativo(vaga.criado_em)}</span>
                                        </div>
                                    </div>
                                    <ArrowRight size={16} color={INK_MUTED} style={{ flexShrink: 0, marginTop: '2px' }} />
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div style={{ textAlign: 'center', marginTop: '28px', fontSize: '11.5px', color: INK_MUTED }}>
                    Portal de carreiras criado com BusinessOS
                </div>
            </main>
        </div>
    );
};

export default PortalCarreiras;
