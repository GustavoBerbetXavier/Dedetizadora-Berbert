# Berbert Pest Control — Sistema de Gestão

Sistema web da dedetizadora. Funciona no computador e no celular, pode ser
instalado na tela inicial como um aplicativo e guarda os dados em um banco de
dados na nuvem (Supabase), com login para cada funcionário.

## Funcionalidades

- **Login de funcionários** com permissões por área: o administrador escolhe quem
  vê Clientes, Agenda, Orçamentos, Laudos e Financeiro. Quem tem **acesso total**
  vê tudo, inclusive Funcionários e Configurações.
- **Painel**: serviços do dia, próximos 7 dias e, para quem tem acesso ao
  financeiro, valores a receber, saldo do mês e contas vencidas.
- **Clientes**: cadastro, busca, botão de WhatsApp e histórico do cliente.
- **Agenda**: calendário mensal com os agendamentos. De um agendamento dá para
  **gerar o laudo** e **lançar a receita** com um clique.
- **Orçamentos**: itens, desconto, validade e forma de pagamento. Imprime ou salva
  em PDF com a logo da empresa. Ao aprovar, já abre o agendamento.
- **Laudos / Certificados**, com opções para marcar em vez de digitar:
  - **Certificado de dedetização**: pragas, áreas, método, os 4 venenos da ficha (com antídoto
    automático), garantia, responsável técnico e recomendações.
  - **Laudo de limpeza de caixa d'água**: reservatórios (tipo, material, capacidade, local), condições
    encontradas, procedimento, desinfetante, validade e **fotos do antes e do depois** (pelo celular ou
    computador). Imprime ou salva em PDF com as fotos. **Requer rodar `supabase/fotos.sql` uma vez.**
- **Financeiro**: receitas e despesas por mês, contas pagas, em aberto e vencidas. **Importar extrato**:
  envie o extrato do banco (.ofx ou .csv): as entradas viram receitas recebidas e as saídas despesas pagas
  (com categoria sugerida); se o valor bater com uma receita ou conta a pagar em aberto, ela recebe baixa.
  Reimportar o mesmo extrato não duplica.
- **Ligações**: vencimentos (quem está para vencer, pelo último serviço ou contrato) e prospecção de
  empresas por cidade e tipo que ainda não são clientes, com ligar, WhatsApp e registro do resultado.
- **Conversas (robô do WhatsApp e Instagram)**: um robô de atendimento próprio, no estilo do ManyChat, que usa as
  APIs oficiais e gratuitas da Meta. Ele responde sozinho com um menu (**Agendar serviço**, **Pedir orçamento**,
  **Falar com atendente**), faz o agendamento completo pelo chat (serviço, nome, endereço, dia e período, só
  oferecendo dias com vaga) e já cria o **cliente** e o **agendamento na Agenda**. Quando o cliente pede atendente
  (ou o robô não entende), a conversa vai para **Esperando equipe** e o funcionário responde pela tela Conversas.
  **Requer a configuração descrita em "Robô do WhatsApp e Instagram", mais abaixo.**
- **Configurações**: dados da empresa usados nos documentos, textos e horários do robô e backup dos dados.

## Como as permissões funcionam

| Área | Quem acessa |
|---|---|
| Painel | Todos os funcionários liberados |
| Clientes | Quem tem "Clientes" (os demais só veem o nome do cliente na agenda e nos laudos) |
| Agenda, Orçamentos, Laudos, Financeiro | Só quem tem a permissão daquela área |
| Funcionários e Configurações | Só administradores (acesso total) |

As regras são aplicadas **dentro do banco de dados** (Row Level Security), e não só
escondidas na tela: mesmo que alguém tente acessar os dados por fora do sistema, o
banco bloqueia.

Um login criado por fora do sistema começa **bloqueado e sem permissões**, até um
administrador liberar na tela "Funcionários".

## Instalação (uma única vez, cerca de 15 minutos)

### 1. Criar o banco de dados no Supabase (grátis)

1. Crie uma conta em <https://supabase.com> e clique em **New project**.
   Escolha um nome (ex.: `berbert`), crie uma senha forte para o banco e selecione a
   região **South America (São Paulo)**.
