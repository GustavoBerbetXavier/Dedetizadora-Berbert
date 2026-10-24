// Aba "Conversas": mensagens do WhatsApp e do Instagram respondidas pelo robô (supabase/functions/robo).
// O robô atende sozinho (menu, agendamento e pedido de orçamento). Quando o cliente pede um atendente,
// a conversa vai para "Esperando equipe" e o funcionário responde por aqui; o robô fica calado nela
// até alguém devolver a conversa ao robô ou encerrar o atendimento.

const SITUACAO_CONVERSA = { humano: ['Esperando equipe', 'laranja'], robo: ['Com o robô', 'azul'], encerrada: ['Encerrada', 'cinza'] };
const CANAIS = { whatsapp: ['WhatsApp', 'verde'], instagram: ['Instagram', 'roxo'] };
const FILTROS_CONVERSA = [['humano', 'Esperando equipe'], ['robo', 'Com o robô'], ['encerrada', 'Encerradas'], ['todas', 'Todas']];
// Os mesmos valores padrão da função do robô (PADRAO em supabase/functions/robo/index.ts).
const ROBO_PADRAO = {
  ativo: true,
  boasVindas: 'Olá, {nome}! Aqui é da {empresa}. Como podemos ajudar?',
  servicos: "Dedetização\nDesratização\nDescupinização\nControle de escorpiões\nLimpeza de caixa d'água\nOutro serviço",
  dias: [1, 2, 3, 4, 5, 6],
  antecedencia: 1,
  diasOferecidos: 6,
  limitePeriodo: 3,
  horaManha: '08:00',
  horaTarde: '13:30',
  msgAtendente: 'Certo! Já avisei a nossa equipe. Logo alguém responde você por aqui.',
  msgOrcamento: 'Para o orçamento, conte para a gente o que você precisa: qual praga ou serviço, o tipo de imóvel (casa, apartamento, comércio...) e o bairro.',
};
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const estadoConversas = { filtro: 'humano', busca: '', aberta: null, lista: [], mensagens: [], semTabela: false };
let timerConversas = null;

/* ---------- Utilitários ---------- */
function horaConversa(iso, comHora = false) {
  if (!iso) return '';
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (isoData(d) === hojeISO()) return hora;
  const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return comHora ? `${dia} ${hora}` : dia;
}
function foneWhatsApp(numero) {
  const n = digitos(numero).replace(/^55(?=\d{10,11}$)/, '');
  if (n.length !== 10 && n.length !== 11) return numero;
  return `(${n.slice(0, 2)}) ${n.slice(2, -4)}-${n.slice(-4)}`;
}
function nomeConversa(c) {
  const cli = c.cliente_id && DB.obter('clientes', c.cliente_id);
  return (cli && cli.nome) || c.nome || (c.canal === 'whatsapp' ? foneWhatsApp(c.contato) : 'Contato do Instagram');
}
// A Meta só deixa a empresa escrever livremente até 24 horas depois da última mensagem do cliente.
const janelaAberta = (c) => Boolean(c.ultima_do_cliente_em) && Date.now() - Date.parse(c.ultima_do_cliente_em) < 24 * 3600 * 1000;
const tagConversa = ([texto, cor]) => `<span class="tag ${cor}">${texto}</span>`;

/* ---------- Página ---------- */
async function conversas(el) {
  el.innerHTML = `
    <div class="cabecalho"><h2>Conversas</h2>
      <input type="search" class="busca" id="cv-busca" placeholder="Buscar nome ou telefone..." value="${esc(estadoConversas.busca)}"></div>
    <div id="cv-alerta"></div>
    <div class="abas" id="cv-filtros"></div>
    <div class="conversas" id="cv-grade">
      <div class="cartao cv-lista"><div class="cv-lista-itens" id="cv-lista"><div class="vazio">Carregando...</div></div></div>
      <div class="cartao cv-chat" id="cv-chat"></div>
    </div>`;
  $('#cv-filtros', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    estadoConversas.filtro = b.dataset.filtro;
    desenharConversas(el);
  });
  $('#cv-busca', el).addEventListener('input', (e) => {
    estadoConversas.busca = e.target.value;
    desenharLista(el);
  });
  $('#cv-lista', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-conversa]');
    if (b) abrirConversa(el, b.dataset.conversa);
  });
  $('#cv-chat', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-cv]');
    if (b) acaoConversa(el, b.dataset.cv);
  });
  $('#cv-chat', el).addEventListener('submit', (e) => {
    e.preventDefault();
    enviarResposta(el, e.target);
  });
  $('#cv-chat', el).addEventListener('keydown', (e) => {
    // Enter envia; Shift+Enter pula linha.
    if (e.target.id === 'cv-texto' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      e.target.form.requestSubmit();
    }
  });

  await recarregarConversas(el);
  clearInterval(timerConversas);
  timerConversas = setInterval(() => {
    if (rotaAtual() !== 'conversas' || !$('#cv-grade', el)) { clearInterval(timerConversas); timerConversas = null; return; }
    if (!document.hidden) recarregarConversas(el, true);
  }, 8000);
}

