export interface HelpField {
  label: string;
  explicacao: string;
}

export interface HelpItem {
  id: string;
  titulo: string;
  categoria: string;
  cor: string;
  oQueFaz: string;
  quandoUsar: string;
  campos?: HelpField[];
  exemplo: { cenario: string; passos: string[] };
}

export const HELP_INTRO = {
  titulo: 'Como construir um fluxo, em 5 passos',
  passos: [
    { titulo: '1. Crie uma automação', texto: 'Clique em "+ NOVA AUTOMAÇÃO" na lista à esquerda. Cada automação é um fluxo independente, com o seu próprio nome.' },
    { titulo: '2. Configure o Gatilho', texto: 'Todo fluxo começa com um nó de Gatilho (já vem criado). É ele que decide QUANDO o fluxo arranca — ex: "quando o cliente escrever a palavra preço no WhatsApp".' },
    { titulo: '3. Arraste nós da paleta', texto: 'À esquerda do canvas há uma lista de blocos organizados por categoria (Lógica, Mensagens, CRM, Avançado). Arraste o que precisar para o canvas, ou clique para adicionar no centro.' },
    { titulo: '4. Ligue os nós', texto: 'Clique e arraste a partir do pontinho na base de um nó até ao topo do próximo, para desenhar a seta que liga os dois passos. Nós de Condição e Menu têm mais do que uma saída — cada uma pode ir para um caminho diferente.' },
    { titulo: '5. Configure cada nó e Guarde', texto: 'Clique num nó para abrir o painel de configuração à direita. Preencha os campos (pode usar {{variáveis}} como {{nome_whatsapp}} ou {{mensagem}} para personalizar). No fim, clique em "Guardar".' }
  ],
  dicas: [
    'Use o botão "Organizar" (ícone de grade, no canto inferior esquerdo do canvas) para arrumar automaticamente os nós em colunas, como um fluxograma.',
    'Use o controlo de zoom no topo do canvas para ver o fluxo inteiro de uma vez ou aproximar um nó específico.',
    'Passe o rato sobre um nó para ver um "×" vermelho no canto — clique para apagar esse nó rapidamente.',
    'Uma automação só funciona depois de estar Ativa (o círculo verde ao lado do nome, na lista à esquerda) — clique nele para ligar/desligar.'
  ]
};

