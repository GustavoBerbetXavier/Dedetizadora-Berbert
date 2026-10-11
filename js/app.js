// Sistema de gestão - Dedetizadora Berbert
// Módulos: Painel, Clientes, Agenda, Orçamentos, Laudos, Financeiro e Configurações.

/* ---------- Utilitários ---------- */
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moeda = (v) => fmtMoeda.format(Number(v) || 0);
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};
function hojeISO() {
  const d = new Date();
  return isoData(d);
}
function isoData(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dataBR(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
function somarDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  return isoData(new Date(a, m - 1, d + Number(dias || 0)));
}
function nomeCliente(id) {
  const c = DB.obter('clientes', id);
  return c ? c.nome : '—';
}
function opcoesClientes(selecionado) {
  const lista = DB.listar('clientes').sort((a, b) => a.nome.localeCompare(b.nome));
  return '<option value="">Selecione...</option>' +
    lista.map((c) => `<option value="${c.id}" ${c.id === selecionado ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
}
function opcoes(lista, selecionado) {
  return lista.map(([v, r]) => `<option value="${v}" ${v === selecionado ? 'selected' : ''}>${r}</option>`).join('');
}
function lerForm(form) {
  const obj = {};
  new FormData(form).forEach((v, k) => (obj[k] = typeof v === 'string' ? v.trim() : v));
  $$('input[type=checkbox]', form).forEach((cb) => (obj[cb.name] = cb.checked));
  return obj;
}
function campo(rotulo, nome, valor = '', tipo = 'text', extra = '') {
  if (tipo === 'textarea') {
    return `<label class="${extra.includes('full') ? 'full' : ''}">${rotulo}<textarea name="${nome}">${esc(valor)}</textarea></label>`;
  }
  const cls = extra.includes('full') ? 'full' : '';
  const attrs = extra.replace('full', '');
  return `<label class="${cls}">${rotulo}<input type="${tipo}" name="${nome}" value="${esc(valor)}" ${attrs}></label>`;
}
function confirmar(msg) {
  return window.confirm(msg);
}

/* ---------- Modal ---------- */
function abrirModal(titulo, html, aoMontar) {
  $('#modal-titulo').textContent = titulo;
  $('#modal-corpo').innerHTML = html;
  $('#modal').hidden = false;
  if (aoMontar) aoMontar($('#modal-corpo'));
  const primeiro = $('#modal-corpo input, #modal-corpo select');
  if (primeiro) primeiro.focus();
}
function fecharModal() {
  $('#modal').hidden = true;
  $('#modal-corpo').innerHTML = '';
}
$('#modal-fechar').addEventListener('click', fecharModal);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') fecharModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) fecharModal(); });

/* ---------- Editor de linhas (itens de orçamento, produtos de laudo) ---------- */
function editorLinhas(colunas, itens) {
  const cab = colunas.map((c) => `<th style="${c.largura ? `width:${c.largura}` : ''}">${c.rotulo}</th>`).join('');
  const linhas = (itens.length ? itens : [{}]).map((i) => linhaHTML(colunas, i)).join('');
  return `<div class="linhas"><div class="tabela-wrap"><table><thead><tr>${cab}<th></th></tr></thead>
    <tbody>${linhas}</tbody></table></div>
    <button type="button" class="btn sec peq add-linha" style="margin-top:6px">+ Adicionar linha</button></div>`;
}
function linhaHTML(colunas, item) {
  return '<tr>' + colunas.map((c) =>
    `<td><input data-col="${c.nome}" type="${c.tipo || 'text'}" ${c.tipo === 'number' ? 'step="0.01" min="0"' : ''} value="${esc(item[c.nome] ?? '')}"></td>`
  ).join('') + '<td><button type="button" class="btn sec peq rm-linha" title="Remover">✕</button></td></tr>';
}
function ligarLinhas(raiz, colunas, aoMudar = () => {}) {
  const tbody = $('.linhas tbody', raiz);
  $('.add-linha', raiz).addEventListener('click', () => {
    tbody.insertAdjacentHTML('beforeend', linhaHTML(colunas, {}));
    aoMudar();
  });
  tbody.addEventListener('click', (e) => {
    if (e.target.classList.contains('rm-linha')) {
      e.target.closest('tr').remove();
      aoMudar();
    }
  });
  tbody.addEventListener('input', aoMudar);
}
function lerLinhas(raiz, colunas) {
  return $$('.linhas tbody tr', raiz).map((tr) => {
    const o = {};
    colunas.forEach((c) => {
      const v = $(`[data-col="${c.nome}"]`, tr).value.trim();
      o[c.nome] = c.tipo === 'number' ? num(v) : v;
    });
    return o;
  }).filter((o) => colunas.some((c) => c.tipo !== 'number' && o[c.nome]));
}

/* ---------- Impressão ---------- */
function imprimir(html) {
  $('#impressao').innerHTML = html;
  document.body.classList.add('imprimindo');
  setTimeout(() => window.print(), 50);
}
window.addEventListener('afterprint', () => document.body.classList.remove('imprimindo'));

function cabecalhoDoc() {
  const c = DB.config();
  return `<div class="doc-topo">
    <div><h1>${esc(c.empresa || 'Dedetizadora Berbert')}</h1>
      <div class="dados">${c.cnpj ? 'CNPJ: ' + esc(c.cnpj) + '<br>' : ''}${c.licenca ? 'Licença Sanitária: ' + esc(c.licenca) : ''}</div></div>
    <div class="dados" style="text-align:right">${esc(c.endereco || '')}<br>${esc(c.telefone || '')}<br>${esc(c.email || '')}</div>
  </div>`;
}
function blocoCliente(cli) {
  if (!cli) return '';
  return `<h3>Cliente</h3><div class="info">
    <div><b>Nome:</b> ${esc(cli.nome)}</div><div><b>CPF/CNPJ:</b> ${esc(cli.documento)}</div>
    <div><b>Endereço:</b> ${esc([cli.endereco, cli.bairro].filter(Boolean).join(', '))}</div><div><b>Cidade:</b> ${esc(cli.cidade)}</div>
    <div><b>Telefone:</b> ${esc(cli.telefone)}</div><div><b>E-mail:</b> ${esc(cli.email)}</div></div>`;
}

/* ---------- Roteamento ---------- */
const rotas = { painel, clientes, agenda, orcamentos, laudos, financeiro, config: configuracoes };

function render() {
  const rota = (location.hash.replace('#/', '') || 'painel').split('?')[0];
  const fn = rotas[rota] || painel;
  $$('.menu a').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === rota));
  $('#menu').classList.remove('aberto');
  fn($('#view'));
}
window.addEventListener('hashchange', render);
$('#menu-btn').addEventListener('click', () => $('#menu').classList.toggle('aberto'));

/* ---------- Status / tags ---------- */
const STATUS_AG = [['agendado', 'Agendado'], ['concluido', 'Concluído'], ['cancelado', 'Cancelado']];
const STATUS_ORC = [['pendente', 'Pendente'], ['aprovado', 'Aprovado'], ['recusado', 'Recusado']];
const COR_STATUS = { agendado: 'azul', concluido: 'verde', cancelado: 'cinza', pendente: 'amarelo', aprovado: 'verde', recusado: 'vermelho' };
function tag(status, lista) {
  const r = (lista.find(([v]) => v === status) || [status, status])[1];
  return `<span class="tag ${COR_STATUS[status] || 'cinza'}">${esc(r)}</span>`;
}

/* =====================================================================
   PAINEL
   ===================================================================== */
function painel(el) {
  const hoje = hojeISO();
  const em7 = somarDias(hoje, 7);
  const mes = hoje.slice(0, 7);
  const ags = DB.listar('agendamentos');
  const fin = DB.listar('financeiro');
  const agHoje = ags.filter((a) => a.data === hoje && a.status !== 'cancelado');
  const proximos = ags.filter((a) => a.data >= hoje && a.data <= em7 && a.status === 'agendado')
    .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  const aReceber = fin.filter((f) => f.tipo === 'receita' && !f.pago).reduce((s, f) => s + num(f.valor), 0);
  const vencidas = fin.filter((f) => !f.pago && f.vencimento && f.vencimento < hoje);
  const saldoMes = fin.filter((f) => f.pago && (f.dataPagamento || f.vencimento || '').startsWith(mes))
    .reduce((s, f) => s + (f.tipo === 'receita' ? 1 : -1) * num(f.valor), 0);
  const orcPend = DB.listar('orcamentos').filter((o) => o.status === 'pendente').length;

  el.innerHTML = `
    <div class="cabecalho"><h2>Painel</h2>
      <div class="acoes">
        <button class="btn" id="novo-ag">+ Agendamento</button>
        <button class="btn sec" id="novo-cli">+ Cliente</button>
      </div></div>
    <div class="grade-kpi">
      <div class="kpi"><div class="rotulo">Serviços hoje</div><div class="valor">${agHoje.length}</div></div>
      <div class="kpi"><div class="rotulo">Clientes cadastrados</div><div class="valor">${DB.listar('clientes').length}</div></div>
      <div class="kpi"><div class="rotulo">Orçamentos pendentes</div><div class="valor">${orcPend}</div></div>
      <div class="kpi"><div class="rotulo">A receber</div><div class="valor">${moeda(aReceber)}</div></div>
      <div class="kpi"><div class="rotulo">Saldo do mês (pago)</div><div class="valor" style="color:${saldoMes < 0 ? 'var(--vermelho)' : 'inherit'}">${moeda(saldoMes)}</div></div>
    </div>
    <div class="cartao"><h3>Próximos 7 dias</h3>${tabelaAgendamentos(proximos, false)}</div>
    <div class="cartao"><h3>Contas vencidas</h3>
      ${vencidas.length ? `<div class="tabela-wrap"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Tipo</th><th class="num">Valor</th></tr></thead><tbody>
        ${vencidas.map((f) => `<tr><td>${dataBR(f.vencimento)}</td><td>${esc(f.descricao)}</td><td>${f.tipo === 'receita' ? 'A receber' : 'A pagar'}</td><td class="num">${moeda(f.valor)}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="vazio">Nenhuma conta vencida 🎉</div>'}
    </div>`;
  $('#novo-ag', el).addEventListener('click', () => formAgendamento(null, { data: hoje }));
  $('#novo-cli', el).addEventListener('click', () => formCliente(null));
}

function tabelaAgendamentos(lista, comAcoes = true) {
  if (!lista.length) return '<div class="vazio">Nenhum agendamento.</div>';
  return `<div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Hora</th><th>Cliente</th><th>Serviço</th><th>Técnico</th><th>Status</th>${comAcoes ? '<th>Ações</th>' : ''}</tr></thead><tbody>
    ${lista.map((a) => `<tr>
      <td>${dataBR(a.data)}</td><td>${esc(a.hora)}</td><td>${esc(nomeCliente(a.clienteId))}</td>
      <td>${esc(a.servico)}</td><td>${esc(a.tecnico)}</td><td>${tag(a.status, STATUS_AG)}</td>
      ${comAcoes ? `<td><div class="acoes">
        ${a.status === 'agendado' ? `<button class="btn peq" data-ag="concluir" data-id="${a.id}">Concluir</button>` : ''}
        <button class="btn sec peq" data-ag="laudo" data-id="${a.id}">Laudo</button>
        <button class="btn sec peq" data-ag="receita" data-id="${a.id}">Lançar $</button>
        <button class="btn sec peq" data-ag="editar" data-id="${a.id}">Editar</button>
        <button class="btn sec peq" data-ag="excluir" data-id="${a.id}">Excluir</button>
      </div></td>` : ''}
    </tr>`).join('')}
  </tbody></table></div>`;
}

/* =====================================================================
   CLIENTES
   ===================================================================== */
function clientes(el) {
  el.innerHTML = `
    <div class="cabecalho"><h2>Clientes</h2>
      <div class="acoes"><input class="busca" id="busca" placeholder="Buscar por nome, telefone, cidade...">
      <button class="btn" id="novo">+ Novo cliente</button></div></div>
    <div class="cartao" style="padding:0"><div id="lista"></div></div>`;
  const desenhar = () => {
    const q = $('#busca', el).value.toLowerCase();
    const lista = DB.listar('clientes')
      .filter((c) => [c.nome, c.telefone, c.cidade, c.bairro, c.documento].join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    $('#lista', el).innerHTML = lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Nome</th><th>Telefone</th><th>Bairro / Cidade</th><th>Tipo</th><th>Ações</th></tr></thead><tbody>
      ${lista.map((c) => `<tr><td><b>${esc(c.nome)}</b></td><td>${esc(c.telefone)}</td><td>${esc([c.bairro, c.cidade].filter(Boolean).join(' / '))}</td>
        <td>${c.tipo === 'PJ' ? 'Empresa' : 'Pessoa física'}</td>
        <td><div class="acoes">
          <button class="btn sec peq" data-acao="hist" data-id="${c.id}">Histórico</button>
          ${c.telefone ? `<a class="btn sec peq" target="_blank" rel="noopener" href="https://wa.me/55${c.telefone.replace(/\D/g, '')}">WhatsApp</a>` : ''}
          <button class="btn sec peq" data-acao="editar" data-id="${c.id}">Editar</button>
          <button class="btn sec peq" data-acao="excluir" data-id="${c.id}">Excluir</button>
        </div></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="vazio">Nenhum cliente encontrado.</div>';
  };
  desenhar();
  $('#busca', el).addEventListener('input', desenhar);
  $('#novo', el).addEventListener('click', () => formCliente(null));
  $('#lista', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.acao === 'editar') formCliente(id);
    if (b.dataset.acao === 'hist') historicoCliente(id);
    if (b.dataset.acao === 'excluir' && confirmar('Excluir este cliente? O histórico ligado a ele continuará salvo.')) {
      DB.remover('clientes', id);
      render();
    }
  });
}

