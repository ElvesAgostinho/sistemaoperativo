import { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList, Loader, RefreshCw, Search, X, ShieldAlert,
  Bot, Tag, UserPlus, Send, Mail, IdCard, KeyRound, History, Zap,
} from 'lucide-react';

/**
 * Tudo o que aconteceu na empresa, num sítio só.
 *
 * A auditoria por conversa responde a "quem mexeu neste cliente?". Esta
 * responde à outra metade: "o que é que se andou a fazer esta semana?" — e é
 * essa que apanha o que não é de conversa nenhuma (permissões mudadas,
 * disparos em massa, campanhas de email).
 *
 * Só abre a quem tiver a permissão de ver auditoria. O servidor verifica o
 * mesmo; isto apenas evita mostrar um ecrã que ia dar erro.
 */

interface Registo {
  id: string;
  created_at: string;
  action: string;
  details: string;
  performed_by_name: string;
  target_user_name: string | null;
  conversation_id: string | null;
  alvo_tipo: string | null;
}

/** Cada família de acções com o seu ícone e cor, para se ler a lista de relance. */
const FAMILIAS: { teste: RegExp; nome: string; icone: any; cor: string }[] = [
  { teste: /^bot_/, nome: 'Bot', icone: Bot, cor: '#0E5A6B' },
  { teste: /^etiqueta_/, nome: 'Etiquetas', icone: Tag, cor: '#7C3AED' },
  { teste: /^conversa_/, nome: 'Conversas', icone: UserPlus, cor: '#0891B2' },
  { teste: /^disparo_|^fluxo_disparado/, nome: 'Disparos', icone: Send, cor: '#B45309' },
  { teste: /^campanha_/, nome: 'Campanhas', icone: Mail, cor: '#BE185D' },
  { teste: /^fluxo_/, nome: 'Fluxos', icone: Zap, cor: '#0E5A6B' },
  { teste: /^contacto_/, nome: 'Fichas', icone: IdCard, cor: '#0F766E' },
  { teste: /^historico_/, nome: 'Histórico', icone: History, cor: '#64748B' },
  { teste: /^permissoes_|^papel_|^utilizador_/, nome: 'Equipa', icone: KeyRound, cor: '#DC2626' },
];

const familiaDe = (accao: string) =>
  FAMILIAS.find(f => f.teste.test(accao)) || { nome: 'Outros', icone: ClipboardList, cor: '#64748B' };

