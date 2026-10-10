import { useState, useRef, useEffect } from 'react';
import {
  MessageSquare, Users, Megaphone, LayoutTemplate, ClipboardList, Settings, Menu, Check,
} from 'lucide-react';

/**
 * Por onde se anda dentro do módulo de WhatsApp.
 *
 * Eram seis ícones sem nome, encostados uns aos outros no topo de uma coluna de
 * 300px — a sobreporem-se ao título e sem ninguém conseguir adivinhar o que
 * cada um fazia sem lá passar o rato por cima. Aqui ficam todos, com o nome
 * escrito e uma marca no que está aberto.
 */

export type Seccao = 'chats' | 'groups' | 'campaigns' | 'templates' | 'auditoria' | 'settings';

const SECCOES: { id: Seccao; nome: string; icone: any; nota: string }[] = [
  { id: 'chats', nome: 'Conversas', icone: MessageSquare, nota: 'Atender os clientes' },
  { id: 'groups', nome: 'Grupos', icone: Users, nota: 'Os grupos onde o número está' },
  { id: 'campaigns', nome: 'Campanhas', icone: Megaphone, nota: 'Enviar a muita gente de uma vez' },
  { id: 'templates', nome: 'Templates', icone: LayoutTemplate, nota: 'Mensagens prontas a usar' },
  { id: 'auditoria', nome: 'Auditoria', icone: ClipboardList, nota: 'Quem fez o quê na empresa' },
  { id: 'settings', nome: 'Ligação ao WhatsApp', icone: Settings, nota: 'Ligar e desligar o número' },
];

export default function MenuSeccoes({ actual, aoEscolher, podeVerAuditoria }: {
  actual: Seccao;
  aoEscolher: (s: Seccao) => void;
  podeVerAuditoria: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  const visiveis = SECCOES.filter(s => s.id !== 'auditoria' || podeVerAuditoria);
  const aberta = SECCOES.find(s => s.id === actual) || SECCOES[0];
  const IconeAberto = aberta.icone;

  return (
    <div ref={caixa} style={{ position: 'relative' }}>
      <button
        onClick={() => setAberto(v => !v)}
        title="Mudar de secção"
        aria-expanded={aberto}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '7px',
          padding: '6px 10px', borderRadius: '7px',
          border: '1px solid ' + (aberto ? '#0E5A6B' : 'transparent'),
          background: aberto ? '#E1EEF0' : 'transparent',
          color: '#54656F', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit',
          transition: 'background .15s ease, border-color .15s ease',
        }}
      >
        <Menu size={19} />
        {/* O nome da secção aberta só aparece quando há espaço: numa coluna
            estreita o que importa é o botão continuar a ser clicável. */}
        <span className="wa-seccao-nome">{aberta.nome}</span>
      </button>

      {aberto && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 60,
          background: '#fff', border: '1px solid #E7E9EB', borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(11,20,26,.16)', padding: '5px', minWidth: '248px',
        }}>
          {visiveis.map(s => {
            const Icone = s.icone;
            const activa = s.id === actual;
            return (
              <button
                key={s.id}
                onClick={() => { aoEscolher(s.id); setAberto(false); }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '11px', width: '100%',
                  padding: '9px 11px', borderRadius: '6px', border: 'none', textAlign: 'left',
                  background: activa ? '#E1EEF0' : 'transparent',
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'background .12s ease',
                }}
                onMouseEnter={e => { if (!activa) e.currentTarget.style.background = '#F5F6F6'; }}
                onMouseLeave={e => { if (!activa) e.currentTarget.style.background = 'transparent'; }}
              >
                <Icone size={17} color={activa ? '#0E5A6B' : '#54656F'} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{
                    display: 'block', fontSize: '13.5px',
                    color: activa ? '#0E5A6B' : '#111B21', fontWeight: activa ? 700 : 500,
                  }}>{s.nome}</span>
                  <span style={{ display: 'block', fontSize: '11.5px', color: '#8696A0', marginTop: '1px' }}>
                    {s.nota}
                  </span>
                </span>
                {activa && <Check size={15} color="#0E5A6B" style={{ flexShrink: 0, marginTop: '2px' }} />}
              </button>
            );
          })}
        </div>
      )}

      <style>{`
        /* O nome ao lado do ícone desaparece primeiro: numa coluna estreita
           vale mais o botão caber do que estar legendado. */
        @container (max-width: 330px) {
          .wa-seccao-nome { display: none; }
        }
      `}</style>
    </div>
  );
}
