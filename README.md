# Dedetizadora Berbert — Sistema de Gestão

Sistema web para a dedetizadora. Funciona no computador e no celular e pode ser
instalado na tela inicial como um aplicativo.

## Funcionalidades

- **Painel**: serviços do dia, próximos 7 dias, valores a receber, saldo do mês e contas vencidas.
- **Clientes**: cadastro (pessoa física/empresa), busca, botão de WhatsApp e histórico completo do cliente.
- **Agenda**: calendário mensal com agendamentos por dia, técnico, valor e status.
  A partir de um agendamento dá para **gerar o laudo** e **lançar a receita** com um clique.
- **Orçamentos**: itens, quantidades, desconto, validade e forma de pagamento.
  Imprime ou salva em PDF. Ao aprovar, já abre o agendamento do serviço.
- **Laudos / Certificados de execução**: pragas alvo, áreas tratadas, método, produtos
  (princípio ativo, grupo químico, registro MS), antídoto, recomendações, garantia e
  responsável técnico. Imprime ou salva em PDF.
- **Financeiro**: receitas e despesas por mês, categorias, contas pagas/em aberto/vencidas.
- **Configurações**: dados da empresa que aparecem nos documentos e backup/restauração dos dados.

## Como usar

Não precisa instalar nada. Basta abrir o `index.html` no navegador
(Chrome recomendado), ou publicar a pasta em qualquer hospedagem de sites estáticos.

Para testar localmente com um servidor:

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

### Publicar grátis no GitHub Pages

1. No GitHub, vá em **Settings → Pages**.
2. Em *Source*, escolha a branch e a pasta `/ (root)`.
3. O sistema ficará disponível em `https://<usuario>.github.io/<repositorio>/`.
4. No celular, abra o endereço no Chrome e toque em **"Adicionar à tela inicial"**.

### Gerar PDF

Clique em **Imprimir / PDF** no orçamento ou laudo e escolha
**"Salvar como PDF"** como impressora.

## Importante sobre os dados

Nesta primeira versão os dados ficam salvos **no próprio navegador** de cada aparelho.
Isso significa que:

- os dados **não são compartilhados** automaticamente entre computador e celular;
- limpar os dados do navegador apaga as informações.

Use **Configurações → Baixar backup** regularmente. O próximo passo recomendado é
ligar o sistema a um banco de dados na nuvem (ex.: Supabase ou Firebase) para que
toda a equipe acesse os mesmos dados, com login por usuário.

## Estrutura

```
index.html      página principal
css/style.css   visual
js/db.js        armazenamento dos dados
js/app.js       telas e regras do sistema
sw.js           funcionamento offline
manifest.json   instalação como aplicativo
```