2. No menu lateral, abra **SQL Editor**, clique em **New query**, cole todo o conteúdo
   do arquivo [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. Vá em **Authentication → Sign In / Providers → Email** e **desative "Confirm email"**
   (assim os funcionários cadastrados pelo sistema já entram direto).
   Deixe "Allow new users to sign up" **ativado**: é ele que permite ao administrador
   cadastrar funcionários pelo sistema.
4. Vá em **Authentication → Users → Add user → Create new user**, informe o **seu**
   e-mail e senha e marque **Auto Confirm User**.
   **O primeiro usuário criado vira o administrador** do sistema.

### 2. Ligar o sistema ao banco

1. No Supabase, abra **Project Settings → API** (ou o botão **Connect**) e copie:
   - **Project URL** (ex.: `https://abcdefgh.supabase.co`)
   - a chave **anon public** (ou **publishable key**)
2. Cole os dois valores no arquivo [`js/config.js`](js/config.js).

Essa chave pode ficar no código: ela só permite tentar fazer login. O que cada pessoa
vê depende do login e das permissões do banco. **Nunca** coloque a chave
`service_role` / `secret` nesse arquivo.

### 3. Publicar (GitHub Pages, grátis)

1. No GitHub, vá em **Settings → Pages**, escolha a branch e a pasta `/ (root)`.
2. O sistema ficará em `https://<usuario>.github.io/<repositorio>/`.
3. No Supabase, em **Authentication → URL Configuration**, coloque esse endereço em
   **Site URL** (usado nos e-mails de troca de senha).
4. No celular, abra o endereço no Chrome e toque em **"Adicionar à tela inicial"**.

## Uso no dia a dia

- **Cadastrar funcionário**: menu **Funcionários → Novo funcionário**. Informe nome,
  e-mail, uma senha inicial e marque as áreas que ele pode acessar.
- **Mudar o acesso ou bloquear** alguém: **Funcionários → Editar acesso**.
- **Esqueceu a senha**: em "Editar acesso" há o botão **Enviar e-mail para trocar senha**.
  Cada um também pode trocar a própria senha pelo menu do perfil.
- **Menu do perfil** (canto inferior esquerdo, para todos): mostra nome e tipo de acesso.
  Ao clicar, abre **Minha conta** (login, situação, último acesso e áreas liberadas),
  **Configurações** (só administradores), **Alterar senha** e **Sair**.
- **Importar clientes de uma planilha**: em **Clientes → Importar planilha**, escolha o
  arquivo `.csv` (do Excel: *Salvar como → CSV*; do Google Planilhas: *Download → CSV*).
  O sistema reconhece as colunas sozinho (Nome, Telefone, CPF/CNPJ, Endereço, Número,
  Bairro, Cidade, UF, CEP...), mostra uma prévia e pula clientes repetidos. Há também
  um botão para baixar uma planilha modelo.
- **Código do cliente**: se a planilha tiver uma coluna de código (Código, Cód., ID...), ele é
  importado; quem vier sem código recebe um automático, continuando a numeração. Clientes
  novos já vêm com o próximo código. O código aparece na lista, na busca, no histórico e nos
  documentos, e o sistema não deixa dois clientes com o mesmo código.
- **Importar orçamentos/ordens de uma planilha** (administrador): em **Orçamentos → Importar
  planilha**. Colunas reconhecidas: número, código do cliente (id - cliente), cliente, emissão,
  valor, situação e vendedor. Cada orçamento é ligado ao cliente pelo código; clientes que não
  existirem são cadastrados. Números que já existem são pulados (pode importar de novo sem
  duplicar) e a numeração continua depois do maior número importado.
- **Filtros de orçamentos**: Geral, Por Número, Cancelado, Finalizado, Executado, Em Execução e
  Pendente, com busca por cliente (código ou nome) e paginação.
- **Filtros de clientes**: Razão Social, Fantasia, CNPJ/CPF, Cidade, Código e situação Ativo/Inativo.
- **Página do cliente**: ao clicar no nome (ou em Editar/Histórico), o cliente abre numa página
  própria com as abas **Dados do cliente**, **Anotações** e **Histórico**. Em Anotações dá para
  incluir, editar, inativar e reativar anotações internas; cada uma guarda a data e quem escreveu.
- **Avisos de contas a pagar**: cadastre a conta em **Financeiro → + Despesa** com o vencimento.
  O sininho no topo mostra as contas **vencidas**, que **vencem hoje** e que **vencem amanhã**
  (para quem tem acesso ao Financeiro). Clicando em **Ativar avisos neste aparelho**, o celular ou
  computador mostra a notificação "Amanhã vence: ..." uma vez por dia por conta, quando o sistema
  estiver aberto ou instalado. Em Financeiro, o filtro **Contas a pagar em aberto** lista todas as
  contas não pagas, de qualquer mês.
- **Cadastros** (administrador): serviços (código, descrição, valor), colaboradores (código,
  nome, funções, registro no conselho, telefone) e produtos/venenos (grupo, concentração,
  registro, antídoto). Usados na criação das ordens.
- **Ordem de serviço (FAES) com link para o técnico**: em Orçamentos, **+ Novo** abre a página
  da ordem: cliente, serviços do cadastro e responsáveis (preenchimento, avaliação prévia,
  responsável técnico, controlador de pragas). Na aba **Execução do técnico**, gere o link e envie
  pelo WhatsApp. O técnico abre no celular, sem login, marca produtos (com quantidade), pragas,
  áreas, EPI e equipamentos e colhe a assinatura do cliente. O resultado volta para a ordem e a
  **FAES** pode ser impressa/salva em PDF já preenchida. **Requer rodar `supabase/ordem_link.sql`
  uma vez no SQL Editor do Supabase.**
- **Ligações** (área própria, liberada em Funcionários): para quem faz as ligações.
  - **Vencimentos**: lista os clientes cujo prazo vence no mês escolhido, calculado pelo último
    serviço feito (não cancelado) mais o prazo de retorno (padrão 6 meses, com prazos por tipo de
    serviço) ou pelo fim do contrato escrito no cadastro ("CONTRATO DE JULHO/2025 A JUNHO/2026").
    Mostra o último serviço, os telefones com botão de ligar e de WhatsApp (mensagem pronta) e o
    botão **Registrar** (agendado, retornar em tal data, não atende, sem interesse...). Também filtra
    vencidos nos últimos 12 meses, vencidos há mais de 1 ano e retornos marcados até hoje.
  - **Prospecção**: escolha cidade, UF e tipo de empresa e clique em **Pesquisar no Google**: o mapa do
    Google Maps aparece dentro do app (gratuito, sem chave). Ao clicar numa empresa no mapa, copie o nome ou
    o telefone e cole em **Conferir empresa**: o sistema diz se já é cliente ou se já foi contatada, e dá os
    botões de ligar, WhatsApp, registrar o resultado e cadastrar como cliente. Há também uma lista automática
    pelo mapa gratuito OpenStreetMap (pode falhar ou vir incompleta).
  - Prazos e mensagens podem ser mudados em **Configurações**. **Requer rodar
    `supabase/ligacoes.sql` uma vez no SQL Editor do Supabase.**
- **Conversas**: o número no menu mostra quantas conversas estão esperando a equipe. Abra a conversa, leia o que o
  robô já perguntou e responda. Ao responder (ou em **Assumir conversa**) o robô para de falar naquela conversa.
  Terminou? **Encerrar atendimento**: se o cliente escrever de novo, o robô volta a atender. **Vincular cliente** liga
  a conversa a um cadastro (pelo WhatsApp o robô já tenta achar sozinho pelo telefone). Pela regra da Meta, a empresa
  só pode escrever até **24 horas** depois da última mensagem do cliente.
- **Gerar PDF**: clique em **Imprimir / PDF** e escolha **"Salvar como PDF"**.
- **Dados da versão anterior** (que ficavam no navegador): na versão antiga, use
  "Baixar backup". Depois, na versão nova, vá em
  **Configurações → Restaurar / importar backup**.

## Robô do WhatsApp e Instagram (configuração, uma vez)

O robô roda no próprio Supabase (uma "Edge Function") e conversa com a Meta pelas APIs oficiais. Não tem
mensalidade: responder quem escreveu para a empresa é gratuito no WhatsApp (dentro de 24 horas) e no Instagram, e o
plano grátis do Supabase cobre 500 mil chamadas por mês. **Não use** programas que imitam o WhatsApp Web (Baileys,
Evolution API, whatsapp-web.js): eles violam as regras do WhatsApp e o número pode ser banido.

### 1. Banco de dados e permissão

1. No Supabase, **SQL Editor → New query**, cole o arquivo [`supabase/robo.sql`](supabase/robo.sql) e clique em **Run**.
2. No sistema, em **Funcionários → Editar acesso**, marque **Conversas** para quem vai atender.

### 2. Publicar o robô no Supabase

1. No Supabase, abra **Edge Functions → Deploy a new function → Via Editor**.
2. Dê o nome **`robo`** (exatamente assim), apague o exemplo, cole todo o arquivo
   [`supabase/functions/robo/index.ts`](supabase/functions/robo/index.ts) e clique em **Deploy**.
3. Na página da função, em **Details** (ou Settings), **desative "Enforce JWT verification" / "Verify JWT"** e salve.
   A Meta não manda login do Supabase; o robô confere sozinho a assinatura da Meta e o login dos funcionários.
4. O endereço do robô (o "webhook") é: `https://<seu-projeto>.supabase.co/functions/v1/robo`
   (aparece também em **Configurações → Verificar conexão com a Meta**).

Quem usa o programa de linha de comando do Supabase pode publicar com
`supabase functions deploy robo --no-verify-jwt`.

### 3. Criar o app na Meta

1. Entre em <https://developers.facebook.com>, **Meus apps → Criar app**, escolha o tipo **Empresa (Business)** e ligue
   ao portfólio (Gerenciador de Negócios) da empresa.
2. Em **Configurações do app → Básico**, copie a **Chave secreta do app**. Preencha também a URL da política de
   privacidade (é exigida para publicar o app).
3. Invente uma senha qualquer para o webhook (ex.: `berbert-robo-2026`): ela é o **META_VERIFY_TOKEN**.

### 4. WhatsApp

1. No app, adicione o produto **WhatsApp**. Em **WhatsApp → Configuração da API**, adicione e verifique o número da
   empresa. Use um número que **não** esteja no aplicativo WhatsApp do celular (ou use a opção de "coexistência" com o
   WhatsApp Business, se a Meta oferecer para o seu número). Copie a **Identificação do número de telefone**.
2. Token permanente: em **business.facebook.com → Configurações do negócio → Usuários do sistema**, crie um usuário
   do sistema administrador, dê a ele acesso ao app e à conta do WhatsApp e clique em **Gerar token** com as permissões
   `whatsapp_business_messaging` e `whatsapp_business_management` e validade **Nunca**.
3. Em **WhatsApp → Configuração → Webhook**, coloque o endereço do robô e a senha do webhook, clique em
   **Verificar e salvar** e, nos campos do webhook, **assine `messages`**.

### 5. Instagram

1. A conta do Instagram precisa ser **profissional** (Empresa ou Criador de conteúdo). No aplicativo do Instagram, em
   **Configurações → Mensagens e respostas a stories → Ferramentas conectadas**, ative **Permitir acesso às mensagens**.
2. No app da Meta, adicione o produto **Instagram → Configuração da API com login do Instagram**. Adicione a conta,
   clique em **Gerar token** (é o **INSTAGRAM_TOKEN**) e copie a **Chave secreta do app do Instagram**.
3. Em **Configurar webhooks**, coloque o mesmo endereço e senha, verifique e **assine `messages`**.
4. Esse token vale **60 dias**: anote para gerar um novo antes de vencer e trocar no Secret do Supabase.

### 6. Guardar as chaves no Supabase

Em **Edge Functions → Secrets**, adicione (cada uma com o valor copiado acima):

| Nome | Valor |
|---|---|
| `META_VERIFY_TOKEN` | a senha inventada para o webhook |
| `META_APP_SECRET` | a chave secreta do app |
| `WHATSAPP_TOKEN` | o token permanente do usuário do sistema |
| `WHATSAPP_PHONE_ID` | a identificação do número de telefone |
| `INSTAGRAM_TOKEN` | o token do Instagram |
| `INSTAGRAM_APP_SECRET` | a chave secreta do app do Instagram |

As chaves ficam só no Supabase, nunca no código do sistema. Depois, em **Configurações → Robô do WhatsApp e
Instagram → Verificar conexão com a Meta**, tudo deve aparecer com ✅. Ali também dá para mudar a mensagem de
boas-vindas, os serviços, os dias e horários de atendimento e quantos agendamentos cabem em cada período.

### 7. Liberar para todos os clientes

Enquanto o app da Meta está **em desenvolvimento**, o robô só responde pessoas cadastradas no app (bom para testar
com o seu próprio celular). Para atender qualquer cliente, mude o app para **Ativo (Live)**. No Instagram, a Meta
ainda pede a **análise do app** (App Review) para a permissão `instagram_business_manage_messages` e pode pedir a
verificação da empresa. O WhatsApp com número próprio funciona com o app ativo.

## Estrutura

```
index.html            página principal (login e sistema)
css/style.css         visual
js/config.js          endereço e chave do Supabase
js/db.js              login, permissões e acesso ao banco
js/app.js             telas e regras do sistema
js/conversas.js       tela Conversas e configurações do robô
js/vendor/supabase.js biblioteca oficial do Supabase (v2.116.0)
supabase/schema.sql   tabelas e regras de permissão do banco
supabase/robo.sql     tabelas das conversas do WhatsApp e Instagram
supabase/functions/robo/index.ts  robô de atendimento (Edge Function do Supabase)
img/                  logo e ícones
sw.js, manifest.json  instalação como aplicativo
```