/** "há 5 minutos", "ontem às 14:30" — a hora exacta fica no title. */
function quando(iso: string): string {
  const d = new Date(iso);
  const minutos = Math.round((Date.now() - d.getTime()) / 60000);
  if (minutos < 1) return 'agora mesmo';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} hora${horas === 1 ? '' : 's'}`;
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86400000);
  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const hora = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (mesmoDia(d, ontem)) return `ontem às ${hora}`;
  return d.toLocaleDateString() + ' às ' + hora;
}

export default function AuditoriaEmpresa({ aoVoltar }: { aoVoltar: () => void }) {
  const [registos, setRegistos] = useState<Registo[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState('');
  const [procura, setProcura] = useState('');
  const [familia, setFamilia] = useState('');

  const API = import.meta.env.VITE_API_URL;

  const carregar = async () => {
    setACarregar(true); setErro('');
    try {
      const r = await fetch(`${API}/api/whatsapp/auditoria`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('os_auth_token')}` },
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Não foi possível ler a auditoria.');
      setRegistos(d.audit || []);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setACarregar(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  // As famílias que existem MESMO nestes registos. Mostrar as nove sempre
  // enchia a barra de filtros que não davam em nada.
  const familiasPresentes = useMemo(() => {
    const vistas = new Map<string, { nome: string; cor: string; quantos: number }>();
    for (const r of registos) {
      const f = familiaDe(r.action);
      const antes = vistas.get(f.nome);
      vistas.set(f.nome, { nome: f.nome, cor: f.cor, quantos: (antes?.quantos || 0) + 1 });
    }
    return [...vistas.values()].sort((a, b) => b.quantos - a.quantos);
  }, [registos]);

  const visiveis = useMemo(() => {
    const termo = procura.trim().toLowerCase();
    return registos.filter(r => {
      if (familia && familiaDe(r.action).nome !== familia) return false;
      if (!termo) return true;
      return (r.details || '').toLowerCase().includes(termo)
        || (r.performed_by_name || '').toLowerCase().includes(termo)
        || (r.action || '').toLowerCase().includes(termo);
    });
  }, [registos, procura, familia]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: '#fff' }}>
      {/* cabeçalho */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '12px 16px', borderBottom: '1px solid #D5D7DA', background: '#fff', flexWrap: 'wrap',
      }}>
        <button onClick={aoVoltar} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px',
          border: '1px solid #D5D7DA', background: '#fff', borderRadius: '2px',
          cursor: 'pointer', fontSize: '12.5px', fontWeight: 600, color: '#1D2D3E',
        }}>← Conversas</button>

        <span style={{ fontWeight: 700, color: '#1D2D3E', display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
          <ClipboardList size={17} color="#0E5A6B" /> Auditoria da empresa
        </span>

        <button onClick={carregar} disabled={aCarregar} title="Voltar a ler"
          style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '7px 12px', border: '1px solid #D5D7DA', background: '#fff',
            borderRadius: '2px', cursor: aCarregar ? 'default' : 'pointer', fontSize: '12.5px', color: '#5B738B',
          }}>
          <RefreshCw size={13} className={aCarregar ? 'girar' : ''} /> Atualizar
        </button>
      </div>

      {/* procura e filtros */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #F0F2F5', background: '#fff' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '2px', background: '#F0F2F5',
          borderRadius: '8px', padding: '7px 13px', marginBottom: '9px', maxWidth: '460px',
        }}>
          <Search size={16} color="#54656F" style={{ flexShrink: 0 }} />
          <input
            type="text" value={procura} onChange={e => setProcura(e.target.value)}
            placeholder="Procurar por pessoa ou por acção"
            style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', marginLeft: '10px', fontSize: '14px' }}
          />
          {procura && (
            <button onClick={() => setProcura('')} aria-label="Limpar"
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#54656F', display: 'flex', padding: 0 }}>
              <X size={15} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
          <button onClick={() => setFamilia('')} className={'wa-pastilha' + (familia === '' ? ' wa-pastilha-activa' : '')}>
            Tudo ({registos.length})
          </button>
          {familiasPresentes.map(f => (
            <button key={f.nome} onClick={() => setFamilia(f.nome)}
              className={'wa-pastilha' + (familia === f.nome ? ' wa-pastilha-activa' : '')}>
              {f.nome} ({f.quantos})
            </button>
          ))}
        </div>
      </div>

      {/* a lista */}
      <div className="wa-lista" style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 24px' }}>
        {aCarregar ? (
          <div style={{ padding: '50px', textAlign: 'center', color: '#5B738B' }}>
            <Loader size={22} className="girar" /> A carregar...
          </div>
        ) : erro ? (
          <div style={{
            margin: '24px auto', maxWidth: '520px', padding: '14px 16px', borderRadius: '3px',
            background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C',
            fontSize: '13px', display: 'flex', gap: '9px', alignItems: 'flex-start', lineHeight: 1.6,
          }}>
            <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '1px' }} /> {erro}
          </div>
        ) : visiveis.length === 0 ? (
          <div style={{ padding: '56px 24px', textAlign: 'center', color: '#667781', fontSize: '13.5px', lineHeight: 1.7 }}>
            {registos.length === 0 ? (
              <>
                Ainda não há nada registado.<br />
                <span style={{ fontSize: '12.5px', color: '#8696A0' }}>
                  Assim que alguém desligar um bot, mudar um fluxo ou disparar uma campanha, aparece aqui.
                </span>
              </>
            ) : (
              <>Nenhum registo com estes filtros.</>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {visiveis.map((r, i) => {
              const f = familiaDe(r.action);
              const Icone = f.icone;
              const novoDia = i === 0
                || new Date(r.created_at).toDateString() !== new Date(visiveis[i - 1].created_at).toDateString();

              return (
                <div key={r.id}>
                  {novoDia && (
                    <div style={{
                      fontSize: '11px', fontWeight: 700, letterSpacing: '.06em', color: '#8696A0',
                      textTransform: 'uppercase', margin: i === 0 ? '12px 0 8px' : '20px 0 8px',
                    }}>
                      {new Date(r.created_at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                    </div>
                  )}

                  <div style={{
                    display: 'flex', gap: '12px', padding: '11px 13px', borderRadius: '4px',
                    borderLeft: `3px solid ${f.cor}`, background: '#F8FAFC', marginBottom: '6px',
                  }}>
                    <span style={{
                      width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                      background: '#fff', border: `1px solid ${f.cor}33`,
                      display: 'grid', placeItems: 'center',
                    }}>
                      <Icone size={15} color={f.cor} />
                    </span>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '13.5px', color: '#1D2D3E', lineHeight: 1.55 }}>
                        <b>{r.performed_by_name}</b> {r.details}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#8696A0', marginTop: '3px' }}>
                        <span title={new Date(r.created_at).toLocaleString()}>{quando(r.created_at)}</span>
                        {' · '}
                        <span style={{ color: f.cor }}>{f.nome}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`.girar { animation: girar 1s linear infinite; } @keyframes girar { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