function formCliente(id, aoSalvar) {
  const c = id ? DB.obter('clientes', id) : { tipo: 'PF' };
  abrirModal(id ? 'Editar cliente' : 'Novo cliente', `
    <form class="form">
      ${campo('Nome / Razão social *', 'nome', c.nome, 'text', 'required full')}
      <label>Tipo<select name="tipo">${opcoes([['PF', 'Pessoa física'], ['PJ', 'Empresa']], c.tipo)}</select></label>
      ${campo('CPF / CNPJ', 'documento', c.documento)}
      ${campo('Telefone / WhatsApp', 'telefone', c.telefone, 'tel')}
      ${campo('E-mail', 'email', c.email, 'email')}
      ${campo('Endereço', 'endereco', c.endereco, 'text', 'full')}
      ${campo('Bairro', 'bairro', c.bairro)}
      ${campo('Cidade', 'cidade', c.cidade)}
      ${campo('Contato responsável', 'contato', c.contato)}
      ${campo('Tipo de imóvel', 'imovel', c.imovel, 'text', 'placeholder="Casa, apartamento, restaurante..."')}
      ${campo('Observações', 'obs', c.obs, 'textarea', 'full')}
      <div class="form-acoes"><button type="button" class="btn sec" data-cancelar>Cancelar</button><button class="btn">Salvar</button></div>
    </form>`, (raiz) => {
    const form = $('form', raiz);
    $('[data-cancelar]', raiz).addEventListener('click', fecharModal);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const salvo = DB.salvarItem('clientes', { ...lerForm(form), id: id || undefined });
      fecharModal();
      if (aoSalvar) aoSalvar(salvo); else render();
    });
  });
}

