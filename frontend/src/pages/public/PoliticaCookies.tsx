import LegalPageLayout, { secaoTitulo, paragrafo, listaEstilo } from './LegalPageLayout';

export default function PoliticaCookies() {
    return (
        <LegalPageLayout titulo="Política de Cookies" ultimaAtualizacao="23 de agosto de 2026">
            <p style={paragrafo}>
                O BusinessOS não utiliza cookies de publicidade ou de rastreamento de terceiros (não temos Google
                Analytics, Facebook Pixel, nem equivalentes). Utilizamos apenas armazenamento local do navegador
                ("localStorage") para manter a sua sessão iniciada — a lista completa está abaixo.
            </p>

            <h2 style={secaoTitulo}>1. O que guardamos no seu navegador e porquê</h2>
            <ul style={listaEstilo}>
                <li><strong>os_auth_token / os_refresh_token</strong> — mantêm-no com sessão iniciada, para não ter de fazer login a cada página.</li>
                <li><strong>os_auth_user</strong> — guarda localmente o seu nome, função e módulos contratados, para a interface carregar mais rápido.</li>
                <li><strong>os_afiliado_user / os_afiliado_token</strong> — equivalente ao acima, mas para quem acede ao Portal de Afiliados.</li>
            </ul>
            <p style={paragrafo}>
                Nenhum destes dados é enviado a terceiros nem usado para publicidade — servem apenas para o sistema
                reconhecer que já iniciou sessão neste navegador.
            </p>

            <h2 style={secaoTitulo}>2. Porque não pedimos consentimento de cookies</h2>
            <p style={paragrafo}>
                Como não utilizamos cookies de rastreamento, marketing ou de terceiros — apenas armazenamento
                estritamente necessário ao funcionamento da sua sessão — não é apresentado um banner de consentimento
                de cookies. Se isto mudar no futuro (por exemplo, com a introdução de análise de utilização), esta
                página será atualizada e passaremos a pedir o seu consentimento antes de ativar esse tipo de
                armazenamento.
            </p>

            <h2 style={secaoTitulo}>3. Como remover estes dados</h2>
            <p style={paragrafo}>
                Terminar sessão (botão "Sair") remove automaticamente estes dados do seu navegador. Também pode
                limpá-los manualmente a qualquer momento nas definições de privacidade do seu navegador, na secção de
                dados de site para o domínio do BusinessOS.
            </p>

            <h2 style={secaoTitulo}>4. Ficheiros de terceiros incorporados</h2>
            <p style={paragrafo}>
                A sala de videochamada do módulo de Reuniões carrega o serviço externo <strong>Jitsi Meet</strong>{' '}
                (meet.jit.si), que pode definir os seus próprios cookies técnicos enquanto a chamada decorre, fora do
                controlo do BusinessOS. Consulte a política de privacidade do Jitsi para mais detalhes sobre esse
                serviço específico.
            </p>
        </LegalPageLayout>
    );
}
