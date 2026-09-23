import type { Diagrama } from './DiagramaFluxo';

export interface Receita {
  id: string;
  titulo: string;
  paraQue: string;
  dificuldade: 'fácil' | 'médio';
  diagrama: Diagrama;
  comoMontar: string[];
  conversa: { de: 'cliente' | 'bot'; texto: string }[];
}

/**
 * Fluxos completos prontos a copiar, do mais simples ao mais completo.
 * Cada um traz o desenho, os passos de montagem e a conversa que o cliente vê.
 */
export const RECEITAS: Receita[] = [
  {
    id: 'r1',
    titulo: '1. Responder sempre que alguém escreve',
    paraQue: 'O básico: quem manda mensagem recebe logo uma resposta, mesmo de madrugada.',
    dificuldade: 'fácil',
    diagrama: {
      caixas: [
        { tipo: 'gatilho', titulo: 'Mensagem no WhatsApp', detalhe: 'qualquer mensagem' },
        { tipo: 'acao', titulo: 'Responder no WhatsApp', detalhe: '"Olá {{nome_whatsapp}}! Já lhe respondemos."' },
        { tipo: 'fim', titulo: 'Fim do fluxo' }
      ]
    },
    comoMontar: [
      'Autopilot → Novo Fluxo. Já vem com o bloco GATILHO.',
      'Arraste "Responder WhatsApp" da lista da esquerda para a tela.',
      'Ligue a bolinha de baixo do GATILHO à bolinha de cima do bloco novo.',
      'Clique no bloco e escreva a mensagem. Use {{nome_whatsapp}} onde quiser o nome da pessoa.',
      'Arraste "Fim do Fluxo" e ligue ao fim. Guardar → ligar o interruptor do fluxo.'
    ],
    conversa: [
      { de: 'cliente', texto: 'Boa tarde' },
      { de: 'bot', texto: 'Olá Carlos! Já lhe respondemos.' }
    ]
  },
  {
    id: 'r2',
    titulo: '2. Fazer uma pergunta e decidir pela resposta',
    paraQue: 'Quando precisa de saber algo do cliente antes de continuar (é aqui que entra o Se/Então).',
    dificuldade: 'fácil',
    diagrama: {
      caixas: [
        { tipo: 'gatilho', titulo: 'Mensagem no WhatsApp' },
        { tipo: 'espera', titulo: 'Aguardar resposta', detalhe: '"Quer orçamento? Responda SIM ou NÃO"' },
        { tipo: 'condicao', titulo: 'Se {{mensagem}} = sim' }
      ],
      ramos: [
        { rotulo: 'SIM', caixas: [{ tipo: 'acao', titulo: 'Responder', detalhe: '"Quarto simples: 45.000 Kz"' }, { tipo: 'fim', titulo: 'Fim' }] },
        { rotulo: 'NÃO', caixas: [{ tipo: 'acao', titulo: 'Responder', detalhe: '"Sem problema, fico por aqui."' }, { tipo: 'fim', titulo: 'Fim' }] }
      ]
    },
    comoMontar: [
      'Arraste "Aguardar resposta" e ligue ao GATILHO.',
      'Clique nele e escreva a pergunta no campo "Pergunta a enviar".',
      'Arraste "Condição (Se/Então)" e ligue por baixo.',
      'Na condição: Variável = {{mensagem}}, operador "é igual a", valor: sim.',
      'Ligue a saída verde SIM a uma resposta e a vermelha NÃO a outra.',
      'Guardar → botão Simular → escreva "Olá" e depois "sim" para ver funcionar.'
    ],
    conversa: [
      { de: 'cliente', texto: 'Olá' },
      { de: 'bot', texto: 'Quer orçamento? Responda SIM ou NÃO' },
      { de: 'cliente', texto: 'sim' },
      { de: 'bot', texto: 'Quarto simples: 45.000 Kz' }
    ]
  },
  {
    id: 'r3',
    titulo: '3. Menu de atendimento com 3 opções',
    paraQue: 'O clássico "escolha uma opção". O Menu pergunta e espera sozinho — não precisa de "Aguardar resposta" antes.',
    dificuldade: 'fácil',
    diagrama: {
      caixas: [
        { tipo: 'gatilho', titulo: 'Mensagem no WhatsApp' },
        { tipo: 'acao', titulo: 'Responder', detalhe: '"Bem-vindo à Residencial Paraíso!"' },
        { tipo: 'menu', titulo: 'Menu', detalhe: '"1 - Preços | 2 - Reservar | 3 - Falar com alguém"' }
      ],
      ramos: [
        { rotulo: 'opção 1', caixas: [{ tipo: 'acao', titulo: 'Responder', detalhe: 'tabela de preços' }] },
        { rotulo: 'opção 2', caixas: [{ tipo: 'espera', titulo: 'Aguardar resposta', detalhe: '"Para que data?"' }, { tipo: 'acao', titulo: 'Notificar equipa' }] },
        { rotulo: 'opção 3', caixas: [{ tipo: 'humano', titulo: 'Transferir para humano' }] }
      ]
    },
    comoMontar: [
      'Arraste "Responder WhatsApp" (a saudação) e ligue ao GATILHO.',
      'Arraste "Menu" e ligue por baixo da saudação.',
      'No Menu, escreva a pergunta com as opções e crie 3 opções: valor 1, 2 e 3 (o rótulo é só para si).',
      'Cada opção ganha uma bolinha própria em baixo — ligue cada uma ao seu caminho.',
      'Guardar → Simular: escreva "Olá" e depois "2".'
    ],
    conversa: [
      { de: 'cliente', texto: 'Olá' },
      { de: 'bot', texto: 'Bem-vindo à Residencial Paraíso!' },
      { de: 'bot', texto: '1 - Preços\n2 - Reservar\n3 - Falar com alguém' },
      { de: 'cliente', texto: '1' },
      { de: 'bot', texto: 'Quarto simples: 45.000 Kz/noite' }
    ]
  },
  {
    id: 'r4',
    titulo: '4. Submenu com opção "voltar"',
    paraQue: 'Menus dentro de menus, com uma opção que leva o cliente de volta ao menu principal.',
    dificuldade: 'médio',
    diagrama: {
      caixas: [
        { tipo: 'menu', titulo: 'MENU PRINCIPAL', detalhe: '"1 - Preços | 2 - Reservar"' }
      ],
      ramos: [
        {
          rotulo: 'opção 1',
          caixas: [
            { tipo: 'menu', titulo: 'MENU PREÇOS', detalhe: '"1 - Quarto simples | 2 - Voltar"' },
            { tipo: 'acao', titulo: 'Responder (opção 1)', detalhe: '"45.000 Kz"' },
            { tipo: 'acao', titulo: 'Voltar ao menu', detalhe: '→ MENU PRINCIPAL' }
          ]
        },
        { rotulo: 'opção 2', caixas: [{ tipo: 'espera', titulo: 'Aguardar resposta', detalhe: '"Qual é o seu nome?"' }] }
      ]
    },
    comoMontar: [
      'Monte primeiro a receita 3 (menu principal).',
      'Arraste um segundo "Menu" e ligue-o à opção 1 do primeiro. Escreva nele: "1 - Quarto simples | 2 - Voltar".',
      'Arraste "Voltar ao menu" e ligue-o à opção 2 desse submenu.',
      'Clique no "Voltar ao menu" e escolha o MENU PRINCIPAL na lista.',
      'Dica: ligue também a resposta do preço ao mesmo "Voltar ao menu" — assim, depois de responder, o cliente volta a ver o menu.'
    ],
    conversa: [
      { de: 'cliente', texto: '1' },
      { de: 'bot', texto: '1 - Quarto simples\n2 - Voltar' },
      { de: 'cliente', texto: '2' },
      { de: 'bot', texto: '1 - Preços\n2 - Reservar' }
    ]
  },
  {
    id: 'r5',
    titulo: '5. Recolher dados e avisar a equipa',
    paraQue: 'Fazer várias perguntas seguidas, guardar cada resposta e mandar tudo para quem trata do assunto.',
    dificuldade: 'médio',
    diagrama: {
      caixas: [
        { tipo: 'gatilho', titulo: 'Mensagem no WhatsApp' },
        { tipo: 'espera', titulo: 'Aguardar resposta', detalhe: '"Qual é o seu nome?" → guardar em nome_cliente' },
        { tipo: 'espera', titulo: 'Aguardar resposta', detalhe: '"Para que data?" → guardar em data' },
        { tipo: 'acao', titulo: 'Responder', detalhe: '"Obrigado {{nome_cliente}}! Reserva para {{data}} anotada."' },
        { tipo: 'acao', titulo: 'Notificar equipa', detalhe: '"Reserva: {{nome_cliente}} — {{data}} — {{telefone}}"' },
        { tipo: 'fim', titulo: 'Fim do fluxo' }
      ]
    },
    comoMontar: [
      'Arraste dois "Aguardar resposta" em fila, um por pergunta.',
      'Em cada um preencha "Pergunta a enviar" e "Guardar a resposta em" (ex: nome_cliente, data).',
      'Na mensagem seguinte escreva o texto usando {{nome_cliente}} e {{data}}.',
      'Arraste "Notificar Equipa" e escreva lá o resumo com as mesmas variáveis.',
      'Guardar → Simular e responder às perguntas como um cliente faria.'
    ],
    conversa: [
      { de: 'cliente', texto: 'Boa tarde, queria reservar' },
      { de: 'bot', texto: 'Qual é o seu nome?' },
      { de: 'cliente', texto: 'Ana Paula' },
      { de: 'bot', texto: 'Para que data?' },
      { de: 'cliente', texto: '12 de outubro' },
      { de: 'bot', texto: 'Obrigado Ana Paula! Reserva para 12 de outubro anotada.' }
    ]
  }
];