async function recarregarConversas(el, silencioso = false) {
  try {
    estadoConversas.lista = await DB.listarConversas();
    estadoConversas.semTabela = false;
    const aberta = estadoConversas.aberta;
    estadoConversas.mensagens = aberta && estadoConversas.lista.some((c) => c.id === aberta) ? await DB.mensagensDa(aberta) : [];
  } catch (e) {
    if (e.semTabela) estadoConversas.semTabela = true;
    else { if (!silencioso) avisar('Não foi possível carregar as conversas: ' + e.message, 'erro'); return; }
  }
  if (!$('#cv-grade', el)) return;
  desenharConversas(el);
  atualizarSeloConversas();
}

function desenharConversas(el) {
  $('#cv-alerta', el).innerHTML = estadoConversas.semTabela ? `<div class="cartao alerta-perigo"><p><b>Falta um passo no banco de dados.</b>
    O administrador precisa executar o arquivo <b>supabase/robo.sql</b> no SQL Editor do Supabase (uma vez) e publicar o robô
    (passo a passo no README, em "Robô do WhatsApp e Instagram").</p></div>` : '';
  const lista = estadoConversas.lista;
  const contagem = (f) => (f === 'todas' ? lista.length : lista.filter((c) => c.atendimento === f).length);
  $('#cv-filtros', el).innerHTML = FILTROS_CONVERSA.map(([f, rotulo]) =>
    `<button class="aba ${estadoConversas.filtro === f ? 'ativa' : ''}" data-filtro="${f}">${rotulo}<span class="cont">${contagem(f)}</span></button>`).join('');
  desenharLista(el);
  desenharChat(el);
}

function desenharLista(el) {
  const { filtro } = estadoConversas;
  const busca = normalizar(estadoConversas.busca);
  const num = digitos(estadoConversas.busca);
  const lista = estadoConversas.lista.filter((c) => (filtro === 'todas' || c.atendimento === filtro)
    && (!busca || normalizar(nomeConversa(c) + ' ' + c.nome).includes(busca) || (num.length >= 3 && c.contato.includes(num))));
  $('#cv-lista', el).innerHTML = lista.length ? lista.map((c) => `
    <button class="cv-item ${c.id === estadoConversas.aberta ? 'ativo' : ''}" data-conversa="${esc(c.id)}">
      <span class="cv-item-topo"><b>${esc(nomeConversa(c))}</b><small>${horaConversa(c.ultima_em)}</small></span>
      <span class="cv-previa">${esc(c.ultima_mensagem)}</span>
      <span class="cv-item-topo"><span>${tagConversa(CANAIS[c.canal] || [c.canal, 'cinza'])} ${filtro === 'todas' ? tagConversa(SITUACAO_CONVERSA[c.atendimento] || [c.atendimento, 'cinza']) : ''}</span>
        ${c.nao_lidas ? `<span class="cv-nao-lidas">${c.nao_lidas}</span>` : ''}</span>
    </button>`).join('')
    : `<div class="vazio">${estadoConversas.lista.length ? 'Nenhuma conversa aqui.' : 'Nenhuma conversa ainda. Quando alguém mandar mensagem no WhatsApp ou no Instagram, ela aparece aqui.'}</div>`;
}