function historicoCliente(id) {
  const c = DB.obter('clientes', id);
  const ags = DB.listar('agendamentos').filter((a) => a.clienteId === id).sort((a, b) => b.data.localeCompare(a.data));
  const orcs = DB.listar('orcamentos').filter((o) => o.clienteId === id).sort((a, b) => b.data.localeCompare(a.data));
  const lds = DB.listar('laudos').filter((l) => l.clienteId === id).sort((a, b) => b.data.localeCompare(a.data));
  const fin = DB.listar('financeiro').filter((f) => f.clienteId === id);
  const pago = fin.filter((f) => f.tipo === 'receita' && f.pago).reduce((s, f) => s + num(f.valor), 0);
  const aberto = fin.filter((f) => f.tipo === 'receita' && !f.pago).reduce((s, f) => s + num(f.valor), 0);
  abrirModal(`Histórico — ${c.nome}`, `
    <p>${esc(c.telefone)} · ${esc([c.endereco, c.bairro, c.cidade].filter(Boolean).join(', '))}</p>
    <div class="grade-kpi">
      <div class="kpi"><div class="rotulo">Serviços</div><div class="valor">${ags.length}</div></div>
      <div class="kpi"><div class="rotulo">Total pago</div><div class="valor">${moeda(pago)}</div></div>
      <div class="kpi"><div class="rotulo">Em aberto</div><div class="valor">${moeda(aberto)}</div></div>
    </div>
    <h3>Agendamentos</h3>${tabelaAgendamentos(ags, false)}
    <h3>Orçamentos</h3>${orcs.length ? `<table><thead><tr><th>Nº</th><th>Data</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>
      ${orcs.map((o) => `<tr><td>${o.numero}</td><td>${dataBR(o.data)}</td><td class="num">${moeda(totalOrcamento(o))}</td><td>${tag(o.status, STATUS_ORC)}</td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Nenhum orçamento.</div>'}
    <h3>Laudos</h3>${lds.length ? `<table><thead><tr><th>Nº</th><th>Data</th><th>Pragas</th><th>Garantia até</th></tr></thead><tbody>
      ${lds.map((l) => `<tr><td>${l.numero}</td><td>${dataBR(l.data)}</td><td>${esc(l.pragas)}</td><td>${l.garantiaDias ? dataBR(somarDias(l.data, l.garantiaDias)) : '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Nenhum laudo.</div>'}
  `);
}

/* =====================================================================
   AGENDA
   ===================================================================== */
const estadoAgenda = { ano: new Date().getFullYear(), mes: new Date().getMonth(), dia: hojeISO() };

function agenda(el) {
  const { ano, mes } = estadoAgenda;
  const primeiro = new Date(ano, mes, 1);
  const inicio = new Date(ano, mes, 1 - primeiro.getDay());
  const hoje = hojeISO();
  const ags = DB.listar('agendamentos');
  const porDia = {};
  ags.forEach((a) => (porDia[a.data] = porDia[a.data] || []).push(a));
  Object.values(porDia).forEach((l) => l.sort((a, b) => (a.hora || '').localeCompare(b.hora || '')));

  let dias = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    const iso = isoData(d);
    const evs = porDia[iso] || [];
    dias += `<div class="dia ${d.getMonth() !== mes ? 'fora' : ''} ${iso === hoje ? 'hoje' : ''} ${iso === estadoAgenda.dia ? 'sel' : ''}" data-dia="${iso}">
      <div class="n">${d.getDate()}</div>
      ${evs.slice(0, 3).map((a) => `<div class="ev ${a.status}">${esc(a.hora)} ${esc(nomeCliente(a.clienteId))}</div>`).join('')}
      ${evs.length > 3 ? `<div class="ev">+${evs.length - 3}</div>` : ''}
    </div>`;
  }
  const tituloMes = primeiro.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase());
  const doDia = porDia[estadoAgenda.dia] || [];

  el.innerHTML = `
    <div class="cabecalho"><h2>Agenda</h2>
      <div class="cal-nav">
        <button class="btn sec" id="ant">‹</button><strong>${tituloMes}</strong><button class="btn sec" id="prox">›</button>
        <button class="btn sec" id="hoje">Hoje</button>
        <button class="btn" id="novo">+ Agendar</button>
      </div></div>
    <div class="cartao">
      <div class="calendario">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => `<div class="dsem">${d}</div>`).join('')}${dias}</div>
    </div>
    <div class="cartao" id="dia-sel"><h3>Agendamentos de ${dataBR(estadoAgenda.dia)}</h3>${tabelaAgendamentos(doDia)}</div>`;

  const mudarMes = (delta) => {
    const d = new Date(estadoAgenda.ano, estadoAgenda.mes + delta, 1);
    estadoAgenda.ano = d.getFullYear();
    estadoAgenda.mes = d.getMonth();
    agenda(el);
  };
  $('#ant', el).addEventListener('click', () => mudarMes(-1));
  $('#prox', el).addEventListener('click', () => mudarMes(1));
  $('#hoje', el).addEventListener('click', () => {
    const d = new Date();
    Object.assign(estadoAgenda, { ano: d.getFullYear(), mes: d.getMonth(), dia: hojeISO() });
    agenda(el);
  });
  $('#novo', el).addEventListener('click', () => formAgendamento(null, { data: estadoAgenda.dia }));
  $('.calendario', el).addEventListener('click', (e) => {
    const d = e.target.closest('[data-dia]');
    if (!d) return;
    estadoAgenda.dia = d.dataset.dia;
    const [a, m] = d.dataset.dia.split('-').map(Number);
    estadoAgenda.ano = a;
    estadoAgenda.mes = m - 1;
    agenda(el);
    $('#dia-sel', el).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function ligarAcoesAgendamento(el) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ag]');
    if (!b) return;
    const a = DB.obter('agendamentos', b.dataset.id);
    if (!a) return;
    switch (b.dataset.ag) {
      case 'concluir':
        DB.salvarItem('agendamentos', { id: a.id, status: 'concluido' });
        render();
        break;
      case 'laudo':
        formLaudo(null, { clienteId: a.clienteId, data: a.data, pragas: a.servico, ...(a.tecnico ? { responsavel: a.tecnico } : {}) });
        break;
      case 'receita':
        formFinanceiro(null, { tipo: 'receita', clienteId: a.clienteId, valor: a.valor, vencimento: a.data, descricao: `${a.servico || 'Serviço'} — ${nomeCliente(a.clienteId)}`, categoria: 'Serviços' });
        break;
      case 'editar':
        formAgendamento(a.id);
        break;
      case 'excluir':
        if (confirmar('Excluir este agendamento?')) { DB.remover('agendamentos', a.id); render(); }
        break;
    }
  });
}

function formAgendamento(id, padrao = {}) {
  const a = id ? DB.obter('agendamentos', id) : { status: 'agendado', hora: '08:00', ...padrao };
  abrirModal(id ? 'Editar agendamento' : 'Novo agendamento', `
    <form class="form">
      <label class="full">Cliente *<div style="display:flex;gap:6px"><select name="clienteId" required style="flex:1">${opcoesClientes(a.clienteId)}</select>
        <button type="button" class="btn sec" id="cli-rapido" title="Cadastrar cliente">+ Novo</button></div></label>
      ${campo('Data *', 'data', a.data, 'date', 'required')}
      ${campo('Hora', 'hora', a.hora, 'time')}
      ${campo('Serviço', 'servico', a.servico, 'text', 'list="servicos" placeholder="Ex.: Dedetização, desratização..."')}
      ${campo('Técnico responsável', 'tecnico', a.tecnico)}
      ${campo('Valor (R$)', 'valor', a.valor, 'number', 'step="0.01" min="0"')}
      <label>Status<select name="status">${opcoes(STATUS_AG, a.status)}</select></label>
      ${campo('Observações', 'obs', a.obs, 'textarea', 'full')}
      <datalist id="servicos">${['Dedetização', 'Desratização', 'Descupinização', 'Desinsetização', 'Controle de escorpiões', 'Limpeza de caixa d\'água', 'Sanitização', 'Retorno / garantia'].map((s) => `<option value="${s}">`).join('')}</datalist>
      <div class="form-acoes"><button type="button" class="btn sec" data-cancelar>Cancelar</button><button class="btn">Salvar</button></div>
    </form>`, (raiz) => {
    const form = $('form', raiz);
    $('[data-cancelar]', raiz).addEventListener('click', fecharModal);
    $('#cli-rapido', raiz).addEventListener('click', () => {
      const rascunho = lerForm(form);
      formCliente(null, (cli) => formAgendamento(id, { ...rascunho, clienteId: cli.id }));
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const dados = lerForm(form);
      DB.salvarItem('agendamentos', { ...a, ...dados, valor: num(dados.valor), id: id || undefined });
      estadoAgenda.dia = dados.data;
      const [ano, mes] = dados.data.split('-').map(Number);
      estadoAgenda.ano = ano;
      estadoAgenda.mes = mes - 1;
      fecharModal();
      render();
    });
  });
}

/* =====================================================================
   ORÇAMENTOS
   ===================================================================== */
const COLS_ORC = [
  { nome: 'descricao', rotulo: 'Descrição do serviço' },
  { nome: 'qtd', rotulo: 'Qtd', tipo: 'number', largura: '80px' },
  { nome: 'valor', rotulo: 'Valor unit. (R$)', tipo: 'number', largura: '130px' },
];
function totalOrcamento(o) {
  const sub = (o.itens || []).reduce((s, i) => s + num(i.qtd || 1) * num(i.valor), 0);
  return Math.max(0, sub - num(o.desconto));
}

function orcamentos(el) {
  const lista = DB.listar('orcamentos').sort((a, b) => b.numero - a.numero);
  el.innerHTML = `
    <div class="cabecalho"><h2>Orçamentos</h2><button class="btn" id="novo">+ Novo orçamento</button></div>
    <div class="cartao" style="padding:0">${lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th class="num">Total</th><th>Status</th><th>Ações</th></tr></thead><tbody>
      ${lista.map((o) => `<tr><td>${o.numero}</td><td>${dataBR(o.data)}</td><td>${esc(nomeCliente(o.clienteId))}</td>
        <td class="num">${moeda(totalOrcamento(o))}</td><td>${tag(o.status, STATUS_ORC)}</td>
        <td><div class="acoes">
          <button class="btn peq" data-acao="imprimir" data-id="${o.id}">Imprimir / PDF</button>
          ${o.status === 'pendente' ? `<button class="btn sec peq" data-acao="aprovar" data-id="${o.id}">Aprovar e agendar</button>` : ''}
          <button class="btn sec peq" data-acao="editar" data-id="${o.id}">Editar</button>
          <button class="btn sec peq" data-acao="excluir" data-id="${o.id}">Excluir</button>
        </div></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="vazio">Nenhum orçamento cadastrado.</div>'}</div>`;
  $('#novo', el).addEventListener('click', () => formOrcamento(null));
  el.querySelector('.cartao').addEventListener('click', (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const o = DB.obter('orcamentos', b.dataset.id);
    if (b.dataset.acao === 'imprimir') imprimirOrcamento(o);
    if (b.dataset.acao === 'editar') formOrcamento(o.id);
    if (b.dataset.acao === 'aprovar') {
      DB.salvarItem('orcamentos', { id: o.id, status: 'aprovado' });
      formAgendamento(null, {
        clienteId: o.clienteId, data: hojeISO(), valor: totalOrcamento(o),
        servico: (o.itens || []).map((i) => i.descricao).join(', '),
        obs: `Referente ao orçamento nº ${o.numero}`,
      });
    }
    if (b.dataset.acao === 'excluir' && confirmar('Excluir este orçamento?')) { DB.remover('orcamentos', o.id); render(); }
  });
}

function formOrcamento(id) {
  const o = id ? DB.obter('orcamentos', id) : { data: hojeISO(), validadeDias: 15, status: 'pendente', itens: [{ qtd: 1 }], pagamento: 'PIX, dinheiro ou cartão' };
  abrirModal(id ? `Editar orçamento nº ${o.numero}` : 'Novo orçamento', `
    <form class="form">
      <label class="full">Cliente *<select name="clienteId" required>${opcoesClientes(o.clienteId)}</select></label>
      ${campo('Data', 'data', o.data, 'date', 'required')}
      ${campo('Validade (dias)', 'validadeDias', o.validadeDias, 'number', 'min="1"')}
      ${editorLinhas(COLS_ORC, o.itens || [])}
      ${campo('Desconto (R$)', 'desconto', o.desconto, 'number', 'step="0.01" min="0"')}
      <label>Status<select name="status">${opcoes(STATUS_ORC, o.status)}</select></label>
      <div class="full total-linha" id="total"></div>
      ${campo('Forma de pagamento', 'pagamento', o.pagamento, 'text', 'full')}
      ${campo('Garantia / condições', 'condicoes', o.condicoes, 'textarea', 'full')}
      <div class="form-acoes"><button type="button" class="btn sec" data-cancelar>Cancelar</button><button class="btn">Salvar</button></div>
    </form>`, (raiz) => {
    const form = $('form', raiz);
    const atualizar = () => {
      $('#total', raiz).textContent = 'Total: ' + moeda(totalOrcamento({ itens: lerLinhas(raiz, COLS_ORC), desconto: form.desconto.value }));
    };
    ligarLinhas(raiz, COLS_ORC, atualizar);
    form.desconto.addEventListener('input', atualizar);
    atualizar();
    $('[data-cancelar]', raiz).addEventListener('click', fecharModal);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const dados = lerForm(form);
      const itens = lerLinhas(raiz, COLS_ORC);
      if (!itens.length) { alert('Adicione pelo menos um item ao orçamento.'); return; }
      DB.salvarItem('orcamentos', {
        ...dados, itens, desconto: num(dados.desconto), id: id || undefined,
        numero: id ? o.numero : DB.proximoNumero('seqOrcamento'),
      });
      fecharModal();
      render();
    });
  });
}

