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
    'Use o botão "Organizar", na barra do zoom no topo do canvas, para arrumar automaticamente os blocos em colunas — e o "Ver tudo" ao lado para caber o fluxo inteiro no ecrã.',
    'Use o controlo de zoom no topo do canvas para ver o fluxo inteiro de uma vez ou aproximar um nó específico.',
    'Passe o rato sobre um nó para ver dois ícones no canto: um "×" vermelho para apagar, e um ícone azul de cópia para duplicar o nó (atalho: selecionar o nó e premir Ctrl+D).',
    'Uma automação só funciona depois de estar Ativa (o círculo verde ao lado do nome, na lista à esquerda) — clique nele para ligar/desligar.'
  ]
};

export const HELP_ITEMS: HelpItem[] = [
  // ---- CONCEITOS ----
  {
    id: 'variaveis',
    titulo: 'Variáveis {{ }} — como e quando usar',
    categoria: 'Conceitos',
    cor: '#0078D4',
    oQueFaz: 'Uma variável é um espaço reservado, escrito entre chavetas duplas — {{assim}} — que o Autopilot substitui automaticamente pelo valor real no momento em que o fluxo corre. Não é texto fixo: é preenchido "ao vivo", diferente para cada cliente e cada conversa.',
    quandoUsar: 'Sempre que quiser que uma mensagem, legenda, assunto de email, ou qualquer outro campo de texto se adapte a quem está do outro lado — em vez de escrever uma mensagem genérica igual para todos, a variável personaliza automaticamente.',
    campos: [
      { label: '{{telefone}}', explicacao: 'O número de telefone de quem enviou a mensagem que ativou o fluxo.' },
      { label: '{{nome_whatsapp}}', explicacao: 'O nome de perfil do WhatsApp da pessoa (o nome que aparece na conversa) — ótimo para saudações personalizadas.' },
      { label: '{{mensagem}}', explicacao: 'O texto exato que a pessoa escreveu. Útil para repassar à IA, ou para confirmar "recebemos o seu pedido: {{mensagem}}".' },
      { label: '{{tags}}', explicacao: 'As etiquetas que esse cliente já tem, separadas por vírgula (só depois de o cliente já existir no CRM).' },
      { label: '{{external_response}} / {{external_status}}', explicacao: 'Preenchidas automaticamente depois de um nó "Requisição Externa (API)" — a resposta e o código de estado que a API externa devolveu.' },
      { label: '{{ai_response}}', explicacao: 'Preenchida automaticamente depois de um nó "Responder com IA" — o texto que a IA gerou.' },
      { label: '{{qualquer_nome_seu}}', explicacao: 'Qualquer nome que você escolher no nó "Campo Personalizado" fica disponível como variável a partir dali — ex: se guardar num campo chamado "orcamento", passa a poder escrever {{orcamento}} em qualquer nó seguinte.' }
    ],
    exemplo: {
      cenario: 'Mensagem de boas-vindas personalizada, seguida de um resumo do pedido.',
      passos: [
        'Nó "Responder WhatsApp" → Mensagem: "Olá {{nome_whatsapp}}! Recebemos a sua mensagem: {{mensagem}}."',
        'Se antes houver um nó "Campo Personalizado" com Campo: orcamento, Valor: 5000',
        'Pode depois escrever: "O seu orçamento de {{orcamento}} Kz está confirmado."'
      ]
    }
  },
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
    oQueFaz: 'Como a Condição, mas com várias opções ao mesmo tempo em vez de só Sim/Não. Cada opção tem a sua própria saída, ligável a um caminho diferente. O menu é uma PERGUNTA: o fluxo pára aqui e continua na mensagem seguinte do cliente, sem repetir a saudação. Se a resposta não for nenhuma das opções, o menu repete-se.',
    quandoUsar: 'Para menus de atendimento tipo "escolha uma opção": vendas, suporte, financeiro — o clássico menu de WhatsApp Business.',
    campos: [
      { label: 'Variável avaliada', explicacao: 'Normalmente {{mensagem}} — a resposta que o cliente der a seguir (não a mensagem que iniciou o fluxo).' },
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
      { label: 'Legenda (opcional)', explicacao: 'Texto que acompanha a imagem/vídeo/documento no WhatsApp (não disponível para áudio). Aceita {{variáveis}} — ideal para descrever um produto com o preço por baixo da foto, em vez de mandar a imagem sozinha.' },
      { label: 'Telefone', explicacao: 'Normalmente {{telefone}}.' }
    ],
    exemplo: {
      cenario: 'Enviar a foto de um produto já com o preço como legenda.',
      passos: [
        'Nó "Enviar Imagem" → Ficheiro: foto do produto',
        'Legenda: "Camisa Azul — 5.000 Kz\\nDisponível em todos os tamanhos."'
      ]
    }
  },
  // ---- CRM ----
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
  // ---- AGENDAMENTO ----
  {
    id: 'check_slots',
    titulo: 'Ver Horários Livres',
    categoria: 'Agendamento',
    cor: '#C9992E',
    oQueFaz: 'Vai ao módulo Agendamento e devolve as horas que estão mesmo livres no dia que o cliente pediu. Não usa inteligência artificial: lê a data por regras (percebe "hoje", "amanhã", "sexta", "12/10", "12 de outubro", "dia 3") e, se não perceber, diz-lhe porquê em vez de inventar.',
    quandoUsar: 'Logo depois de perguntar o dia ao cliente, antes de lhe mostrar as opções de hora.',
    campos: [
      { label: 'Serviço', explicacao: 'O que se vai marcar. Escolha da lista (vem do módulo Agendamento) ou use uma variável, ex: {{mensagem}} quando o cliente escolheu num menu.' },
      { label: 'Data', explicacao: 'Normalmente {{data_pedida}} — a resposta que guardou no "Aguardar resposta" anterior.' },
      { label: 'Guardar os horários em', explicacao: 'O nome da variável com a lista pronta a enviar. Por omissão: horarios_livres.' },
      { label: 'Quantos horários mostrar', explicacao: 'Para não encher a mensagem. 6 a 8 costuma chegar.' }
    ],
    exemplo: {
      cenario: 'O cliente diz "sexta" e quer saber as horas.',
      passos: [
        '"Aguardar resposta" → Pergunta: "Para que dia?" · Guardar em: data_pedida',
        '"Ver horários livres" → Serviço: Quarto simples · Data: {{data_pedida}}',
        'Se/Então: {{tem_vagas}} = sim',
        'Ramo SIM → "Temos livre: {{horarios_livres}}. A que horas?"',
        'Ramo NÃO → "Nesse dia não tenho nada. {{agendamento_erro}}" e voltar a perguntar'
      ]
    }
  },
  {
    id: 'create_booking',
    titulo: 'Criar Marcação',
    categoria: 'Agendamento',
    cor: '#C9992E',
    oQueFaz: 'Grava mesmo a marcação no módulo Agendamento, com a origem "Fluxo do Autopilot". Verifica outra vez se a hora continua livre — se entretanto alguém a apanhou, não marca e explica porquê.',
    quandoUsar: 'No fim, quando já tem o dia, a hora e o nome do cliente.',
    campos: [
      { label: 'Serviço / Data / Hora', explicacao: 'O mesmo serviço do "Ver horários livres", e as respostas que guardou: {{data_pedida}}, {{hora_pedida}}. Percebe "14h", "14:30", "2 da tarde", "meio-dia".' },
      { label: 'Nome e Telefone', explicacao: '{{nome_cliente}} (o que o cliente escreveu) e {{telefone}} (o número de quem está a falar).' },
      { label: 'Campos próprios da empresa', explicacao: 'Os campos que criou em Agendamento → Definições (nº de pessoas, matrícula, BI). Pode pôr um valor fixo ou uma variável.' }
    ],
    exemplo: {
      cenario: 'Fechar a marcação e confirmar ao cliente.',
      passos: [
        '"Criar marcação" → Data: {{data_pedida}} · Hora: {{hora_pedida}} · Nome: {{nome_cliente}} · Telefone: {{telefone}}',
        'Se/Então: {{agendamento_ok}} = sim',
        'Ramo SIM → "Marcado, {{nome_cliente}}! {{agendamento_data_extenso}} às {{agendamento_hora}}."',
        'Ramo NÃO → "Não consegui: {{agendamento_erro}}" e "Voltar ao menu"'
      ]
    }
  },
  {
    id: 'list_bookings',
    titulo: 'Marcações do Cliente',
    categoria: 'Agendamento',
    cor: '#C9992E',
    oQueFaz: 'Traz as marcações futuras de quem está a escrever, já em texto pronto a enviar (uma por linha, com data por extenso e hora). As canceladas não aparecem.',
    quandoUsar: 'Numa opção de menu do género "2 - As minhas marcações", ou antes de remarcar/cancelar.',
    campos: [
      { label: 'Telefone do cliente', explicacao: 'Deixe {{telefone}} — é o número de quem está na conversa.' },
      { label: 'Guardar a lista em', explicacao: 'Por omissão: minhas_marcacoes. Use depois {{minhas_marcacoes}} numa mensagem.' }
    ],
    exemplo: {
      cenario: 'O cliente escolhe a opção 2 do menu.',
      passos: [
        '"Marcações do cliente" → Telefone: {{telefone}}',
        'Se/Então: {{tem_marcacoes}} = sim',
        'Ramo SIM → "As suas marcações:\n{{minhas_marcacoes}}"',
        'Ramo NÃO → "Ainda não tem nada marcado connosco."',
        'Os dois ramos terminam em "Voltar ao menu"'
      ]
    }
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
    oQueFaz: 'Avisa quem trata do assunto — por email, por WhatsApp, ou pelos dois ao mesmo tempo — sem interromper a conversa com o cliente. Aceita vários destinatários e percebe sozinho quais são emails e quais são telemóveis.',
    quandoUsar: 'Para avisar quem vende assim que surge um cliente a sério, ou quem trata de pagamentos quando alguém pergunta por dinheiro. Ponha-o depois da condição ou da opção de menu que interessa, nunca logo a seguir ao gatilho — senão toca a cada "Olá".',
    campos: [
      { label: 'Como avisar', explicacao: 'Email, WhatsApp, ou os dois. Seja qual for a escolha, quem tiver "@" recebe email e quem for número recebe WhatsApp — o aviso chega na mesma se trocar o canal sem querer.' },
      { label: 'Para quem', explicacao: 'Um ou vários, separados por vírgula. Ex: "reservas@empresa.ao, 244923000111". O número pode ser escrito com +, espaços ou traços.' },
      { label: 'Mensagem', explicacao: 'O aviso interno. Use variáveis para saber logo de quem se trata, sem ter de abrir o sistema.' },
      { label: 'Email de recurso', explicacao: 'Se o WhatsApp estiver desligado e o aviso não sair, é enviado para aqui, com a explicação do que falhou. É o campo que evita perder um cliente por causa de um canal em baixo.' }
    ],
    exemplo: {
      cenario: 'Avisar o vendedor e a caixa de reservas sempre que alguém marca.',
      passos: [
        'Como avisar: Os dois (email e WhatsApp)',
        'Para quem: reservas@empresa.ao, 244923000111',
        'Mensagem: "Reserva: {{nome_cliente}} — {{agendamento_data_extenso}} às {{agendamento_hora}} — {{telefone}}"',
        'Email de recurso: dono@empresa.ao',
        'Depois do bloco: {{notificacao_ok}} vale "sim" ou "nao", e {{notificacao_erro}} diz o que se passou — dá para ligar a uma condição'
      ]
    }
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
    oQueFaz: 'Pausa o fluxo por alguns segundos ou minutos antes de continuar. Limitado a 15 minutos (é uma espera técnica, não um agendamento de longo prazo).',
    quandoUsar: 'Pequenos intervalos entre mensagens, para não parecer um robô a disparar tudo de uma vez — varia o tempo consoante a resposta (uma confirmação rápida não precisa da mesma espera que uma explicação longa).',
    campos: [{ label: 'Tempo de espera', explicacao: 'De 1 segundo a 15 minutos (900 segundos), com atalhos rápidos para os valores mais comuns.' }],
    exemplo: { cenario: 'Esperar 15 segundos entre a saudação e o menu de opções.', passos: ['Nó "Aguardar" → 15 segundos, entre a mensagem de boas-vindas e o Menu'] }
  },
  {
    id: 'simulador',
    titulo: 'Simulador — testar sem enviar',
    categoria: 'Conceitos',
    cor: '#0E5A6B',
    oQueFaz: 'O botão "Simular" (canto superior direito) abre uma conversa de teste que corre o fluxo a sério, mas sem enviar nada ao cliente nem gravar nada. Mostra as respostas, o caminho que o fluxo seguiu e destaca o bloco onde a conversa está.',
    quandoUsar: 'Sempre que montar ou mudar um fluxo, antes de o ligar. É a forma mais rápida de perceber porque é que um caminho não foi o esperado: o simulador escreve o que a condição leu e com o que comparou (ex: "Condição: NÃO — Olá == sim").',
    campos: [
      { label: 'Caixa de mensagem', explicacao: 'Escreva o que o cliente escreveria. Comece por "Olá" e depois responda como um cliente responderia.' },
      { label: 'Caminho percorrido', explicacao: 'A lista em baixo mostra cada bloco por onde passou, pela ordem, já com as variáveis substituídas.' },
      { label: 'Reiniciar', explicacao: 'A seta ao lado do título limpa a conversa e volta ao início do fluxo.' }
    ],
    exemplo: {
      cenario: 'Perceber porque é que a condição vai sempre para NÃO.',
      passos: ['Abra o fluxo → Simular', 'Escreva "Olá" → veja se o fluxo ficou à espera ou se avançou logo', 'Se a condição correu já, falta um "Aguardar resposta" antes dela']
    }
  },
  {
    id: 'send_template',
    titulo: 'Enviar template',
    categoria: 'Mensagens',
    cor: '#0E5A6B',
    oQueFaz: 'Envia um dos modelos criados em WhatsApp → Templates, com as variáveis preenchidas a partir do fluxo.',
    quandoUsar: 'Mensagens que se repetem sempre iguais (confirmação de reserva, lembrete de pagamento, boas-vindas) e, no número oficial da Meta, sempre que precisar de escrever primeiro a um cliente que não fala consigo há mais de 24 horas — fora dessa janela a Meta só deixa enviar templates aprovados.',
    campos: [
      { label: 'Template', explicacao: 'Os modelos criados em WhatsApp → Templates. No número oficial só os aprovados pela Meta são enviados; no número por QR vai como mensagem normal com o mesmo conteúdo.' },
      { label: 'Valores das variáveis', explicacao: 'O que entra em {{1}}, {{2}}… Pode ser texto fixo ou uma variável do fluxo, como {{nome_whatsapp}} ou {{resposta}}.' }
    ],
    exemplo: {
      cenario: 'Confirmar uma reserva com o nome que o cliente acabou de dar.',
      passos: ['"Aguardar resposta" → "Qual é o seu nome?" · guardar em nome_cliente', '"Enviar template" → confirmacao_reserva · {{1}} = {{nome_cliente}}']
    }
  },
  {
    id: 'goto_menu',
    titulo: 'Voltar ao menu',
    categoria: 'Conversa',
    cor: '#0891b2',
    oQueFaz: 'Manda a conversa de volta a um Menu do mesmo fluxo: a pergunta desse menu é enviada outra vez e o cliente escolhe de novo.',
    quandoUsar: 'Menus encadeados. Ex: menu principal com 4 opções; a opção 1 abre um submenu (1-preços, 2-voltar); a opção "2 - voltar" é um nó "Voltar ao menu" apontado ao menu principal. Assim o cliente circula pelos menus sem nunca repetir a saudação.',
    campos: [{ label: 'Menu de destino', explicacao: 'Qualquer nó Menu deste fluxo, incluindo o principal. Se o menu tiver "Pergunta a enviar" preenchida, é ela que o cliente volta a ver.' }],
    exemplo: {
      cenario: 'Submenu de Preços com opção de voltar ao menu principal.',
      passos: ['Menu principal → opção 1 → Menu "Preços" (pergunta: "1 - Quarto simples · 2 - Voltar")', 'Menu "Preços" → opção 2 → "Voltar ao menu" → Menu principal']
    }
  },
  {
    id: 'wait_reply',
    titulo: 'Aguardar resposta do cliente',
    categoria: 'Conversa',
    cor: '#0891b2',
    oQueFaz: 'Faz uma pergunta (se preencher o texto) e pára o fluxo até o cliente responder. Quando a resposta chega, o fluxo continua no nó seguinte — sem repetir nada do que já foi enviado.',
    quandoUsar: 'Sempre que precisar do que o cliente escreve: pedir o nome, o NIF, a data da reserva, ou antes de uma Condição que compare {{mensagem}}. Sem este nó, a Condição é avaliada com a mensagem que iniciou o fluxo (normalmente "Olá"), e por isso dava sempre o caminho NÃO.',
    campos: [
      { label: 'Pergunta a enviar', explicacao: 'Opcional. Se deixar vazio, o fluxo apenas espera (útil quando a pergunta já foi enviada num nó anterior).' },
      { label: 'Guardar a resposta em', explicacao: 'Opcional. Nome da variável onde a resposta fica guardada para usar mais à frente, ex: nome_cliente → {{nome_cliente}}. A resposta fica sempre também em {{mensagem}} e {{resposta}}.' }
    ],
    exemplo: {
      cenario: 'Perguntar o nome e usá-lo na mensagem seguinte.',
      passos: ['"Aguardar resposta" → Pergunta: "Como se chama?" · Guardar em: nome_cliente', '"Responder no WhatsApp" → "Muito prazer, {{nome_cliente}}!"']
    }
  },
  {
    id: 'jump',
    titulo: 'Saltar para Outro Fluxo',
    categoria: 'Avançado',
    cor: '#8b5cf6',
    oQueFaz: 'Corre outra automação já criada e, quando esta terminar, VOLTA e continua o fluxo atual a partir do nó seguinte. Funciona como um "sub-fluxo" emprestado, não como uma transferência definitiva.',
    quandoUsar: 'Para não repetir os mesmos passos em vários fluxos — ex: um "Fluxo de Boas-Vindas" comum, chamado a partir de vários pontos diferentes. Se não quiser que o fluxo atual continue depois, ligue o salto a um nó "Fim do Fluxo".',
    campos: [{ label: 'Fluxo Alvo', explicacao: 'Escolha entre as suas outras automações já criadas e ativas. Dois fluxos que saltem um para o outro não entram em ciclo — o segundo salto é ignorado.' }],
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
