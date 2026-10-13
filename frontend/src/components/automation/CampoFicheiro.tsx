import { useRef, useState } from 'react';
import { Upload, Link2, X, Loader, AlertTriangle } from 'lucide-react';
import MediaWhatsApp from '../whatsapp/MediaWhatsApp';

/**
 * O ficheiro de um bloco de multimédia: carregado do computador OU por endereço.
 *
 * Só havia a caixa do endereço, o que obrigava a ter a foto já algures na
 * internet antes de a poder usar — e quem está a montar um fluxo tem a foto no
 * telemóvel ou no computador, não num servidor. As duas formas servem casos
 * diferentes e ambas são precisas: o carregamento para o que se tem à mão, o
 * endereço para o que já está publicado (um vídeo do YouTube, um PDF do site).
 */

/** O mesmo tecto do servidor (multer, em automationRoutes). */
export const TAMANHO_MAX_MB = 25;

const ACEITA: Record<string, { accept: string; nome: string }> = {
    imagem: { accept: 'image/*', nome: 'imagem' },
    video: { accept: 'video/*', nome: 'vídeo' },
    audio: { accept: 'audio/*', nome: 'áudio' },
    documento: { accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip', nome: 'documento' },
};

const campo: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '8px 10px',
    border: '1px solid #D5D7DA', borderRadius: '6px', fontSize: '12.5px',
    outline: 'none', fontFamily: 'inherit', color: '#1D2D3E',
};

