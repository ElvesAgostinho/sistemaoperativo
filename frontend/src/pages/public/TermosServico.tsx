import LegalPageLayout, { secaoTitulo, paragrafo, listaEstilo } from './LegalPageLayout';

export default function TermosServico() {
    return (
        <LegalPageLayout titulo="Termos de Serviço" ultimaAtualizacao="23 de agosto de 2026">
            <p style={paragrafo}>
                O BusinessOS é uma plataforma de gestão empresarial (CRM, RH, Financeiro, WhatsApp, Reuniões e
                Assistente de Inteligência Artificial) fornecida como serviço por assinatura ("SaaS") pela <strong>TOP IA</strong> ("nós",
                "a plataforma"). Estes Termos regulam a utilização do BusinessOS por qualquer empresa cliente ("Cliente",
                "a Empresa") e pelos utilizadores que esta autoriza a aceder ao sistema. Ao criar uma conta, o Cliente
                aceita estes Termos em nome de todos os utilizadores que vier a registar.
            </p>

            <h2 style={secaoTitulo}>1. A conta e a aprovação de acesso</h2>
            <p style={paragrafo}>
                O registo de uma nova empresa fica pendente de aprovação até ser validado manualmente. O registo de um
                novo colaborador dentro de uma empresa já existente (via código de convite) fica igualmente pendente até
                ser aprovado por um administrador dessa empresa. Esta aprovação em duas camadas existe para impedir
                acessos não autorizados aos dados da Empresa.
            </p>
            <p style={paragrafo}>
                O Cliente é responsável por manter a confidencialidade das credenciais dos seus utilizadores e por toda
                a atividade realizada através da sua conta, incluindo ações tomadas pelo Assistente de IA a pedido de um
                utilizador autorizado.
            </p>

            <h2 style={secaoTitulo}>2. Módulos, limites e planos</h2>
            <p style={paragrafo}>
                O acesso aos módulos do BusinessOS (RH, CRM, WhatsApp, Reuniões, Financeiro, Afiliados, Agendamento,
                entre outros) e o número máximo de utilizadores por conta ("lugares") são definidos individualmente
                para cada Empresa, de acordo com o plano contratado. Tentar exceder o número de lugares contratados
                impede a aprovação de novos utilizadores até o limite ser aumentado ou libertado.
            </p>
            <p style={paragrafo}>
                Reservamo-nos o direito de suspender ou limitar o acesso a módulos caso a subscrição não esteja em dia,
                mediante aviso prévio ao administrador da Empresa sempre que possível.
            </p>

            <h2 style={secaoTitulo}>3. Utilização aceitável</h2>
            <p style={paragrafo}>O Cliente compromete-se a não utilizar o BusinessOS para:</p>
            <ul style={listaEstilo}>
                <li>Enviar comunicações não solicitadas em massa (spam) através do módulo de WhatsApp, respeitando sempre as políticas de uso comercial do WhatsApp/Meta;</li>
                <li>Armazenar ou processar dados de terceiros sem base legal para o fazer;</li>
                <li>Tentar aceder a dados de outra Empresa registada na plataforma, ou contornar o isolamento entre contas;</li>
                <li>Utilizar o Assistente de IA para gerar conteúdo ilegal, enganoso ou que viole direitos de terceiros;</li>
                <li>Realizar engenharia inversa, revenda não autorizada, ou sobrecarga deliberada da infraestrutura.</li>
            </ul>

            <h2 style={secaoTitulo}>4. O Assistente de Inteligência Artificial</h2>
            <p style={paragrafo}>
                O Assistente de IA interno pode consultar dados reais da Empresa (clientes, negócios, colaboradores,
                reuniões, contabilidade, entre outros) para responder a pedidos e executar tarefas. Ações sensíveis —
                como a criação de um funcionário, a emissão de um recibo de vencimento ou o registo de um pagamento —
                geram sempre um rascunho que exige confirmação humana antes de qualquer gravação definitiva. O
                Assistente não age sozinho sobre dados financeiros ou de recursos humanos.
            </p>
            <p style={paragrafo}>
                O Assistente pode processar as suas perguntas através de fornecedores de IA externos — ver a nossa{' '}
                <a href="/privacidade" style={{ color: 'inherit', fontWeight: 700 }}>Política de Proteção de Dados</a> para
                detalhes sobre que dados são partilhados e com quem.
            </p>

            <h2 style={secaoTitulo}>5. Propriedade e dados</h2>
            <p style={paragrafo}>
                O software, a marca BusinessOS e a infraestrutura são propriedade da TOP IA. Todos os dados que o Cliente
                introduz na plataforma (clientes, colaboradores, conversas, documentos, gravações) permanecem
                propriedade do Cliente. Após o cancelamento da subscrição, o Cliente pode solicitar a exportação dos
                seus dados dentro de um prazo razoável, findo o qual estes poderão ser eliminados definitivamente.
            </p>

            <h2 style={secaoTitulo}>6. Disponibilidade e limitação de responsabilidade</h2>
            <p style={paragrafo}>
                Esforçamo-nos por manter o serviço disponível de forma contínua, mas não garantimos disponibilidade
                ininterrupta (100%) nem estamos isentos de manutenções pontuais ou falhas de fornecedores terceiros dos
                quais dependemos (alojamento, base de dados, IA, WhatsApp). Na medida permitida por lei, a nossa
                responsabilidade por danos indiretos ou lucros cessantes é excluída; a nossa responsabilidade total
                está limitada ao valor pago pelo Cliente nos três meses anteriores ao incidente.
            </p>

            <h2 style={secaoTitulo}>7. Suspensão e cessação</h2>
            <p style={paragrafo}>
                Qualquer uma das partes pode terminar a relação contratual mediante aviso prévio. Podemos suspender de
                imediato uma conta em caso de utilização que viole a secção 3 ou que ponha em risco a segurança de
                outras Empresas na plataforma.
            </p>

            <h2 style={secaoTitulo}>8. Alterações a estes Termos</h2>
            <p style={paragrafo}>
                Podemos atualizar estes Termos para refletir novas funcionalidades ou requisitos legais. Alterações
                materiais serão comunicadas ao administrador de cada Empresa com antecedência razoável.
            </p>

            <h2 style={secaoTitulo}>9. Lei aplicável</h2>
            <p style={paragrafo}>
                Estes Termos regem-se pela lei da República de Angola. Quaisquer litígios serão submetidos aos
                tribunais competentes angolanos, sem prejuízo de outras vias de resolução acordadas por escrito entre
                as partes.
            </p>

            <h2 style={secaoTitulo}>10. Contacto</h2>
            <p style={paragrafo}>
                Para questões sobre estes Termos, contacte-nos através de{' '}
                <a href="mailto:geral@topia.solutions" style={{ color: 'inherit', fontWeight: 700 }}>geral@topia.solutions</a>.
            </p>
        </LegalPageLayout>
    );
}
