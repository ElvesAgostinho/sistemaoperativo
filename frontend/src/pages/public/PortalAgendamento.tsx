import { useEffect, useState } from 'react';
import { CalendarClock, Check, ChevronLeft, Clock, Scissors, User, Loader2, CalendarDays } from 'lucide-react';

interface Servico { id: number; nome: string; duracao_minutos: number; preco: number | null; cor: string; }
interface Profissional { id: number; nome: string; }

const GOLD = '#C9992E';
const DARK = '#14161C';

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#F4F5F7', fontFamily: "'IBM Plex Sans','Segoe UI',system-ui,sans-serif", color: '#16181D' },
  header: { background: DARK, color: 'white', padding: '28px 20px 26px', textAlign: 'center' },
  headerTitle: { fontFamily: "'Manrope','Segoe UI',system-ui,sans-serif", fontWeight: 800, fontSize: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' },
  headerSub: { color: '#9AA1AC', fontSize: '13px', marginTop: '6px' },
  wrap: { maxWidth: '520px', margin: '0 auto', padding: '22px 16px 60px' },
  stepsBar: { display: 'flex', gap: '6px', marginBottom: '20px' },
  stepDot: (active: boolean, done: boolean) => ({ flex: 1, height: '4px', borderRadius: '4px', background: done || active ? GOLD : '#E5E7EB' }),
  card: { background: 'white', border: '1px solid #E5E7EB', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 2px rgba(20,22,28,0.04), 0 6px 20px rgba(20,22,28,0.06)' },
  cardTitle: { fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: '17px', marginBottom: '4px' },
  cardSub: { fontSize: '12.5px', color: '#6B7280', marginBottom: '16px' },
  option: (selected: boolean) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 15px', borderRadius: '11px',
    border: `1.5px solid ${selected ? GOLD : '#E5E7EB'}`, background: selected ? '#FBF1DE' : '#FAFAFA', cursor: 'pointer', marginBottom: '9px'
  }),
  btnPrimary: { width: '100%', padding: '13px', borderRadius: '11px', border: 'none', background: GOLD, color: '#201705', fontWeight: 800, fontSize: '14.5px', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" },
  btnBack: { background: 'none', border: 'none', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '13px', marginBottom: '14px', padding: 0, fontFamily: "'IBM Plex Sans',sans-serif" },
  input: { width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E5E7EB', fontSize: '14px', marginBottom: '12px', fontFamily: "'IBM Plex Sans',sans-serif" },
  slotGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '9px', marginBottom: '18px' },
  slotBtn: (selected: boolean) => ({
    padding: '11px 6px', borderRadius: '10px', border: `1.5px solid ${selected ? GOLD : '#E5E7EB'}`,
    background: selected ? GOLD : '#FAFAFA', color: selected ? '#201705' : '#16181D', fontWeight: 700, fontSize: '13.5px',
    fontFamily: "'IBM Plex Mono',monospace", cursor: 'pointer', textAlign: 'center'
  }),
};

