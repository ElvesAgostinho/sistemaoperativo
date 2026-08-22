import { useState, useEffect } from 'react';
import { Save, Loader, CheckCircle, FileText } from 'lucide-react';

// Painel reutilizável do modelo de Proforma — usado tanto em Definições >
// Documentos (para quem não tem o módulo Financeiro) como dentro do próprio
// módulo Financeiro (para quem tem). Os dois apontam para a MESMA
// configuração no backend (mesmas chaves em configuracoes_sistema), por
// isso editar de qualquer um dos dois sítios dá o mesmo resultado — não há
// duas fontes de verdade a divergir.
export default function ConfiguracaoProforma({ compact = false }: { compact?: boolean }) {
    const [config, setConfig] = useState({
        PROFORMA_VALIDADE_DIAS: '30',
        PROFORMA_CONDICOES_PAGAMENTO: '',
        PROFORMA_TERMOS: '',
        PROFORMA_RODAPE: '',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const token = localStorage.getItem('os_auth_token');
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/settings/empresa`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.success && data.config) {
                    const c = data.config;
                    setConfig({
                        PROFORMA_VALIDADE_DIAS: c.PROFORMA_VALIDADE_DIAS || '30',
                        PROFORMA_CONDICOES_PAGAMENTO: c.PROFORMA_CONDICOES_PAGAMENTO || '',
                        PROFORMA_TERMOS: c.PROFORMA_TERMOS || '',
                        PROFORMA_RODAPE: c.PROFORMA_RODAPE || '',
                    });
                }
            } catch (e) { console.error(e); }
            setLoading(false);
        })();
    }, []);

    const salvar = async () => {
        setSaving(true);
        setSaved(false);
        try {
            const token = localStorage.getItem('os_auth_token');
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/settings/empresa`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ configs: config })
            });
            const data = await res.json();
            if (data.success) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
            else alert(data.error || 'Erro ao guardar.');
        } catch {
            alert('Erro de rede ao guardar.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={{ padding: '20px', color: '#64748b', fontSize: '13px' }}>A carregar...</div>;

    return (
        <div style={{ maxWidth: compact ? '100%' : '680px' }}>
            {!compact && (
                <>
                    <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={22} color="#017E84" /> Modelo de Proforma
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 24px 0' }}>
                        Este texto é usado em TODAS as propostas comerciais geradas no CRM ("Gerar Proforma") — editar aqui
                        controla o que sai no documento, em vez de texto fixo. O logótipo e os dados da empresa editam-se em Definições → Empresa.
                    </p>
                </>
            )}

            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '20px' }}>
                <div>
                    <label style={labelStyle}>Validade da proposta (dias)</label>
                    <input type="number" min={1} value={config.PROFORMA_VALIDADE_DIAS}
                        onChange={e => setConfig(p => ({ ...p, PROFORMA_VALIDADE_DIAS: e.target.value }))}
                        style={{ ...inputStyle, width: '160px' }} />
                </div>
                <div>
                    <label style={labelStyle}>Condições de pagamento</label>
                    <textarea value={config.PROFORMA_CONDICOES_PAGAMENTO}
                        onChange={e => setConfig(p => ({ ...p, PROFORMA_CONDICOES_PAGAMENTO: e.target.value }))}
                        placeholder="Ex: 50% de sinal na confirmação, restante 50% na entrega. Pagamento por transferência bancária ou Multicaixa."
                        rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div>
                    <label style={labelStyle}>Termos e condições</label>
                    <textarea value={config.PROFORMA_TERMOS}
                        onChange={e => setConfig(p => ({ ...p, PROFORMA_TERMOS: e.target.value }))}
                        placeholder="Ex: Os preços apresentados não incluem IVA. Esta proposta não constitui uma fatura."
                        rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div>
                    <label style={labelStyle}>Rodapé do documento</label>
                    <input value={config.PROFORMA_RODAPE}
                        onChange={e => setConfig(p => ({ ...p, PROFORMA_RODAPE: e.target.value }))}
                        placeholder="Documento gerado automaticamente pelo BusinessOS."
                        style={inputStyle} />
                </div>
            </div>

            <button onClick={salvar} disabled={saving}
                style={{ width: 'fit-content', padding: '10px 24px', backgroundColor: '#017E84', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {saving ? <Loader size={16} className="spin" /> : <Save size={16} />}
                {saving ? 'A Guardar...' : 'Guardar Modelo de Proforma'}
            </button>
            {saved && <span style={{ marginLeft: '12px', color: '#16a34a', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={14} /> Guardado!</span>}
            <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