/** A explicação das variáveis, com o erro mais comum lado a lado. */
export const VARIAVEIS_AJUDA = {
  titulo: 'Variáveis: {{mensagem}} e companhia',
  intro: '{{mensagem}} é um quadro onde o sistema escreve a última coisa que o cliente digitou. Cada vez que o cliente escreve, o quadro é apagado e reescrito. Os blocos leem esse quadro no momento em que correm.',
  lista: [
    { nome: '{{mensagem}}', o_que: 'a última coisa que o cliente escreveu' },
    { nome: '{{resposta}}', o_que: 'o mesmo, mas mais claro de ler depois de um "Aguardar resposta"' },
    { nome: '{{nome_whatsapp}}', o_que: 'o nome do cliente no WhatsApp' },
    { nome: '{{telefone}}', o_que: 'o número do cliente' },
    { nome: '{{tags}}', o_que: 'as etiquetas do cliente no CRM' },
    { nome: '{{o_que_voce_criar}}', o_que: 'qualquer resposta que tenha guardado no campo "Guardar a resposta em"' }
  ],
  erradoDiagrama: {
    caixas: [
      { tipo: 'acao' as const, titulo: 'Responder', detalhe: '"Quer orçamento? SIM/NÃO"' },
      { tipo: 'condicao' as const, titulo: 'Se {{mensagem}} = sim', detalhe: 'lê "Olá" → vai sempre para NÃO' }
    ]
  },
  certoDiagrama: {
    caixas: [
      { tipo: 'espera' as const, titulo: 'Aguardar resposta', detalhe: '"Quer orçamento? SIM/NÃO" (o fluxo pára aqui)' },
      { tipo: 'condicao' as const, titulo: 'Se {{mensagem}} = sim', detalhe: 'lê "sim" → vai para SIM' }
    ]
  },
  regras: [
    'Antes de qualquer Se/Então que leia o cliente, ponha um "Aguardar resposta".',
    'O Menu já espera sozinho — não precisa de "Aguardar resposta" antes dele.',
    'Para usar uma resposta mais tarde, preencha "Guardar a resposta em" e depois escreva {{nome_que_deu}}.',
    'Maiúsculas e acentos não interessam na comparação: "Não" é igual a "nao".',
    'Em dúvida, carregue em Simular: o caminho mostra o que a condição leu e com o que comparou.'
  ]
};
