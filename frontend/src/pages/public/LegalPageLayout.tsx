import type { ReactNode, CSSProperties } from 'react';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { LogoMark } from '../../components/BrandLogo';

const FONT_DISPLAY = "'Roboto', 'Segoe UI', sans-serif";
const FONT_BODY = "'Roboto', 'Segoe UI', sans-serif";
const ACCENT = '#0E5A6B';
const ACCENT_SOFT = '#E1EEF0';
const INK = '#1D2D3E';
const INK_MUTED = '#5B738B';
const BORDER = '#D5D7DA';

interface LegalPageLayoutProps {
    titulo: string;
    ultimaAtualizacao: string;
    children: ReactNode;
}

const linkStyle: CSSProperties = { color: ACCENT, fontWeight: 600, textDecoration: 'none' };

export default function LegalPageLayout({ titulo, ultimaAtualizacao, children }: LegalPageLayoutProps) {
    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F5F6F7', fontFamily: FONT_BODY, color: INK }}>
            <header style={{ backgroundColor: '#0A3B47', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'white', textDecoration: 'none' }}>
                    <LogoMark size={28} />
                    <span style={{ fontFamily: FONT_DISPLAY, fontSize: '16px', fontWeight: 700 }}>BusinessOS</span>
                </a>
                <a href="/" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(255,255,255,0.75)', textDecoration: 'none', fontSize: '13.5px', fontWeight: 600 }}>
                    <ArrowLeft size={15} /> Início
                </a>
            </header>

            <main style={{ maxWidth: '760px', margin: '0 auto', padding: '48px 24px 80px' }}>
                <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: '26px', fontWeight: 700, margin: '0 0 6px 0' }}>{titulo}</h1>
                <p style={{ color: INK_MUTED, fontSize: '13.5px', margin: '0 0 28px 0' }}>Última atualização: {ultimaAtualizacao}</p>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', backgroundColor: ACCENT_SOFT, border: `1px solid ${BORDER}`, borderRadius: '2px', padding: '16px 18px', marginBottom: '36px' }}>
                    <ShieldAlert size={18} color={ACCENT} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: INK }}>
                        Este documento é um modelo geral, escrito para refletir com precisão como o BusinessOS funciona hoje.
                        Não substitui aconselhamento jurídico — recomenda-se revisão por um advogado antes de o considerar
                        definitivo, em particular quanto à Lei n.º 22/11 (Proteção de Dados Pessoais) e a obrigações fiscais
                        aplicáveis à sua atividade.
                    </p>
                </div>

                <div style={{ fontSize: '15px', lineHeight: 1.75 }}>
                    {children}
                </div>

                <div style={{ marginTop: '56px', paddingTop: '24px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '13.5px' }}>
                    <a href="/termos" style={linkStyle}>Termos de Serviço</a>
                    <a href="/privacidade" style={linkStyle}>Proteção de Dados</a>
                    <a href="/cookies" style={linkStyle}>Cookies</a>
                    <a href="mailto:geral@topia.solutions" style={{ ...linkStyle, marginLeft: 'auto' }}>geral@topia.solutions</a>
                </div>
            </main>
        </div>
    );
}

export const secaoTitulo: CSSProperties = { fontFamily: FONT_DISPLAY, fontSize: '17px', fontWeight: 700, color: INK, margin: '32px 0 10px 0' };
export const paragrafo: CSSProperties = { color: INK, margin: '0 0 14px 0' };
export const listaEstilo: CSSProperties = { margin: '0 0 14px 0', paddingLeft: '22px' };
export { ACCENT, INK_MUTED, BORDER };