function imprimirOrcamento(o) {
  const cli = DB.obter('clientes', o.clienteId);
  const sub = (o.itens || []).reduce((s, i) => s + num(i.qtd || 1) * num(i.valor), 0);
  imprimir(`<div class="doc">${cabecalhoDoc()}
    <h2>Orçamento nº ${o.numero}</h2>
    <div class="info"><div><b>Data:</b> ${dataBR(o.data)}</div><div><b>Válido até:</b> ${dataBR(somarDias(o.data, o.validadeDias || 15))}</div></div>
    ${blocoCliente(cli)}
    <h3>Serviços</h3>
    <table><thead><tr><th>Descrição</th><th class="num">Qtd</th><th class="num">Valor unit.</th><th class="num">Subtotal</th></tr></thead><tbody>
      ${(o.itens || []).map((i) => `<tr><td>${esc(i.descricao)}</td><td class="num">${num(i.qtd || 1)}</td><td class="num">${moeda(i.valor)}</td><td class="num">${moeda(num(i.qtd || 1) * num(i.valor))}</td></tr>`).join('')}
      ${num(o.desconto) ? `<tr><td colspan="3" class="num">Subtotal</td><td class="num">${moeda(sub)}</td></tr><tr><td colspan="3" class="num">Desconto</td><td class="num">- ${moeda(o.desconto)}</td></tr>` : ''}
      <tr><td colspan="3" class="num"><b>TOTAL</b></td><td class="num"><b>${moeda(totalOrcamento(o))}</b></td></tr>
    </tbody></table>
    ${o.pagamento ? `<h3>Forma de pagamento</h3><p>${esc(o.pagamento)}</p>` : ''}
    ${o.condicoes ? `<h3>Garantia e condições</h3><p style="white-space:pre-line">${esc(o.condicoes)}</p>` : ''}
    <div class="assinatura"><div>${esc(DB.config().empresa || 'Dedetizadora Berbert')}</div><div>De acordo — ${esc(cli ? cli.nome : 'Cliente')}</div></div>
  </div>`);
}

