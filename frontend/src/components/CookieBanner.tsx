import { useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';

const STORAGE_KEY = 'os_cookie_consent_v1';

const FONT_BODY = "'Roboto', 'Segoe UI', sans-serif";
const ACCENT = '#0E5A6B';
const ACCENT_HOVER = '#0A4451';
const INK = '#1D2D3E';
const BORDER = '#D5D7DA';

export default function CookieBanner() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        try {
            if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
        } catch { /* localStorage indisponível (modo privado) — não bloqueia a app */ }
    }, []);

    const aceitar = () => {
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <div style={{
            position: 'fixed', left: '20px', right: '20px', bottom: '20px', zIndex: 10000,
            maxWidth: '560px', margin: '0 auto',
            background: 'white', border: `1px solid ${BORDER}`,
            boxShadow: '0 2px 10px rgba(29,45,62,0.2)', padding: '18px 20px',
            display: 'flex', alignItems: 'flex-start', gap: '14px', fontFamily: FONT_BODY
        }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '2px', background: '#E1EEF0', color: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Cookie size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: INK, lineHeight: 1.55 }}>
                    Só usamos armazenamento essencial para manter a sua sessão iniciada — sem cookies de publicidade ou de rastreamento de terceiros. Saiba mais na nossa{' '}
                    <a href="/cookies" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, fontWeight: 700, textDecoration: 'none' }}>Política de Cookies</a>.
                </p>
                <button
                    onClick={aceitar}
                    style={{ padding: '8px 18px', backgroundColor: ACCENT, color: 'white', border: 'none', borderRadius: '2px', fontSize: '12.5px', fontWeight: 700, fontFamily: FONT_BODY, cursor: 'pointer' }}
                    onMouseOver={e => { e.currentTarget.style.backgroundColor = ACCENT_HOVER; }}
                    onMouseOut={e => { e.currentTarget.style.backgroundColor = ACCENT; }}
                >
                    Entendi
                </button>
            </div>
        </div>
    );
}
