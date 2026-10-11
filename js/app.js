// Sistema de gestão - Berbert Pest Control
// Módulos: Painel, Clientes, Agenda, Orçamentos, Laudos, Financeiro,
// Funcionários e Configurações. O acesso de cada funcionário é definido
// pelo administrador e verificado também pelo banco de dados.

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
  return isoData(new Date());
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
// Campo para escolher o cliente digitando parte do nome, telefone ou CPF/CNPJ.
// Funciona bem mesmo com dezenas de milhares de clientes (mostra só os 30 primeiros resultados).
function campoCliente(selecionado, { obrigatorio = true, extra = '' } = {}) {
  const c = DB.obter('clientes', selecionado);
  return `<label class="full">Cliente${obrigatorio ? ' *' : ''}<div class="linha-cliente">
    <div class="busca-cliente" data-obrigatorio="${obrigatorio ? 1 : ''}">
      <input type="text" class="bc-texto" value="${esc(c ? c.nome : '')}" placeholder="Digite código, nome, telefone ou CPF/CNPJ..." autocomplete="off">
      <input type="hidden" name="clienteId" value="${c ? c.id : ''}">
      <div class="bc-lista" hidden></div>
    </div>${extra}</div></label>`;
}
function ligarCampoCliente(raiz) {
  const caixa = $('.busca-cliente', raiz);
  if (!caixa) return;
  const texto = $('.bc-texto', caixa), oculto = $('[name=clienteId]', caixa), lista = $('.bc-lista', caixa);
  let indice = null, resultados = [], ativo = -1;
  const montarIndice = () => DB.listar('clientes').map((c) => ({
    c, cod: normalizar(c.codigo), busca: normalizar(c.codigo) + ' ' + normalizar(c.nome) + ' ' + digitos(c.telefone) + ' ' + digitos(c.documento) + ' ' + normalizar(c.bairro) + ' ' + normalizar(c.cidade),
  })).sort((a, b) => (a.c.nome || '').localeCompare(b.c.nome || ''));
  const desenhar = () => {
    lista.innerHTML = resultados.length ? resultados.map((c, i) => `<button type="button" data-id="${c.id}" class="${i === ativo ? 'ativo' : ''}">
        <b>${c.codigo ? `<span class="cod">${esc(c.codigo)}</span>` : ''}${esc(c.nome)}</b><small>${esc([c.telefone, c.bairro, c.cidade].filter(Boolean).join(' · '))}</small></button>`).join('')
      : '<div class="bc-vazio">Nenhum cliente encontrado.</div>';
    lista.hidden = false;
  };
  const buscar = () => {
    indice = indice || montarIndice();
    const termos = normalizar(texto.value).split(' ').filter(Boolean)
      .map((t) => (/^[\d().\-\/\s]+$/.test(t) ? digitos(t) || t : t));
    resultados = [];
    const consulta = normalizar(texto.value);
    const porCodigo = consulta && indice.find((item) => item.cod === consulta);
    if (porCodigo) resultados.push(porCodigo.c);
    for (const item of indice) {
      if (item === porCodigo) continue;
      if (termos.every((t) => item.busca.includes(t))) resultados.push(item.c);
      if (resultados.length >= 30) break;
    }
    ativo = resultados.length ? 0 : -1;
    desenhar();
  };
  const escolher = (c) => {
    oculto.value = c.id;
    texto.value = c.nome;
    lista.hidden = true;
    caixa.classList.remove('invalido');
  };
  texto.addEventListener('input', () => { oculto.value = ''; buscar(); });
  texto.addEventListener('focus', () => { if (!oculto.value) buscar(); });
  texto.addEventListener('keydown', (e) => {
    if (lista.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) buscar();
    if (e.key === 'ArrowDown') { e.preventDefault(); ativo = Math.min(ativo + 1, resultados.length - 1); desenhar(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ativo = Math.max(ativo - 1, 0); desenhar(); }
    else if (e.key === 'Enter' && !lista.hidden && resultados[ativo]) { e.preventDefault(); escolher(resultados[ativo]); }
    else if (e.key === 'Escape' && !lista.hidden) { e.stopPropagation(); lista.hidden = true; }
  });
  lista.addEventListener('mousedown', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    e.preventDefault();
    escolher(DB.obter('clientes', b.dataset.id));
  });
  texto.addEventListener('blur', () => setTimeout(() => {
    lista.hidden = true;
    if (!oculto.value) texto.value = caixa.dataset.obrigatorio ? texto.value : '';
  }, 150));
}
// Confere se um cliente foi escolhido na lista (o campo oculto não tem validação do navegador).
function clienteValido(form) {
  const caixa = $('.busca-cliente', form);
  if (!caixa || !caixa.dataset.obrigatorio || $('[name=clienteId]', caixa).value) return true;
  caixa.classList.add('invalido');
  $('.bc-texto', caixa).focus();
  avisar('Escolha o cliente na lista: digite parte do nome e clique nele.', 'erro');
  return false;
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
  const cls = extra.includes('full') ? 'full' : '';
  if (tipo === 'textarea') {
    return `<label class="${cls}">${rotulo}<textarea name="${nome}">${esc(valor)}</textarea></label>`;
  }
  const attrs = extra.replace('full', '');
  return `<label class="${cls}">${rotulo}<input type="${tipo}" name="${nome}" value="${esc(valor)}" ${attrs}></label>`;
}
function confirmar(msg) {
  return window.confirm(msg);
}
function avisar(msg, tipo = 'ok') {
  const el = $('#aviso-flutuante');
  el.textContent = msg;
  el.className = tipo;
  el.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => (el.hidden = true), tipo === 'erro' ? 6000 : 2500);
}
// Executa uma ação assíncrona de um formulário, travando o botão enquanto salva.
async function enviando(botao, acao) {
  const texto = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Salvando...';
  try {
    await acao();
  } catch (e) {
    avisar(e.message || String(e), 'erro');
  } finally {
    botao.disabled = false;
    botao.textContent = texto;
  }
}

/* ---------- Ícones (SVG) ---------- */
const ICONES = {
  painel: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  clientes: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  agenda: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  orcamentos: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  laudos: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  financeiro: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  funcionarios: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  conta: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  senha: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  seta: '<path d="m18 15-6-6-6 6"/>',
};
const icone = (nome) => `<svg class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome]}</svg>`;

/* ---------- Modal ---------- */
function abrirModal(titulo, html, aoMontar) {
  $('#modal-titulo').textContent = titulo;
  $('#modal-corpo').innerHTML = html;
  $('#modal').hidden = false;
  if (aoMontar) aoMontar($('#modal-corpo'));
  const primeiro = $('#modal-corpo input:not([type=checkbox]):not([disabled]), #modal-corpo select');
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
  ).join('') + '<td><button type="button" class="btn sec peq rm-linha" title="Remover">&times;</button></td></tr>';
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
  const area = $('#impressao');
  area.innerHTML = html;
  document.body.classList.add('imprimindo');
  // Espera a logo carregar antes de abrir a impressão.
  const imagens = $$('img', area).filter((img) => !img.complete);
  Promise.all(imagens.map((img) => new Promise((ok) => { img.onload = img.onerror = ok; })))
    .then(() => setTimeout(() => window.print(), 50));
}
window.addEventListener('afterprint', () => document.body.classList.remove('imprimindo'));