function topoConversa(c) {
  const cli = c.cliente_id && DB.obter('clientes', c.cliente_id);
  const contato = c.canal === 'whatsapp' ? foneWhatsApp(c.contato) : (c.nome || 'Instagram');
  const d = c.dados || {};
  const agendamento = d.agendamentoId && DB.pode('agenda') && DB.obter('agendamentos', d.agendamentoId);
  return `
    <div class="cv-quem">
      <button class="btn sec peq cv-voltar" data-cv="voltar" aria-label="Voltar para a lista">&lsaquo;</button>
      <div><b>${esc(nomeConversa(c))}</b>
        <small>${tagConversa(CANAIS[c.canal] || [c.canal, 'cinza'])} ${tagConversa(SITUACAO_CONVERSA[c.atendimento] || [c.atendimento, 'cinza'])}
          ${esc(contato)}${cli ? ` · cliente ${esc(cli.codigo || '')}` : ''}</small></div>
    </div>
    <div class="acoes">
      ${c.canal === 'whatsapp' ? `<a class="btn sec peq" href="https://wa.me/${esc(digitos(c.contato))}" target="_blank" rel="noopener">Abrir no WhatsApp</a>` : ''}
      ${cli && DB.pode('clientes') ? '<button class="btn sec peq" data-cv="cliente">Ver cliente</button>' : ''}
      ${!cli ? '<button class="btn sec peq" data-cv="vincular">Vincular cliente</button>' : ''}
      ${agendamento ? '<button class="btn sec peq" data-cv="agendamento">Ver agendamento</button>' : ''}
      ${c.atendimento !== 'humano' ? '<button class="btn peq" data-cv="assumir">Assumir conversa</button>' : ''}
      ${c.atendimento === 'humano' ? '<button class="btn sec peq" data-cv="robo">Devolver ao robô</button><button class="btn peq" data-cv="encerrar">Encerrar atendimento</button>' : ''}
    </div>`;
}

function mensagemHTML(m) {
  const autor = m.direcao === 'entrada' ? '' : m.autor === 'robo' ? 'Robô' : m.autor;
  // O robô grava as opções que mostrou no fim do texto: "...\n\n[ Opção 1 | Opção 2 ]".
  const partes = String(m.texto || '').match(/^([\s\S]*?)\n\n\[ (.+) \]$/);
  const texto = partes ? partes[1] : m.texto;
  const opcoesRobo = partes ? `<span class="cv-opcoes">${partes[2].split(' | ').map((o) => `<span>${esc(o)}</span>`).join('')}</span>` : '';
  return `<div class="cv-msg ${m.direcao === 'entrada' ? 'entrada' : 'saida'} ${m.erro ? 'erro' : ''}">${esc(texto)}${opcoesRobo}<span class="cv-msg-info">${autor ? esc(autor) + ' · ' : ''}${horaConversa(m.criado_em, true)}${m.erro ? ' · NÃO ENVIADA: ' + esc(m.erro) : ''}</span></div>`;
}

// Redesenha o chat sem apagar o que o funcionário está digitando.
function desenharChat(el) {
  const caixa = $('#cv-chat', el);
  const c = estadoConversas.lista.find((x) => x.id === estadoConversas.aberta);
  $('#cv-grade', el).classList.toggle('com-aberta', Boolean(c));
  if (!c) {
    caixa.dataset.id = '';
    caixa.innerHTML = '<div class="vazio cv-escolha">Escolha uma conversa na lista.</div>';
    return;
  }
  const nova = caixa.dataset.id !== c.id;
  if (nova) {
    caixa.dataset.id = c.id;
    caixa.innerHTML = '<div class="cv-chat-topo" id="cv-topo"></div><div class="cv-msgs" id="cv-msgs"></div><div id="cv-rodape"></div>';
  }
  $('#cv-topo', caixa).innerHTML = topoConversa(c);
  const msgs = $('#cv-msgs', caixa);
  const noFim = nova || msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 60;
  msgs.innerHTML = estadoConversas.mensagens.map(mensagemHTML).join('') || '<div class="vazio">Sem mensagens.</div>';
  if (noFim) msgs.scrollTop = msgs.scrollHeight;

  const rodape = $('#cv-rodape', caixa);
  const aberta = janelaAberta(c) ? '1' : '0';
  if (rodape.dataset.janela !== aberta) {
    rodape.dataset.janela = aberta;
    rodape.innerHTML = aberta === '1' ? `
    <form class="cv-enviar"><textarea id="cv-texto" rows="2" placeholder="Escreva a resposta... (Enter envia, Shift+Enter pula linha)"></textarea>
      <button class="btn">Enviar</button></form>
    <div class="cv-dica">Ao responder, você assume a conversa e o robô para de responder nela.</div>`
    : `<div class="cv-aviso">Já se passaram 24 horas desde a última mensagem do cliente. Pela regra da Meta, só dá para responder
      por aqui depois que ele escrever de novo${c.canal === 'whatsapp' ? ' (ou ligue / use o botão "Abrir no WhatsApp")' : ''}.</div>`;
  }
  const dica = $('.cv-dica', rodape);
  if (dica) dica.hidden = c.atendimento === 'humano';
}

