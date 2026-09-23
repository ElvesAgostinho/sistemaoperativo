import type { Diagrama } from './DiagramaFluxo';

export interface PassoGuia {
  onde: string;      // em que ecrã o utilizador tem de estar
  titulo: string;
  texto: string;
  campos?: { campo: string; valor: string }[];
}

export interface Guia {
  id: string;
  emoji: string;
  titulo: string;
  paraQue: string;
  antes: string[];
  passos: PassoGuia[];
  diagrama?: Diagrama;
  conversa?: { de: 'cliente' | 'bot'; texto: string }[];
  armadilhas: { problema: string; porque: string; solucao: string }[];
}

/**
 * Guias de ponta a ponta dos módulos novos. Ao contrário das "receitas" (que
 * mostram só o desenho do fluxo), estes dizem exatamente em que ecrã estar e
 * o que escrever em cada campo, do zero até estar a funcionar.
 */
export const GUIAS: Guia[] = [
  {
    id: 'agendamento',
    emoji: '📅',
    titulo: 'Marcar pelo WhatsApp, do zero',
    paraQue: 'O cliente escreve para o seu número, escolhe o dia e a hora, e a marcação aparece no módulo Agendamento. Sem ninguém do outro lado e sem inteligência artificial — são regras, por isso o resultado é sempre o mesmo.',
    antes: [
      'Ter o WhatsApp ligado (WhatsApp → o canal com o círculo verde).',
      'Cerca de 15 minutos. Não precisa de saber programar.'
    ],
    passos: [
      {
        onde: 'Agendamento → Definições',
        titulo: '1. Diga que negócio tem',
        texto: 'Escolha o tipo de negócio (hotel, clínica, salão, oficina, restaurante, aluguer, ou genérico). O módulo passa logo a usar as suas palavras — "Quarto" em vez de "Serviço", "Reserva" em vez de "Marcação". Se quiser guardar mais alguma coisa em cada marcação (nº de pessoas, matrícula, BI), acrescente aí em baixo, em "Dados que quer guardar".'
      },
      {
        onde: 'Agendamento → (Serviços / Quartos / Consultas)',
        titulo: '2. Crie o que se pode marcar',
        texto: 'Um por linha, com a duração. A duração é o que decide de quanto em quanto tempo há vagas: 60 minutos dá 08:00, 09:00, 10:00…; 30 minutos dá 08:00, 08:30, 09:00…',
        campos: [
          { campo: 'Nome', valor: 'Quarto simples' },
          { campo: 'Duração', valor: '60 minutos' }
        ]
      },
      {
        onde: 'Agendamento → Horário',
        titulo: '3. Diga a que horas está aberto',
        texto: 'Marque os dias e as horas de abertura e fecho. É só dentro deste horário que o sistema oferece vagas — fora dele, responde que não há nada livre. Sem este passo o fluxo não tem horas para mostrar.'
      },
      {
        onde: 'Autopilot → + Nova Automação',
        titulo: '4. Pergunte o dia',
        texto: 'Arraste "Aguardar resposta" da lista da esquerda e ligue-o ao GATILHO. Este bloco pára o fluxo e fica à espera — é isso que o distingue do "Aguardar (pausa)", que só conta o tempo.',
        campos: [
          { campo: 'Pergunta a enviar', valor: 'Para que dia quer marcar?' },
          { campo: 'Guardar a resposta em', valor: 'data_pedida' }
        ]
      },
      {
        onde: 'Autopilot → secção AGENDAMENTO',
        titulo: '5. Veja as horas livres desse dia',
        texto: 'Arraste "Ver horários livres" e ligue ao bloco anterior. Ele lê o que o cliente escreveu — percebe hoje, amanhã, sexta, 12/10, 12 de outubro, dia 3 — e vai buscar as vagas reais.',
        campos: [
          { campo: 'Serviço', valor: 'Quarto simples' },
          { campo: 'Data', valor: '{{data_pedida}}' },
          { campo: 'Guardar os horários em', valor: 'horarios_livres' }
        ]
      },
      {
        onde: 'Autopilot → secção LÓGICA',
        titulo: '6. Há vagas ou não?',
        texto: 'Arraste "Se / Então". Do lado SIM continua a marcação; do lado NÃO responde ao cliente e volta a perguntar o dia. É este bloco que impede o fluxo de seguir em frente com uma data que não percebeu.',
        campos: [
          { campo: 'Variável', valor: '{{tem_vagas}}' },
          { campo: 'Operador', valor: '= igual a' },
          { campo: 'Valor', valor: 'sim' }
        ]
      },
      {
        onde: 'Autopilot (ramo SIM)',
        titulo: '7. Pergunte a hora e o nome',
        texto: 'Dois "Aguardar resposta" em fila. No primeiro mostre as horas que o bloco anterior trouxe; no segundo peça o nome.',
        campos: [
          { campo: 'Pergunta 1', valor: 'Temos livre: {{horarios_livres}}. A que horas?' },
          { campo: 'Guardar em', valor: 'hora_pedida' },
          { campo: 'Pergunta 2', valor: 'Em que nome fica a marcação?' },
          { campo: 'Guardar em', valor: 'nome_cliente' }
        ]
      },
      {
        onde: 'Autopilot → secção AGENDAMENTO',
        titulo: '8. Crie a marcação',
        texto: 'Arraste "Criar marcação". É aqui que fica gravada no módulo, com a origem "Fluxo do Autopilot". Antes de gravar, confirma outra vez se a hora ainda está livre — se entretanto alguém a apanhou, não marca e explica porquê.',
        campos: [
          { campo: 'Serviço', valor: 'Quarto simples (o mesmo do passo 5)' },
          { campo: 'Data', valor: '{{data_pedida}}' },
          { campo: 'Hora', valor: '{{hora_pedida}}' },
          { campo: 'Nome do cliente', valor: '{{nome_cliente}}' },
          { campo: 'Telefone', valor: '{{telefone}}' }
        ]
      },
      {
        onde: 'Autopilot → secção LÓGICA',
        titulo: '9. Confirme ao cliente',
        texto: 'Outro "Se / Então", agora com {{agendamento_ok}} = sim. No SIM, um "Responder no WhatsApp" a confirmar; no NÃO, mostre o motivo e volte a perguntar a hora.',
        campos: [
          { campo: 'Variável', valor: '{{agendamento_ok}}' },
          { campo: 'Resposta no ramo SIM', valor: 'Marcado, {{nome_cliente}}! {{agendamento_data_extenso}} às {{agendamento_hora}}.' },
          { campo: 'Resposta no ramo NÃO', valor: 'Não consegui marcar: {{agendamento_erro}}' }
        ]
      },
      {
        onde: 'Autopilot → botão Simular',
        titulo: '10. Experimente antes de ligar',
        texto: 'Clique em Guardar e depois em Simular. Escreva como um cliente escreveria ("amanhã", "2 da tarde") e veja a conversa a acontecer — sem enviar nada a ninguém, e sem criar marcações a sério. Só quando estiver como quer é que liga o interruptor do fluxo, na lista da esquerda.'
      }
    ],
    diagrama: {
      caixas: [
        { tipo: 'gatilho', titulo: 'Mensagem no WhatsApp' },
        { tipo: 'espera', titulo: 'Aguardar resposta', detalhe: '"Para que dia?" → data_pedida' },
        { tipo: 'agenda', titulo: 'Ver horários livres', detalhe: '→ {{horarios_livres}}, {{tem_vagas}}' },
        { tipo: 'condicao', titulo: 'Se {{tem_vagas}} = sim' }
      ],
      ramos: [
        { rotulo: 'SIM', caixas: [
          { tipo: 'espera', titulo: 'Aguardar resposta', detalhe: 'a hora → hora_pedida' },
          { tipo: 'espera', titulo: 'Aguardar resposta', detalhe: 'o nome → nome_cliente' },
          { tipo: 'agenda', titulo: 'Criar marcação' },
          { tipo: 'condicao', titulo: 'Se {{agendamento_ok}} = sim' },
          { tipo: 'acao', titulo: 'Responder', detalhe: 'confirmação ao cliente' }
        ] },
        { rotulo: 'NÃO', caixas: [
          { tipo: 'acao', titulo: 'Responder', detalhe: '"Nesse dia não tenho nada livre."' },
          { tipo: 'acao', titulo: 'Voltar ao menu' }
        ] }
      ]
    },
    conversa: [
      { de: 'cliente', texto: 'Boa tarde, queria marcar' },
      { de: 'bot', texto: 'Para que dia quer marcar?' },
      { de: 'cliente', texto: 'sexta' },
      { de: 'bot', texto: 'Temos livre: 08:00, 09:00, 10:00, 14:00, 15:00. A que horas?' },
      { de: 'cliente', texto: '2 da tarde' },
      { de: 'bot', texto: 'Em que nome fica a marcação?' },
      { de: 'cliente', texto: 'Ana Paula' },
      { de: 'bot', texto: 'Marcado, Ana Paula! 25 de setembro de 2026 às 14:00.' }
    ],
    armadilhas: [
      {
        problema: 'O bot responde sempre "não tenho nada livre"',
        porque: 'O Horário de funcionamento está fechado nesse dia, ou não há nenhum serviço criado.',
        solucao: 'Agendamento → Horário: abra os dias. Agendamento → Serviços: crie pelo menos um, com duração.'
      },
      {
        problema: 'O fluxo salta a pergunta e responde logo',
        porque: 'Usou "Aguardar (pausa)" em vez de "Aguardar resposta". A pausa só conta o tempo, não espera por ninguém.',
        solucao: 'Troque pelo bloco "Aguardar resposta", que é o único que pára o fluxo até o cliente escrever.'
      },
      {
        problema: 'A condição vai sempre para o ramo NÃO',
        porque: 'Pôs o "Se / Então" antes do "Ver horários livres" — nessa altura {{tem_vagas}} ainda não existe.',
        solucao: 'A ordem é sempre: perguntar → ir buscar → só depois decidir.'
      },
      {
        problema: 'Marcou, mas não aparece no módulo',
        porque: 'Simulou em vez de correr a sério. A simulação nunca grava nada, de propósito.',
        solucao: 'Ligue o interruptor do fluxo e escreva do seu telemóvel para o número da empresa.'
      }
    ]
  },
  {
    id: 'templates',
    emoji: '💬',
    titulo: 'Templates: mensagens prontas, como as da Meta',
    paraQue: 'Modelos de mensagem guardados uma vez e usados sempre — pelo fluxo, ou por si à mão no chat. Servem tanto para a API oficial da Meta como para a não oficial.',
    antes: ['Ter pelo menos um canal de WhatsApp ligado.'],
    passos: [
      {
        onde: 'WhatsApp → Templates',
        titulo: '1. Crie o modelo',
        texto: 'Clique em Novo. Dê um nome curto e sem espaços (é assim que a Meta exige) e escolha a categoria: Utilidade para avisos, Marketing para promoções.',
        campos: [
          { campo: 'Nome', valor: 'confirmacao_reserva' },
          { campo: 'Categoria', valor: 'Utilidade' },
          { campo: 'Idioma', valor: 'Português (Portugal)' }
        ]
      },
      {
        onde: 'WhatsApp → Templates',
        titulo: '2. Escreva o corpo com espaços por preencher',
        texto: 'Onde quiser uma parte variável, escreva {{1}}, {{2}}, {{3}} — por ordem. É a numeração que a Meta usa. Pode juntar cabeçalho, rodapé e botões.',
        campos: [
          { campo: 'Corpo', valor: 'Olá {{1}}, a sua reserva de {{2}} está confirmada para {{3}}.' },
          { campo: 'Rodapé', valor: 'Responda a esta mensagem para remarcar.' }
        ]
      },
      {
        onde: 'WhatsApp → Templates',
        titulo: '3. Envie para aprovação (só na API oficial)',
        texto: 'Se usa a API oficial da Meta, clique em Submeter e espere pela aprovação — costuma demorar minutos. Na API não oficial o modelo fica disponível logo, sem aprovação.'
      },
      {
        onde: 'Autopilot → Enviar template',
        titulo: '4. Use no fluxo',
        texto: 'Arraste o bloco "Enviar template", escolha o modelo da lista e preencha cada espaço. Nos espaços pode pôr variáveis do fluxo.',
        campos: [
          { campo: '{{1}}', valor: '{{nome_whatsapp}}' },
          { campo: '{{2}}', valor: '{{agendamento_servico}}' },
          { campo: '{{3}}', valor: '{{agendamento_data_extenso}}' }
        ]
      },
      {
        onde: 'WhatsApp → chat',
        titulo: '5. Ou use à mão, numa conversa',
        texto: 'Na caixa de escrever há um botão de templates: escolhe o modelo, preenche os espaços e envia. Escrever à mão continua a funcionar como sempre — o template é uma opção, não uma obrigação.'
      }
    ],
    armadilhas: [
      {
        problema: 'A Meta recusou o template',
        porque: 'Nomes com espaços ou maiúsculas, corpo a começar ou acabar numa variável, ou categoria errada (promoção marcada como Utilidade).',
        solucao: 'Nome em minúsculas com _ , texto à volta de cada {{1}}, e Marketing para tudo o que venda alguma coisa.'
      },
      {
        problema: 'O bloco envia mas não chega nada',
        porque: 'O número do cliente nunca falou consigo e está a usar a API oficial: fora da janela de 24 horas só passam templates aprovados.',
        solucao: 'Use um template aprovado, ou espere que seja o cliente a escrever primeiro.'
      }
    ]
  },
  {
    id: 'notificar',
    emoji: '🔔',
    titulo: 'Ser avisado quando entra um cliente',
    paraQue: 'O fluxo atende, mas é você que fecha o negócio. Este bloco avisa-o a si (ou à equipa) por email, por WhatsApp, ou pelos dois ao mesmo tempo.',
    antes: ['Para avisar por email: Definições → Email configurado. Para WhatsApp: um canal ligado.'],
    passos: [
      {
        onde: 'Autopilot → secção AVANÇADO',
        titulo: '1. Arraste "Notificar Equipa"',
        texto: 'Ponha-o logo a seguir ao passo em que já sabe que vale a pena — depois de a pessoa escolher "quero reservar", por exemplo, e não logo no "Olá".'
      },
      {
        onde: 'Painel do bloco',
        titulo: '2. Escolha como quer ser avisado',
        texto: 'Email, WhatsApp, ou os dois. Em "Para quem" pode pôr vários, separados por vírgula: o sistema percebe sozinho o que é email (tem @) e o que é telemóvel (só números).',
        campos: [
          { campo: 'Como avisar', valor: 'Os dois (email e WhatsApp)' },
          { campo: 'Para quem', valor: 'reservas@empresa.ao, 244923000111' }
        ]
      },
      {
        onde: 'Painel do bloco',
        titulo: '3. Escreva o aviso com os dados já lá dentro',
        texto: 'Use as variáveis para não ter de abrir o sistema para saber de quem se trata.',
        campos: [
          { campo: 'Mensagem', valor: 'Reserva: {{nome_cliente}} — {{agendamento_data_extenso}} às {{agendamento_hora}} — {{telefone}}' }
        ]
      },
      {
        onde: 'Painel do bloco',
        titulo: '4. Ponha um email de recurso',
        texto: 'Se o WhatsApp estiver desligado nesse dia, o aviso não se perde: vai para este email, com a explicação do que falhou. É o campo que evita perder um cliente por causa de um canal em baixo.',
        campos: [{ campo: 'Email de recurso', valor: 'dono@empresa.ao' }]
      },
      {
        onde: 'Autopilot → Simular',
        titulo: '5. Confirme que chega',
        texto: 'Na simulação o aviso aparece na lista de passos, mas não é enviado. Para confirmar a sério, ligue o fluxo e escreva você mesmo para o número da empresa.'
      }
    ],
    armadilhas: [
      {
        problema: 'Não recebo nada',
        porque: 'O SMTP não está configurado, ou o canal de WhatsApp está desligado.',
        solucao: 'Definições → Email; WhatsApp → o canal tem de ter o círculo verde. Entretanto, preencha o email de recurso.'
      },
      {
        problema: 'Recebo avisos a mais',
        porque: 'O bloco está logo a seguir ao gatilho, por isso dispara com qualquer "Olá".',
        solucao: 'Mova-o para depois da condição ou da opção de menu que interessa.'
      }
    ]
  }
];
