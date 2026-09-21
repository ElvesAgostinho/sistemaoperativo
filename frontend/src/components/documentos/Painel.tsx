import { useState, useEffect } from 'react';
import { LayoutDashboard, FileText, ShieldAlert, Clock, CheckSquare, PenLine, Archive, HardDrive, Lock, MapPin, Inbox } from 'lucide-react';
import { API, authFetch, COR, ROTULO_CICLO, fmtTam } from './comum';

/** Painel executivo do arquivo: números que importam e onde está o trabalho pendente. */
export default function Painel({ irPara }: { irPara: (vista: string) => void }) {
    const [p, setP] = useState<any>(null);
    const [erro, setErro] = useState('');
    useEffect(() => { (async () => { const r = await authFetch(`${API}/api/documentos/painel`); const d = await r.json(); if (d.success) setP(d.painel); else setErro(d.error || 'Não foi possível carregar o painel.'); })(); }, []);
    if (erro) return <div style={{ padding: '20px', color: COR.bad }}>{erro}</div>;
    if (!p) return <div style={{ padding: '20px', color: COR.muted, fontSize: '13px' }}>A calcular...</div>;

    const Cartao = ({ icone: I, valor, rotulo, cor, onClick, sub }: any) => (
        <div onClick={onClick} style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '14px 16px', cursor: onClick ? 'pointer' : 'default', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '2px', background: '#E1EEF0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I size={18} color={cor || COR.accent} /></div>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '22px', fontWeight: 700, color: cor || COR.ink, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
                <div style={{ fontSize: '11.5px', color: COR.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{rotulo}</div>
                {sub && <div style={{ fontSize: '11.5px', color: COR.faint }}>{sub}</div>}
            </div>
        </div>
    );
    const Barras = ({ titulo, itens, rotulo }: { titulo: string; itens: { nome: string; total: number }[]; rotulo?: (n: string) => string }) => {
        const max = Math.max(1, ...itens.map(i => i.total));
        return (
            <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '14px 16px' }}>
                <div style={{ fontWeight: 700, color: COR.ink, fontSize: '13px', marginBottom: '10px' }}>{titulo}</div>
                {itens.length === 0 && <div style={{ fontSize: '12.5px', color: COR.faint }}>Sem dados.</div>}
                {itens.map(i => (
                    <div key={i.nome} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 36px', gap: '8px', alignItems: 'center', marginBottom: '6px', fontSize: '12.5px' }}>
                        <span style={{ color: COR.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={i.nome}>{rotulo ? rotulo(i.nome) : i.nome}</span>
                        <div style={{ height: '10px', background: COR.borderSoft, borderRadius: '2px' }}><div style={{ width: `${(i.total / max) * 100}%`, height: '100%', background: COR.accent, borderRadius: '2px' }} /></div>
                        <span style={{ color: COR.muted, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{i.total}</span>
                    </div>
                ))}
            </div>
        );
    };
    const maxMes = Math.max(1, ...p.entradasPorMes.map((m: any) => m.total));
    const mesNome = (k: string) => new Date(k + '-01T00:00:00').toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' });

    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px' }}>
            <div style={{ maxWidth: '1100px' }}>
                <h2 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 700, color: COR.ink, display: 'flex', alignItems: 'center', gap: '8px' }}><LayoutDashboard size={18} color={COR.accent} /> Painel do arquivo</h2>
                <p style={{ margin: '0 0 16px', fontSize: '12.5px', color: COR.muted }}>O estado do arquivo num relance. Clique num número para ir ao trabalho pendente.</p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                    <Cartao icone={FileText} valor={p.total} rotulo="Documentos" sub={`${p.emVigor} em vigor · ${p.arquivados} arquivados`} onClick={() => irPara('todos')} />
                    <Cartao icone={Inbox} valor={p.porRever + p.aProcessar + p.comErro} rotulo="Por rever" cor={p.porRever + p.comErro > 0 ? COR.warn : undefined} sub={`${p.aProcessar} a ser lidos · ${p.comErro} com erro`} onClick={() => irPara('por_rever')} />
                    <Cartao icone={ShieldAlert} valor={p.caducados} rotulo="Caducados" cor={p.caducados > 0 ? COR.bad : COR.good} sub={`${p.aCaducar30} caducam em 30 dias`} onClick={() => irPara('conformidade')} />
                    <Cartao icone={CheckSquare} valor={p.aprovacoesPendentes} rotulo="Aprovações pendentes" sub={`${p.processosEmCurso} processo${p.processosEmCurso === 1 ? '' : 's'} em curso`} onClick={() => irPara('aprovacoes')} />
                    <Cartao icone={PenLine} valor={p.assinaturasPendentes} rotulo="Assinaturas pendentes" sub={`${p.emAssinatura} documento${p.emAssinatura === 1 ? '' : 's'} à espera`} onClick={() => irPara('aprovacoes')} />
                    <Cartao icone={Clock} valor={p.emRetencao} rotulo="Em retenção" cor={p.emRetencao > 0 ? COR.warn : undefined} sub="prazo de guarda vencido: decidir" onClick={() => irPara('retencao')} />
                    <Cartao icone={Lock} valor={p.confidenciais} rotulo="Confidenciais / Restritos" />
                    <Cartao icone={MapPin} valor={p.comLocalizacaoFisica} rotulo="Com localização física" onClick={() => irPara('fisico')} />
                    <Cartao icone={HardDrive} valor={fmtTam(p.armazenamentoBytes)} rotulo="Armazenamento" />
                    <Cartao icone={Archive} valor={p.eliminados} rotulo="Eliminados (recuperáveis)" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px' }}>
                    <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '14px 16px' }}>
                        <div style={{ fontWeight: 700, color: COR.ink, fontSize: '13px', marginBottom: '10px' }}>Entradas nos últimos 6 meses</div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '120px' }}>
                            {p.entradasPorMes.map((m: any) => (
                                <div key={m.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                                    <span style={{ fontSize: '11px', color: COR.muted, fontVariantNumeric: 'tabular-nums' }}>{m.total}</span>
                                    <div style={{ width: '100%', height: `${Math.max(3, (m.total / maxMes) * 80)}%`, background: COR.accent, borderRadius: '2px 2px 0 0' }} />
                                    <span style={{ fontSize: '10.5px', color: COR.faint }}>{mesNome(m.mes)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <Barras titulo="Por área" itens={p.porArea} />
                    <Barras titulo="Por tipo" itens={p.porTipo} />
                    <Barras titulo="Por estado" itens={p.porCiclo} rotulo={n => ROTULO_CICLO[n] || n} />
                    <Barras titulo="Por origem" itens={p.porOrigem} rotulo={n => ({ manual: 'Upload manual', email: 'Email', whatsapp: 'WhatsApp', sistema: 'Gerados pelo sistema' } as any)[n] || n} />
                    <Barras titulo="Entidades com mais documentos" itens={p.topEntidades} />
                </div>
            </div>
        </div>
    );
}