/* =====================================================================
   LAUDOS (Certificado de execução de serviço)
   ===================================================================== */
const COLS_PROD = [
  { nome: 'produto', rotulo: 'Produto (nome comercial)' },
  { nome: 'principio', rotulo: 'Princípio ativo' },
  { nome: 'grupo', rotulo: 'Grupo químico' },
  { nome: 'registro', rotulo: 'Registro MS', largura: '120px' },
  { nome: 'quantidade', rotulo: 'Qtd / diluição', largura: '120px' },
];

function laudos(el) {
  const lista = DB.listar('laudos').sort((a, b) => b.numero - a.numero);
  el.innerHTML = `
    <div class="cabecalho"><h2>Laudos / Certificados</h2><button class="btn" id="novo">+ Novo laudo</button></div>
    <div class="cartao" style="padding:0">${lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Pragas alvo</th><th>Garantia até</th><th>Ações</th></tr></thead><tbody>
      ${lista.map((l) => {
        const ate = l.garantiaDias ? somarDias(l.data, l.garantiaDias) : '';
        return `<tr><td>${l.numero}</td><td>${dataBR(l.data)}</td><td>${esc(nomeCliente(l.clienteId))}</td><td>${esc(l.pragas)}</td>
        <td>${ate ? `${dataBR(ate)} ${ate < hojeISO() ? '<span class="tag cinza">vencida</span>' : '<span class="tag verde">vigente</span>'}` : '—'}</td>
        <td><div class="acoes">
          <button class="btn peq" data-acao="imprimir" data-id="${l.id}">Imprimir / PDF</button>
          <button class="btn sec peq" data-acao="editar" data-id="${l.id}">Editar</button>
          <button class="btn sec peq" data-acao="excluir" data-id="${l.id}">Excluir</button>
        </div></td></tr>`;
      }).join('')}
    </tbody></table></div>` : '<div class="vazio">Nenhum laudo emitido.</div>'}</div>`;
  $('#novo', el).addEventListener('click', () => formLaudo(null));
  el.querySelector('.cartao').addEventListener('click', (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const l = DB.obter('laudos', b.dataset.id);
    if (b.dataset.acao === 'imprimir') imprimirLaudo(l);
    if (b.dataset.acao === 'editar') formLaudo(l.id);
    if (b.dataset.acao === 'excluir' && confirmar('Excluir este laudo?')) { DB.remover('laudos', l.id); render(); }
  });
}

function formLaudo(id, padrao = {}) {
  const cfg = DB.config();
  const l = id ? DB.obter('laudos', id) : {
    data: hojeISO(), garantiaDias: 90, produtos: [],
    responsavel: cfg.responsavelTecnico, registroResp: cfg.registroResp,
    ...padrao,
  };
  abrirModal(id ? `Editar laudo nº ${l.numero}` : 'Novo laudo / certificado', `
    <form class="form">
      <label class="full">Cliente *<select name="clienteId" required>${opcoesClientes(l.clienteId)}</select></label>
      ${campo('Data da execução', 'data', l.data, 'date', 'required')}
      ${campo('Garantia (dias)', 'garantiaDias', l.garantiaDias, 'number', 'min="0"')}
      ${campo('Pragas alvo', 'pragas', l.pragas, 'text', 'full placeholder="Baratas, formigas, ratos, cupins..."')}
      ${campo('Áreas tratadas', 'areas', l.areas, 'text', 'full placeholder="Cozinha, banheiros, área externa..."')}
      ${campo('Método de aplicação', 'metodo', l.metodo, 'text', 'full placeholder="Pulverização, gel, iscas, polvilhamento..."')}
      <div class="full"><b style="font-size:13px;color:var(--suave)">Produtos utilizados</b></div>
      ${editorLinhas(COLS_PROD, l.produtos || [])}
      ${campo('Antídoto / tratamento em caso de intoxicação', 'antidoto', l.antidoto, 'textarea', 'full')}
      ${campo('Recomendações ao cliente', 'recomendacoes', l.recomendacoes ?? 'Manter o ambiente fechado por pelo menos 2 horas após a aplicação. Evitar contato de crianças e animais com as áreas tratadas até a secagem completa. Não lavar as áreas tratadas por 7 dias.', 'textarea', 'full')}
      ${campo('Responsável técnico', 'responsavel', l.responsavel)}
      ${campo('Registro (CRQ/CRBio/CREA)', 'registroResp', l.registroResp)}
      ${campo('Observações', 'obs', l.obs, 'textarea', 'full')}
      <div class="form-acoes"><button type="button" class="btn sec" data-cancelar>Cancelar</button><button class="btn">Salvar</button></div>
    </form>`, (raiz) => {
    const form = $('form', raiz);
    ligarLinhas(raiz, COLS_PROD);
    $('[data-cancelar]', raiz).addEventListener('click', fecharModal);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const dados = lerForm(form);
      DB.salvarItem('laudos', {
        ...dados, produtos: lerLinhas(raiz, COLS_PROD), id: id || undefined,
        numero: id ? l.numero : DB.proximoNumero('seqLaudo'),
      });
      fecharModal();
      location.hash = '#/laudos';
      render();
    });
  });
}

function imprimirLaudo(l) {
  const cli = DB.obter('clientes', l.clienteId);
  const cfg = DB.config();
  imprimir(`<div class="doc">${cabecalhoDoc()}
    <h2>Certificado de Execução de Serviço nº ${l.numero}</h2>
    <div class="info"><div><b>Data da execução:</b> ${dataBR(l.data)}</div>
      <div><b>Garantia:</b> ${l.garantiaDias ? `${l.garantiaDias} dias (até ${dataBR(somarDias(l.data, l.garantiaDias))})` : '—'}</div></div>
    ${blocoCliente(cli)}
    <h3>Serviço executado</h3>
    <div class="info"><div><b>Pragas alvo:</b> ${esc(l.pragas)}</div><div><b>Método:</b> ${esc(l.metodo)}</div>
      <div style="grid-column:1/-1"><b>Áreas tratadas:</b> ${esc(l.areas)}</div></div>
    <h3>Produtos utilizados</h3>
    ${(l.produtos || []).length ? `<table><thead><tr><th>Produto</th><th>Princípio ativo</th><th>Grupo químico</th><th>Registro MS</th><th>Qtd / diluição</th></tr></thead><tbody>
      ${l.produtos.map((p) => `<tr><td>${esc(p.produto)}</td><td>${esc(p.principio)}</td><td>${esc(p.grupo)}</td><td>${esc(p.registro)}</td><td>${esc(p.quantidade)}</td></tr>`).join('')}
    </tbody></table>` : '<p>—</p>'}
    ${l.antidoto ? `<h3>Antídoto / tratamento</h3><p style="white-space:pre-line">${esc(l.antidoto)}</p>` : ''}
    <p><b>Em caso de intoxicação:</b> procure atendimento médico levando este certificado. Disque-Intoxicação (ANVISA): 0800 722 6001.</p>
    ${l.recomendacoes ? `<h3>Recomendações</h3><p style="white-space:pre-line">${esc(l.recomendacoes)}</p>` : ''}
    ${l.obs ? `<h3>Observações</h3><p style="white-space:pre-line">${esc(l.obs)}</p>` : ''}
    <div class="assinatura">
      <div>${esc(l.responsavel || cfg.responsavelTecnico || 'Responsável técnico')}<br>${esc(l.registroResp || '')}</div>
      <div>${esc(cli ? cli.nome : 'Cliente')}</div>
    </div>
  </div>`);
}

/* =====================================================================
   FINANCEIRO
   ===================================================================== */
const estadoFin = { mes: hojeISO().slice(0, 7), tipo: '' };

function financeiro(el) {
  const hoje = hojeISO();
  const doMes = DB.listar('financeiro').filter((f) => (f.vencimento || '').startsWith(estadoFin.mes));
  const lista = doMes.filter((f) => !estadoFin.tipo || f.tipo === estadoFin.tipo)
    .sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
  const soma = (fn) => doMes.filter(fn).reduce((s, f) => s + num(f.valor), 0);
  const receitas = soma((f) => f.tipo === 'receita');
  const despesas = soma((f) => f.tipo === 'despesa');
  const recebido = soma((f) => f.tipo === 'receita' && f.pago);
  const aReceber = soma((f) => f.tipo === 'receita' && !f.pago);

  el.innerHTML = `
    <div class="cabecalho"><h2>Financeiro</h2>
      <div class="acoes">
        <input type="month" class="busca" style="min-width:0" id="mes" value="${estadoFin.mes}">
        <select class="busca" style="min-width:0" id="tipo">${opcoes([['', 'Todos'], ['receita', 'Receitas'], ['despesa', 'Despesas']], estadoFin.tipo)}</select>
        <button class="btn" id="nova-rec">+ Receita</button>
        <button class="btn perigo" id="nova-desp">+ Despesa</button>
      </div></div>
    <div class="grade-kpi">
      <div class="kpi"><div class="rotulo">Receitas do mês</div><div class="valor" style="color:var(--verde)">${moeda(receitas)}</div></div>
      <div class="kpi"><div class="rotulo">Despesas do mês</div><div class="valor" style="color:var(--vermelho)">${moeda(despesas)}</div></div>
      <div class="kpi"><div class="rotulo">Resultado previsto</div><div class="valor">${moeda(receitas - despesas)}</div></div>
      <div class="kpi"><div class="rotulo">Recebido / a receber</div><div class="valor" style="font-size:18px">${moeda(recebido)} / ${moeda(aReceber)}</div></div>
    </div>
    <div class="cartao" style="padding:0">${lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Cliente</th><th>Categoria</th><th class="num">Valor</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
      ${lista.map((f) => {
        const sit = f.pago ? `<span class="tag verde">${f.tipo === 'receita' ? 'Recebido' : 'Pago'}${f.dataPagamento ? ' ' + dataBR(f.dataPagamento) : ''}</span>`
          : f.vencimento < hoje ? '<span class="tag vermelho">Vencido</span>' : '<span class="tag amarelo">Em aberto</span>';
        return `<tr><td>${dataBR(f.vencimento)}</td><td>${esc(f.descricao)}</td><td>${f.clienteId ? esc(nomeCliente(f.clienteId)) : ''}</td><td>${esc(f.categoria)}</td>
        <td class="num" style="color:${f.tipo === 'receita' ? 'var(--verde)' : 'var(--vermelho)'}">${f.tipo === 'despesa' ? '- ' : ''}${moeda(f.valor)}</td><td>${sit}</td>
        <td><div class="acoes">
          ${!f.pago ? `<button class="btn peq" data-acao="pagar" data-id="${f.id}">${f.tipo === 'receita' ? 'Recebido' : 'Pago'}</button>` : ''}
          <button class="btn sec peq" data-acao="editar" data-id="${f.id}">Editar</button>
          <button class="btn sec peq" data-acao="excluir" data-id="${f.id}">Excluir</button>
        </div></td></tr>`;
      }).join('')}
    </tbody></table></div>` : '<div class="vazio">Nenhum lançamento neste mês.</div>'}</div>`;

  $('#mes', el).addEventListener('change', (e) => { estadoFin.mes = e.target.value || hojeISO().slice(0, 7); financeiro(el); });
  $('#tipo', el).addEventListener('change', (e) => { estadoFin.tipo = e.target.value; financeiro(el); });
  $('#nova-rec', el).addEventListener('click', () => formFinanceiro(null, { tipo: 'receita', categoria: 'Serviços' }));
  $('#nova-desp', el).addEventListener('click', () => formFinanceiro(null, { tipo: 'despesa' }));
  el.querySelector('.cartao').addEventListener('click', (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const f = DB.obter('financeiro', b.dataset.id);
    if (b.dataset.acao === 'pagar') { DB.salvarItem('financeiro', { id: f.id, pago: true, dataPagamento: hojeISO() }); render(); }
    if (b.dataset.acao === 'editar') formFinanceiro(f.id);
    if (b.dataset.acao === 'excluir' && confirmar('Excluir este lançamento?')) { DB.remover('financeiro', f.id); render(); }
  });
}

