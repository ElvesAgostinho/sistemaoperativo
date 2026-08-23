import LegalPageLayout, { secaoTitulo, paragrafo, listaEstilo } from './LegalPageLayout';

export default function PoliticaPrivacidade() {
    return (
        <LegalPageLayout titulo="Política de Proteção de Dados" ultimaAtualizacao="23 de agosto de 2026">
            <p style={paragrafo}>
                Esta política explica, de forma direta, que dados pessoais o BusinessOS trata, para quê, e com que
                fornecedores terceiros esses dados podem ser partilhados. Aplica-se aos dados dos utilizadores das
                Empresas clientes e aos dados dos clientes/contactos que essas Empresas gerem dentro da plataforma
                (ex: contactos de WhatsApp, leads de CRM). Seguimos os princípios da Lei n.º 22/11, de 17 de junho —
                Lei da Proteção de Dados Pessoais de Angola.
            </p>

            <h2 style={secaoTitulo}>1. Quem é o responsável pelo tratamento</h2>
            <p style={paragrafo}>
                A Empresa cliente (o seu empregador ou o negócio que geriu o registo) é responsável pelos dados que
                introduz no sistema sobre os seus próprios colaboradores e clientes. A <strong>TOP IA</strong>, enquanto
                fornecedora da plataforma, atua como subcontratante/processadora desses dados, tratando-os apenas
                conforme as instruções e configurações da Empresa cliente.
            </p>

            <h2 style={secaoTitulo}>2. Que dados tratamos</h2>
            <ul style={listaEstilo}>
                <li><strong>Conta e perfil:</strong> nome, email, palavra-passe (encriptada), foto de perfil, função (role) na Empresa.</li>
                <li><strong>Recursos Humanos:</strong> nome, BI, NIF, NISS, morada, contacto de emergência, dados bancários (IBAN), salário, ausências, recibos de vencimento — apenas quando a Empresa utiliza o módulo de RH.</li>
                <li><strong>CRM e vendas:</strong> nome, email, telefone e histórico de negócios de clientes e leads que a Empresa gere.</li>
                <li><strong>WhatsApp:</strong> número de telefone, nome de perfil, e o conteúdo das mensagens trocadas (texto, imagem, áudio, documentos) entre a Empresa e os seus contactos.</li>
                <li><strong>Reuniões:</strong> gravação de áudio de cada participante, a transcrição gerada a partir dessa gravação, e a ata/resumo produzidos por IA.</li>
                <li><strong>Ficheiros e documentos</strong> carregados pela Empresa (contratos, comprovativos, currículos de candidatos, etc).</li>
                <li><strong>Dados técnicos:</strong> registos de acesso e de ações relevantes (auditoria), para fins de segurança.</li>
            </ul>

            <h2 style={secaoTitulo}>3. Com que fornecedores terceiros os dados são partilhados</h2>
            <p style={paragrafo}>
                Para o BusinessOS funcionar, alguns dados passam por fornecedores especializados que utilizamos como
                infraestrutura. Nenhum destes fornecedores usa os seus dados para outros fins que não prestar-nos o
                serviço contratado:
            </p>
            <ul style={listaEstilo}>
                <li><strong>Supabase</strong> — alojamento da base de dados, autenticação de contas e armazenamento de ficheiros/imagens.</li>
                <li><strong>OpenAI</strong> — processamento de linguagem natural do Assistente de IA e do bot de WhatsApp, e transcrição de áudio das reuniões (Whisper). O texto das suas perguntas e, quando aplicável, o áudio das reuniões, são enviados a este fornecedor para gerar a resposta.</li>
                <li><strong>Gateway de IA auto-hospedado</strong> — um servidor próprio (LiteLLM) que encaminha os pedidos de IA, permitindo-nos trocar de fornecedor de modelo no futuro sem impacto adicional na privacidade.</li>
                <li><strong>Evolution API / Meta (WhatsApp Business)</strong> — encaminhamento das mensagens de WhatsApp entre a Empresa e os seus contactos.</li>
                <li><strong>Serviço de email (SMTP)</strong> configurado pela própria Empresa — para o envio de emails a partir da plataforma.</li>
            </ul>

            <h2 style={secaoTitulo}>4. Porque tratamos estes dados</h2>
            <p style={paragrafo}>
                Tratamos os dados acima para: prestar o serviço contratado pela Empresa (execução de um contrato),
                cumprir obrigações legais aplicáveis (ex: registos laborais), e para os interesses legítimos da
                Empresa na gestão do seu próprio negócio. Não vendemos dados pessoais a terceiros, nem os utilizamos
                para publicidade.
            </p>

            <h2 style={secaoTitulo}>5. Isolamento entre empresas</h2>
            <p style={paragrafo}>
                Cada Empresa cliente está tecnicamente isolada das restantes: os dados de uma Empresa nunca são
                visíveis a outra Empresa registada na plataforma. O acesso interno da equipa do BusinessOS aos dados
                de uma Empresa é limitado ao estritamente necessário para suporte técnico e aprovação de contas.
            </p>

            <h2 style={secaoTitulo}>6. Quanto tempo guardamos os dados</h2>
            <p style={paragrafo}>
                Os dados são guardados enquanto a conta da Empresa estiver ativa. Após o cancelamento, guardamo-los
                por um período razoável para permitir a exportação a pedido do Cliente, findo o qual são eliminados,
                salvo obrigação legal de conservação mais longa (ex: documentos fiscais ou laborais).
            </p>

            <h2 style={secaoTitulo}>7. Os seus direitos</h2>
            <p style={paragrafo}>Enquanto titular dos dados, tem o direito de:</p>
            <ul style={listaEstilo}>
                <li>Aceder aos dados pessoais que temos sobre si;</li>
                <li>Solicitar a correção de dados incorretos ou desatualizados;</li>
                <li>Solicitar o apagamento dos seus dados, quando não exista outra base legal para os conservar;</li>
                <li>Opor-se a um tratamento específico, ou solicitar a sua limitação;</li>
                <li>Solicitar a portabilidade dos seus dados num formato estruturado.</li>
            </ul>
            <p style={paragrafo}>
                Se é colaborador de uma Empresa cliente, comece por contactar o administrador dessa Empresa — é quem
                controla os seus dados no sistema. Para questões diretamente à TOP IA sobre o funcionamento da
                plataforma, escreva para{' '}
                <a href="mailto:geral@topia.solutions" style={{ color: 'inherit', fontWeight: 700 }}>geral@topia.solutions</a>.
            </p>

            <h2 style={secaoTitulo}>8. Segurança</h2>
            <p style={paragrafo}>
                Todo o tráfego entre o seu navegador e o BusinessOS é encriptado (HTTPS). O acesso ao sistema é
                protegido por autenticação e por controlo de permissões por função (RBAC), e novas contas ficam
                bloqueadas até serem aprovadas por um administrador. A infraestrutura de servidores está protegida por
                firewall e monitorização de tentativas de acesso indevido.
            </p>

            <h2 style={secaoTitulo}>9. Alterações a esta política</h2>
            <p style={paragrafo}>
                Podemos atualizar esta política à medida que o BusinessOS evolui. A data no topo desta página indica
                a versão mais recente.
            </p>
        </LegalPageLayout>
    );
}
