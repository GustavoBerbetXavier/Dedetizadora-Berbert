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
- **Laudos / Certificados de execução**: pragas, áreas, método, produtos
  (princípio ativo, grupo químico, registro MS), antídoto, recomendações, garantia
  e responsável técnico. Imprime ou salva em PDF com a logo.
- **Financeiro**: receitas e despesas por mês, contas pagas, em aberto e vencidas.
- **Configurações**: dados da empresa usados nos documentos e backup dos dados.

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
- **Gerar PDF**: clique em **Imprimir / PDF** e escolha **"Salvar como PDF"**.
- **Dados da versão anterior** (que ficavam no navegador): na versão antiga, use
  "Baixar backup". Depois, na versão nova, vá em
  **Configurações → Restaurar / importar backup**.

## Estrutura

```
index.html            página principal (login e sistema)
css/style.css         visual
js/config.js          endereço e chave do Supabase
js/db.js              login, permissões e acesso ao banco
js/app.js             telas e regras do sistema
js/vendor/supabase.js biblioteca oficial do Supabase (v2.116.0)
supabase/schema.sql   tabelas e regras de permissão do banco
img/                  logo e ícones
sw.js, manifest.json  instalação como aplicativo
```