export default function PortalAgendamento() {
  const empresaId = window.location.pathname.split('/')[2];

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [empresaNome, setEmpresaNome] = useState('');
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);

  const [step, setStep] = useState(1);
  const [servico, setServico] = useState<Servico | null>(null);
  const [profissional, setProfissional] = useState<Profissional | null>(null);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [hora, setHora] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState('');
  const [concluido, setConcluido] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/public/agendamento/${empresaId}/info`);
        const d = await res.json();
        if (d.success) {
          setEmpresaNome(d.empresaNome);
          setServicos(d.servicos || []);
          setProfissionais(d.profissionais || []);
        } else setErro('Não foi possível carregar esta página de marcação.');
      } catch { setErro('Erro de conexão ao servidor.'); }
      setLoading(false);
    })();
  }, [empresaId]);

  useEffect(() => {
    if (step !== 4 || !servico) return;
    setSlotsLoading(true);
    setHora('');
    (async () => {
      const qs = new URLSearchParams({ servico_id: String(servico.id), data, ...(profissional ? { profissional_id: String(profissional.id) } : {}) });
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/public/agendamento/${empresaId}/disponibilidade?${qs}`);
      const d = await res.json();
      setSlots(d.success ? d.horarios || [] : []);
      setSlotsLoading(false);
    })();
  }, [step, data, servico, profissional]);

  const confirmar = async () => {
    if (!servico || !hora || !nome.trim() || !telefone.trim()) return;
    setEnviando(true);
    setErroEnvio('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/public/agendamento/${empresaId}/marcar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servico_id: servico.id, profissional_id: profissional?.id, cliente_nome: nome, cliente_telefone: telefone, data, hora_inicio: hora })
      });
      const d = await res.json();
      if (d.success) setConcluido(true);
      else setErroEnvio(d.error || 'Não foi possível concluir a marcação.');
    } catch { setErroEnvio('Erro de conexão ao servidor.'); }
    setEnviando(false);
  };

  if (loading) return <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 className="animate-spin" color={GOLD} /></div>;
  if (erro) return <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center', color: '#B23A3A' }}>{erro}</div>;

  if (concluido) {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <div style={styles.headerTitle}><CalendarClock size={22} color={GOLD} /> {empresaNome}</div>
        </div>
        <div style={styles.wrap}>
          <div style={{ ...styles.card, textAlign: 'center', padding: '36px 22px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#E7F5EC', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Check size={28} color="#1F7A45" />
            </div>
            <div style={{ ...styles.cardTitle, fontSize: '19px' }}>Marcação confirmada!</div>
            <p style={{ color: '#6B7280', fontSize: '13.5px', lineHeight: 1.6, marginTop: '8px' }}>
              {nome}, a sua marcação de <strong>{servico?.nome}</strong> ficou registada para o dia{' '}
              <strong>{new Date(data + 'T12:00:00').toLocaleDateString('pt-PT')}</strong> às <strong>{hora}</strong>.
              {' '}Vai receber uma confirmação pelo WhatsApp no número indicado.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.headerTitle}><CalendarClock size={22} color={GOLD} /> {empresaNome}</div>
        <div style={styles.headerSub}>Marque o seu horário em poucos passos</div>
      </div>

      <div style={styles.wrap}>
        <div style={styles.stepsBar}>
          {[1, 2, 3, 4, 5].map(s => <div key={s} style={styles.stepDot(step === s, step > s)} />)}
        </div>

        {step === 1 && (
          <div style={styles.card}>
            <div style={styles.cardTitle}><Scissors size={16} color={GOLD} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px' }} />Escolha o serviço</div>
            <div style={styles.cardSub}>O que gostaria de marcar?</div>
            {servicos.length === 0 && <div style={{ color: '#9AA1AC', fontSize: '13px', padding: '10px 0' }}>Sem serviços disponíveis de momento.</div>}
            {servicos.map(s => (
              <div key={s.id} style={styles.option(servico?.id === s.id)} onClick={() => { setServico(s); setStep(profissionais.length > 0 ? 2 : 3); }}>
                <div><div style={{ fontWeight: 700, fontSize: '14px' }}>{s.nome}</div><div style={{ fontSize: '12px', color: '#6B7280' }}>{s.duracao_minutos} min{s.preco ? ` · ${Number(s.preco).toLocaleString('pt-AO')} Kz` : ''}</div></div>
              </div>
            ))}
          </div>
        )}

        {step === 2 && (
          <div style={styles.card}>
            <button style={styles.btnBack} onClick={() => setStep(1)}><ChevronLeft size={15} /> Voltar</button>
            <div style={styles.cardTitle}><User size={16} color={GOLD} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px' }} />Escolha o profissional</div>
            <div style={styles.cardSub}>Opcional — pode deixar em aberto.</div>
            <div style={styles.option(profissional === null)} onClick={() => { setProfissional(null); setStep(3); }}>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>Qualquer profissional disponível</div>
            </div>
            {profissionais.map(p => (
              <div key={p.id} style={styles.option(profissional?.id === p.id)} onClick={() => { setProfissional(p); setStep(3); }}>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{p.nome}</div>
              </div>
            ))}
          </div>
        )}

        {step === 3 && (
          <div style={styles.card}>
            <button style={styles.btnBack} onClick={() => setStep(profissionais.length > 0 ? 2 : 1)}><ChevronLeft size={15} /> Voltar</button>
            <div style={styles.cardTitle}><CalendarDays size={16} color={GOLD} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px' }} />Escolha a data</div>
            <div style={styles.cardSub}>Vamos mostrar só os horários realmente livres.</div>
            <input type="date" style={styles.input} value={data} min={new Date().toISOString().slice(0, 10)} onChange={e => setData(e.target.value)} />
            <button style={styles.btnPrimary} onClick={() => setStep(4)}>Ver horários disponíveis</button>
          </div>
        )}

        {step === 4 && (
          <div style={styles.card}>
            <button style={styles.btnBack} onClick={() => setStep(3)}><ChevronLeft size={15} /> Voltar</button>
            <div style={styles.cardTitle}><Clock size={16} color={GOLD} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px' }} />Escolha o horário</div>
            <div style={styles.cardSub}>{new Date(data + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long' })}</div>
            {slotsLoading && <div style={{ color: '#9AA1AC', fontSize: '13px', padding: '10px 0' }}>A verificar disponibilidade...</div>}
            {!slotsLoading && slots.length === 0 && <div style={{ color: '#9AA1AC', fontSize: '13px', padding: '10px 0' }}>Sem horários livres neste dia. Tente outra data.</div>}
            {!slotsLoading && slots.length > 0 && (
              <div style={styles.slotGrid}>
                {slots.map(s => <div key={s} style={styles.slotBtn(hora === s)} onClick={() => setHora(s)}>{s}</div>)}
              </div>
            )}
            <button style={{ ...styles.btnPrimary, opacity: hora ? 1 : 0.5, cursor: hora ? 'pointer' : 'not-allowed' }} disabled={!hora} onClick={() => hora && setStep(5)}>Continuar</button>
          </div>
        )}

        {step === 5 && (
          <div style={styles.card}>
            <button style={styles.btnBack} onClick={() => setStep(4)}><ChevronLeft size={15} /> Voltar</button>
            <div style={styles.cardTitle}>Os seus dados</div>
            <div style={styles.cardSub}>
              {servico?.nome} · {new Date(data + 'T12:00:00').toLocaleDateString('pt-PT')} às {hora}
            </div>
            <input style={styles.input} placeholder="O seu nome" value={nome} onChange={e => setNome(e.target.value)} />
            <input style={styles.input} placeholder="Número de WhatsApp (ex: 9XX XXX XXX)" value={telefone} onChange={e => setTelefone(e.target.value)} />
            {erroEnvio && <div style={{ color: '#B23A3A', fontSize: '12.5px', marginBottom: '10px' }}>{erroEnvio}</div>}
            <button style={{ ...styles.btnPrimary, opacity: nome.trim() && telefone.trim() && !enviando ? 1 : 0.5 }} disabled={!nome.trim() || !telefone.trim() || enviando} onClick={confirmar}>
              {enviando ? 'A confirmar...' : 'Confirmar marcação'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