export default function CampoFicheiro({ tipo, url, nome, aoMudar }: {
    tipo: 'imagem' | 'video' | 'audio' | 'documento';
    url: string;
    nome?: string;
    aoMudar: (patch: { url: string; nomeDoFicheiro?: string }) => void;
}) {
    const [aCarregar, setACarregar] = useState(false);
    // O endereco escreve-se letra a letra. Guardar a cada tecla fazia o campo
    // saltar para o estado "ja tenho ficheiro" logo no primeiro caractere.
    const [rascunho, setRascunho] = useState('');
    const [erro, setErro] = useState('');
    const [aviso, setAviso] = useState('');
    const entrada = useRef<HTMLInputElement>(null);
    const def = ACEITA[tipo] || ACEITA.documento;

    const carregar = async (ficheiro: File) => {
        setErro(''); setAviso('');

        // O tecto é do servidor; verificá-lo aqui poupa um envio de 100 MB que
        // ia ser recusado no fim, depois de a pessoa esperar por ele.
        if (ficheiro.size > TAMANHO_MAX_MB * 1024 * 1024) {
            const mb = (ficheiro.size / 1024 / 1024).toFixed(1);
            setErro(`O ficheiro tem ${mb} MB e o máximo são ${TAMANHO_MAX_MB} MB.`);
            return;
        }

        setACarregar(true);
        try {
            const corpo = new FormData();
            corpo.append('file', ficheiro);
            const r = await fetch(`${import.meta.env.VITE_API_URL}/api/automation/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('os_auth_token')}` },
                body: corpo,
            });
            const d = await r.json();
            if (!r.ok || !d.success) throw new Error(d.error || 'O servidor não aceitou o ficheiro.');

            // O servidor diz que tipo de ficheiro recebeu. Se não for o do
            // bloco, o WhatsApp recusa o envio — mais vale dizê-lo agora do que
            // deixar a mensagem falhar a meio de uma conversa real.
            if (d.tipo && d.tipo !== tipo) {
                setAviso(`Isto é um ${d.tipo}, e o bloco é de ${def.nome}. Troque o tipo do bloco, ou escolha outro ficheiro.`);
            }
            aoMudar({ url: d.filePath, nomeDoFicheiro: ficheiro.name });
        } catch (e: any) {
            setErro(e.message || 'Não foi possível carregar o ficheiro.');
        } finally {
            setACarregar(false);
            if (entrada.current) entrada.current.value = '';
        }
    };

    const usarEndereco = () => {
        const v = rascunho.trim();
        if (!v) return;
        // Um endereço que não começa por http nunca vai funcionar no WhatsApp, e
        // o erro só aparecia na conversa do cliente.
        if (!/^https?:\/\//i.test(v)) {
            setErro('O endereço tem de começar por http:// ou https://');
            return;
        }
        setErro(''); setAviso('');
        aoMudar({ url: v });
        setRascunho('');
    };

    const limpar = () => { setErro(''); setAviso(''); aoMudar({ url: '', nomeDoFicheiro: undefined }); };

    // Já há ficheiro: mostra-se o que está lá, e como tirá-lo.
    if (url) {
        return (
            <div style={{ marginBottom: '6px' }}>
                {/* Como o cliente vai ver isto no telemovel. E a MESMA peca que
                    desenha a bolha da conversa — nao uma imitacao dela. */}
                <div style={{
                    padding: '9px', borderRadius: '8px',
                    border: '1px solid #E2E8F0', background: '#EFE7DE',
                }}>
                    <div style={{
                        background: '#fff', borderRadius: '7px', padding: '6px',
                        boxShadow: '0 1px 1px rgba(11,20,26,0.13)',
                    }}>
                        <MediaWhatsApp tipo={tipo} url={url} nome={nome} />
                    </div>
                </div>

                <div style={{
                    display: 'flex', alignItems: 'center', gap: '7px', marginTop: '5px',
                    fontSize: '10.5px', color: '#8696A0',
                }}>
                    <span style={{
                        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {nome || url}
                    </span>
                    <button
                        onClick={limpar}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C',
                            padding: 0, display: 'flex', alignItems: 'center', gap: '3px',
                            fontSize: '10.5px', fontFamily: 'inherit', flexShrink: 0,
                        }}
                    >
                        <X size={11} /> Tirar
                    </button>
                </div>

                {aviso && (
                    <div style={{
                        marginTop: '5px', fontSize: '11px', color: '#92400E',
                        display: 'flex', gap: '5px', alignItems: 'flex-start', lineHeight: 1.6,
                    }}>
                        <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: '2px' }} /> {aviso}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div style={{ marginBottom: '6px' }}>
            <input
                ref={entrada}
                type="file"
                accept={def.accept}
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) carregar(f); }}
            />

            <button
                onClick={() => entrada.current?.click()}
                disabled={aCarregar}
                style={{
                    width: '100%', padding: '9px', borderRadius: '6px',
                    border: '1px dashed #9FC4CC', background: '#fff',
                    color: aCarregar ? '#7FA9B3' : '#0E5A6B',
                    cursor: aCarregar ? 'default' : 'pointer',
                    fontSize: '12.5px', fontWeight: 600, fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}
            >
                {aCarregar ? <Loader size={13} className="girar" /> : <Upload size={13} />}
                {aCarregar ? 'A carregar…' : `Carregar ${def.nome} do computador`}
            </button>

            <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                margin: '7px 0', fontSize: '10.5px', color: '#8696A0',
            }}>
                <span style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
                OU
                <span style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <Link2
                        size={13}
                        color="#8696A0"
                        style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)' }}
                    />
                    <input
                        style={{ ...campo, paddingLeft: '28px' }}
                        value={rascunho}
                        onChange={e => { setRascunho(e.target.value); setErro(''); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); usarEndereco(); } }}
                        onBlur={usarEndereco}
                        placeholder="Colar um endereço (https://…)"
                    />
                </div>
                {rascunho.trim() && (
                    <button
                        onClick={usarEndereco}
                        style={{
                            padding: '0 13px', borderRadius: '6px', border: 'none',
                            background: '#0E5A6B', color: '#fff', cursor: 'pointer',
                            fontSize: '12.5px', fontWeight: 600, fontFamily: 'inherit', flexShrink: 0,
                        }}
                    >
                        Usar
                    </button>
                )}
            </div>

            <div style={{ marginTop: '5px', fontSize: '10.5px', color: '#8696A0', lineHeight: 1.6 }}>
                Até {TAMANHO_MAX_MB} MB. O ficheiro fica guardado e pode ser usado em vários fluxos.
            </div>

            {erro && (
                <div style={{
                    marginTop: '6px', fontSize: '11px', color: '#B91C1C',
                    display: 'flex', gap: '5px', alignItems: 'flex-start', lineHeight: 1.6,
                }}>
                    <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: '2px' }} /> {erro}
                </div>
            )}

            <style>{`.girar { animation: girar 1s linear infinite; } @keyframes girar { 100% { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
