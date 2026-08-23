import React, { useEffect, useState } from 'react';
import { ArrowLeft, Upload, CheckCircle, Briefcase, MapPin, Wallet, FileText, Loader2 } from 'lucide-react';
import { LogoMark } from '../../components/BrandLogo';

const FONT_DISPLAY = "'Roboto', 'Segoe UI', sans-serif";
const FONT_BODY = "'Roboto', 'Segoe UI', sans-serif";
const ACCENT = '#0854A0';
const ACCENT_HOVER = '#063E78';
const ACCENT_SOFT = '#E4EDF7';
const INK = '#1D2D3E';
const INK_MUTED = '#5B738B';
const BORDER = '#D5D7DA';

interface Vaga {
    id: string;
    titulo: string;
    departamento: string;
    localizacao: string;
    descricao: string;
    salario_min?: number;
    salario_max?: number;
    empresas: { nome: string };
    empresa_id: string;
}

function formatKz(v: number) {
    return new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 }).format(v);
}

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', border: `1px solid ${BORDER}`, borderRadius: '10px',
    fontSize: '13.5px', outline: 'none', fontFamily: FONT_BODY, boxSizing: 'border-box', color: INK, background: '#F5F6F7'
};
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: INK_MUTED, marginBottom: '6px' };

const CandidaturaForm = () => {
    const pathnameParts = window.location.pathname.split('/');
    const empresa_id = pathnameParts[2];
    const vaga_id = pathnameParts[4];

    const navigateTo = (url: string) => { window.location.href = url; };

    const [vaga, setVaga] = useState<Vaga | null>(null);
    const [logoBase64, setLogoBase64] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const [nome, setNome] = useState('');
    const [email, setEmail] = useState('');
    const [telefone, setTelefone] = useState('');
    const [linkedin, setLinkedin] = useState('');
    const [file, setFile] = useState<File | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!vaga_id) { setLoading(false); return; }
        const fetchVaga = async () => {
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/public/vaga/${vaga_id}`);
                const data = await res.json();
                if (data.success && data.vaga) {
                    setVaga(data.vaga);
                    if (data.logoBase64) setLogoBase64(data.logoBase64);
                }
            } catch (err) { console.error(err); }
            finally { setLoading(false); }
        };
        fetchVaga();
    }, [vaga_id]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) setFile(e.target.files[0]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) { setError('Anexe o seu currículo em PDF.'); return; }
        setSubmitting(true);
        setError('');

        try {
            const formData = new FormData();
            formData.append('vaga_id', vaga_id);
            formData.append('empresa_id', empresa_id);
            formData.append('nome', nome);
            formData.append('email', email);
            formData.append('telefone', telefone);
            formData.append('linkedin_url', linkedin);
            formData.append('cv', file);

            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/public/candidatar`, { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) setSuccess(true);
            else setError(data.error || 'Erro ao submeter candidatura.');
        } catch (err) {
            setError('Erro de rede. Tente novamente.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_BODY, color: INK_MUTED, backgroundColor: '#F5F6F7' }}>A carregar vaga...</div>;
    }
    if (!vaga) {
        return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_BODY, color: '#BB0000', backgroundColor: '#F5F6F7' }}>Vaga não encontrada.</div>;
    }

    if (success) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F6F7', fontFamily: FONT_BODY, padding: '24px' }}>
                <div style={{ width: '100%', maxWidth: '440px', textAlign: 'center', backgroundColor: 'white', border: `1px solid ${BORDER}`, borderRadius: '18px', padding: '48px 36px' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: ACCENT_SOFT, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                        <CheckCircle size={30} color={ACCENT} />
                    </div>
                    <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: '22px', fontWeight: 700, color: INK, margin: '0 0 10px 0' }}>Candidatura enviada!</h2>
                    <p style={{ color: INK_MUTED, fontSize: '14px', lineHeight: 1.6, margin: '0 0 28px 0' }}>
                        Obrigado pelo seu interesse. A equipa da <strong>{vaga.empresas?.nome}</strong> vai analisar o seu perfil — já com a avaliação da nossa IA — e entrará em contacto em breve.
                    </p>
                    <button onClick={() => navigateTo(`/carreiras/${empresa_id}`)} style={{ padding: '12px 24px', backgroundColor: ACCENT, color: 'white', border: 'none', borderRadius: '10px', fontSize: '13.5px', fontWeight: 700, fontFamily: FONT_BODY, cursor: 'pointer', width: '100%' }}>
                        Ver mais vagas
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F5F6F7', fontFamily: FONT_BODY, color: INK }}>
            <header style={{ background: '#354A5E', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                <button onClick={() => navigateTo(`/carreiras/${empresa_id}`)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: FONT_BODY }}>
                    <ArrowLeft size={16} /> Todas as vagas
                </button>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', color: 'white', opacity: 0.85 }}>
                    <LogoMark size={20} /> <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: '13px' }}>BusinessOS</span>
                </div>
            </header>

            <main className="candidatura-grid" style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 24px 80px', display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(300px,1fr)', gap: '32px', alignItems: 'start' }}>
                {/* Detalhes da vaga */}
                <div>
                    {logoBase64 && <img src={logoBase64} alt="" style={{ height: '40px', maxWidth: '180px', objectFit: 'contain', marginBottom: '18px' }} />}
                    <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(22px, 2.6vw, 28px)', fontWeight: 700, margin: '0 0 14px 0' }}>{vaga.titulo}</h1>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '13.5px', color: INK_MUTED, marginBottom: '28px' }}>
                        {vaga.departamento && <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Briefcase size={15} /> {vaga.departamento}</span>}
                        {vaga.localizacao && <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={15} /> {vaga.localizacao}</span>}
                        {(vaga.salario_min || vaga.salario_max) && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Wallet size={15} />
                                {vaga.salario_min && vaga.salario_max ? `${formatKz(vaga.salario_min)} – ${formatKz(vaga.salario_max)} Kz` : `Até ${formatKz(vaga.salario_max || vaga.salario_min!)} Kz`}
                            </span>
                        )}
                    </div>
                    <div style={{ height: '1px', background: BORDER, margin: '0 0 24px 0' }} />
                    <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: '16px', fontWeight: 700, margin: '0 0 12px 0' }}>Descrição da Função</h3>
                    <div style={{ color: INK_MUTED, fontSize: '14px', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{vaga.descricao}</div>
                </div>

                {/* Painel de candidatura */}
                <div style={{ position: 'sticky', top: '24px', background: 'white', border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '26px' }}>
                    <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: '17px', fontWeight: 700, margin: '0 0 4px 0' }}>Candidatar-me</h3>
                    <p style={{ fontSize: '12.5px', color: INK_MUTED, margin: '0 0 20px 0' }}>O seu CV é avaliado automaticamente pela nossa IA assim que submete.</p>

                    {error && <div style={{ background: '#F6DEDE', color: '#BB0000', padding: '10px 14px', borderRadius: '8px', fontSize: '12.5px', marginBottom: '16px' }}>{error}</div>}

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div>
                            <label style={labelStyle}>Nome Completo *</label>
                            <input required value={nome} onChange={e => setNome(e.target.value)} style={inputStyle} placeholder="João Silva" />
                        </div>
                        <div>
                            <label style={labelStyle}>Email *</label>
                            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="joao@exemplo.com" />
                        </div>
                        <div>
                            <label style={labelStyle}>Telefone</label>
                            <input type="tel" value={telefone} onChange={e => setTelefone(e.target.value)} style={inputStyle} placeholder="+244 9XX XXX XXX" />
                        </div>
                        <div>
                            <label style={labelStyle}>Perfil LinkedIn</label>
                            <input type="url" value={linkedin} onChange={e => setLinkedin(e.target.value)} style={inputStyle} placeholder="https://linkedin.com/in/..." />
                        </div>
                        <div>
                            <label style={labelStyle}>Currículo (PDF) *</label>
                            <div
                                onClick={() => document.getElementById('cv-upload')?.click()}
                                style={{ border: `1.5px dashed ${file ? ACCENT : BORDER}`, borderRadius: '10px', padding: '18px', textAlign: 'center', cursor: 'pointer', background: file ? ACCENT_SOFT : '#F5F6F7' }}
                            >
                                <Upload size={20} color={file ? ACCENT : INK_MUTED} style={{ marginBottom: '6px' }} />
                                <div style={{ fontSize: '12.5px', color: file ? ACCENT : INK_MUTED, fontWeight: 600 }}>
                                    {file ? file.name : 'Clique para anexar o PDF'}
                                </div>
                                <input id="cv-upload" type="file" accept=".pdf" onChange={handleFileChange} style={{ display: 'none' }} required />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={submitting}
                            style={{ padding: '13px', backgroundColor: ACCENT, color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, fontFamily: FONT_BODY, cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '4px' }}
                            onMouseOver={e => { if (!submitting) e.currentTarget.style.backgroundColor = ACCENT_HOVER; }}
                            onMouseOut={e => { if (!submitting) e.currentTarget.style.backgroundColor = ACCENT; }}
                        >
                            {submitting ? <><Loader2 size={16} className="rec-spin" /> A enviar...</> : <><FileText size={16} /> Submeter Candidatura</>}
                        </button>
                    </form>
                </div>
            </main>
            <style>{`
                .rec-spin { animation: rec-spin 1s linear infinite; }
                @keyframes rec-spin { 100% { transform: rotate(360deg); } }
                @media (max-width: 760px) {
                    .candidatura-grid { grid-template-columns: 1fr !important; }
                }
            `}</style>
        </div>
    );
};

export default CandidaturaForm;