export const HELP_ITEMS: HelpItem[] = [
  // ---- GATILHO ----
  {
    id: 'trigger',
    titulo: 'Gatilho — Mensagem WhatsApp',
    categoria: 'Início do Fluxo',
    cor: '#f59e0b',
    oQueFaz: 'Define a condição que faz o fluxo começar a correr. É sempre o primeiro nó — todo fluxo tem exatamente um.',
    quandoUsar: 'Escolha "Qualquer mensagem recebida" se este for o fluxo principal de atendimento. Escolha "Contém palavra-chave" para fluxos específicos que só devem responder a certos assuntos (ex: só quando o cliente escrever "preço" ou "orçamento").',
    campos: [
      { label: 'Tipo de Gatilho', explicacao: '"Mensagem Recebida no WhatsApp" (o mais comum) ou "Webhook Genérico" (para integrações externas mais avançadas).' },
      { label: 'Condição', explicacao: '"Qualquer mensagem" dispara sempre; "Contém palavra-chave" só dispara se o texto do cliente incluir uma das palavras indicadas; "Expressão regular" é para quem já conhece regex, permite padrões mais complexos.' },
      { label: 'Palavras-chave', explicacao: 'Lista separada por vírgulas. Ex: "preço, tabela, catalogo" — dispara se o cliente escrever qualquer uma delas, em qualquer parte da frase.' }
    ],
    exemplo: {
      cenario: 'Uma loja quer um fluxo que só ativa quando o cliente pergunta pelo preço.',
      passos: [
        'Tipo de Gatilho: Mensagem Recebida no WhatsApp',
        'Condição: Contém palavra-chave',
        'Palavras-chave: preço, quanto custa, valor, tabela'
      ]
    }
  },
  // ---- LÓGICA ----
  {
    id: 'condition',
    titulo: 'Condição (Se / Então)',
    categoria: 'Lógica',
    cor: '#8b5cf6',
    oQueFaz: 'Testa uma condição e divide o fluxo em dois caminhos: "Sim" (condição verdadeira) e "Não" (condição falsa). Cada caminho pode seguir para nós completamente diferentes.',
    quandoUsar: 'Sempre que a resposta ou ação seguinte depender de alguma coisa — o que o cliente escreveu, uma tag que ele tem, um valor que foi guardado antes.',
    campos: [
      { label: 'Variável', explicacao: 'O que vai ser testado, entre chavetas duplas. Ex: {{mensagem}} (o texto que o cliente enviou), {{tags}} (as etiquetas do cliente), ou qualquer {{campo_personalizado}} definido antes no fluxo.' },
      { label: 'Operador', explicacao: '"contém" (mais usado — verifica se o texto inclui uma palavra), "é igual a", "é diferente de", "maior que" e "menor que" (para números).' },
      { label: 'Valor', explicacao: 'O que comparar com a variável. Ex: "urgente".' }
    ],
    exemplo: {
      cenario: 'Se a mensagem do cliente contiver "urgente", responder de forma prioritária; senão, seguir o atendimento normal.',
      passos: [
        'Variável: {{mensagem}}',
        'Operador: contém',
        'Valor: urgente',
        'Ligar a saída SIM a um nó "Transferir para Humano"',
        'Ligar a saída NÃO ao resto do fluxo normal'
      ]
    }
  },
  {
    id: 'menu',
    titulo: 'Menu (Respostas Rápidas)',
    categoria: 'Lógica',
    cor: '#0891b2',
    oQueFaz: 'Como a Condição, mas com várias opções ao mesmo tempo em vez de só Sim/Não. Cada opção tem a sua própria saída, ligável a um caminho diferente.',
    quandoUsar: 'Para menus de atendimento tipo "escolha uma opção": vendas, suporte, financeiro — o clássico menu de WhatsApp Business.',
    campos: [
      { label: 'Variável avaliada', explicacao: 'Normalmente {{mensagem}} — o texto que o cliente escreveu.' },
      { label: 'Opções', explicacao: 'Cada opção tem um Rótulo (só para você identificar no canvas) e um valor de correspondência (a palavra que, se estiver na mensagem, escolhe esse caminho). A primeira opção que corresponder é usada.' }
    ],
    exemplo: {
      cenario: 'Menu inicial de atendimento com 3 opções.',
      passos: [
        'Opção 1 — Rótulo: "Vendas", Casa quando contém: comprar',
        'Opção 2 — Rótulo: "Suporte", Casa quando contém: suporte, problema, ajuda',
        'Opção 3 — Rótulo: "Financeiro", Casa quando contém: fatura, pagamento',
        'Ligar cada opção a um ramo diferente do fluxo'
      ]
    }
  },
  // ---- MENSAGENS ----
  {
    id: 'reply_message',
    titulo: 'Responder WhatsApp',
    categoria: 'Mensagens',
    cor: '#0ea5e9',
    oQueFaz: 'Envia uma mensagem de texto fixa (com variáveis) de volta ao cliente pelo WhatsApp.',
    quandoUsar: 'Para respostas diretas e previsíveis — confirmações, saudações, informações fixas. É o nó mais usado em qualquer fluxo.',
    campos: [
      { label: 'Telefone', explicacao: 'Deixe em branco/como {{telefone}} para responder a quem enviou a mensagem — só mude se quiser enviar para outro número.' },
      { label: 'Mensagem', explicacao: 'O texto a enviar. Pode usar {{nome_whatsapp}}, {{mensagem}}, ou qualquer variável criada antes no fluxo (ex: {{orcamento}}).' }
    ],
    exemplo: {
      cenario: 'Saudação personalizada.',
      passos: ['Mensagem: "Olá {{nome_whatsapp}}! Obrigado por entrar em contacto. Em que posso ajudar?"']
    }
  },
  {
    id: 'ai_reply',
    titulo: 'Responder com IA (Base de Conhecimento)',
    categoria: 'Mensagens',
    cor: '#059669',
    oQueFaz: 'Gera uma resposta automaticamente com Inteligência Artificial, baseada nos documentos que a empresa carregou na Base de Conhecimento (políticas, FAQs, catálogos).',
    quandoUsar: 'Quando a pergunta do cliente pode variar muito e não compensa escrever uma resposta fixa para cada caso — a IA procura a informação certa nos documentos e responde no ato.',
    campos: [
      { label: 'Telefone', explicacao: 'Igual ao nó "Responder WhatsApp" — normalmente deixa-se {{telefone}}.' },
      { label: 'Pergunta / instrução', explicacao: 'O que perguntar à IA. O mais comum é usar {{mensagem}} para repassar exatamente o que o cliente escreveu.' }
    ],
    exemplo: {
      cenario: 'Loja carregou um documento "Politica_Devolucoes.txt" na Base de Conhecimento e quer que perguntas sobre devoluções sejam respondidas automaticamente.',
      passos: [
        'Na Base de Conhecimento, carregar o documento com as políticas',
        'No fluxo: Gatilho com palavra-chave "devolução, trocar, garantia"',
        'Ligar direto a um nó "Responder com IA" com Pergunta: {{mensagem}}'
      ]
    }
  },
  {
    id: 'send_email',
    titulo: 'Enviar Email',
    categoria: 'Mensagens',
    cor: '#3b82f6',
    oQueFaz: 'Envia um email usando as credenciais configuradas em Definições > Email.',
    quandoUsar: 'Para confirmações formais, envio de documentos por email, ou quando o WhatsApp não é o canal ideal.',
    campos: [
      { label: 'Destinatário', explicacao: 'O email de quem vai receber.' },
      { label: 'Assunto', explicacao: 'Título do email.' },
      { label: 'Corpo', explicacao: 'Texto do email — aceita variáveis {{}}.' }
    ],
    exemplo: {
      cenario: 'Enviar confirmação por email depois de criar uma lead.',
      passos: ['Destinatário: {{email}}', 'Assunto: "Recebemos o seu pedido"', 'Corpo: "Olá {{nome_whatsapp}}, já recebemos o seu pedido e vamos responder em breve."']
    }
  },
  {
    id: 'send_media',
    titulo: 'Enviar Imagem / Vídeo / Áudio / Documento',
    categoria: 'Mensagens',
    cor: '#10b981',
    oQueFaz: 'Envia um ficheiro de mídia pelo WhatsApp — catálogos em PDF, fotos de produtos, vídeos de demonstração, notas de voz.',
    quandoUsar: 'Sempre que uma imagem/documento explica melhor do que texto — catálogos, tabelas de preços, comprovativos.',
    campos: [
      { label: 'Ficheiro', explicacao: 'Clique em "Escolher do dispositivo" para enviar direto do computador ou telemóvel (câmara/galeria/ficheiros) — mais fácil do que indicar um caminho manualmente.' },
      { label: 'Telefone', explicacao: 'Normalmente {{telefone}}.' }
    ],
    exemplo: {
      cenario: 'Enviar o catálogo em PDF quando o cliente pede a tabela de preços.',
      passos: ['Gatilho: palavra-chave "catálogo, tabela, preços"', 'Nó "Enviar Documento" → carregar o PDF do catálogo']
    }
  },
  // ---- CRM ----
  {
    id: 'create_client',
    titulo: 'Criar Cliente',
    categoria: 'CRM',
    cor: '#3b82f6',
    oQueFaz: 'Regista o contacto do WhatsApp como Cliente no módulo de CRM (se ainda não existir).',
    quandoUsar: 'No início de um fluxo de vendas/atendimento, para garantir que todo contacto vira um registo no CRM — mesmo antes de virar uma negociação.',
    campos: [
      { label: 'Nome', explicacao: 'Normalmente {{nome_whatsapp}} (o nome de perfil do WhatsApp).' },
      { label: 'Telefone', explicacao: 'Normalmente {{telefone}}.' }
    ],
    exemplo: { cenario: 'Registar automaticamente todo cliente novo que escreve.', passos: ['Nome: {{nome_whatsapp}}', 'Telefone: {{telefone}}'] }
  },
  {
    id: 'create_lead',
    titulo: 'Criar Negócio (Lead)',
    categoria: 'CRM',
    cor: '#3b82f6',
    oQueFaz: 'Cria uma oportunidade de negócio no funil de vendas (Kanban do CRM), associada ao cliente já criado neste fluxo.',
    quandoUsar: 'Depois de "Criar Cliente" — quando a conversa indica interesse real de compra.',
    campos: [{ label: 'Título', explicacao: 'Nome da oportunidade no Kanban. Ex: "Interesse em {{mensagem}}".' }],
    exemplo: { cenario: 'Cliente pergunta sobre um produto específico.', passos: ['Depois de "Criar Cliente", ligar a "Criar Negócio (Lead)"', 'Título: "Pedido via WhatsApp: {{mensagem}}"'] }
  },
  {
    id: 'tags',
    titulo: 'Adicionar / Remover Tag',
    categoria: 'CRM',
    cor: '#16a34a',
    oQueFaz: 'Marca (ou desmarca) etiquetas no cliente — úteis para segmentar e depois usar em condições de outros fluxos.',
    quandoUsar: 'Para classificar clientes automaticamente: "interessado", "cliente VIP", "sem resposta", etc. Requer que o cliente já tenha sido resolvido antes no fluxo (ex: por um nó "Criar Cliente" ou porque o número já existe no CRM).',
    campos: [{ label: 'Tag(s)', explicacao: 'Uma ou mais, separadas por vírgula. Ex: "interessado, urgente".' }],
    exemplo: { cenario: 'Marcar como "interessado" quem pergunta pelo preço.', passos: ['Gatilho: palavra-chave "preço"', '"Adicionar Tag" → interessado'] }
  },
  {
    id: 'custom_field',
    titulo: 'Campo Personalizado',
    categoria: 'CRM',
    cor: '#0891b2',
    oQueFaz: 'Guarda um valor livre no cliente (não é um campo fixo do sistema, você define o nome). Fica disponível como {{nome_do_campo}} em qualquer nó seguinte, no mesmo fluxo ou em fluxos futuros com esse cliente.',
    quandoUsar: 'Para lembrar informação específica do seu negócio que não existe por padrão — orçamento pedido, produto de interesse, data preferida de entrega.',
    campos: [{ label: 'Nome do Campo', explicacao: 'Sem espaços, ex: "produto_interesse".' }, { label: 'Valor', explicacao: 'O que guardar — pode ser fixo ou {{mensagem}}.' }],
    exemplo: { cenario: 'Guardar qual produto o cliente perguntou, para usar depois numa mensagem de acompanhamento.', passos: ['Campo: produto_interesse', 'Valor: {{mensagem}}', 'Mais tarde: "Olá, ainda tem interesse em {{produto_interesse}}?"'] }
  },
  // ---- AVANÇADO ----
  {
    id: 'external_request',
    titulo: 'Requisição Externa (API)',
    categoria: 'Avançado',
    cor: '#7c3aed',
    oQueFaz: 'Chama qualquer serviço externo (outro sistema, planilha online, ERP) através de uma URL. É o bloco mais flexível — não fica limitado ao que já existe pronto no BusinessOS.',
    quandoUsar: 'Para integrar com sistemas de terceiros — verificar stock num sistema externo, registar um pedido noutra plataforma, disparar uma automação noutro serviço (Zapier, Make, etc.).',
    campos: [
      { label: 'URL', explicacao: 'O endereço do serviço a chamar.' },
      { label: 'Método', explicacao: 'GET para só consultar; POST/PUT para enviar dados.' },
      { label: 'Corpo (JSON)', explicacao: 'Os dados a enviar, em formato JSON. Aceita variáveis {{}}.' }
    ],
    exemplo: {
      cenario: 'Registar o pedido numa planilha/sistema externo via webhook.',
      passos: ['URL: https://meusistema.com/api/pedidos', 'Método: POST', 'Corpo: {"telefone":"{{telefone}}","mensagem":"{{mensagem}}"}', 'A resposta fica disponível como {{external_response}} nos próximos passos']
    }
  },
  {
    id: 'notify_team',
    titulo: 'Notificar Equipa',
    categoria: 'Avançado',
    cor: '#f59e0b',
    oQueFaz: 'Envia um aviso interno (por email ou WhatsApp) para um colaborador — sem interromper a conversa com o cliente.',
    quandoUsar: 'Para avisar a equipa de vendas quando surge uma oportunidade quente, ou o financeiro quando alguém pergunta sobre pagamento.',
    campos: [
      { label: 'Canal', explicacao: 'Email ou WhatsApp.' },
      { label: 'Destinatário', explicacao: 'Email ou número de telefone do colaborador.' },
      { label: 'Mensagem', explicacao: 'O aviso interno.' }
    ],
    exemplo: { cenario: 'Avisar o vendedor sempre que alguém pede um orçamento.', passos: ['Canal: WhatsApp', 'Destinatário: 2449XXXXXXXX (número do vendedor)', 'Mensagem: "Novo pedido de orçamento de {{nome_whatsapp}} ({{telefone}})"'] }
  },
  {
    id: 'handoff_human',
    titulo: 'Transferir para Humano',
    categoria: 'Avançado',
    cor: '#e11d48',
    oQueFaz: 'Pausa toda automação e resposta de IA para aquele cliente — um agente humano assume a conversa a partir dali, pelo inbox do WhatsApp.',
    quandoUsar: 'Quando o assunto é sensível demais para um fluxo automático decidir — reclamações, negociações complexas, pedido explícito de falar com alguém.',
    campos: [{ label: 'Mensagem ao cliente', explicacao: 'Opcional — um aviso tipo "um atendente vai continuar a conversa consigo".' }],
    exemplo: {
      cenario: 'Cliente escreve "quero falar com uma pessoa".',
      passos: ['Gatilho ou Condição detecta essa frase', '"Transferir para Humano" → Mensagem: "Certo! Um dos nossos atendentes já vai continuar a conversa consigo."']
    }
  },
  {
    id: 'delay',
    titulo: 'Aguardar',
    categoria: 'Avançado',
    cor: '#64748b',
    oQueFaz: 'Pausa o fluxo por alguns minutos antes de continuar. Limitado a 15 minutos (é uma espera técnica, não um agendamento de longo prazo).',
    quandoUsar: 'Pequenos intervalos entre mensagens, para não parecer um robô a disparar tudo de uma vez.',
    campos: [{ label: 'Minutos', explicacao: 'De 1 a 15.' }],
    exemplo: { cenario: 'Esperar 2 minutos entre a saudação e o menu de opções.', passos: ['Nó "Aguardar" → 2 minutos, entre a mensagem de boas-vindas e o Menu'] }
  },
  {
    id: 'jump',
    titulo: 'Saltar para Outro Fluxo',
    categoria: 'Avançado',
    cor: '#8b5cf6',
    oQueFaz: 'Transfere a execução para outra automação já criada, reaproveitando-a como se fosse um "sub-fluxo".',
    quandoUsar: 'Para não repetir os mesmos passos em vários fluxos — ex: um "Fluxo de Boas-Vindas" comum, chamado a partir de vários pontos diferentes.',
    campos: [{ label: 'Fluxo Alvo', explicacao: 'Escolha entre as suas outras automações já criadas e ativas.' }],
    exemplo: { cenario: 'Vários gatilhos diferentes, mas todos terminam com o mesmo "Fluxo de Agradecimento".', passos: ['Criar uma automação separada só com esse agradecimento', 'Em cada fluxo, terminar com "Saltar para Outro Fluxo" → escolher essa automação'] }
  },
  {
    id: 'end',
    titulo: 'Fim do Fluxo',
    categoria: 'Estrutura',
    cor: '#64748b',
    oQueFaz: 'Marca visualmente onde um ramo do fluxo termina. É opcional — um nó sem nenhuma saída ligada já encerra o fluxo sozinho.',
    quandoUsar: 'Para deixar o desenho do fluxo mais claro e organizado, sobretudo em fluxos com muitos ramos.',
    exemplo: { cenario: 'Fechar visualmente um ramo "Não" de uma condição que não continua para mais lado nenhum.', passos: ['Ligar a saída NÃO da condição a um nó "Fim do Fluxo"'] }
  }
];
