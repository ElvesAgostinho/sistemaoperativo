import { useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';

const STORAGE_KEY = 'os_cookie_consent_v1';

const FONT_BODY = "'IBM Plex Sans', 'Segoe UI', sans-serif";
const ACCENT = '#017E84';
const ACCENT_HOVER = '#016368';
const INK = '#16211F';
const BORDER = '#E2E8E6';

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
            background: 'white', border: `1px solid ${BORDER}`, borderRadius: '14px',
            boxShadow: '0 12px 32px rgba(15,23,20,0.16)', padding: '18px 20px',
            display: 'flex', alignItems: 'flex-start', gap: '14px', fontFamily: FONT_BODY
        }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: '#E3F3F1', color: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Cookie size={17} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: INK, lineHeight: 1.55 }}>
                    Só usamos armazenamento essencial para manter a sua sessão iniciada — sem cookies de publicidade ou de rastreamento de terceiros. Saiba mais na nossa{' '}
                    <a href="/cookies" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, fontWeight: 700, textDecoration: 'none' }}>Política de Cookies</a>.
                </p>
                <button
                    onClick={aceitar}
                    style={{ padding: '8px 18px', backgroundColor: ACCENT, color: 'white', border: 'none', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700, fontFamily: FONT_BODY, cursor: 'pointer' }}
                    onMouseOver={e => { e.currentTarget.style.backgroundColor = ACCENT_HOVER; }}
                    onMouseOut={e => { e.currentTarget.style.backgroundColor = ACCENT; }}
                >
                    Entendi
                </button>
            </div>
        </div>
    );
}
