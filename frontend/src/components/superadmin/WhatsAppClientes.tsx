import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, AlertCircle } from 'lucide-react';

/**
 * O WhatsApp de cada cliente, para o dono da plataforma.
 *
 * Um número desligado não recebe nada — nem a conversa, nem a automação — e o
 * cliente pode não dar por isso durante semanas. Aqui vê-se quem está parado,
 * desde quando, e qual foi a última mensagem que entrou, para se poder ligar à
 * empresa antes de ela se queixar.
 */

interface Numero {
  empresaId: string;
  empresa: string;
  numero: string | null;
  estado: 'ligado' | 'desligado' | 'nunca_ligado';
  desligadoDesde: string | null;
  ultimaMensagemRecebida: string | null;
}

const quando = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

const ROTULO: Record<Numero['estado'], { texto: string; fundo: string; cor: string }> = {
  ligado: { texto: 'Ligado', fundo: '#DCEEE2', cor: '#107E3E' },
  desligado: { texto: 'Desligado', fundo: '#FDECEC', cor: '#B23A3A' },
  nunca_ligado: { texto: 'Nunca ligou', fundo: '#FFF4D6', cor: '#92400E' },
};

export default function WhatsAppClientes() {
  const [numeros, setNumeros] = useState<Numero[] | null>(null);
  const [erro, setErro] = useState('');
  const [aCarregar, setACarregar] = useState(false);

  const carregar = async () => {
    setACarregar(true); setErro('');
    try {
      const r = await fetch(`${import.meta.env.VITE_API_URL}/api/superadmin/whatsapp`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('os_auth_token')}` },
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Não foi possível ler o estado.');
      setNumeros(d.numeros || []);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setACarregar(false);
    }
  };
  useEffect(() => { carregar(); }, []);

  const parados = (numeros || []).filter(n => n.estado !== 'ligado').length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{ color: '#5B738B', fontSize: '14px' }}>
          {numeros === null ? 'A ler o estado dos números...' : parados === 0
            ? 'Todos os clientes têm o WhatsApp ligado.'
            : <><b style={{ color: '#B23A3A' }}>{parados} cliente(s)</b> sem WhatsApp ligado — não recebem mensagens e a automação não responde. Para voltar a ligar, a empresa lê o código QR em WhatsApp → Gestão de Canais.</>}
        </div>
        <button onClick={carregar} disabled={aCarregar} style={{ padding: '8px 14px', background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px', color: '#0E5A6B', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {aCarregar ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />} Atualizar
        </button>
      </div>

      {erro && (
        <div style={{ padding: '12px 16px', backgroundColor: '#F6DEDE', color: '#BB0000', borderRadius: '2px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={18} /> {erro}
        </div>
      )}

      {numeros && (
        <div style={{ background: 'white', borderRadius: '2px', border: '1px solid #D5D7DA', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: '#F5F6F7', color: '#5B738B', fontSize: '13px', textTransform: 'uppercase' }}>
              <tr>
                <th style={{ padding: '14px 20px', borderBottom: '1px solid #D5D7DA' }}>Empresa</th>
                <th style={{ padding: '14px 20px', borderBottom: '1px solid #D5D7DA' }}>Número</th>
                <th style={{ padding: '14px 20px', borderBottom: '1px solid #D5D7DA' }}>Estado</th>
                <th style={{ padding: '14px 20px', borderBottom: '1px solid #D5D7DA' }}>Desligado desde</th>
                <th style={{ padding: '14px 20px', borderBottom: '1px solid #D5D7DA' }}>Última mensagem recebida</th>
              </tr>
            </thead>
            <tbody>
              {numeros.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#5B738B' }}>Nenhum cliente tem WhatsApp configurado.</td></tr>
              )}
              {numeros.map(n => {
                const r = ROTULO[n.estado];
                return (
                  <tr key={`${n.empresaId}-${n.numero}`} style={{ borderBottom: '1px solid #EEF0F2' }}>
                    <td style={{ padding: '14px 20px', fontWeight: 600, color: '#1D2D3E' }}>{n.empresa}</td>
                    <td style={{ padding: '14px 20px', color: '#5B738B' }}>{n.numero ? `+${n.numero}` : '—'}</td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ padding: '4px 10px', borderRadius: '999px', background: r.fundo, color: r.cor, fontSize: '12px', fontWeight: 700 }}>{r.texto}</span>
                    </td>
                    <td style={{ padding: '14px 20px', color: '#5B738B' }}>
                      {n.estado === 'desligado' ? (n.desligadoDesde ? quando(n.desligadoDesde) : 'há mais tempo') : '—'}
                    </td>
                    <td style={{ padding: '14px 20px', color: '#5B738B' }}>{quando(n.ultimaMensagemRecebida)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