function formFinanceiro(id, padrao = {}) {
  const f = id ? DB.obter('financeiro', id) : { vencimento: hojeISO(), pago: false, ...padrao };
  const categorias = f.tipo === 'despesa'
    ? ['Produtos químicos', 'Combustível', 'Salários', 'Equipamentos', 'Aluguel', 'Impostos', 'Manutenção de veículo', 'Outros']
    : ['Serviços', 'Contrato mensal', 'Outros'];
  abrirModal(`${id ? 'Editar' : 'Nova'} ${f.tipo === 'despesa' ? 'despesa' : 'receita'}`, `
    <form class="form">
      ${campo('Descrição *', 'descricao', f.descricao, 'text', 'required full')}
      ${campo('Valor (R$) *', 'valor', f.valor, 'number', 'required step="0.01" min="0"')}
      ${campo('Vencimento *', 'vencimento', f.vencimento, 'date', 'required')}
      ${campo('Categoria', 'categoria', f.categoria, 'text', 'list="cats"')}
      <datalist id="cats">${categorias.map((c) => `<option value="${c}">`).join('')}</datalist>
      <label>Cliente<select name="clienteId">${opcoesClientes(f.clienteId)}</select></label>
      <label>Forma de pagamento<select name="forma">${opcoes([['', '—'], ['pix', 'PIX'], ['dinheiro', 'Dinheiro'], ['cartao', 'Cartão'], ['boleto', 'Boleto'], ['transferencia', 'Transferência']], f.forma)}</select></label>
      <label class="check"><input type="checkbox" name="pago" ${f.pago ? 'checked' : ''}> Já ${f.tipo === 'despesa' ? 'pago' : 'recebido'}</label>
      ${campo('Observações', 'obs', f.obs, 'textarea', 'full')}
      <div class="form-acoes"><button type="button" class="btn sec" data-cancelar>Cancelar</button><button class="btn">Salvar</button></div>
    </form>`, (raiz) => {
    const form = $('form', raiz);
    $('[data-cancelar]', raiz).addEventListener('click', fecharModal);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const dados = lerForm(form);
      DB.salvarItem('financeiro', {
        ...dados, tipo: f.tipo, valor: num(dados.valor), id: id || undefined,
        dataPagamento: dados.pago ? (f.dataPagamento || hojeISO()) : '',
      });
      fecharModal();
      location.hash = '#/financeiro';
      render();
    });
  });
}