async function abrirConversa(el, id) {
  estadoConversas.aberta = id;
  estadoConversas.mensagens = [];
  desenharLista(el);
  desenharChat(el);
  const c = estadoConversas.lista.find((x) => x.id === id);
  try {
    estadoConversas.mensagens = await DB.mensagensDa(id);
    if (c && c.nao_lidas) {
      c.nao_lidas = 0;
      await DB.atualizarConversa(id, { nao_lidas: 0 });
      atualizarSeloConversas();
    }
  } catch (e) {
    avisar(e.message, 'erro');
  }
  if (estadoConversas.aberta === id && $('#cv-grade', el)) { desenharLista(el); desenharChat(el); }
  const texto = $('#cv-texto', el);
  if (texto && window.matchMedia('(min-width: 801px)').matches) texto.focus();
}

async function mudarAtendimento(el, c, campos, msg) {
  try {
    await DB.atualizarConversa(c.id, campos);
    Object.assign(c, campos);
    avisar(msg);
  } catch (e) {
    avisar(e.message, 'erro');
  }
  desenharConversas(el);
}

function acaoConversa(el, acao) {
  const c = estadoConversas.lista.find((x) => x.id === estadoConversas.aberta);
  if (!c) return;
  switch (acao) {
    case 'voltar':
      estadoConversas.aberta = null;
      desenharConversas(el);
      break;
    case 'assumir':
      mudarAtendimento(el, c, { atendimento: 'humano', nao_lidas: 0 }, 'Você assumiu a conversa: o robô não responde mais nela.');
      break;
    case 'robo':
      mudarAtendimento(el, c, { atendimento: 'robo', estado: 'inicio', dados: {} }, 'O robô volta a responder esta conversa.');
      break;
    case 'encerrar':
      mudarAtendimento(el, c, { atendimento: 'encerrada', estado: 'inicio', dados: {}, nao_lidas: 0 }, 'Atendimento encerrado. Se o cliente escrever de novo, o robô atende.');
      break;
    case 'cliente':
      abrirCliente(c.cliente_id);
      break;
    case 'agendamento':
      formAgendamento(c.dados.agendamentoId);
      break;
    case 'vincular':
      abrirModal('Vincular a um cliente', `
        <p class="ajuda">Escolha o cadastro desta pessoa (${esc(nomeConversa(c))}).</p>
        <form class="form">${campoCliente(null)}
          <div class="form-acoes"><button type="button" class="btn sec" data-cancelar>Cancelar</button><button class="btn">Vincular</button></div>
        </form>`, (raiz) => {
        const form = $('form', raiz);
        ligarCampoCliente(raiz);
        $('[data-cancelar]', raiz).addEventListener('click', fecharModal);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (!clienteValido(form)) return;
          fecharModal();
          mudarAtendimento(el, c, { cliente_id: form.clienteId.value }, 'Conversa vinculada ao cliente.');
        });
      });
      break;
  }
}

async function enviarResposta(el, form) {
  const id = estadoConversas.aberta;
  const caixa = $('#cv-texto', form);
  const texto = caixa.value.trim();
  if (!id || !texto) return;
  const botao = $('button', form);
  botao.disabled = true;
  botao.textContent = 'Enviando...';
  try {
    await DB.enviarMensagem(id, texto);
    caixa.value = '';
  } catch (e) {
    avisar('A mensagem não foi enviada: ' + e.message, 'erro', 9000);
  } finally {
    botao.disabled = false;
    botao.textContent = 'Enviar';
  }
  await recarregarConversas(el, true);
  caixa.focus();
}

/* ---------- Número de conversas esperando a equipe, no menu ---------- */
async function atualizarSeloConversas() {
  const link = document.querySelector('.menu a[data-rota="conversas"]');
  if (!link || !DB.perfil() || !DB.pode('conversas')) return;
  let n;
  try { n = await DB.contarConversasEsperando(); } catch { return; }
  let selo = $('.selo', link);
  if (!selo) {
    selo = document.createElement('span');
    selo.className = 'selo';
    selo.title = 'Conversas esperando a equipe';
    link.appendChild(selo);
  }
  selo.textContent = n;
  selo.hidden = !n;
}
setInterval(() => { if (!document.hidden) atualizarSeloConversas(); }, 60 * 1000);

