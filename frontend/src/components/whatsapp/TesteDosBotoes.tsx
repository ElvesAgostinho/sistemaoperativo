import { useState, useEffect } from 'react';
import { MousePointerClick, ListOrdered } from 'lucide-react';

/**
 * Como os menus chegam ao cliente, em cada número da empresa.
 *
 * Havia aqui um teste de botões e um interruptor para os ligar na Evolution.
 * Saíram os dois: nunca houve uma Evolution onde os botões chegassem (falhou na
 * 2.3.6, na 2.3.7 e com dois números), e com o interruptor ligado a mensagem
 * ficava em PENDING — o cliente não recebia nem o texto da pergunta.
 *
 * Agora a regra é fixa e fica escrita aqui, para quem configura:
 *  - Evolution (o número ligado por QR code): lista numerada, o cliente
 *    responde com o número; os links, telefones e códigos vão escritos.
 *  - API oficial da Meta: botões e menus a clicar.
 */
export default function TesteDosBotoes() {
  const [estado, setEstado] = useState<{ temEvolution: boolean; temMeta: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${import.meta.env.VITE_API_URL}/api/whatsapp/canal/botoes`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('os_auth_token')}` },
        });
        const d = await r.json();
        if (d.success) {
          setEstado({
            temEvolution: d.temEvolution ?? d.provider === 'evolution',
            temMeta: d.temMeta ?? d.provider === 'meta',
          });
        }
      } catch { /* o painel funciona sem isto */ }
    })();
  }, []);

  if (!estado || (!estado.temEvolution && !estado.temMeta)) return null;

  const linha = (icone: any, cor: string, titulo: string, texto: React.ReactNode) => {
    const Icone = icone;
    return (
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginTop: '10px' }}>
        <Icone size={16} color={cor} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '12.5px', color: '#5B738B', lineHeight: 1.65 }}>
          <b style={{ color: '#1D2D3E' }}>{titulo}</b><br />{texto}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      border: '1px solid #D5D7DA', borderRadius: '2px', padding: '16px', marginBottom: '20px', background: '#fff',
    }}>
      <b style={{ color: '#1D2D3E', fontSize: '14px' }}>Como os menus chegam ao cliente</b>

      {estado.temEvolution && linha(ListOrdered, '#5B738B', 'Número da Evolution (QR code) — lista numerada', <>
        O menu chega como texto: <i>"1 - Ver preços / 2 - Fazer reserva"</i>, e o cliente responde
        com o <b>número</b>. Os botões de link, chamada e copiar vão escritos no texto. Esta via não
        entrega botões a clicar — por isso o sistema nunca os tenta aqui.
      </>)}

      {estado.temMeta && linha(MousePointerClick, '#0E5A6B', 'Número da API oficial da Meta — botões a clicar', <>
        Até 3 opções chegam como botões; mais do que isso, como um menu que abre. O cliente
        também pode escrever o número, e funciona na mesma.
      </>)}
    </div>
  );
}
