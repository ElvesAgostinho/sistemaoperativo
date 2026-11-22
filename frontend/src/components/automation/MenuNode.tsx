import { Handle, Position, useEdges, type NodeProps } from '@xyflow/react';
import { ListChecks } from 'lucide-react';
import type { MenuNodeData } from './types';
import NodeDeleteButton from './NodeDeleteButton';
import NodeDuplicateButton from './NodeDuplicateButton';

export default function MenuNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as MenuNodeData;
  const options = d.options || [];
  // Uma opção sem nada ligado deixa o cliente SEM RESPOSTA quando a escolhe:
  // o fluxo acaba ali, em silêncio. Visto num fluxo de cliente com 4 de 5
  // opções assim — para quem escolhia, "a automação não funcionava".
  const edges = useEdges();
  const semLigacao = (optId: string, opt: any) =>
    !edges.some(e => e.source === id && e.sourceHandle === optId) && !(Array.isArray(opt?.blocos) && opt.blocos.length);

  return (
    <div className="automation-node-card" style={{
      width: 220,
      backgroundColor: 'white',
      border: `2px solid ${selected ? '#0891b2' : '#06b6d4'}`,
      borderRadius: '10px',
      padding: '10px',
      position: 'relative',
      boxShadow: selected ? '0 0 0 3px rgba(6,182,212,0.18)' : '0 2px 6px rgba(0,0,0,0.06)'
    }}>
      <NodeDeleteButton nodeId={id} />
      <NodeDuplicateButton nodeId={id} />
      <Handle type="target" position={Position.Top} style={{ background: '#06b6d4', width: 8, height: 8 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ backgroundColor: '#ecfeff', padding: '6px', borderRadius: '7px', flexShrink: 0 }}>
          <ListChecks size={15} color="#0891b2" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#0891b2', letterSpacing: '0.5px' }}>MENU</div>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1a1a1a' }}>Escolha do utilizador</div>
        </div>
      </div>

      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {options.length === 0 && (
          <div style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic' }}>Sem opções configuradas</div>
        )}
        {/* Como o cliente o lê: "1 - Ver preços". O número é o que ele escreve. */}
        {options.map((opt, i) => (
          <div key={opt.id} title={semLigacao(opt.id, opt) ? 'Esta opção não está ligada a nada: quem a escolher fica sem resposta. Arraste da bolinha por baixo para o passo seguinte.' : undefined} style={{
            fontSize: '11px', padding: '5px 8px', borderRadius: '7px',
            background: semLigacao(opt.id, opt) ? '#FFFBEB' : '#f0fdfa',
            border: '1px solid ' + (semLigacao(opt.id, opt) ? '#FCD34D' : '#99f6e4'),
            color: semLigacao(opt.id, opt) ? '#92400E' : '#0f766e',
            display: 'flex', gap: '6px'
          }}>
            <span style={{ fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
            <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{opt.label || 'Opção'}</span>
            {semLigacao(opt.id, opt) && <span style={{ flexShrink: 0, fontSize: '9.5px', fontWeight: 700 }}>⚠ sem ligação</span>}
          </div>
        ))}
      </div>

      {options.map((opt, i) => (
        <Handle
          key={opt.id}
          type="source"
          id={opt.id}
          position={Position.Bottom}
          style={{ background: '#0891b2', width: 8, height: 8, left: `${((i + 1) / (options.length + 1)) * 100}%` }}
        />
      ))}

      {/* "Sem resposta": por onde segue quando o cliente, ao fim das
          tentativas, não escolheu nenhuma opção — por exemplo para "Passar a
          humano". Sem ligação, o menu despede-se e a conversa fica livre. */}
      <div style={{ marginTop: '6px', textAlign: 'right', fontSize: '9.5px', color: '#94a3b8', paddingRight: '10px' }}>sem resposta →</div>
      <Handle
        type="source"
        id="fallback"
        position={Position.Right}
        title="Sem resposta: o cliente não escolheu nenhuma opção"
        style={{ background: '#f59e0b', width: 8, height: 8, top: 'auto', bottom: '14px' }}
      />
    </div>
  );
}