/* ---------- Configurações do robô (tela Configurações) ---------- */
function cartaoConfigRobo() {
  const r = { ...ROBO_PADRAO, ...DB.roboConfig() };
  const servicos = Array.isArray(r.servicos) ? r.servicos.join('\n') : r.servicos;
  return `<div class="cartao"><h3>Robô do WhatsApp e Instagram</h3>
    <p class="ajuda">O robô responde sozinho quem escreve para a empresa: mostra o menu, agenda o serviço (cria o cliente e o
      agendamento na Agenda) e chama a equipe quando o cliente pede. As conversas ficam na área <b>Conversas</b>.
      Na mensagem de boas-vindas dá para usar {nome} e {empresa}.</p>
    <form class="form" id="form-robo">
      <label class="check full"><input type="checkbox" name="ativo" ${r.ativo !== false ? 'checked' : ''}> Robô ligado (desligado, ele só guarda as mensagens para a equipe responder)</label>
      ${campo('Mensagem de boas-vindas', 'boasVindas', r.boasVindas, 'text', 'full')}
      <label class="full">Serviços oferecidos no agendamento (um por linha, até 10)<textarea name="servicos" rows="6">${esc(servicos)}</textarea></label>
      <div class="full"><span class="rotulo-campo">Dias da semana com atendimento</span><div class="dias-robo">
        ${DIAS_SEMANA.map((d, i) => `<label class="check"><input type="checkbox" name="dia${i}" ${(r.dias || []).map(Number).includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}
      </div></div>
      ${campo('Primeiro dia oferecido (dias a partir de hoje)', 'antecedencia', r.antecedencia, 'number', 'min="0" max="30"')}
      ${campo('Quantos dias oferecer', 'diasOferecidos', r.diasOferecidos, 'number', 'min="1" max="9"')}
      ${campo('Agendamentos por período (manhã ou tarde) em cada dia', 'limitePeriodo', r.limitePeriodo, 'number', 'min="1" max="50"')}
      ${campo('Horário do período da manhã', 'horaManha', r.horaManha, 'time')}
      ${campo('Horário do período da tarde', 'horaTarde', r.horaTarde, 'time')}
      ${campo('Resposta quando o cliente pede atendente', 'msgAtendente', r.msgAtendente, 'textarea', 'full')}
      ${campo('Pergunta do pedido de orçamento', 'msgOrcamento', r.msgOrcamento, 'textarea', 'full')}
      <div class="form-acoes"><button type="button" class="btn sec" id="status-robo">Verificar conexão com a Meta</button><button class="btn" id="salvar-robo">Salvar</button></div>
    </form>
    <div id="status-robo-res"></div></div>`;
}

function ligarConfigRobo(el) {
  $('#form-robo', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const d = lerForm(e.target);
    const dados = {
      ativo: d.ativo,
      boasVindas: d.boasVindas,
      servicos: d.servicos,
      dias: DIAS_SEMANA.map((_, i) => i).filter((i) => d['dia' + i]),
      antecedencia: parseInt(d.antecedencia, 10) || 0,
      diasOferecidos: parseInt(d.diasOferecidos, 10) || ROBO_PADRAO.diasOferecidos,
      limitePeriodo: parseInt(d.limitePeriodo, 10) || ROBO_PADRAO.limitePeriodo,
      horaManha: d.horaManha || ROBO_PADRAO.horaManha,
      horaTarde: d.horaTarde || ROBO_PADRAO.horaTarde,
      msgAtendente: d.msgAtendente,
      msgOrcamento: d.msgOrcamento,
    };
    if (!dados.dias.length) { avisar('Marque pelo menos um dia da semana.', 'erro'); return; }
    enviando($('#salvar-robo', el), async () => {
      await DB.salvarRoboConfig(dados);
      avisar('Configurações do robô salvas.');
    });
  });
  $('#status-robo', el).addEventListener('click', async (e) => {
    const res = $('#status-robo-res', el);
    const endereco = `${window.BERBERT_CONFIG.supabaseUrl}/functions/v1/robo`;
    const linha = (ok, texto) => `<li>${ok ? '✅' : '❌'} ${texto}</li>`;
    e.target.disabled = true;
    res.innerHTML = '<p class="ajuda">Verificando...</p>';
    try {
      const s = await DB.statusRobo();
      res.innerHTML = `<ul class="lista-ajuda">
        ${linha(true, 'Função "robo" publicada no Supabase')}
        ${linha(s.verificacao, 'Senha do webhook (META_VERIFY_TOKEN)')}
        ${linha(s.assinatura, 'Chave secreta do app (META_APP_SECRET)')}
        ${linha(s.whatsapp, 'WhatsApp (WHATSAPP_TOKEN e WHATSAPP_PHONE_ID)')}
        ${linha(s.instagram, 'Instagram (INSTAGRAM_TOKEN)')}
      </ul>`;
    } catch (err) {
      res.innerHTML = `<ul class="lista-ajuda">${linha(false, esc(err.message))}</ul>`;
    } finally {
      e.target.disabled = false;
    }
    res.insertAdjacentHTML('beforeend', `<p class="ajuda">Endereço do webhook para cadastrar no painel da Meta:<br><code>${esc(endereco)}</code></p>`);
  });
}