function cabecalhoDoc() {
  const c = DB.config();
  return `<div class="doc-topo">
    <div><img src="img/logo-escura.webp" alt="Berbert Pest Control" class="doc-logo">
      <div class="dados">${esc(c.empresa || 'Dedetizadora Berbert')}${c.cnpj ? ' — CNPJ: ' + esc(c.cnpj) : ''}${c.licenca ? '<br>Licença Sanitária: ' + esc(c.licenca) : ''}</div></div>
    <div class="dados" style="text-align:right">${esc(c.endereco || '')}<br>${esc(c.telefone || '')}<br>${esc(c.email || '')}</div>
  </div>`;
}
function blocoCliente(cli) {
  if (!cli) return '';
  return `<h3>Cliente</h3><div class="info">
    <div><b>Nome:</b> ${esc(cli.nome)}${cli.codigo ? ` <span style="color:#555">(cód. ${esc(cli.codigo)})</span>` : ''}</div><div><b>CPF/CNPJ:</b> ${esc(cli.documento)}</div>
    <div><b>Endereço:</b> ${esc([cli.endereco, cli.bairro, cli.cep && 'CEP ' + cli.cep].filter(Boolean).join(', '))}</div><div><b>Cidade:</b> ${esc(cli.cidade)}</div>
    <div><b>Telefone:</b> ${esc(cli.telefone)}</div><div><b>E-mail:</b> ${esc(cli.email)}</div></div>`;
}

/* ---------- Menu e roteamento ---------- */
// modulo: permissão exigida (null = todos; 'admin' = só administrador)
const ROTAS = [
  { rota: 'painel', titulo: 'Painel', modulo: null, fn: painel },
  { rota: 'clientes', titulo: 'Clientes', modulo: 'clientes', fn: clientes },
  { rota: 'agenda', titulo: 'Agenda', modulo: 'agenda', fn: agenda },
  { rota: 'orcamentos', titulo: 'Orçamentos', modulo: 'orcamentos', fn: orcamentos },
  { rota: 'laudos', titulo: 'Laudos', modulo: 'laudos', fn: laudos },
  { rota: 'financeiro', titulo: 'Financeiro', modulo: 'financeiro', fn: financeiro },
  { rota: 'funcionarios', titulo: 'Funcionários', modulo: 'admin', fn: funcionarios },
  // Configurações não aparece no menu principal: fica no menu do perfil (canto inferior esquerdo).
  { rota: 'config', titulo: 'Configurações', modulo: 'admin', fn: configuracoes, foraDoMenu: true },
];
function rotaPermitida(r) {
  if (r.modulo === null) return true;
  if (r.modulo === 'admin') return Boolean(DB.perfil() && DB.perfil().admin);
  return DB.pode(r.modulo);
}
function montarMenu() {
  $('#menu-links').innerHTML = ROTAS.filter((r) => !r.foraDoMenu && rotaPermitida(r))
    .map((r) => `<a href="#" data-rota="${r.rota}">${icone(r.rota)}<span>${r.titulo}</span></a>`).join('');
  $('#menu-btn').innerHTML = icone('menu');
  montarPerfil();
}

/* ---------- Perfil do usuário (canto inferior esquerdo) ---------- */
function iniciais(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}
function papel(p) {
  return p.admin ? 'Administrador' : 'Funcionário';
}
function montarPerfil() {
  const p = DB.perfil();
  const nome = p.nome || p.email;
  $('#perfil-btn').innerHTML = `
    <span class="avatar">${esc(iniciais(nome))}</span>
    <span class="perfil-txt"><b>${esc(nome)}</b><small>${papel(p)}</small></span>
    ${icone('seta')}`;
  $('#perfil-menu').innerHTML = `
    <div class="perfil-cab">
      <span class="avatar grande">${esc(iniciais(nome))}</span>
      <div><b>${esc(nome)}</b><small>${esc(p.email)}</small></div>
    </div>
    <button data-perfil="conta">${icone('conta')}Minha conta</button>
    ${p.admin ? `<button data-perfil="config">${icone('config')}Configurações</button>` : ''}
    <button data-perfil="senha">${icone('senha')}Alterar senha</button>
    <button data-perfil="sair" class="sair">${icone('sair')}Sair</button>`;
}
function abrirMenuPerfil(abrir) {
  $('#perfil-menu').hidden = !abrir;
  $('#perfil-btn').setAttribute('aria-expanded', String(abrir));
  $('#perfil').classList.toggle('aberto', abrir);
}
$('#perfil-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  abrirMenuPerfil($('#perfil-menu').hidden);
});
$('#perfil-menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-perfil]');
  if (!b) return;
  abrirMenuPerfil(false);
  $('#menu').classList.remove('aberto');
  if (b.dataset.perfil === 'conta') minhaConta();
  if (b.dataset.perfil === 'config') irPara('config');
  if (b.dataset.perfil === 'senha') formMinhaSenha();
  if (b.dataset.perfil === 'sair') sair();
});
document.addEventListener('click', (e) => {
  if (!$('#perfil-menu').hidden && !e.target.closest('#perfil')) abrirMenuPerfil(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#perfil-menu').hidden) abrirMenuPerfil(false);
});

function dataHoraBR(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
function minhaConta() {
  const p = DB.perfil();
  const u = DB.usuario() || {};
  const nome = p.nome || p.email;
  abrirModal('Minha conta', `
    <div class="conta-topo">
      <span class="avatar grande">${esc(iniciais(nome))}</span>
      <div><h3>${esc(nome)}</h3><span class="tag ${p.admin ? 'laranja' : 'azul'}">${papel(p)}</span></div>
    </div>
    <div class="conta-info">
      <div><span>E-mail (login)</span><b>${esc(p.email)}</b></div>
      <div><span>Situação</span><b>${p.ativo ? 'Ativo' : 'Bloqueado'}</b></div>
      <div><span>Último acesso</span><b>${dataHoraBR(u.last_sign_in_at)}</b></div>
      <div><span>Conta criada em</span><b>${dataHoraBR(p.criado_em)}</b></div>
      <div class="full"><span>Áreas que você pode acessar</span><div>${tagsAcesso(p)}</div></div>
    </div>
    <p class="ajuda">${p.admin ? 'Você é administrador: pode alterar o acesso dos funcionários em "Funcionários".'
      : 'Para mudar seu nome ou suas permissões, fale com o administrador do sistema.'}</p>
    <div class="form-acoes">
      <button type="button" class="btn sec" id="conta-senha">Alterar senha</button>
      <button type="button" class="btn perigo" id="conta-sair">Sair</button>
    </div>`, (raiz) => {
    $('#conta-senha', raiz).addEventListener('click', formMinhaSenha);
    $('#conta-sair', raiz).addEventListener('click', () => { fecharModal(); sair(); });
  });
}
// A tela atual fica guardada aqui (e no histórico do navegador), sem aparecer
// no endereço: a URL continua sempre limpa, mas o botão Voltar funciona.
let rotaAtiva = (() => {
  if (location.hash.startsWith('#/')) return location.hash.slice(2).split('?')[0];
  try { return sessionStorage.getItem('berbert-rota') || 'painel'; } catch { return 'painel'; }
})();
if (location.hash.startsWith('#/')) history.replaceState({ rota: rotaAtiva }, '', location.pathname + location.search);

function rotaAtual() {
  return rotaAtiva;
}
function irPara(rota, substituir = false) {
  rotaAtiva = rota;
  try { sessionStorage.setItem('berbert-rota', rota); } catch { /* sem armazenamento */ }
  history[substituir ? 'replaceState' : 'pushState']({ rota }, '', location.pathname + location.search);
  render();
  atualizarDados();
}
function render() {
  let r = ROTAS.find((x) => x.rota === rotaAtual()) || ROTAS[0];
  if (!rotaPermitida(r)) r = ROTAS[0];
  $$('.menu a').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === r.rota));
  $('#menu').classList.remove('aberto');
  r.fn($('#view'));
}
// Busca alterações feitas por outros funcionários (ao trocar de tela ou voltar ao app).
async function atualizarDados() {
  if (!DB.perfil() || $('#app').hidden || DB.carregadoHa() < 20000) return;
  const rota = rotaAtual();
  try {
    await DB.carregar();
    if (rota === rotaAtual() && $('#modal').hidden) render();
  } catch (e) {
    avisar('Não foi possível atualizar os dados: ' + DB.traduzirErro(e), 'erro');
  }
}
window.addEventListener('popstate', (e) => {
  if ($('#app').hidden || !e.state || !e.state.rota) return;
  rotaAtiva = e.state.rota;
  try { sessionStorage.setItem('berbert-rota', rotaAtiva); } catch { /* sem armazenamento */ }
  render();
  atualizarDados();
});
$('#menu').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-rota]');
  if (!a) return;
  e.preventDefault();
  if (a.dataset.rota !== rotaAtiva) irPara(a.dataset.rota);
  else $('#menu').classList.remove('aberto');
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) atualizarDados(); });
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
  const p = DB.perfil();
  const verAgenda = DB.pode('agenda');
  const verFin = DB.pode('financeiro');
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

  const kpis = [];
  if (verAgenda) kpis.push(['Serviços hoje', agHoje.length]);
  kpis.push(['Clientes cadastrados', DB.listar('clientes').length]);
  if (DB.pode('orcamentos')) kpis.push(['Orçamentos pendentes', orcPend]);
  if (verFin) {
    kpis.push(['A receber', moeda(aReceber)]);
    kpis.push(['Saldo do mês (pago)', `<span style="color:${saldoMes < 0 ? 'var(--vermelho)' : 'inherit'}">${moeda(saldoMes)}</span>`]);
  }

  el.innerHTML = `
    <div class="cabecalho"><h2>Olá, ${esc((p.nome || '').split(' ')[0] || 'bem-vindo')}</h2>
      <div class="acoes">
        ${verAgenda ? '<button class="btn" id="novo-ag">+ Agendamento</button>' : ''}
        ${DB.pode('clientes') ? '<button class="btn sec" id="novo-cli">+ Cliente</button>' : ''}
      </div></div>
    <div class="grade-kpi">${kpis.map(([r, v]) => `<div class="kpi"><div class="rotulo">${r}</div><div class="valor">${v}</div></div>`).join('')}</div>
    ${verAgenda ? `<div class="cartao"><h3>Próximos 7 dias</h3>${tabelaAgendamentos(proximos, false)}</div>` : ''}
    ${verFin ? `<div class="cartao"><h3>Contas vencidas</h3>
      ${vencidas.length ? `<div class="tabela-wrap"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Tipo</th><th class="num">Valor</th></tr></thead><tbody>
        ${vencidas.map((f) => `<tr><td>${dataBR(f.vencimento)}</td><td>${esc(f.descricao)}</td><td>${f.tipo === 'receita' ? 'A receber' : 'A pagar'}</td><td class="num">${moeda(f.valor)}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="vazio">Nenhuma conta vencida.</div>'}
    </div>` : ''}`;
  if (verAgenda) $('#novo-ag', el).addEventListener('click', () => formAgendamento(null, { data: hoje }));
  if (DB.pode('clientes')) $('#novo-cli', el).addEventListener('click', () => formCliente(null));
}