/* =====================================================================
   CONFIGURAÇÕES
   ===================================================================== */
function configuracoes(el) {
  const c = DB.config();
  el.innerHTML = `
    <div class="cabecalho"><h2>Configurações</h2></div>
    <div class="cartao"><h3>Dados da empresa (aparecem nos orçamentos e laudos)</h3>
      <form class="form" id="form-cfg">
        ${campo('Nome da empresa', 'empresa', c.empresa || 'Dedetizadora Berbert', 'text', 'full')}
        ${campo('CNPJ', 'cnpj', c.cnpj)}
        ${campo('Licença sanitária / alvará', 'licenca', c.licenca)}
        ${campo('Telefone', 'telefone', c.telefone)}
        ${campo('E-mail', 'email', c.email)}
        ${campo('Endereço', 'endereco', c.endereco, 'text', 'full')}
        ${campo('Responsável técnico', 'responsavelTecnico', c.responsavelTecnico)}
        ${campo('Registro do responsável (CRQ/CRBio)', 'registroResp', c.registroResp)}
        <div class="form-acoes"><button class="btn">Salvar dados</button></div>
      </form></div>
    <div class="cartao"><h3>Backup dos dados</h3>
      <p style="color:var(--suave)">Os dados ficam salvos neste navegador. Faça backup regularmente e guarde o arquivo em local seguro (Google Drive, pendrive, e-mail).</p>
      <div class="acoes">
        <button class="btn" id="exportar">⬇ Baixar backup</button>
        <label class="btn sec">⬆ Restaurar backup<input type="file" id="importar" accept="application/json,.json" hidden></label>
      </div></div>`;
  $('#form-cfg', el).addEventListener('submit', (e) => {
    e.preventDefault();
    DB.salvarConfig(lerForm(e.target));
    alert('Dados salvos!');
  });
  $('#exportar', el).addEventListener('click', () => {
    const blob = new Blob([DB.exportar()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup-berbert-${hojeISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#importar', el).addEventListener('change', async (e) => {
    const arq = e.target.files[0];
    if (!arq) return;
    if (!confirmar('Restaurar o backup vai SUBSTITUIR todos os dados atuais. Continuar?')) return;
    try {
      DB.importar(await arq.text());
      alert('Backup restaurado com sucesso!');
      render();
    } catch (err) {
      alert('Não foi possível restaurar: ' + err.message);
    }
  });
}

/* ---------- Inicialização ---------- */
ligarAcoesAgendamento($('#view'));
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