function tabelaAgendamentos(lista, comAcoes = true) {
  if (!lista.length) return '<div class="vazio">Nenhum agendamento.</div>';
  return `<div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Hora</th><th>Cliente</th><th>Serviço</th><th>Técnico</th><th>Status</th>${comAcoes ? '<th>Ações</th>' : ''}</tr></thead><tbody>
    ${lista.map((a) => `<tr>
      <td>${dataBR(a.data)}</td><td>${esc(a.hora)}</td><td>${esc(nomeCliente(a.clienteId))}</td>
      <td>${esc(a.servico)}</td><td>${esc(a.tecnico)}</td><td>${tag(a.status, STATUS_AG)}</td>
      ${comAcoes ? `<td><div class="acoes">
        ${a.status === 'agendado' ? `<button class="btn peq" data-ag="concluir" data-id="${a.id}">Concluir</button>` : ''}
        ${DB.pode('laudos') ? `<button class="btn sec peq" data-ag="laudo" data-id="${a.id}">Laudo</button>` : ''}
        ${DB.pode('financeiro') ? `<button class="btn sec peq" data-ag="receita" data-id="${a.id}">Lançar $</button>` : ''}
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
      <div class="acoes"><input class="busca" id="busca" placeholder="Buscar por código, nome, telefone, cidade...">
      <button class="btn sec" id="importar">Importar planilha</button>
      <button class="btn" id="novo">+ Novo cliente</button></div></div>
    <div id="aviso-codigos"></div>
    <div class="cartao" style="padding:0"><div id="lista"></div></div>`;
  const semCodigo = DB.listar('clientes').filter((c) => !c.codigo);
  if (semCodigo.length) {
    $('#aviso-codigos', el).innerHTML = `<div class="cartao aviso-linha">
      <span>${semCodigo.length} cliente${semCodigo.length === 1 ? ' está' : 's estão'} sem código.</span>
      <button class="btn sec peq" id="gerar-codigos">Gerar códigos automaticamente</button></div>`;
    $('#gerar-codigos', el).addEventListener('click', (e) => {
      const gerar = geradorCodigos();
      const lista = semCodigo.slice()
        .sort((a, b) => (a.criadoEm || '').localeCompare(b.criadoEm || '') || (a.nome || '').localeCompare(b.nome || ''))
        .map((c) => ({ id: c.id, codigo: gerar() }));
      if (!confirmar(`Gerar códigos de ${lista[0].codigo} a ${lista[lista.length - 1].codigo} para ${lista.length} clientes, na ordem de cadastro (e por nome, para quem foi cadastrado junto)?`)) return;
      enviando(e.target, async () => {
        await DB.atualizarVarios('clientes', lista, (feitos, de) => (e.target.textContent = `Gerando... ${feitos} de ${de}`));
        avisar('Códigos gerados.');
        render();
      });
    });
  }
  const desenhar = () => {
    const q = $('#busca', el).value.toLowerCase();
    const todos = DB.listar('clientes')
      .filter((c) => [c.codigo, c.nome, c.telefone, c.cidade, c.bairro, c.documento].join(' ').toLowerCase().includes(q))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    // Mostra no máximo 200 por vez para a tela continuar rápida com muitos clientes.
    const lista = todos.slice(0, 200);
    const rodape = todos.length > lista.length
      ? `<div class="vazio">Mostrando ${lista.length} de ${todos.length} clientes. Use a busca para encontrar os demais.</div>` : '';
    $('#lista', el).innerHTML = lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Cód.</th><th>Nome</th><th>Telefone</th><th>Bairro / Cidade</th><th>Tipo</th><th>Ações</th></tr></thead><tbody>
      ${lista.map((c) => `<tr><td class="cod-col">${esc(c.codigo || '—')}</td><td><b>${esc(c.nome)}</b></td><td>${esc(c.telefone)}</td><td>${esc([c.bairro, c.cidade].filter(Boolean).join(' / '))}</td>
        <td>${c.tipo === 'PJ' ? 'Empresa' : 'Pessoa física'}</td>
        <td><div class="acoes">
          <button class="btn sec peq" data-acao="hist" data-id="${c.id}">Histórico</button>
          ${c.telefone ? `<a class="btn sec peq" target="_blank" rel="noopener" href="https://wa.me/55${c.telefone.replace(/\D/g, '')}">WhatsApp</a>` : ''}
          <button class="btn sec peq" data-acao="editar" data-id="${c.id}">Editar</button>
          <button class="btn sec peq" data-acao="excluir" data-id="${c.id}">Excluir</button>
        </div></td></tr>`).join('')}
    </tbody></table></div>${rodape}` : '<div class="vazio">Nenhum cliente encontrado.</div>';
  };
  desenhar();
  $('#busca', el).addEventListener('input', desenhar);
  $('#novo', el).addEventListener('click', () => formCliente(null));
  $('#importar', el).addEventListener('click', importarClientes);
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

/* ---------- Importação de clientes por planilha (.csv) ---------- */
const CAMPOS_IMPORTACAO = [
  ['codigo', 'Código do cliente', ['codigo', 'cod', 'codigo cliente', 'codigo do cliente', 'cod cliente', 'cod do cliente', 'id', 'id cliente',
    'cliente id', 'n cliente', 'numero do cliente', 'matricula', 'ref', 'referencia']],
  ['nome', 'Nome / Razão social *', ['nome', 'cliente', 'razao social', 'nome completo', 'nome do cliente', 'nome cliente', 'razao', 'nome fantasia']],
  ['documento', 'CPF / CNPJ', ['cpf/cnpj', 'cpf', 'cnpj', 'cpf cnpj', 'cpf ou cnpj', 'documento', 'cnpj/cpf']],
  ['telefone', 'Telefone / WhatsApp', ['telefone', 'celular', 'whatsapp', 'fone', 'tel', 'telefone 1', 'contato telefonico']],
  ['telefone2', 'Outro telefone', ['telefone 2', 'telefone2', 'fone 2', 'tel 2', 'telefone fixo', 'fixo']],
  ['email', 'E-mail', ['email', 'e-mail', 'e mail']],
  ['endereco', 'Endereço (rua)', ['endereco', 'logradouro', 'rua', 'end']],
  ['numero', 'Número', ['numero', 'nº', 'n', 'no', 'num']],
  ['complemento', 'Complemento', ['complemento', 'compl']],
  ['bairro', 'Bairro', ['bairro']],
  ['cidade', 'Cidade', ['cidade', 'municipio']],
  ['uf', 'Estado (UF)', ['uf', 'estado']],
  ['cep', 'CEP', ['cep']],
  ['contato', 'Contato responsável', ['contato', 'responsavel', 'pessoa de contato']],
  ['imovel', 'Tipo de imóvel', ['tipo de imovel', 'imovel', 'tipo imovel', 'tipo do imovel']],
  ['obs', 'Observações', ['obs', 'observacao', 'observacoes', 'anotacoes', 'notas']],
];
const normalizar = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[:.]/g, '').replace(/\s+/g, ' ').trim();
const digitos = (s) => String(s || '').replace(/\D/g, '');

// Lê o arquivo aceitando UTF-8 ou o formato padrão do Excel no Windows.
async function lerArquivoTexto(arq) {
  const buf = await arq.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}
// Lê um CSV separado por ponto e vírgula, vírgula ou tabulação (com suporte a aspas).
function lerCSV(texto) {
  texto = texto.replace(/^\uFEFF/, '');
  const primeira = texto.split(/\r?\n/)[0];
  const sep = [';', ',', '\t'].map((s) => [s, primeira.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const linhas = [];
  let linha = [], valor = '', aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { valor += '"'; i++; } else aspas = false;
      } else valor += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(valor); valor = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(valor); linhas.push(linha); linha = []; valor = '';
    } else valor += c;
  }
  if (valor || linha.length) { linha.push(valor); linhas.push(linha); }
  return linhas.filter((l) => l.some((v) => v.trim()));
}
// Sugere qual coluna da planilha corresponde a cada campo do cadastro.
function sugerirColunas(cabecalho) {
  const cols = cabecalho.map(normalizar);
  const usadas = new Set();
  const mapa = {};
  for (const exato of [true, false]) {
    for (const [campoNome, , apelidos] of CAMPOS_IMPORTACAO) {
      if (mapa[campoNome] !== undefined) continue;
      const i = cols.findIndex((c, idx) => !usadas.has(idx) && apelidos.some((a) =>
        exato ? c === a : a.length >= 4 && c.startsWith(a)));
      if (i >= 0) { mapa[campoNome] = i; usadas.add(i); }
    }
  }
  return mapa;
}
function montarClienteImportado(linha, mapa) {
  const v = (k) => (mapa[k] === undefined || mapa[k] === '' ? '' : String(linha[mapa[k]] ?? '').trim());
  const c = {
    codigo: v('codigo').replace(/\.0+$/, ''), nome: v('nome'), documento: v('documento'), email: v('email'), bairro: v('bairro'),
    contato: v('contato'), imovel: v('imovel'), cep: v('cep'),
  };
  let endereco = [v('endereco'), v('numero')].filter(Boolean).join(', ');
  if (v('complemento')) endereco += (endereco ? ' - ' : '') + v('complemento');
  c.endereco = endereco;
  c.cidade = [v('cidade'), v('uf')].filter(Boolean).join('/');
  c.telefone = v('telefone') || v('telefone2');
  const obs = [v('obs')];
  if (v('telefone') && v('telefone2')) obs.push('Outro telefone: ' + v('telefone2'));
  c.obs = obs.filter(Boolean).join('\n');
  c.tipo = digitos(c.documento).length === 14 ? 'PJ' : 'PF';
  Object.keys(c).forEach((k) => { if (!c[k]) delete c[k]; });
  return c;
}
// Chave para reconhecer cliente repetido: o código, se houver; senão CPF/CNPJ; senão nome + telefone.
function chaveCliente(c, ignorarCodigo = false) {
  if (c.codigo && !ignorarCodigo) return 'cod:' + normalizar(c.codigo);
  const doc = digitos(c.documento);
  if (doc.length >= 11) return 'doc:' + doc;
  return 'nome:' + normalizar(c.nome) + '|' + digitos(c.telefone);
}
// Gera os próximos códigos numéricos, continuando do maior código já usado
// (mantendo zeros à esquerda, se os códigos existentes usarem, ex.: 00123).
function geradorCodigos(extras = []) {
  const numericos = DB.listar('clientes').map((c) => c.codigo).concat(extras)
    .filter((c) => c && /^\d+$/.test(String(c))).map(String);
  let ultimo = numericos.reduce((m, c) => Math.max(m, Number(c)), 0);
  const largura = numericos.some((c) => c.length > 1 && c[0] === '0') ? Math.max(...numericos.map((c) => c.length)) : 0;
  return () => String(++ultimo).padStart(largura, '0');
}

function importarClientes() {
  abrirModal('Importar clientes de planilha', `
    <div class="importacao">
      <p>Escolha o arquivo <b>.csv</b> com os seus clientes. A primeira linha deve ter os nomes das colunas
        (por exemplo: Nome, Telefone, CPF/CNPJ, Endereço, Bairro, Cidade).</p>
      <p class="ajuda">Se a planilha estiver no Excel (.xlsx), abra no Excel e use <b>Arquivo → Salvar como → CSV</b>.
        No Google Planilhas: <b>Arquivo → Fazer download → CSV</b>.</p>
      <div class="acoes">
        <label class="btn">Escolher arquivo .csv<input type="file" id="arquivo-csv" accept=".csv,text/csv,.txt" hidden></label>
        <button type="button" class="btn sec" id="baixar-modelo">Baixar planilha modelo</button>
      </div>
      <div id="etapa-mapa"></div>
    </div>`, (raiz) => {
    $('#baixar-modelo', raiz).addEventListener('click', () => {
      const modelo = '\uFEFFCódigo;Nome;Telefone;CPF/CNPJ;E-mail;Endereço;Número;Bairro;Cidade;UF;CEP;Observações\n' +
        '1;Maria da Silva;(11) 99999-0000;123.456.789-00;maria@email.com;Rua das Flores;100;Centro;São Paulo;SP;01000-000;Cliente desde 2020\n';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([modelo], { type: 'text/csv;charset=utf-8' }));
      a.download = 'modelo-clientes.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('#arquivo-csv', raiz).addEventListener('change', async (e) => {
      const arq = e.target.files[0];
      e.target.value = '';
      if (!arq) return;
      try {
        const linhas = lerCSV(await lerArquivoTexto(arq));
        if (linhas.length < 2) throw new Error('O arquivo precisa ter a linha de títulos e pelo menos um cliente.');
        etapaMapeamento($('#etapa-mapa', raiz), arq.name, linhas);
      } catch (err) {
        avisar('Não foi possível ler o arquivo: ' + err.message, 'erro');
      }
    });
  });
}

function etapaMapeamento(el, nomeArquivo, linhas) {
  const cabecalho = linhas[0].map((c, i) => c.trim() || `Coluna ${i + 1}`);
  const corpo = linhas.slice(1);
  const mapa = sugerirColunas(cabecalho);
  const opcoesColunas = (sel) => '<option value="">— não importar —</option>' +
    cabecalho.map((c, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(c)}</option>`).join('');
  el.innerHTML = `
    <h3>Arquivo: ${esc(nomeArquivo)} (${corpo.length} linhas)</h3>
    <p class="ajuda">Confira qual coluna da sua planilha vai para cada campo do cadastro. Já deixei sugeridas as que reconheci.</p>
    <div class="grade-mapa">
      ${CAMPOS_IMPORTACAO.map(([k, rotulo]) => `<label>${rotulo}<select data-campo="${k}">${opcoesColunas(mapa[k])}</select></label>`).join('')}
    </div>
    <label class="check-linha"><input type="checkbox" id="pular-dup" checked>
      Pular clientes repetidos (mesmo código; sem código, mesmo CPF/CNPJ ou mesmo nome e telefone) que já estão cadastrados ou aparecem duas vezes na planilha</label>
    <div id="previa"></div>
    <div class="form-acoes"><button type="button" class="btn sec" data-cancelar>Cancelar</button>
      <button type="button" class="btn" id="confirmar-importacao">Importar</button></div>`;

  let resultado = { novos: [], atualizar: [], semNome: 0, repetidos: 0 };
  const calcular = () => {
    $$('[data-campo]', el).forEach((s) => (mapa[s.dataset.campo] = s.value === '' ? undefined : Number(s.value)));
    const pular = $('#pular-dup', el).checked;
    // Clientes já cadastrados, por código e por CPF/CNPJ (ou nome + telefone).
    const porCodigo = new Map(), porChave = new Map();
    DB.listar('clientes').forEach((c) => {
      if (c.codigo) porCodigo.set(normalizar(c.codigo), c);
      porChave.set(chaveCliente(c, true), c);
    });
    const vistosNoArquivo = new Set(), atualizados = new Set();
    resultado = { novos: [], atualizar: [], semNome: 0, repetidos: 0, codigosAuto: 0 };
    for (const linha of corpo) {
      const c = montarClienteImportado(linha, mapa);
      if (!c.nome) { resultado.semNome++; continue; }
      const chave = chaveCliente(c);
      if (pular && vistosNoArquivo.has(chave)) { resultado.repetidos++; continue; }
      vistosNoArquivo.add(chave);
      // Código da planilha já pertence a um cliente cadastrado: é o mesmo cliente.
      if (c.codigo && porCodigo.has(normalizar(c.codigo))) { resultado.repetidos++; continue; }
      const existente = pular && porChave.get(chaveCliente(c, true));
      if (existente) {
        // Cliente já cadastrado sem código (ex.: importado antes): recebe o código da planilha
        // e os dados que estiverem faltando no cadastro.
        if (c.codigo && !existente.codigo && !atualizados.has(existente.id)) {
          const campos = { id: existente.id, codigo: c.codigo };
          Object.keys(c).forEach((k) => { if (k !== 'codigo' && c[k] && !existente[k]) campos[k] = c[k]; });
          resultado.atualizar.push(campos);
          atualizados.add(existente.id);
          porCodigo.set(normalizar(c.codigo), existente);
        } else resultado.repetidos++;
        continue;
      }
      resultado.novos.push(c);
    }
    // Quem veio sem código na planilha recebe um código automático em sequência.
    const gerar = geradorCodigos(resultado.novos.map((c) => c.codigo));
    resultado.novos.forEach((c) => { if (!c.codigo) { c.codigo = gerar(); resultado.codigosAuto++; } });
    const amostra = resultado.novos.slice(0, 5);
    $('#previa', el).innerHTML = `
      <div class="resumo-importacao">
        <span class="tag verde">${resultado.novos.length} novos para importar</span>
        ${resultado.atualizar.length ? `<span class="tag laranja">${resultado.atualizar.length} já cadastrados (receberão o código da planilha)</span>` : ''}
        ${resultado.repetidos ? `<span class="tag amarelo">${resultado.repetidos} repetidos (serão pulados)</span>` : ''}
        ${resultado.semNome ? `<span class="tag vermelho">${resultado.semNome} sem nome (serão pulados)</span>` : ''}
        ${resultado.codigosAuto ? `<span class="tag azul">${resultado.codigosAuto} sem código (receberão código automático)</span>` : ''}
      </div>
      ${amostra.length ? `<b class="rotulo-previa">Prévia dos primeiros clientes:</b>
      <div class="tabela-wrap"><table><thead><tr><th>Cód.</th><th>Nome</th><th>Telefone</th><th>CPF/CNPJ</th><th>Endereço</th><th>Bairro</th><th>Cidade</th></tr></thead><tbody>
        ${amostra.map((c) => `<tr><td>${esc(c.codigo)}</td><td>${esc(c.nome)}</td><td>${esc(c.telefone)}</td><td>${esc(c.documento)}</td><td>${esc(c.endereco)}</td><td>${esc(c.bairro)}</td><td>${esc(c.cidade)}</td></tr>`).join('')}
      </tbody></table></div>` : ''}`;
    const botao = $('#confirmar-importacao', el);
    const n = resultado.novos.length, m = resultado.atualizar.length;
    botao.disabled = !n && !m;
    botao.textContent = [n || !m ? `Importar ${n} cliente${n === 1 ? '' : 's'}` : '', m ? `${n ? 'e a' : 'A'}tualizar ${m}` : ''].filter(Boolean).join(' ');
  };
  el.addEventListener('change', (e) => { if (e.target.matches('[data-campo], #pular-dup')) calcular(); });
  $('[data-cancelar]', el).addEventListener('click', fecharModal);
  $('#confirmar-importacao', el).addEventListener('click', async (e) => {
    if (mapa.nome === undefined) { avisar('Escolha qual coluna tem o nome do cliente.', 'erro'); return; }
    const botao = e.target;
    botao.disabled = true;
    try {
      const m = resultado.atualizar.length;
      if (m) {
        await DB.atualizarVarios('clientes', resultado.atualizar, (feitos, de) => {
          botao.textContent = `Atualizando... ${feitos} de ${de}`;
        });
        resultado.atualizar = [];
      }
      const total = await DB.adicionarVarios('clientes', resultado.novos, (feitos, de) => {
        botao.textContent = `Importando... ${feitos} de ${de}`;
      });
      fecharModal();
      avisar([total ? `${total} clientes importados` : '', m ? `${m} clientes atualizados com o código` : ''].filter(Boolean).join(' e ') + '.');
      render();
    } catch (err) {
      avisar('A importação parou: ' + err.message + ' Os clientes já gravados foram mantidos.', 'erro');
      botao.disabled = false;
      calcular();
    }
  });
  calcular();
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function formCliente(id, aoSalvar) {
  const c = id ? DB.obter('clientes', id) : { tipo: 'PF', codigo: geradorCodigos()() };
  abrirModal(id ? 'Editar cliente' : 'Novo cliente', `
    <form class="form">
      ${campo('Código', 'codigo', c.codigo)}
      <div></div>
      ${campo('Nome / Razão social *', 'nome', c.nome, 'text', 'required full')}
      <label>Tipo<select name="tipo">${opcoes([['PF', 'Pessoa física'], ['PJ', 'Empresa']], c.tipo)}</select></label>
      ${campo('CPF / CNPJ', 'documento', c.documento)}
      ${campo('Telefone / WhatsApp', 'telefone', c.telefone, 'tel')}
      ${campo('E-mail', 'email', c.email, 'email')}
      ${campo('Endereço', 'endereco', c.endereco, 'text', 'full')}
      ${campo('Bairro', 'bairro', c.bairro)}
      ${campo('Cidade', 'cidade', c.cidade)}
      ${campo('CEP', 'cep', c.cep)}
      ${campo('Contato responsável', 'contato', c.contato)}
      ${campo('Tipo de imóvel', 'imovel', c.imovel, 'text', 'placeholder="Casa, apartamento, restaurante..."')}
      ${campo('Observações', 'obs', c.obs, 'textarea', 'full')}
      <div class="form-acoes"><button type="button" class="btn sec" data-cancelar>Cancelar</button><button class="btn">Salvar</button></div>
    </form>`, (raiz) => {
    const form = $('form', raiz);
    $('[data-cancelar]', raiz).addEventListener('click', fecharModal);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const dados = lerForm(form);
      const cod = normalizar(dados.codigo);
      const outro = cod && DB.listar('clientes').find((x) => x.id !== id && normalizar(x.codigo) === cod);
      if (outro) { avisar(`O código ${dados.codigo} já é do cliente ${outro.nome}.`, 'erro'); form.codigo.focus(); return; }
      const salvo = DB.salvarItem('clientes', { ...dados, id: id || undefined });
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
  abrirModal(`Histórico — ${c.codigo ? c.codigo + ' · ' : ''}${c.nome}`, `
    <p>${esc(c.telefone)} · ${esc([c.endereco, c.bairro, c.cidade].filter(Boolean).join(', '))}</p>
    <div class="grade-kpi">
      ${DB.pode('agenda') ? `<div class="kpi"><div class="rotulo">Serviços</div><div class="valor">${ags.length}</div></div>` : ''}
      ${DB.pode('financeiro') ? `<div class="kpi"><div class="rotulo">Total pago</div><div class="valor">${moeda(pago)}</div></div>
      <div class="kpi"><div class="rotulo">Em aberto</div><div class="valor">${moeda(aberto)}</div></div>` : ''}
    </div>
    ${DB.pode('agenda') ? `<h3>Agendamentos</h3>${tabelaAgendamentos(ags, false)}` : ''}
    ${DB.pode('orcamentos') ? `<h3>Orçamentos</h3>${orcs.length ? `<table><thead><tr><th>Nº</th><th>Data</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>
      ${orcs.map((o) => `<tr><td>${o.numero}</td><td>${dataBR(o.data)}</td><td class="num">${moeda(totalOrcamento(o))}</td><td>${tag(o.status, STATUS_ORC)}</td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Nenhum orçamento.</div>'}` : ''}
    ${DB.pode('laudos') ? `<h3>Laudos</h3>${lds.length ? `<table><thead><tr><th>Nº</th><th>Data</th><th>Pragas</th><th>Garantia até</th></tr></thead><tbody>
      ${lds.map((l) => `<tr><td>${l.numero}</td><td>${dataBR(l.data)}</td><td>${esc(l.pragas)}</td><td>${l.garantiaDias ? dataBR(somarDias(l.data, l.garantiaDias)) : '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Nenhum laudo.</div>'}` : ''}
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
  const porDia = {};
  DB.listar('agendamentos').forEach((a) => (porDia[a.data] = porDia[a.data] || []).push(a));
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
        <button class="btn sec" id="ant" aria-label="Mês anterior">&lsaquo;</button><strong>${tituloMes}</strong><button class="btn sec" id="prox" aria-label="Próximo mês">&rsaquo;</button>
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
  const criaCliente = DB.pode('clientes');
  abrirModal(id ? 'Editar agendamento' : 'Novo agendamento', `
    <form class="form">
      ${campoCliente(a.clienteId, { extra: criaCliente ? '<button type="button" class="btn sec" id="cli-rapido" title="Cadastrar cliente">+ Novo</button>' : '' })}
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
    ligarCampoCliente(raiz);
    $('[data-cancelar]', raiz).addEventListener('click', fecharModal);
    if (criaCliente) {
      $('#cli-rapido', raiz).addEventListener('click', () => {
        const rascunho = lerForm(form);
        formCliente(null, (cli) => formAgendamento(id, { ...rascunho, clienteId: cli.id }));
      });
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!clienteValido(form)) return;
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
  const agendar = DB.pode('agenda');
  el.innerHTML = `
    <div class="cabecalho"><h2>Orçamentos</h2><button class="btn" id="novo">+ Novo orçamento</button></div>
    <div class="cartao" style="padding:0">${lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th class="num">Total</th><th>Status</th><th>Ações</th></tr></thead><tbody>
      ${lista.map((o) => `<tr><td>${o.numero}</td><td>${dataBR(o.data)}</td><td>${esc(nomeCliente(o.clienteId))}</td>
        <td class="num">${moeda(totalOrcamento(o))}</td><td>${tag(o.status, STATUS_ORC)}</td>
        <td><div class="acoes">
          <button class="btn peq" data-acao="imprimir" data-id="${o.id}">Imprimir / PDF</button>
          ${o.status === 'pendente' ? `<button class="btn sec peq" data-acao="aprovar" data-id="${o.id}">${agendar ? 'Aprovar e agendar' : 'Aprovar'}</button>` : ''}
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
      if (!agendar) { render(); return; }
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
      ${campoCliente(o.clienteId)}
      ${campo('Data', 'data', o.data, 'date', 'required')}
      ${campo('Validade (dias)', 'validadeDias', o.validadeDias, 'number', 'min="1"')}
      ${editorLinhas(COLS_ORC, o.itens || [])}
      ${campo('Desconto (R$)', 'desconto', o.desconto, 'number', 'step="0.01" min="0"')}
      <label>Status<select name="status">${opcoes(STATUS_ORC, o.status)}</select></label>
      <div class="full total-linha" id="total"></div>
      ${campo('Forma de pagamento', 'pagamento', o.pagamento, 'text', 'full')}
      ${campo('Garantia / condições', 'condicoes', o.condicoes, 'textarea', 'full')}
      <div class="form-acoes"><button type="button" class="btn sec" data-cancelar>Cancelar</button><button class="btn" id="salvar">Salvar</button></div>
    </form>`, (raiz) => {
    const form = $('form', raiz);
    ligarCampoCliente(raiz);
    const atualizar = () => {
      $('#total', raiz).textContent = 'Total: ' + moeda(totalOrcamento({ itens: lerLinhas(raiz, COLS_ORC), desconto: form.desconto.value }));
    };
    ligarLinhas(raiz, COLS_ORC, atualizar);
    form.desconto.addEventListener('input', atualizar);
    atualizar();
    $('[data-cancelar]', raiz).addEventListener('click', fecharModal);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!clienteValido(form)) return;
      const dados = lerForm(form);
      const itens = lerLinhas(raiz, COLS_ORC);
      if (!itens.length) { avisar('Adicione pelo menos um item ao orçamento.', 'erro'); return; }
      enviando($('#salvar', raiz), async () => {
        const numero = id ? o.numero : await DB.proximoNumero('orcamento');
        DB.salvarItem('orcamentos', { ...dados, itens, desconto: num(dados.desconto), id: id || undefined, numero });
        fecharModal();
        render();
      });
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
      ${campoCliente(l.clienteId)}
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
      <div class="form-acoes"><button type="button" class="btn sec" data-cancelar>Cancelar</button><button class="btn" id="salvar">Salvar</button></div>
    </form>`, (raiz) => {
    const form = $('form', raiz);
    ligarCampoCliente(raiz);
    ligarLinhas(raiz, COLS_PROD);
    $('[data-cancelar]', raiz).addEventListener('click', fecharModal);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!clienteValido(form)) return;
      const dados = lerForm(form);
      const produtos = lerLinhas(raiz, COLS_PROD);
      enviando($('#salvar', raiz), async () => {
        const numero = id ? l.numero : await DB.proximoNumero('laudo');
        DB.salvarItem('laudos', { ...dados, produtos, id: id || undefined, numero });
        fecharModal();
        if (rotaAtual() === 'laudos') render(); else irPara('laudos');
      });
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
      <div class="kpi"><div class="rotulo">Receitas do mês</div><div class="valor" style="color:var(--primaria)">${moeda(receitas)}</div></div>
      <div class="kpi"><div class="rotulo">Despesas do mês</div><div class="valor" style="color:var(--vermelho)">${moeda(despesas)}</div></div>
      <div class="kpi"><div class="rotulo">Resultado previsto</div><div class="valor">${moeda(receitas - despesas)}</div></div>
      <div class="kpi"><div class="rotulo">Recebido / a receber</div><div class="valor" style="font-size:18px">${moeda(recebido)} / ${moeda(aReceber)}</div></div>
    </div>
    <div class="cartao" style="padding:0">${lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Cliente</th><th>Categoria</th><th class="num">Valor</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
      ${lista.map((f) => {
        const sit = f.pago ? `<span class="tag verde">${f.tipo === 'receita' ? 'Recebido' : 'Pago'}${f.dataPagamento ? ' ' + dataBR(f.dataPagamento) : ''}</span>`
          : f.vencimento < hoje ? '<span class="tag vermelho">Vencido</span>' : '<span class="tag amarelo">Em aberto</span>';
        return `<tr><td>${dataBR(f.vencimento)}</td><td>${esc(f.descricao)}</td><td>${f.clienteId ? esc(nomeCliente(f.clienteId)) : ''}</td><td>${esc(f.categoria)}</td>
        <td class="num" style="color:${f.tipo === 'receita' ? 'var(--primaria)' : 'var(--vermelho)'}">${f.tipo === 'despesa' ? '- ' : ''}${moeda(f.valor)}</td><td>${sit}</td>
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
      ${campoCliente(f.clienteId, { obrigatorio: false })}
      <label>Forma de pagamento<select name="forma">${opcoes([['', '—'], ['pix', 'PIX'], ['dinheiro', 'Dinheiro'], ['cartao', 'Cartão'], ['boleto', 'Boleto'], ['transferencia', 'Transferência']], f.forma)}</select></label>
      <label class="check"><input type="checkbox" name="pago" ${f.pago ? 'checked' : ''}> Já ${f.tipo === 'despesa' ? 'pago' : 'recebido'}</label>
      ${campo('Observações', 'obs', f.obs, 'textarea', 'full')}
      <div class="form-acoes"><button type="button" class="btn sec" data-cancelar>Cancelar</button><button class="btn">Salvar</button></div>
    </form>`, (raiz) => {
    const form = $('form', raiz);
    ligarCampoCliente(raiz);
    $('[data-cancelar]', raiz).addEventListener('click', fecharModal);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!clienteValido(form)) return;
      const dados = lerForm(form);
      DB.salvarItem('financeiro', {
        ...dados, tipo: f.tipo, valor: num(dados.valor), id: id || undefined,
        dataPagamento: dados.pago ? (f.dataPagamento || hojeISO()) : '',
      });
      fecharModal();
      if (rotaAtual() === 'financeiro') render(); else irPara('financeiro');
    });
  });
}

/* =====================================================================
   FUNCIONÁRIOS (somente administrador)
   ===================================================================== */
function tagsAcesso(p) {
  if (p.admin) return '<span class="tag laranja">Acesso total</span>';
  const nomes = DB.MODULOS.filter(([m]) => (p.permissoes || []).includes(m)).map(([, r]) => `<span class="tag cinza">${r}</span>`);
  return nomes.length ? nomes.join(' ') : '<span class="tag vermelho">Nenhum</span>';
}

async function funcionarios(el) {
  el.innerHTML = `
    <div class="cabecalho"><h2>Funcionários</h2><button class="btn" id="novo">+ Novo funcionário</button></div>
    <p class="ajuda">Defina aqui quem pode entrar no sistema e quais áreas cada funcionário pode acessar.
      Quem não tem acesso a uma área não a vê no menu e também é bloqueado pelo banco de dados.</p>
    <div class="cartao" style="padding:0" id="lista"><div class="vazio">Carregando...</div></div>`;
  $('#novo', el).addEventListener('click', () => formFuncionario(null, () => funcionarios(el)));
  let lista;
  try {
    lista = await DB.listarFuncionarios();
  } catch (e) {
    $('#lista', el).innerHTML = `<div class="vazio">${esc(e.message)}</div>`;
    return;
  }
  if (rotaAtual() !== 'funcionarios' || !$('#lista', el)) return;
  const eu = DB.perfil().id;
  $('#lista', el).innerHTML = `<div class="tabela-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Acesso</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
    ${lista.map((p) => `<tr><td><b>${esc(p.nome || '—')}</b>${p.id === eu ? ' <span class="tag azul">você</span>' : ''}</td><td>${esc(p.email)}</td>
      <td>${tagsAcesso(p)}</td>
      <td>${p.ativo ? '<span class="tag verde">Ativo</span>' : '<span class="tag amarelo">Bloqueado</span>'}</td>
      <td><button class="btn sec peq" data-id="${p.id}">Editar acesso</button></td></tr>`).join('')}
  </tbody></table></div>`;
  $('#lista', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) formFuncionario(lista.find((p) => p.id === b.dataset.id), () => funcionarios(el));
  });
}

function formFuncionario(p, aoSalvar) {
  const novo = !p;
  const f = p || { admin: false, ativo: true, permissoes: ['clientes', 'agenda'] };
  const euMesmo = !novo && p.id === DB.perfil().id;
  abrirModal(novo ? 'Novo funcionário' : `Acesso de ${p.nome || p.email}`, `
    <form class="form">
      ${campo('Nome *', 'nome', f.nome, 'text', 'required')}
      ${novo ? campo('E-mail (login) *', 'email', '', 'email', 'required autocomplete="off"')
             : `<label>E-mail (login)<input value="${esc(f.email)}" disabled></label>`}
      ${novo ? campo('Senha inicial * (mín. 6 caracteres)', 'senha', '', 'text', 'required minlength="6" autocomplete="off"') : ''}
      <div class="full permissoes">
        <b>O que este funcionário pode acessar?</b>
        <label class="check destaque"><input type="checkbox" name="admin" ${f.admin ? 'checked' : ''} ${euMesmo ? 'disabled' : ''}>
          Acesso total (administrador): vê tudo, inclusive financeiro, funcionários e configurações</label>
        <div class="grade-perm">
          ${DB.MODULOS.map(([m, r]) => `<label class="check"><input type="checkbox" name="perm_${m}" ${(f.permissoes || []).includes(m) ? 'checked' : ''}> ${r}</label>`).join('')}
        </div>
      </div>
      ${novo ? '' : `<label class="check full"><input type="checkbox" name="ativo" ${f.ativo ? 'checked' : ''} ${euMesmo ? 'disabled' : ''}>
        Pode entrar no sistema (desmarque para bloquear o acesso deste funcionário)</label>`}
      ${euMesmo ? '<p class="ajuda full">Você não pode remover o seu próprio acesso de administrador.</p>' : ''}
      <div class="form-acoes">
        ${novo ? '' : '<button type="button" class="btn sec" id="reset-senha" style="margin-right:auto">Enviar e-mail para trocar senha</button>'}
        <button type="button" class="btn sec" data-cancelar>Cancelar</button><button class="btn" id="salvar">Salvar</button>
      </div>
    </form>`, (raiz) => {
    const form = $('form', raiz);
    const cbAdmin = form.admin;
    const sincronizar = () => $$('.grade-perm input', raiz).forEach((cb) => (cb.disabled = cbAdmin.checked));
    cbAdmin.addEventListener('change', sincronizar);
    sincronizar();
    $('[data-cancelar]', raiz).addEventListener('click', fecharModal);
    if (!novo) {
      $('#reset-senha', raiz).addEventListener('click', (e) => enviando(e.target, async () => {
        await DB.enviarRedefinicaoSenha(p.email);
        avisar(`E-mail de troca de senha enviado para ${p.email}.`);
      }));
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = lerForm(form);
      const campos = {
        nome: d.nome,
        admin: euMesmo ? true : d.admin,
        permissoes: DB.MODULOS.map(([m]) => m).filter((m) => d['perm_' + m]),
      };
      if (!novo) campos.ativo = euMesmo ? true : d.ativo;
      enviando($('#salvar', raiz), async () => {
        if (novo) await DB.criarFuncionario({ ...campos, email: d.email, senha: d.senha });
        else await DB.atualizarFuncionario(p.id, campos);
        if (euMesmo) montarPerfil();
        fecharModal();
        avisar(novo ? 'Funcionário cadastrado. Ele já pode entrar com o e-mail e a senha informados.' : 'Acesso atualizado.');
        aoSalvar();
      });
    });
  });
}

function formMinhaSenha() {
  abrirModal('Alterar minha senha', `
    <form class="form">
      ${campo('Nova senha *', 'senha', '', 'password', 'required minlength="6" autocomplete="new-password"')}
      ${campo('Repita a nova senha *', 'senha2', '', 'password', 'required minlength="6" autocomplete="new-password"')}
      <div class="form-acoes"><button type="button" class="btn sec" data-cancelar>Cancelar</button><button class="btn" id="salvar">Salvar</button></div>
    </form>`, (raiz) => {
    const form = $('form', raiz);
    $('[data-cancelar]', raiz).addEventListener('click', fecharModal);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = lerForm(form);
      if (d.senha !== d.senha2) { avisar('As senhas não conferem.', 'erro'); return; }
      enviando($('#salvar', raiz), async () => {
        await DB.alterarMinhaSenha(d.senha);
        fecharModal();
        avisar('Senha alterada com sucesso.');
      });
    });
  });
}

/* =====================================================================
   CONFIGURAÇÕES (somente administrador)
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
        <div class="form-acoes"><button class="btn" id="salvar-cfg">Salvar dados</button></div>
      </form></div>
    <div class="cartao"><h3>Backup dos dados</h3>
      <p class="ajuda">Os dados ficam guardados no banco de dados na nuvem. Mesmo assim, é bom baixar uma cópia de vez em quando.
        A restauração também serve para importar os dados da versão anterior do sistema (que guardava no navegador).</p>
      <div class="acoes">
        <button class="btn" id="exportar">Baixar backup</button>
        <label class="btn sec">Restaurar / importar backup<input type="file" id="importar" accept="application/json,.json" hidden></label>
      </div></div>`;
  $('#form-cfg', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const dados = lerForm(e.target);
    enviando($('#salvar-cfg', el), async () => {
      await DB.salvarConfig(dados);
      avisar('Dados da empresa salvos.');
    });
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
    e.target.value = '';
    if (!arq) return;
    if (!confirmar('Os registros do backup serão gravados no banco (registros com o mesmo código serão substituídos). Continuar?')) return;
    try {
      avisar('Importando...');
      await DB.importar(await arq.text());
      avisar('Backup importado com sucesso!');
      render();
    } catch (err) {
      avisar('Não foi possível importar: ' + err.message, 'erro');
    }
  });
}

/* =====================================================================
   INICIALIZAÇÃO E LOGIN
   ===================================================================== */
function mostrarTela(id) {
  ['carregando', 'tela-login', 'tela-aviso', 'app'].forEach((t) => ($('#' + t).hidden = t !== id));
}
function mostrarAviso(html) {
  $('#aviso-texto').innerHTML = html;
  mostrarTela('tela-aviso');
}

async function entrarNoApp(perfil) {
  if (!perfil) { mostrarTela('tela-login'); return; }
  if (!perfil.ativo) {
    mostrarAviso(`<p>Olá${perfil.nome ? ', ' + esc(perfil.nome) : ''}! Seu acesso ainda não foi liberado.</p>
      <p class="ajuda">Peça ao administrador para liberar o seu login na tela "Funcionários".</p>
      <button class="btn" id="aviso-sair">Voltar</button>`);
    $('#aviso-sair').addEventListener('click', async () => { await DB.sair(); mostrarTela('tela-login'); });
    return;
  }
  mostrarTela('carregando');
  await DB.carregar();
  montarMenu();
  mostrarTela('app');
  history.replaceState({ rota: rotaAtiva }, '', location.pathname + location.search);
  render();
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = lerForm(e.target);
  const erro = $('#login-erro');
  const botao = $('button', e.target);
  erro.hidden = true;
  botao.disabled = true;
  botao.textContent = 'Entrando...';
  try {
    const perfil = await DB.entrar(d.email, d.senha);
    e.target.reset();
    await entrarNoApp(perfil);
  } catch (err) {
    erro.textContent = DB.traduzirErro(err);
    erro.hidden = false;
    mostrarTela('tela-login');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Entrar';
  }
});

async function sair() {
  abrirMenuPerfil(false);
  await DB.sair();
  rotaAtiva = 'painel';
  try { sessionStorage.removeItem('berbert-rota'); } catch { /* sem armazenamento */ }
  history.replaceState(null, '', location.pathname + location.search);
  mostrarTela('tela-login');
}

DB.definirAoErro((msg) => avisar(msg, 'erro'));
ligarAcoesAgendamento($('#view'));

(async () => {
  if (!DB.configurado()) {
    mostrarAviso(`<h3>Banco de dados não configurado</h3>
      <p class="ajuda">Preencha o endereço e a chave do Supabase no arquivo <code>js/config.js</code>.
      O passo a passo completo está no arquivo README do projeto.</p>`);
    return;
  }
  try {
    await entrarNoApp(await DB.iniciar());
  } catch (e) {
    mostrarAviso(`<p>Não foi possível conectar ao banco de dados.</p><p class="ajuda">${esc(DB.traduzirErro(e))}</p>
      <button class="btn" id="tentar">Tentar novamente</button>`);
    $('#tentar').addEventListener('click', () => location.reload());
  }
})();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
