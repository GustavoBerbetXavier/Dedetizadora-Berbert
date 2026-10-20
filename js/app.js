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
function avisar(msg, tipo = 'ok', duracao) {
  const el = $('#aviso-flutuante');
  el.textContent = msg;
  el.className = tipo;
  el.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => (el.hidden = true), duracao || (tipo === 'erro' ? 6000 : 2500));
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
  ligacoes: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  cadastros: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7M17.5 14v7"/>',
  sino: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
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
  // Página de um cliente: 'cliente/<id>' (ou 'cliente/novo'); no menu, acende "Clientes".
  { rota: 'cliente', titulo: 'Cliente', modulo: 'clientes', fn: paginaCliente, foraDoMenu: true, menu: 'clientes' },
  { rota: 'agenda', titulo: 'Agenda', modulo: 'agenda', fn: agenda },
  { rota: 'orcamentos', titulo: 'Orçamentos', modulo: 'orcamentos', fn: orcamentos },
  { rota: 'laudos', titulo: 'Laudos', modulo: 'laudos', fn: laudos },
  // Página de um laudo: 'laudo/<id>', 'laudo/novo' (dedetização) ou 'laudo/novo-caixa' (caixa d'água).
  { rota: 'laudo', titulo: 'Laudo', modulo: 'laudos', fn: paginaLaudo, foraDoMenu: true, menu: 'laudos' },
  { rota: 'financeiro', titulo: 'Financeiro', modulo: 'financeiro', fn: financeiro },
  { rota: 'ligacoes', titulo: 'Ligações', modulo: 'ligacoes', fn: ligacoes },
  // Página de uma ordem/orçamento: 'orcamento/<id>' (ou 'orcamento/novo').
  { rota: 'orcamento', titulo: 'Ordem', modulo: 'orcamentos', fn: paginaOrcamento, foraDoMenu: true, menu: 'orcamentos' },
  { rota: 'cadastros', titulo: 'Cadastros', modulo: 'admin', fn: cadastros },
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
  const [base, ...resto] = rotaAtual().split('/');
  let r = ROTAS.find((x) => x.rota === base) || ROTAS[0];
  if (!rotaPermitida(r)) r = ROTAS[0];
  $$('.menu a').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === (r.menu || r.rota)));
  $('#menu').classList.remove('aberto');
  window.scrollTo(0, 0);
  r.fn($('#view'), resto.join('/'));
  atualizarNotificacoes();
}
// Busca alterações feitas por outros funcionários (ao trocar de tela ou voltar ao app).
/* ---------- Notificações de contas a pagar ---------- */
// Contas a pagar (despesas não pagas) vencidas, que vencem hoje ou amanhã.
function alertasContas() {
  if (!DB.perfil() || !DB.pode('financeiro')) return [];
  const hoje = hojeISO(), amanha = somarDias(hoje, 1);
  return DB.listar('financeiro')
    .filter((f) => f.tipo === 'despesa' && !f.pago && f.vencimento && f.vencimento <= amanha)
    .map((f) => ({ f, quando: f.vencimento < hoje ? 'vencida' : f.vencimento === hoje ? 'hoje' : 'amanha' }))
    .sort((a, b) => a.f.vencimento.localeCompare(b.f.vencimento));
}
const TEXTO_ALERTA = { amanha: 'Vence amanhã', hoje: 'Vence hoje', vencida: 'Vencida' };
const COR_ALERTA = { amanha: 'amarelo', hoje: 'laranja', vencida: 'vermelho' };

function atualizarNotificacoes() {
  const caixa = $('#notif');
  if (!DB.perfil() || !DB.pode('financeiro')) { caixa.hidden = true; return; }
  caixa.hidden = false;
  const alertas = alertasContas();
  $('#notif-btn').innerHTML = icone('sino') + (alertas.length ? `<span class="notif-badge">${alertas.length > 99 ? '99+' : alertas.length}</span>` : '');
  const permissao = 'Notification' in window ? Notification.permission : 'indisponivel';
  $('#notif-painel').innerHTML = `
    <div class="notif-cab">Contas a pagar</div>
    ${alertas.length ? alertas.map(({ f, quando }) => `<button class="notif-item" data-conta="${f.id}">
        <span class="tag ${COR_ALERTA[quando]}">${TEXTO_ALERTA[quando]}</span>
        <b>${esc(f.descricao)}</b>
        <small>${moeda(f.valor)} · vencimento ${dataBR(f.vencimento)}</small>
      </button>`).join('') : '<div class="notif-vazio">Nenhuma conta vencida ou vencendo hoje e amanhã.</div>'}
    <div class="notif-rodape">
      <button class="btn sec peq" id="notif-ver">Ver contas a pagar</button>
      ${permissao === 'default' ? '<button class="btn peq" id="notif-ativar">Ativar avisos neste aparelho</button>' : ''}
      ${permissao === 'denied' ? '<span class="ajuda" style="margin:0">Avisos bloqueados no navegador. Libere nas configurações do site.</span>' : ''}
    </div>`;
  notificarAparelho(alertas);
}
function abrirContasAPagar() {
  $('#notif-painel').hidden = true;
  estadoFin.tipo = 'apagar';
  if (rotaAtual() === 'financeiro') render(); else irPara('financeiro');
}
$('#notif-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const p = $('#notif-painel');
  p.hidden = !p.hidden;
  $('#notif-btn').setAttribute('aria-expanded', String(!p.hidden));
});
$('#notif-painel').addEventListener('click', async (e) => {
  if (e.target.closest('#notif-ativar')) {
    await Notification.requestPermission();
    atualizarNotificacoes();
    if (Notification.permission === 'granted') avisar('Pronto! Este aparelho vai avisar das contas a vencer.');
    return;
  }
  if (e.target.closest('#notif-ver') || e.target.closest('[data-conta]')) abrirContasAPagar();
});
document.addEventListener('click', (e) => {
  if (!$('#notif-painel').hidden && !e.target.closest('#notif')) $('#notif-painel').hidden = true;
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.abrir === 'financeiro' && DB.perfil()) abrirContasAPagar(); });
}

// Mostra a notificação do aparelho (celular/computador) uma vez por dia para cada conta.
let resumoMostrado = false;
async function notificarAparelho(alertas) {
  const hoje = hojeISO();
  const avisar1x = alertas.filter(({ quando }) => quando !== 'vencida');
  if (!resumoMostrado && alertas.length) {
    resumoMostrado = true;
    const amanha = alertas.filter((a) => a.quando === 'amanha');
    const msg = amanha.length === 1 ? `Amanhã vence: ${amanha[0].f.descricao} (${moeda(amanha[0].f.valor)})`
      : `Você tem ${alertas.length} conta(s) a pagar vencida(s) ou vencendo. Veja no sininho.`;
    avisar(msg, 'ok', 7000);
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const vencidas = alertas.filter((a) => a.quando === 'vencida');
  const pendentes = avisar1x.map(({ f, quando }) => ({
    chave: `berbert-notif-${f.id}-${quando}-${hoje}`,
    titulo: quando === 'amanha' ? 'Conta vence amanhã' : 'Conta vence hoje',
    corpo: `${quando === 'amanha' ? 'Amanhã' : 'Hoje'} vence: ${f.descricao} — ${moeda(f.valor)}`,
    tag: `conta-${f.id}`,
  }));
  if (vencidas.length) {
    pendentes.push({ chave: `berbert-notif-vencidas-${hoje}`, titulo: 'Contas vencidas',
      corpo: `${vencidas.length} conta(s) a pagar já venceu(ram) e não foi(ram) paga(s).`, tag: 'contas-vencidas' });
  }
  for (const n of pendentes) {
    try { if (localStorage.getItem(n.chave)) continue; localStorage.setItem(n.chave, '1'); } catch { /* sem armazenamento */ }
    const opcoes = { body: n.corpo, icon: 'img/app-192.png', badge: 'img/favicon.png', tag: n.tag };
    try {
      const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
      if (reg) await reg.showNotification(n.titulo, opcoes); else new Notification(n.titulo, opcoes);
    } catch { /* navegador não permitiu */ }
  }
}
// Confere as contas de tempos em tempos (inclusive lançadas por outros funcionários).
setInterval(async () => {
  if (!DB.perfil() || $('#app').hidden) return;
  if (DB.carregadoHa() > 10 * 60 * 1000) { try { await DB.carregar(); } catch { /* tenta depois */ } }
  atualizarNotificacoes();
}, 15 * 60 * 1000);

// Avisa quando uma versão nova do sistema foi publicada, para ninguém usar uma versão antiga
// (uma aba aberta continua com a versão de quando foi carregada).
const VERSAO_APP = '2026-10-20.5';
async function verificarVersao() {
  try {
    const r = await fetch('versao.json', { cache: 'no-store' });
    const { versao } = await r.json();
    if (versao && versao !== VERSAO_APP) $('#nova-versao').hidden = false;
  } catch { /* sem conexão: tenta de novo depois */ }
}
$('#nova-versao-btn').addEventListener('click', () => location.reload());
setInterval(verificarVersao, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) verificarVersao(); });
verificarVersao();

async function atualizarDados() {
  if (!DB.perfil() || $('#app').hidden || DB.carregadoHa() < 20000) return;
  const rota = rotaAtual();
  try {
    await DB.carregar();
    // Na página de um cliente não redesenha, para não perder o que estiver sendo digitado.
    if (rota === rotaAtual() && $('#modal').hidden && !/^(cliente|orcamento)\//.test(rota)) render();
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
const STATUS_ORC = [['pendente', 'Pendente'], ['em_execucao', 'Em Execução'], ['executado', 'Executado'], ['finalizado', 'Finalizado'], ['cancelado', 'Cancelado']];
// Situações usadas antes no app, convertidas para as atuais.
const STATUS_ORC_ANTIGO = { aprovado: 'em_execucao', recusado: 'cancelado' };
const statusOrc = (o) => STATUS_ORC_ANTIGO[o.status] || o.status || 'pendente';
const COR_STATUS = { agendado: 'azul', concluido: 'verde', cancelado: 'cinza', pendente: 'amarelo', em_execucao: 'azul', executado: 'laranja', finalizado: 'verde' };
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
  const orcPend = DB.listar('orcamentos').filter((o) => statusOrc(o) === 'pendente').length;

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
  if (DB.pode('clientes')) $('#novo-cli', el).addEventListener('click', () => abrirCliente('novo'));
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

/* ---------- Filtros guardados na sessão (sobrevivem ao F5) ---------- */
function carregarEstado(nome, padrao) {
  try { return { ...padrao, ...JSON.parse(sessionStorage.getItem('berbert-estado-' + nome) || '{}') }; } catch { return padrao; }
}
function guardarEstado(nome, estado) {
  try { sessionStorage.setItem('berbert-estado-' + nome, JSON.stringify(estado)); } catch { /* sem armazenamento */ }
}

/* ---------- Paginação (usada em Clientes e Orçamentos) ---------- */
const POR_PAGINA = 10;
function paginar(lista, estado) {
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  estado.pagina = Math.min(Math.max(1, estado.pagina), paginas);
  const pag = estado.pagina;
  return {
    itens: lista.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA),
    html: `<div class="paginacao">
      <button class="btn sec peq" data-pag="anterior" ${pag <= 1 ? 'disabled' : ''}>Anterior</button>
      <span>Página: <input type="number" class="pag-num" min="1" max="${paginas}" value="${pag}" aria-label="Página"> de ${paginas}</span>
      <button class="btn sec peq" data-pag="proxima" ${pag >= paginas ? 'disabled' : ''}>Próxima</button>
      <span class="pag-total">Total: ${lista.length.toLocaleString('pt-BR')}</span>
    </div>`,
  };
}
function ligarPaginacao(caixa, estado, desenhar) {
  caixa.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pag]');
    if (!b || b.disabled) return;
    estado.pagina += b.dataset.pag === 'proxima' ? 1 : -1;
    desenhar();
    caixa.scrollIntoView({ block: 'nearest' });
  });
  caixa.addEventListener('change', (e) => {
    if (!e.target.matches('.pag-num')) return;
    estado.pagina = parseInt(e.target.value, 10) || 1;
    desenhar();
  });
}

/* =====================================================================
   CLIENTES
   ===================================================================== */
// Página e filtros da lista ficam guardados ao editar um cliente ou voltar à tela.
const estadoClientes = carregarEstado('clientes', { pagina: 1, busca: '', campo: 'todos', situacao: 'todos' });
const FILTROS_CLIENTE = [
  ['todos', 'Todos os campos', 'Buscar por código, nome, telefone, cidade...'],
  ['nome', 'Razão Social', 'Digite a razão social ou nome...'],
  ['fantasia', 'Fantasia', 'Digite o nome fantasia...'],
  ['documento', 'CNPJ/CPF', 'Digite o CNPJ ou CPF...'],
  ['cidade', 'Cidade', 'Digite a cidade...'],
  ['codigo', 'Código', 'Digite o código exato...'],
];
const clienteAtivo = (c) => c.ativo !== false;
function filtrarClientes(lista, { campo, busca, situacao }) {
  const nq = normalizar(busca), dq = digitos(busca);
  return lista.filter((c) => {
    if (situacao === 'ativos' && !clienteAtivo(c)) return false;
    if (situacao === 'inativos' && clienteAtivo(c)) return false;
    if (!nq) return true;
    switch (campo) {
      case 'nome': return normalizar(c.nome).includes(nq);
      case 'fantasia': return normalizar(c.fantasia).includes(nq);
      case 'documento': return dq ? digitos(c.documento).includes(dq) : normalizar(c.documento).includes(nq);
      case 'cidade': return normalizar(c.cidade).includes(nq);
      case 'codigo': return normalizar(c.codigo) === nq;
      default:
        return normalizar([c.codigo, c.nome, c.fantasia, c.telefone, c.cidade, c.bairro, c.documento].join(' ')).includes(nq)
          || (dq.length >= 3 && (digitos(c.telefone).includes(dq) || digitos(c.documento).includes(dq)));
    }
  });
}

function clientes(el) {
  const placeholder = () => (FILTROS_CLIENTE.find(([v]) => v === estadoClientes.campo) || FILTROS_CLIENTE[0])[2];
  el.innerHTML = `
    <div class="cabecalho"><h2>Clientes</h2>
      <div class="acoes">
      ${DB.perfil().admin ? '<button class="btn sec perigo-texto" id="excluir-tudo">Excluir tudo</button>' : ''}
      <button class="btn sec" id="importar">Importar planilha</button>
      <button class="btn" id="novo">+ Novo cliente</button></div></div>
    <div class="filtros">
      <label>Filtrar por<select id="f-campo">${opcoes(FILTROS_CLIENTE.map(([v, r]) => [v, r]), estadoClientes.campo)}</select></label>
      <label class="filtro-busca">Busca<input class="busca" id="busca" placeholder="${placeholder()}" value="${esc(estadoClientes.busca)}"></label>
      <label>Situação<select id="f-situacao">${opcoes([['todos', 'Ativos e inativos'], ['ativos', 'Ativos'], ['inativos', 'Inativos']], estadoClientes.situacao)}</select></label>
    </div>
    <div id="aviso-codigos"></div>
    <div class="cartao" style="padding:0"><div id="lista"></div></div>`;
  const semCodigo = DB.listar('clientes').filter((c) => !c.codigo);
  const repetidos = semCodigo.length ? encontrarRepetidos() : [];
  if (repetidos.length) {
    // Enquanto houver repetidos, não oferece gerar códigos (senão as cópias também ganhariam código).
    $('#aviso-codigos', el).innerHTML = `<div class="cartao aviso-linha alerta">
      <span><b>${repetidos.length} clientes estão repetidos:</b> existem duas vezes no cadastro, uma com código e outra sem.</span>
      ${DB.perfil().admin ? '<button class="btn peq" id="ver-repetidos">Ver e remover repetidos</button>'
        : '<span class="ajuda" style="margin:0">Peça ao administrador para remover os repetidos.</span>'}</div>`;
    if (DB.perfil().admin) $('#ver-repetidos', el).addEventListener('click', () => telaRepetidos(repetidos));
  } else if (semCodigo.length) {
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
    const todos = filtrarClientes(DB.listar('clientes'), estadoClientes)
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const { itens: lista, html: rodape } = paginar(todos, estadoClientes);
    guardarEstado('clientes', estadoClientes);
    $('#lista', el).innerHTML = lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Cód.</th><th>Razão social / Nome</th><th>Telefone</th><th>Bairro / Cidade</th><th>Tipo</th><th>Ações</th></tr></thead><tbody>
      ${lista.map((c) => `<tr class="${clienteAtivo(c) ? '' : 'inativo'}"><td class="cod-col">${esc(c.codigo || '—')}</td>
        <td><a href="#" class="link-cliente" data-acao="abrir" data-id="${c.id}">${esc(c.nome)}</a>${clienteAtivo(c) ? '' : ' <span class="tag cinza">Inativo</span>'}${anotacoesAtivas(c).length ? ` <span class="tag azul" title="Anotações">${anotacoesAtivas(c).length} anot.</span>` : ''}${c.fantasia ? `<div class="sub">${esc(c.fantasia)}</div>` : ''}</td>
        <td>${esc(c.telefone)}</td><td>${esc([c.bairro, c.cidade].filter(Boolean).join(' / '))}</td>
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
  $('#busca', el).addEventListener('input', (e) => {
    estadoClientes.busca = e.target.value;
    estadoClientes.pagina = 1;
    desenhar();
  });
  $('#f-campo', el).addEventListener('change', (e) => {
    estadoClientes.campo = e.target.value;
    estadoClientes.pagina = 1;
    $('#busca', el).placeholder = placeholder();
    $('#busca', el).focus();
    desenhar();
  });
  $('#f-situacao', el).addEventListener('change', (e) => {
    estadoClientes.situacao = e.target.value;
    estadoClientes.pagina = 1;
    desenhar();
  });
  ligarPaginacao($('#lista', el), estadoClientes, desenhar);
  $('#novo', el).addEventListener('click', () => abrirCliente('novo'));
  $('#importar', el).addEventListener('click', importarClientes);
  if (DB.perfil().admin) $('#excluir-tudo', el).addEventListener('click', () => excluirTudo('clientes'));
  $('#lista', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    e.preventDefault();
    const id = b.dataset.id;
    if (b.dataset.acao === 'abrir' || b.dataset.acao === 'editar') abrirCliente(id);
    if (b.dataset.acao === 'hist') abrirCliente(id, 'historico');
    if (b.dataset.acao === 'notas') abrirCliente(id, 'anotacoes');
    if (b.dataset.acao === 'excluir' && confirmar('Excluir este cliente? O histórico ligado a ele continuará salvo.')) {
      DB.remover('clientes', id);
      render();
    }
  });
}

/* ---------- Clientes repetidos (cadastrados com e sem código) ---------- */
function assinaturaCliente(c) {
  return [normalizar(c.nome), digitos(c.documento), digitos(c.telefone), normalizar(c.email),
    normalizar(c.endereco), normalizar(c.bairro), normalizar(c.cidade)].join('|');
}
// Para cada cliente SEM código, procura a cópia COM código: primeiro com todos os dados iguais;
// se não houver, pelo mesmo CPF/CNPJ (ou nome + telefone), desde que exista uma única cópia.
function encontrarRepetidos() {
  const todos = DB.listar('clientes');
  const porAssinatura = new Map(), porChave = new Map();
  const adicionar = (mapa, k, c) => { if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(c); };
  todos.filter((c) => c.codigo).forEach((c) => {
    adicionar(porAssinatura, assinaturaCliente(c), c);
    adicionar(porChave, chaveCliente(c, true), c);
  });
  const usados = new Set();
  const pares = [];
  for (const d of todos.filter((c) => !c.codigo)) {
    let candidatos = (porAssinatura.get(assinaturaCliente(d)) || []).filter((x) => !usados.has(x.id));
    if (!candidatos.length) {
      const pelaChave = (porChave.get(chaveCliente(d, true)) || []).filter((x) => !usados.has(x.id));
      if (pelaChave.length === 1) candidatos = pelaChave;
    }
    if (candidatos.length) {
      usados.add(candidatos[0].id);
      pares.push({ manter: candidatos[0], remover: d });
    }
  }
  return pares;
}

function telaRepetidos(pares) {
  const cols = ['agendamentos', 'orcamentos', 'laudos', 'financeiro'];
  const ids = new Set(pares.map((p) => p.remover.id));
  const ligados = cols.reduce((n, col) => n + DB.listar(col).filter((r) => ids.has(r.clienteId)).length, 0);
  const amostra = pares.slice(0, 8);
  abrirModal('Remover clientes repetidos', `
    <p>Encontrei <b>${pares.length.toLocaleString('pt-BR')} clientes cadastrados duas vezes</b>: uma cópia com código e outra sem.
      Vou <b>manter a cópia com código</b> e apagar a cópia sem código.</p>
    <ul class="lista-ajuda">
      <li>Se a cópia sem código tiver algum dado que falta na outra (bairro, e-mail...), ele é copiado antes de apagar.</li>
      <li>${ligados ? `${ligados} agendamento(s), orçamento(s), laudo(s) ou lançamento(s) ligados às cópias serão passados para o cliente mantido.`
        : 'Nenhum agendamento, orçamento, laudo ou lançamento está ligado às cópias.'}</li>
      <li>Clientes que existem só uma vez não são alterados.</li>
    </ul>
    <b class="rotulo-previa">Exemplos:</b>
    <div class="tabela-wrap"><table><thead><tr><th>Fica (com código)</th><th>Sai (sem código)</th><th>Telefone</th></tr></thead><tbody>
      ${amostra.map((p) => `<tr><td><span class="cod-col">${esc(p.manter.codigo)}</span> ${esc(p.manter.nome)}</td><td>${esc(p.remover.nome)}</td><td>${esc(p.manter.telefone || p.remover.telefone)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="ajuda" style="margin-top:12px">Por segurança, baixe uma cópia dos dados antes de continuar.</p>
    <div class="form-acoes">
      <button type="button" class="btn sec" id="rep-backup" style="margin-right:auto">Baixar backup</button>
      <button type="button" class="btn sec" data-cancelar>Cancelar</button>
      <button type="button" class="btn perigo" id="rep-remover">Remover ${pares.length.toLocaleString('pt-BR')} repetidos</button>
    </div>`, (raiz) => {
    $('[data-cancelar]', raiz).addEventListener('click', fecharModal);
    $('#rep-backup', raiz).addEventListener('click', baixarBackup);
    $('#rep-remover', raiz).addEventListener('click', async (e) => {
      if (!confirmar(`Apagar ${pares.length} cópias sem código e manter as com código? Esta ação não pode ser desfeita.`)) return;
      const botao = e.target;
      botao.disabled = true;
      try {
        const destino = new Map(pares.map((p) => [p.remover.id, p.manter.id]));
        for (const col of cols) {
          DB.listar(col).filter((r) => destino.has(r.clienteId))
            .forEach((r) => DB.salvarItem(col, { id: r.id, clienteId: destino.get(r.clienteId) }));
        }
        const completar = [];
        for (const { manter, remover } of pares) {
          const campos = {};
          Object.keys(remover).forEach((k) => {
            if (!['id', 'criadoEm', 'codigo', 'tipo'].includes(k) && remover[k] && !manter[k]) campos[k] = remover[k];
          });
          if (Object.keys(campos).length) completar.push({ id: manter.id, ...campos });
        }
        if (completar.length) {
          await DB.atualizarVarios('clientes', completar, (f, de) => (botao.textContent = `Copiando dados... ${f} de ${de}`));
        }
        await DB.removerVarios('clientes', pares.map((p) => p.remover.id), (f, de) => (botao.textContent = `Removendo... ${f} de ${de}`));
        fecharModal();
        avisar(`${pares.length} clientes repetidos removidos.`);
        render();
      } catch (err) {
        avisar('A remoção parou: ' + err.message + ' Abra de novo para continuar de onde parou.', 'erro');
        fecharModal();
        render();
      }
    });
  });
}

/* ---------- Importação de clientes por planilha (.csv) ---------- */
const CAMPOS_IMPORTACAO = [
  ['codigo', 'Código do cliente', ['codigo', 'cod', 'codigo cliente', 'codigo do cliente', 'cod cliente', 'cod do cliente', 'id', 'id cliente',
    'cliente id', 'n cliente', 'numero do cliente', 'matricula', 'ref', 'referencia']],
  ['nome', 'Razão social / Nome *', ['razao social', 'nome', 'cliente', 'nome completo', 'nome do cliente', 'nome cliente', 'razao']],
  ['fantasia', 'Nome fantasia', ['fantasia', 'nome fantasia', 'apelido']],
  ['ativo', 'Situação (ativo/inativo)', ['situacao', 'ativo', 'status', 'situacao do cliente', 'ativo/inativo']],
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
function sugerirColunas(cabecalho, campos = CAMPOS_IMPORTACAO) {
  const cols = cabecalho.map(normalizar);
  const usadas = new Set();
  const mapa = {};
  for (const exato of [true, false]) {
    for (const [campoNome, , apelidos] of campos) {
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
    codigo: v('codigo').replace(/\.0+$/, ''), nome: v('nome'), fantasia: v('fantasia'), documento: v('documento'), email: v('email'), bairro: v('bairro'),
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
  const sit = normalizar(v('ativo'));
  if (sit) c.ativo = !['inativo', 'i', 'n', 'nao', '0', 'false', 'bloqueado', 'desativado', 'cancelado', 'excluido'].includes(sit);
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
      const total = (await DB.adicionarVarios('clientes', resultado.novos, (feitos, de) => {
        botao.textContent = `Importando... ${feitos} de ${de}`;
      })).length;
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

function camposCliente(c) {
  return `
      ${campo('Código', 'codigo', c.codigo)}
      <label class="check"><input type="checkbox" name="ativo" ${clienteAtivo(c) ? 'checked' : ''}> Cliente ativo</label>
      ${campo('Razão social / Nome *', 'nome', c.nome, 'text', 'required full')}
      ${campo('Nome fantasia', 'fantasia', c.fantasia, 'text', 'full')}
      <label>Tipo<select name="tipo">${opcoes([['PF', 'Pessoa física'], ['PJ', 'Empresa']], c.tipo)}</select></label>
      ${campo('CPF / CNPJ', 'documento', c.documento)}
      ${campo('I.E. / R.G.', 'ie', c.ie)}
      ${campo('Telefone / WhatsApp', 'telefone', c.telefone, 'tel')}
      ${campo('E-mail', 'email', c.email, 'email')}
      ${campo('Endereço', 'endereco', c.endereco, 'text', 'full')}
      ${campo('Bairro', 'bairro', c.bairro)}
      ${campo('Cidade', 'cidade', c.cidade)}
      ${campo('CEP', 'cep', c.cep)}
      ${campo('Contato responsável', 'contato', c.contato)}
      ${campo('Tipo de imóvel', 'imovel', c.imovel, 'text', 'placeholder="Casa, apartamento, restaurante..."')}
      ${campo('Ramo de atividade', 'ramo', c.ramo, 'text', 'full placeholder="Ex.: Restaurante, indústria, contrato de julho/2025 a junho/2026..."')}
      ${campo('Observações', 'obs', c.obs, 'textarea', 'full')}`;
}
// Valida e grava o cliente do formulário. Devolve o cliente salvo, ou null se algo impedir.
function salvarClienteDoForm(form, id) {
  const dados = lerForm(form);
  const cod = normalizar(dados.codigo);
  const outro = cod && DB.listar('clientes').find((x) => x.id !== id && normalizar(x.codigo) === cod);
  if (outro) { avisar(`O código ${dados.codigo} já é do cliente ${outro.nome}.`, 'erro'); form.codigo.focus(); return null; }
  return DB.salvarItem('clientes', { ...dados, id: id || undefined });
}

// Cadastro rápido em janela (usado dentro do agendamento, sem sair da tela).
function formCliente(id, aoSalvar) {
  const c = id ? DB.obter('clientes', id) : { tipo: 'PF', codigo: geradorCodigos()() };
  abrirModal(id ? 'Editar cliente' : 'Novo cliente', `
    <form class="form">${camposCliente(c)}
      <div class="form-acoes"><button type="button" class="btn sec" data-cancelar>Cancelar</button><button class="btn">Salvar</button></div>
    </form>`, (raiz) => {
    const form = $('form', raiz);
    $('[data-cancelar]', raiz).addEventListener('click', fecharModal);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const salvo = salvarClienteDoForm(form, id);
      if (!salvo) return;
      fecharModal();
      if (aoSalvar) aoSalvar(salvo); else render();
    });
  });
}

/* ---------- Página do cliente (abas: Dados, Anotações, Histórico) ---------- */
let abaCliente = 'dados';
function abrirCliente(id, aba = 'dados') {
  abaCliente = aba;
  irPara('cliente/' + id);
}
const anotacoesAtivas = (c) => (c.anotacoes || []).filter((a) => a.ativa !== false);

function paginaCliente(el, id) {
  const novo = id === 'novo';
  const c = novo ? { tipo: 'PF', codigo: geradorCodigos()() } : DB.obter('clientes', id);
  if (!c) {
    el.innerHTML = `<div class="cartao"><p>Cliente não encontrado. Ele pode ter sido excluído.</p>
      <button class="btn sec" id="voltar">Voltar para clientes</button></div>`;
    $('#voltar', el).addEventListener('click', () => irPara('clientes'));
    return;
  }
  if (novo) abaCliente = 'dados';
  const abas = [['dados', 'Dados do cliente'], ['anotacoes', 'Anotações'], ['historico', 'Histórico']];
  el.innerHTML = `
    <div class="pagina-topo">
      <button class="btn sec peq" id="voltar">&lsaquo; Clientes</button>
      <h2>${novo ? 'Novo cliente' : `${c.codigo ? esc(c.codigo) + ' — ' : ''}${esc(c.nome)}`}</h2>
      ${!novo && !clienteAtivo(c) ? '<span class="tag cinza">Inativo</span>' : ''}
    </div>
    <div class="abas" role="tablist">
      ${abas.map(([v, r]) => `<button class="aba ${abaCliente === v ? 'ativa' : ''}" data-aba="${v}" role="tab" ${novo && v !== 'dados' ? 'disabled title="Salve o cliente primeiro"' : ''}>${r}${v === 'anotacoes' && !novo ? ` <span class="cont">${anotacoesAtivas(c).length}</span>` : ''}</button>`).join('')}
    </div>
    <section class="cartao" data-painel="dados" ${abaCliente === 'dados' ? '' : 'hidden'}>
      <form class="form" id="form-cliente">${camposCliente(c)}
        <div class="form-acoes">
          ${novo ? '' : '<button type="button" class="btn sec perigo-texto" id="excluir-cliente" style="margin-right:auto">Excluir cliente</button>'}
          <button type="button" class="btn sec" id="voltar2">Voltar</button>
          <button class="btn" id="salvar-cliente">${novo ? 'Cadastrar cliente' : 'Salvar alterações'}</button>
        </div>
      </form>
    </section>
    ${novo ? '' : `
    <section class="cartao" data-painel="anotacoes" ${abaCliente === 'anotacoes' ? '' : 'hidden'}></section>
    <section class="cartao" data-painel="historico" ${abaCliente === 'historico' ? '' : 'hidden'}>${historicoClienteHTML(c)}</section>`}`;

  const voltar = () => irPara('clientes');
  $('#voltar', el).addEventListener('click', voltar);
  $('#voltar2', el).addEventListener('click', voltar);
  $('.abas', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-aba]');
    if (!b || b.disabled) return;
    abaCliente = b.dataset.aba;
    $$('.aba', el).forEach((x) => x.classList.toggle('ativa', x === b));
    $$('[data-painel]', el).forEach((p) => (p.hidden = p.dataset.painel !== abaCliente));
  });
  $('#form-cliente', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const salvo = salvarClienteDoForm(e.target, novo ? null : c.id);
    if (!salvo) return;
    avisar(novo ? 'Cliente cadastrado.' : 'Alterações salvas.');
    if (novo) irPara('cliente/' + salvo.id, true);
    else {
      const h2 = $('.pagina-topo h2', el);
      h2.textContent = `${salvo.codigo ? salvo.codigo + ' — ' : ''}${salvo.nome}`;
    }
  });
  if (!novo) {
    $('#excluir-cliente', el).addEventListener('click', () => {
      if (!confirmar(`Excluir o cliente ${c.nome}? O histórico ligado a ele continuará salvo.`)) return;
      DB.remover('clientes', c.id);
      avisar('Cliente excluído.');
      irPara('clientes', true);
    });
    painelAnotacoes($('[data-painel="anotacoes"]', el), c.id, () => {
      const cont = $('[data-aba="anotacoes"] .cont', el);
      if (cont) cont.textContent = anotacoesAtivas(DB.obter('clientes', c.id)).length;
    });
  }
}

// Aba Anotações: anotações internas do cliente, com data, autor, editar e inativar.
function painelAnotacoes(caixa, clienteId, aoMudar) {
  let editando = null; // id da anotação em edição
  let mostrarInativas = false;
  const gravar = (lista) => {
    DB.salvarItem('clientes', { id: clienteId, anotacoes: lista });
    aoMudar();
  };
  const desenhar = () => {
    const c = DB.obter('clientes', clienteId);
    const todas = (c.anotacoes || []).slice().sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
    const visiveis = mostrarInativas ? todas : todas.filter((a) => a.ativa !== false);
    const emEdicao = editando && todas.find((a) => a.id === editando);
    caixa.innerHTML = `
      <p class="ajuda">Data de cadastro (registro): <b>${c.criadoEm ? dataBR(c.criadoEm.slice(0, 10)) : '—'}</b></p>
      <form class="form-anotacao" id="form-anotacao">
        <label><span>Anotação <span class="obrigatorio">*</span></span>
          <textarea name="texto" rows="4" placeholder="Digite a anotação..." required>${esc(emEdicao ? emEdicao.texto : '')}</textarea></label>
        <div class="anotacao-botoes">
          <button class="btn">${emEdicao ? 'Salvar anotação' : 'Incluir anotação'}</button>
          <button type="button" class="btn sec" id="limpar-anotacao">${emEdicao ? 'Cancelar edição' : 'Nova / limpar'}</button>
        </div>
      </form>
      <div class="tabela-wrap"><table class="tabela-anotacoes"><thead><tr><th style="width:160px">Cadastro</th><th>Anotação</th><th style="width:170px"></th></tr></thead><tbody>
        ${visiveis.length ? visiveis.map((a) => `<tr class="${a.ativa === false ? 'inativo' : ''}">
          <td>${dataHoraBR(a.criadoEm)}${a.autor ? `<div class="sub">${esc(a.autor)}</div>` : ''}${a.editadoEm ? `<div class="sub">editada ${dataHoraBR(a.editadoEm)}</div>` : ''}</td>
          <td class="texto-anotacao">${esc(a.texto)}${a.ativa === false ? ' <span class="tag cinza">Inativa</span>' : ''}</td>
          <td><div class="acoes">${a.ativa === false
            ? `<button type="button" class="btn sec peq" data-nota="reativar" data-id="${a.id}">Reativar</button>`
            : `<button type="button" class="btn sec peq" data-nota="editar" data-id="${a.id}">Editar</button>
               <button type="button" class="btn sec peq" data-nota="inativar" data-id="${a.id}">Inativar</button>`}</div></td>
        </tr>`).join('') : '<tr><td colspan="3" class="vazio" style="text-align:left">Nenhuma anotação cadastrada.</td></tr>'}
      </tbody></table></div>
      <div class="anotacao-rodape">
        <span class="ajuda" style="margin:0">${todas.filter((a) => a.ativa !== false).length} anotação(ões) ativa(s) listada(s).</span>
        ${todas.some((a) => a.ativa === false) ? `<label class="check-linha" style="margin:0"><input type="checkbox" id="ver-inativas" ${mostrarInativas ? 'checked' : ''}> Mostrar inativas</label>` : ''}
      </div>`;
    const form = $('#form-anotacao', caixa);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const texto = form.texto.value.trim();
      if (!texto) { avisar('Digite a anotação.', 'erro'); return; }
      const lista = (DB.obter('clientes', clienteId).anotacoes || []).slice();
      const p = DB.perfil();
      if (editando) {
        const i = lista.findIndex((a) => a.id === editando);
        if (i >= 0) lista[i] = { ...lista[i], texto, editadoEm: new Date().toISOString() };
        avisar('Anotação alterada.');
      } else {
        lista.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), texto, ativa: true,
          criadoEm: new Date().toISOString(), autor: p.nome || p.email });
        avisar('Anotação incluída.');
      }
      editando = null;
      gravar(lista);
      desenhar();
    });
    $('#limpar-anotacao', caixa).addEventListener('click', () => { editando = null; desenhar(); $('textarea', caixa).focus(); });
    const ver = $('#ver-inativas', caixa);
    if (ver) ver.addEventListener('change', () => { mostrarInativas = ver.checked; desenhar(); });
  };
  caixa.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nota]');
    if (!b) return;
    const lista = (DB.obter('clientes', clienteId).anotacoes || []).slice();
    const i = lista.findIndex((a) => a.id === b.dataset.id);
    if (i < 0) return;
    if (b.dataset.nota === 'editar') {
      editando = lista[i].id;
      desenhar();
      const t = $('textarea', caixa);
      t.focus();
      t.setSelectionRange(t.value.length, t.value.length);
      return;
    }
    if (b.dataset.nota === 'inativar') {
      if (!confirmar('Inativar esta anotação? Ela deixa de aparecer na lista, mas pode ser reativada.')) return;
      lista[i] = { ...lista[i], ativa: false, inativadaEm: new Date().toISOString() };
    }
    if (b.dataset.nota === 'reativar') lista[i] = { ...lista[i], ativa: true };
    if (editando === lista[i].id) editando = null;
    gravar(lista);
    desenhar();
  });
  desenhar();
}

function historicoClienteHTML(c) {
  const id = c.id;
  const ags = DB.listar('agendamentos').filter((a) => a.clienteId === id).sort((a, b) => b.data.localeCompare(a.data));
  const orcs = DB.listar('orcamentos').filter((o) => o.clienteId === id).sort((a, b) => b.data.localeCompare(a.data));
  const lds = DB.listar('laudos').filter((l) => l.clienteId === id).sort((a, b) => b.data.localeCompare(a.data));
  const fin = DB.listar('financeiro').filter((f) => f.clienteId === id);
  const pago = fin.filter((f) => f.tipo === 'receita' && f.pago).reduce((s, f) => s + num(f.valor), 0);
  const aberto = fin.filter((f) => f.tipo === 'receita' && !f.pago).reduce((s, f) => s + num(f.valor), 0);
  return `
    <p>${esc(c.telefone)} · ${esc([c.endereco, c.bairro, c.cidade].filter(Boolean).join(', '))}</p>
    <div class="grade-kpi">
      ${DB.pode('agenda') ? `<div class="kpi"><div class="rotulo">Serviços</div><div class="valor">${ags.length}</div></div>` : ''}
      ${DB.pode('financeiro') ? `<div class="kpi"><div class="rotulo">Total pago</div><div class="valor">${moeda(pago)}</div></div>
      <div class="kpi"><div class="rotulo">Em aberto</div><div class="valor">${moeda(aberto)}</div></div>` : ''}
    </div>
    ${DB.pode('agenda') ? `<h3>Agendamentos</h3>${tabelaAgendamentos(ags, false)}` : ''}
    ${DB.pode('orcamentos') ? `<h3>Orçamentos</h3>${orcs.length ? `<table><thead><tr><th>Nº</th><th>Data</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>
      ${orcs.map((o) => `<tr><td>${o.numero}</td><td>${dataBR(o.data)}</td><td class="num">${moeda(totalOrcamento(o))}</td><td>${tag(statusOrc(o), STATUS_ORC)}</td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Nenhum orçamento.</div>'}` : ''}
    ${DB.pode('laudos') ? `<h3>Laudos</h3>${lds.length ? `<table><thead><tr><th>Nº</th><th>Data</th><th>Pragas</th><th>Garantia até</th></tr></thead><tbody>
      ${lds.map((l) => `<tr><td>${l.numero}</td><td>${dataBR(l.data)}</td><td>${esc(l.pragas)}</td><td>${l.garantiaDias ? dataBR(somarDias(l.data, l.garantiaDias)) : '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Nenhum laudo.</div>'}` : ''}
  `;
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

// Filtro, busca e página da lista de orçamentos ficam guardados ao voltar à tela.
const estadoOrc = carregarEstado('orcamentos', { pagina: 1, filtro: 'geral', numero: '', cliente: '' });
const FILTROS_ORC = [['geral', 'Geral'], ['numero', 'Por Número'], ['cancelado', 'Cancelado'], ['finalizado', 'Finalizado'],
  ['executado', 'Executado'], ['em_execucao', 'Em Execução'], ['pendente', 'Pendente']];

function orcamentos(el) {
  const agendar = DB.pode('agenda');
  const todos = DB.listar('orcamentos');
  const contagem = { geral: todos.length };
  todos.forEach((o) => { const st = statusOrc(o); contagem[st] = (contagem[st] || 0) + 1; });
  el.innerHTML = `
    <div class="cabecalho"><h2>Orçamentos e Ordens de Serviço</h2>
      <div class="acoes">
        ${DB.perfil().admin ? '<button class="btn sec perigo-texto" id="excluir-tudo">Excluir tudo</button><button class="btn sec" id="importar-orc">Importar planilha</button>' : ''}
        <button class="btn" id="novo">+ Novo orçamento</button></div></div>
    <div class="abas" role="tablist">
      ${FILTROS_ORC.map(([v, r]) => `<button class="aba ${estadoOrc.filtro === v ? 'ativa' : ''}" data-filtro="${v}" role="tab">${r}${v === 'numero' ? '' : ` <span class="cont">${(contagem[v] || 0).toLocaleString('pt-BR')}</span>`}</button>`).join('')}
    </div>
    <div class="filtros">
      ${estadoOrc.filtro === 'numero'
        ? `<label class="filtro-busca">Número do orçamento<input class="busca" id="f-numero" inputmode="numeric" placeholder="Digite o número..." value="${esc(estadoOrc.numero)}"></label>`
        : `<label class="filtro-busca">Cliente<input class="busca" id="f-cliente" placeholder="Buscar por código ou nome do cliente..." value="${esc(estadoOrc.cliente)}"></label>`}
    </div>
    <div class="cartao" style="padding:0"><div id="lista-orc"></div></div>`;

  const desenhar = () => {
    let lista;
    if (estadoOrc.filtro === 'numero') {
      const q = digitos(estadoOrc.numero);
      lista = q ? todos.filter((o) => String(o.numero).startsWith(q))
        .sort((a, b) => (String(b.numero) === q) - (String(a.numero) === q) || b.numero - a.numero) : [];
    } else {
      lista = estadoOrc.filtro === 'geral' ? todos.slice() : todos.filter((o) => statusOrc(o) === estadoOrc.filtro);
      const nq = normalizar(estadoOrc.cliente);
      if (nq) {
        // Um número igual ao código de um cliente mostra só os orçamentos desse cliente.
        const porCodigo = /^\d+$/.test(nq) && DB.listar('clientes').find((c) => normalizar(c.codigo) === nq);
        lista = lista.filter((o) => {
          const c = DB.obter('clientes', o.clienteId);
          if (porCodigo) return c === porCodigo;
          return c && (normalizar(c.codigo) === nq || normalizar(c.nome).includes(nq) || normalizar(c.fantasia).includes(nq));
        });
      }
      lista.sort((a, b) => b.numero - a.numero);
    }
    const { itens, html: rodape } = paginar(lista, estadoOrc);
    guardarEstado('orcamentos', estadoOrc);
    const vazio = estadoOrc.filtro === 'numero' && !digitos(estadoOrc.numero) ? 'Digite o número do orçamento.' : 'Nenhum orçamento encontrado.';
    $('#lista-orc', el).innerHTML = itens.length ? `<div class="tabela-wrap"><table><thead><tr><th>Nº</th><th>Emissão</th><th>Cliente</th><th>Vendedor</th><th class="num">Total</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
      ${itens.map((o) => {
        const c = DB.obter('clientes', o.clienteId);
        return `<tr><td><a href="#" class="link-cliente" data-acao="editar" data-id="${o.id}">${o.numero}</a>${o.execucao && o.execucao.enviadoEm ? ' <span class="tag verde" title="Técnico enviou a execução">assinada</span>' : ''}</td><td>${o.data ? dataBR(o.data) : '—'}</td>
        <td>${c ? `${c.codigo ? `<span class="cod-col">${esc(c.codigo)}</span> ` : ''}${esc(c.nome)}` : '—'}</td>
        <td>${esc(o.vendedor || '')}</td>
        <td class="num">${moeda(totalOrcamento(o))}</td><td>${tag(statusOrc(o), STATUS_ORC)}</td>
        <td><div class="acoes">
          <button class="btn peq" data-acao="imprimir" data-id="${o.id}">Imprimir FAES</button>
          ${statusOrc(o) === 'pendente' ? `<button class="btn sec peq" data-acao="aprovar" data-id="${o.id}">${agendar ? 'Aprovar e agendar' : 'Aprovar'}</button>` : ''}
          <button class="btn sec peq" data-acao="editar" data-id="${o.id}">Editar</button>
          <button class="btn sec peq" data-acao="excluir" data-id="${o.id}">Excluir</button>
        </div></td></tr>`;
      }).join('')}
    </tbody></table></div>${rodape}` : `<div class="vazio">${vazio}</div>`;
  };
  desenhar();

  $('.abas', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    estadoOrc.filtro = b.dataset.filtro;
    estadoOrc.pagina = 1;
    orcamentos(el);
    const campoBusca = $('#f-numero, #f-cliente', el);
    if (campoBusca && estadoOrc.filtro === 'numero') campoBusca.focus();
  });
  const campoBusca = $('#f-numero, #f-cliente', el);
  campoBusca.addEventListener('input', (e) => {
    estadoOrc[estadoOrc.filtro === 'numero' ? 'numero' : 'cliente'] = e.target.value;
    estadoOrc.pagina = 1;
    desenhar();
  });
  ligarPaginacao($('#lista-orc', el), estadoOrc, desenhar);
  $('#novo', el).addEventListener('click', () => abrirOrcamento('novo'));
  if (DB.perfil().admin) {
    $('#importar-orc', el).addEventListener('click', importarOrcamentos);
    $('#excluir-tudo', el).addEventListener('click', () => excluirTudo('orcamentos'));
  }
  $('#lista-orc', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    e.preventDefault();
    const o = DB.obter('orcamentos', b.dataset.id);
    if (b.dataset.acao === 'imprimir') imprimirFAES(o);
    if (b.dataset.acao === 'editar') abrirOrcamento(o.id);
    if (b.dataset.acao === 'aprovar') {
      DB.salvarItem('orcamentos', { id: o.id, status: 'em_execucao' });
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

/* ---------- Importação de orçamentos por planilha (.csv) ---------- */
const CAMPOS_IMPORTACAO_ORC = [
  ['numero', 'Número do orçamento *', ['numero', 'nº', 'n', 'no', 'numero do orcamento', 'numero orcamento', 'orcamento', 'os', 'numero os', 'ordem', 'pedido']],
  ['codigoCliente', 'Código do cliente', ['id - cliente', 'id cliente', 'id-cliente', 'codigo cliente', 'codigo do cliente', 'cod cliente', 'cliente id', 'cod']],
  ['cliente', 'Nome do cliente', ['cliente', 'nome', 'nome do cliente', 'razao social', 'nome cliente']],
  ['emissao', 'Emissão (data)', ['emissao', 'data', 'data emissao', 'data de emissao', 'data do orcamento']],
  ['valor', 'Valor total', ['valor', 'total', 'valor total']],
  ['situacao', 'Situação', ['situacao', 'status', 'estado']],
  ['vendedor', 'Vendedor', ['vendedor', 'responsavel', 'atendente', 'tecnico']],
  ['obs', 'Observações', ['obs', 'observacao', 'observacoes', 'descricao', 'servico']],
];
function dataImportada(v) {
  v = String(v || '').trim();
  let m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, d, mes, a] = m.map(Number);
    if (a < 1990 || a > 2100 || mes < 1 || mes > 12 || d < 1 || d > 31) return '';
    return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m && Number(m[1]) >= 1990 && Number(m[1]) <= 2100 ? m[0] : '';
}
function valorImportado(v) {
  v = String(v || '').replace(/[R$\s]/g, '');
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}
function situacaoImportada(v) {
  const s = normalizar(v);
  if (s.startsWith('cancel') || s.startsWith('recus')) return 'cancelado';
  if (s.startsWith('finaliz') || s.startsWith('conclu')) return 'finalizado';
  if (s.startsWith('executad')) return 'executado';
  if (s.includes('execucao') || s.includes('andamento') || s.startsWith('aprovad')) return 'em_execucao';
  return 'pendente';
}

function importarOrcamentos() {
  abrirModal('Importar orçamentos de planilha', `
    <div class="importacao">
      <p>Escolha o arquivo <b>.csv</b> com os orçamentos/ordens. A primeira linha deve ter os nomes das colunas
        (por exemplo: numero; id - cliente; cliente; emissao; valor; situacao; vendedor).</p>
      <p class="ajuda">Cada orçamento é ligado ao cliente pelo <b>código do cliente</b>. Clientes que ainda não existirem
        no cadastro são criados automaticamente com o código e o nome da planilha.</p>
      <div class="acoes"><label class="btn">Escolher arquivo .csv<input type="file" id="arquivo-csv" accept=".csv,text/csv,.txt" hidden></label></div>
      <div id="etapa-mapa"></div>
    </div>`, (raiz) => {
    $('#arquivo-csv', raiz).addEventListener('change', async (e) => {
      const arq = e.target.files[0];
      e.target.value = '';
      if (!arq) return;
      try {
        const linhas = lerCSV(await lerArquivoTexto(arq));
        if (linhas.length < 2) throw new Error('O arquivo precisa ter a linha de títulos e pelo menos um orçamento.');
        etapaMapeamentoOrc($('#etapa-mapa', raiz), arq.name, linhas);
      } catch (err) {
        avisar('Não foi possível ler o arquivo: ' + err.message, 'erro');
      }
    });
  });
}

function etapaMapeamentoOrc(el, nomeArquivo, linhas) {
  const cabecalho = linhas[0].map((c, i) => c.trim() || `Coluna ${i + 1}`);
  const corpo = linhas.slice(1);
  const mapa = sugerirColunas(cabecalho, CAMPOS_IMPORTACAO_ORC);
  const opcoesColunas = (sel) => '<option value="">— não importar —</option>' +
    cabecalho.map((c, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(c)}</option>`).join('');
  el.innerHTML = `
    <h3>Arquivo: ${esc(nomeArquivo)} (${corpo.length.toLocaleString('pt-BR')} linhas)</h3>
    <p class="ajuda">Confira qual coluna da planilha vai para cada campo. Já deixei sugeridas as que reconheci.</p>
    <div class="grade-mapa">
      ${CAMPOS_IMPORTACAO_ORC.map(([k, rotulo]) => `<label>${rotulo}<select data-campo="${k}">${opcoesColunas(mapa[k])}</select></label>`).join('')}
    </div>
    <label class="check-linha"><input type="checkbox" id="op-atualizar" checked>
      Atualizar os orçamentos que já foram importados antes, quando o arquivo trouxer alterações (cliente, emissão, valor, situação, vendedor)</label>
    <div id="previa"></div>
    <div class="form-acoes"><button type="button" class="btn sec" data-cancelar>Cancelar</button>
      <button type="button" class="btn" id="confirmar-importacao">Importar</button></div>`;

  const NOMES_CAMPO = { clienteId: 'cliente', data: 'emissão', status: 'situação', vendedor: 'vendedor', valor: 'valor' };
  const itensDe = (valor) => (valor ? [{ descricao: 'Serviço (importado do sistema anterior)', qtd: 1, valor }] : []);
  let r = null;
  const calcular = () => {
    $$('[data-campo]', el).forEach((s) => (mapa[s.dataset.campo] = s.value === '' ? undefined : Number(s.value)));
    const atualizar = $('#op-atualizar', el).checked;
    const opRenum = $('#op-renumerar', el);
    const renumerar = opRenum ? opRenum.checked : false;
    const v = (linha, k) => (mapa[k] === undefined ? '' : String(linha[mapa[k]] ?? '').trim());
    const existentes = new Map(DB.listar('orcamentos').map((o) => [String(o.numero), o]));
    const clientes = DB.listar('clientes');
    const porCodigo = new Map(clientes.filter((c) => c.codigo).map((c) => [normalizar(c.codigo), c]));
    const porNome = new Map();
    clientes.forEach((c) => { const k = normalizar(c.nome); if (!porNome.has(k)) porNome.set(k, []); porNome.get(k).push(c); });
    const novosClientes = new Map(); // chave -> cliente a criar
    r = { novos: [], atualizar: [], conflitos: [], iguais: 0, semNumero: 0, repetidosArquivo: 0, pelaCodigo: 0, peloNome: 0,
      divergentes: 0, datasInvalidas: 0, porSituacao: {}, mudancas: {}, exemplosMudanca: [], maior: 0, novosClientes };

    // Acha o cliente pelo código (conferindo o nome) ou pelo nome; se não existir, prepara um cadastro novo.
    const resolverCliente = (cod, nome) => {
      let cliente = cod ? porCodigo.get(normalizar(cod)) : null;
      if (cliente && nome && normalizar(cliente.nome) !== normalizar(nome)) { cliente = null; r.divergentes++; } else if (cliente) r.pelaCodigo++;
      if (!cliente && nome) {
        const mesmos = porNome.get(normalizar(nome));
        if (mesmos && mesmos.length === 1) { cliente = mesmos[0]; r.peloNome++; }
      }
      if (cliente) return { clienteId: cliente.id };
      if (!nome && !cod) return { clienteId: '' };
      const codLivre = cod && !porCodigo.has(normalizar(cod));
      const chaveNovo = codLivre ? 'cod:' + normalizar(cod) : 'nome:' + normalizar(nome);
      if (!novosClientes.has(chaveNovo)) novosClientes.set(chaveNovo, { nome: nome || `Cliente ${cod}`, tipo: 'PF', ...(codLivre ? { codigo: cod } : {}) });
      return { clienteId: '', chaveNovo };
    };

    const vistos = new Set();
    for (const linha of corpo) {
      const numero = digitos(v(linha, 'numero'));
      if (!numero) { r.semNumero++; continue; }
      if (vistos.has(numero)) { r.repetidosArquivo++; continue; }
      vistos.add(numero);
      const num = Number(numero);
      r.maior = Math.max(r.maior, num);
      const data = dataImportada(v(linha, 'emissao'));
      const valor = valorImportado(v(linha, 'valor'));
      const status = situacaoImportada(v(linha, 'situacao'));
      const vendedor = v(linha, 'vendedor').replace(/^\d+\s+/, '').trim();
      const ex = existentes.get(String(num));

      if (ex && ex.importado) {
        // Já importado antes: só registra o que mudou.
        if (!atualizar) { r.iguais++; continue; }
        const cli = resolverCliente(v(linha, 'codigoCliente').replace(/\.0+$/, ''), v(linha, 'cliente'));
        const campos = {};
        if (cli.chaveNovo || (cli.clienteId && cli.clienteId !== ex.clienteId)) campos.clienteId = cli.clienteId;
        if (data !== (ex.data || '')) campos.data = data;
        if (status !== statusOrc(ex)) campos.status = status;
        if (vendedor !== (ex.vendedor || '')) campos.vendedor = vendedor;
        if (Math.abs(valor - totalOrcamento(ex)) > 0.004) { campos.itens = itensDe(valor); campos.desconto = 0; campos.valor = true; }
        const mudou = Object.keys(campos).filter((k) => NOMES_CAMPO[k]);
        if (!mudou.length) { r.iguais++; continue; }
        mudou.forEach((k) => (r.mudancas[k] = (r.mudancas[k] || 0) + 1));
        if (r.exemplosMudanca.length < 8) {
          r.exemplosMudanca.push(`nº ${num}: ` + mudou.map((k) => k === 'valor' ? `valor ${moeda(totalOrcamento(ex))} → ${moeda(valor)}`
            : k === 'data' ? `emissão ${dataBR(ex.data) || '—'} → ${dataBR(data) || '—'}`
            : k === 'status' ? `situação → ${(STATUS_ORC.find(([s]) => s === status) || [])[1]}`
            : k === 'clienteId' ? `cliente → ${v(linha, 'cliente')}` : `vendedor → ${vendedor}`).join(', '));
        }
        delete campos.valor;
        r.atualizar.push({ id: ex.id, chaveNovo: cli.chaveNovo, ...campos });
        continue;
      }

      const cli = resolverCliente(v(linha, 'codigoCliente').replace(/\.0+$/, ''), v(linha, 'cliente'));
      const novo = {
        numero: num, clienteId: cli.clienteId, chaveNovo: cli.chaveNovo, data, validadeDias: 15, status, desconto: 0, itens: itensDe(valor),
        ...(vendedor ? { vendedor } : {}), ...(v(linha, 'obs') ? { condicoes: v(linha, 'obs') } : {}), importado: true,
      };
      if (ex) {
        // Número já usado por um orçamento criado no app: conflito.
        r.conflitos.push({ ex, novo, nomeArquivo: v(linha, 'cliente') });
        if (!renumerar) continue;
      }
      if (!data) r.datasInvalidas++;
      r.porSituacao[status] = (r.porSituacao[status] || 0) + 1;
      r.novos.push(novo);
    }
    // Novos números para os orçamentos do app em conflito (depois do maior número existente).
    let proximo = Math.max(r.maior, ...DB.listar('orcamentos').map((o) => Number(o.numero) || 0)) + 1;
    r.renumerar = r.conflitos.slice().sort((a, b) => a.ex.numero - b.ex.numero).map((c) => ({ id: c.ex.id, numero: proximo++, antigo: c.ex.numero }));
    r.maiorFinal = renumerar && r.renumerar.length ? proximo - 1 : r.maior;

    const n = r.novos.length, m = r.atualizar.length;
    const amostra = r.novos.slice(-5).reverse();
    const nomeDe = (o) => (o.clienteId ? (DB.obter('clientes', o.clienteId) || {}).nome : (novosClientes.get(o.chaveNovo) || {}).nome) || '—';
    $('#previa', el).innerHTML = `
      <div class="resumo-importacao">
        <span class="tag verde">${n.toLocaleString('pt-BR')} novos para importar</span>
        ${m ? `<span class="tag laranja">${m} já importados serão atualizados</span>` : ''}
        ${r.iguais ? `<span class="tag cinza">${r.iguais.toLocaleString('pt-BR')} já importados sem mudanças</span>` : ''}
        ${r.conflitos.length ? `<span class="tag vermelho">${r.conflitos.length} números em conflito com orçamentos criados no app</span>` : ''}
        ${r.repetidosArquivo ? `<span class="tag amarelo">${r.repetidosArquivo} números repetidos na planilha (pulados)</span>` : ''}
        ${r.semNumero ? `<span class="tag vermelho">${r.semNumero} sem número (pulados)</span>` : ''}
      </div>
      <ul class="lista-ajuda">
        ${n ? `<li>Novos — situação: ${STATUS_ORC.filter(([s]) => r.porSituacao[s]).map(([s, rot]) => `${rot}: <b>${r.porSituacao[s].toLocaleString('pt-BR')}</b>`).join(' · ')}</li>` : ''}
        ${m ? `<li>Alterações encontradas: ${Object.entries(r.mudancas).map(([k, q]) => `${NOMES_CAMPO[k]} <b>${q}</b>`).join(' · ')}
          <ul>${r.exemplosMudanca.map((x) => `<li>${esc(x)}</li>`).join('')}${m > r.exemplosMudanca.length ? '<li>...</li>' : ''}</ul></li>` : ''}
        ${novosClientes.size ? `<li><b>${novosClientes.size}</b> cliente(s) novo(s) serão cadastrados (não estavam no cadastro).</li>` : ''}
        ${r.divergentes ? `<li class="atencao">${r.divergentes} linha(s) com código de cliente que, no cadastro, pertence a outro nome (ligadas pelo nome ou a um cliente novo).</li>` : ''}
        ${r.datasInvalidas ? `<li>${r.datasInvalidas} orçamento(s) novo(s) com data de emissão inválida (ficarão sem data).</li>` : ''}
      </ul>
      ${r.conflitos.length ? `<div class="conflitos">
        <b>Números em conflito:</b> estes números já são de orçamentos criados no app, mas no arquivo são de outras ordens do sistema antigo.
        <div class="tabela-wrap"><table><thead><tr><th>Nº</th><th>No app (criado aqui)</th><th>No arquivo (sistema antigo)</th><th>Novo nº do app</th></tr></thead><tbody>
          ${r.conflitos.slice(0, 12).map((c) => { const rn = r.renumerar.find((x) => x.id === c.ex.id); return `<tr><td>${c.ex.numero}</td><td>${esc(nomeCliente(c.ex.clienteId))}</td><td>${esc(c.nomeArquivo)}</td><td>${rn ? rn.numero : ''}</td></tr>`; }).join('')}
          ${r.conflitos.length > 12 ? `<tr><td colspan="4">... e mais ${r.conflitos.length - 12}</td></tr>` : ''}
        </tbody></table></div>
        <label class="check-linha"><input type="checkbox" id="op-renumerar" ${renumerar ? 'checked' : ''}>
          Dar um novo número aos orçamentos criados no app (coluna "Novo nº do app") e importar as ordens do arquivo com o número original</label>
        <p class="ajuda">Se não marcar, essas ordens do arquivo ficam de fora.</p>
      </div>` : ''}
      ${amostra.length ? `<b class="rotulo-previa">Últimos novos:</b>
      <div class="tabela-wrap"><table><thead><tr><th>Nº</th><th>Emissão</th><th>Cliente</th><th>Vendedor</th><th class="num">Valor</th><th>Situação</th></tr></thead><tbody>
        ${amostra.map((o) => `<tr><td>${o.numero}</td><td>${o.data ? dataBR(o.data) : '—'}</td><td>${esc(nomeDe(o))}</td><td>${esc(o.vendedor || '')}</td><td class="num">${moeda(totalOrcamento(o))}</td><td>${tag(o.status, STATUS_ORC)}</td></tr>`).join('')}
      </tbody></table></div>` : ''}`;
    const botao = $('#confirmar-importacao', el);
    botao.disabled = !n && !m;
    botao.textContent = [n || !m ? `Importar ${n.toLocaleString('pt-BR')}` : '', m ? `${n ? 'e a' : 'A'}tualizar ${m}` : ''].filter(Boolean).join(' ');
  };
  el.addEventListener('change', (e) => { if (e.target.matches('[data-campo], #op-atualizar, #op-renumerar')) calcular(); });
  $('[data-cancelar]', el).addEventListener('click', fecharModal);
  $('#confirmar-importacao', el).addEventListener('click', async (e) => {
    if (mapa.numero === undefined) { avisar('Escolha qual coluna tem o número do orçamento.', 'erro'); return; }
    const botao = e.target;
    botao.disabled = true;
    const renumerar = ($('#op-renumerar', el) || {}).checked && r.renumerar.length;
    try {
      const chaves = [...r.novosClientes.keys()];
      const idPorChave = new Map();
      if (chaves.length) {
        const criados = await DB.adicionarVarios('clientes', chaves.map((k) => r.novosClientes.get(k)),
          (f, de) => (botao.textContent = `Cadastrando clientes... ${f} de ${de}`));
        chaves.forEach((k, i) => idPorChave.set(k, criados[i].id));
        r.novosClientes.clear();
      }
      const comCliente = ({ chaveNovo, ...o }) => ({ ...o, ...(chaveNovo ? { clienteId: idPorChave.get(chaveNovo) || '' } : {}) });
      if (renumerar) {
        await DB.atualizarVarios('orcamentos', r.renumerar.map(({ id, numero }) => ({ id, numero })),
          (f, de) => (botao.textContent = `Renumerando... ${f} de ${de}`));
      }
      if (r.atualizar.length) {
        await DB.atualizarVarios('orcamentos', r.atualizar.map(comCliente), (f, de) => (botao.textContent = `Atualizando... ${f} de ${de}`));
      }
      if (r.novos.length) {
        await DB.adicionarVarios('orcamentos', r.novos.map(comCliente),
          (f, de) => (botao.textContent = `Importando... ${f.toLocaleString('pt-BR')} de ${de.toLocaleString('pt-BR')}`));
      }
      await DB.ajustarNumeracao(renumerar ? r.maiorFinal : r.maior, 0);
      fecharModal();
      avisar([r.novos.length ? `${r.novos.length.toLocaleString('pt-BR')} orçamentos importados` : '',
        r.atualizar.length ? `${r.atualizar.length} atualizados` : '', renumerar ? `${r.renumerar.length} do app renumerados` : '',
        chaves.length ? `${chaves.length} clientes cadastrados` : ''].filter(Boolean).join(', ') + '.');
      render();
    } catch (err) {
      avisar('A importação parou: ' + err.message + ' O que já foi gravado foi mantido; importe de novo para continuar.', 'erro');
      fecharModal();
      render();
    }
  });
  calcular();
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- Página da ordem / orçamento (abas: Dados da ordem e Execução do técnico) ---------- */
let abaOrcamento = 'dados';
function abrirOrcamento(id, aba = 'dados') {
  abaOrcamento = aba;
  irPara('orcamento/' + id);
}
const colaboradoresAtivos = () => DB.catalogo('colaboradores').filter((c) => c.ativo !== false)
  .sort((a, b) => (Number(a.codigo) || 0) - (Number(b.codigo) || 0) || (a.nome || '').localeCompare(b.nome || ''));
function opcoesColaborador(sel, funcao) {
  const lista = colaboradoresAtivos();
  // Mostra primeiro quem tem a função indicada; os demais continuam disponíveis.
  const comFuncao = lista.filter((c) => (c.funcoes || []).includes(funcao));
  const outros = lista.filter((c) => !(c.funcoes || []).includes(funcao));
  const op = (c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc((c.codigo ? c.codigo + ' - ' : '') + c.nome)}</option>`;
  return '<option value="">— selecione —</option>' + comFuncao.map(op).join('')
    + (outros.length && comFuncao.length ? `<optgroup label="Outros colaboradores">${outros.map(op).join('')}</optgroup>` : outros.map(op).join(''));
}
function linkTecnico(o) {
  return new URL('os.html?t=' + o.tokenTecnico, location.href.split('#')[0]).href;
}

function paginaOrcamento(el, id) {
  const novo = id === 'novo';
  const o = novo ? { data: hojeISO(), dataAvaliacao: hojeISO(), validadeDias: 15, status: 'pendente', itens: [], pagamento: 'PIX, dinheiro ou cartão' }
    : DB.obter('orcamentos', id);
  if (!o) {
    el.innerHTML = `<div class="cartao"><p>Ordem não encontrada. Ela pode ter sido excluída.</p>
      <button class="btn sec" id="voltar">Voltar</button></div>`;
    $('#voltar', el).addEventListener('click', () => irPara('orcamentos'));
    return;
  }
  if (novo) abaOrcamento = 'dados';
  const servicos = DB.catalogo('servicos').filter((x) => x.ativo !== false);
  const semColab = !colaboradoresAtivos().length;
  el.innerHTML = `
    <div class="pagina-topo">
      <button class="btn sec peq" id="voltar">&lsaquo; Orçamentos</button>
      <h2>${novo ? 'Nova ordem de serviço / orçamento' : `Nº ${o.numero} — ${esc(nomeCliente(o.clienteId))}`}</h2>
      ${novo ? '' : tag(statusOrc(o), STATUS_ORC)}
      ${novo ? '' : `<div class="acoes" style="margin-left:auto">
        <button class="btn sec peq" id="imp-orc">Imprimir orçamento</button>
        <button class="btn peq" id="imp-faes">Imprimir FAES / PDF</button></div>`}
    </div>
    <div class="abas" role="tablist">
      <button class="aba ${abaOrcamento === 'dados' ? 'ativa' : ''}" data-aba="dados">Dados da ordem</button>
      <button class="aba ${abaOrcamento === 'execucao' ? 'ativa' : ''}" data-aba="execucao" ${novo ? 'disabled title="Salve a ordem primeiro"' : ''}>Execução do técnico${o.execucao && o.execucao.enviadoEm ? ' <span class="cont">assinada</span>' : ''}</button>
    </div>
    <section class="cartao" data-painel="dados" ${abaOrcamento === 'dados' ? '' : 'hidden'}>
      <form class="form" id="form-orc">
        ${campoCliente(o.clienteId)}
        ${campo('Emissão', 'data', o.data, 'date', 'required')}
        <label>Situação<select name="status">${opcoes(STATUS_ORC, statusOrc(o))}</select></label>
        <h3 class="full secao">Serviços</h3>
        <label class="full">Adicionar serviço do cadastro
          <select id="add-servico"><option value="">${servicos.length ? '— escolha um serviço para adicionar —' : 'Nenhum serviço cadastrado (cadastre em Cadastros → Serviços)'}</option>
          ${servicos.map((x) => `<option value="${x.id}">${esc((x.codigo ? x.codigo + ' - ' : '') + x.descricao)} — ${moeda(x.valor)}</option>`).join('')}</select></label>
        ${editorLinhas(COLS_ORC, o.itens || [])}
        ${campo('Desconto (R$)', 'desconto', o.desconto, 'number', 'step="0.01" min="0"')}
        <div class="total-linha" id="total" style="align-self:end"></div>
        <h3 class="full secao">Responsáveis</h3>
        ${semColab ? '<p class="full ajuda">Nenhum colaborador cadastrado. O administrador cadastra em <b>Cadastros → Colaboradores</b>.</p>' : ''}
        <label>Responsável pelo preenchimento<select name="responsavelPreenchimento">${opcoesColaborador(o.responsavelPreenchimento, 'atendimento')}</select></label>
        <label>Responsável pela avaliação prévia<select name="responsavelAvaliacao">${opcoesColaborador(o.responsavelAvaliacao, 'avaliador')}</select></label>
        <label>Responsável técnico<select name="responsavelTecnico">${opcoesColaborador(o.responsavelTecnico, 'responsavel_tecnico')}</select></label>
        <label>Técnico / controlador de pragas<select name="controlador">${opcoesColaborador(o.controlador, 'controlador')}</select></label>
        <h3 class="full secao">Avaliação</h3>
        ${campo('Data da avaliação', 'dataAvaliacao', o.dataAvaliacao || o.data, 'date')}
        ${campo('Hora de início prevista', 'horaInicio', o.horaInicio, 'time')}
        ${campo('Características das áreas', 'caracteristicas', o.caracteristicas, 'text', 'full placeholder="Ex.: 12 porta iscas, cozinha industrial, depósito..."')}
        ${campo('Observações para o técnico', 'obsTecnico', o.obsTecnico, 'textarea', 'full')}
        <h3 class="full secao">Orçamento</h3>
        ${campo('Vendedor', 'vendedor', o.vendedor, 'text', 'list="vendedores"')}
        ${campo('Validade (dias)', 'validadeDias', o.validadeDias, 'number', 'min="1"')}
        <datalist id="vendedores">${[...new Set(DB.listar('orcamentos').map((x) => x.vendedor).filter(Boolean))].slice(0, 50).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
        ${campo('Forma de pagamento', 'pagamento', o.pagamento, 'text', 'full')}
        ${campo('Garantia / condições', 'condicoes', o.condicoes, 'textarea', 'full')}
        <div class="form-acoes">
          ${novo ? '' : '<button type="button" class="btn sec perigo-texto" id="excluir-orc" style="margin-right:auto">Excluir</button>'}
          <button type="button" class="btn sec" id="voltar2">Voltar</button>
          <button class="btn" id="salvar-orc">${novo ? 'Criar ordem' : 'Salvar alterações'}</button>
        </div>
      </form>
    </section>
    ${novo ? '' : `<section class="cartao" data-painel="execucao" ${abaOrcamento === 'execucao' ? '' : 'hidden'}></section>`}`;

  const voltar = () => irPara('orcamentos');
  $('#voltar', el).addEventListener('click', voltar);
  $('#voltar2', el).addEventListener('click', voltar);
  $('.abas', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-aba]');
    if (!b || b.disabled) return;
    abaOrcamento = b.dataset.aba;
    $$('.aba', el).forEach((x) => x.classList.toggle('ativa', x === b));
    $$('[data-painel]', el).forEach((p) => (p.hidden = p.dataset.painel !== abaOrcamento));
  });
  const form = $('#form-orc', el);
  ligarCampoCliente(form);
  const atualizar = () => {
    $('#total', el).textContent = 'Total: ' + moeda(totalOrcamento({ itens: lerLinhas(form, COLS_ORC), desconto: form.desconto.value }));
  };
  ligarLinhas(form, COLS_ORC, atualizar);
  form.desconto.addEventListener('input', atualizar);
  $('#add-servico', el).addEventListener('change', (e) => {
    const sv = DB.catalogo('servicos').find((x) => x.id === e.target.value);
    e.target.value = '';
    if (!sv) return;
    const tbody = $('.linhas tbody', form);
    // reaproveita uma linha vazia, se houver
    const vazia = $$('tr', tbody).find((tr) => !$('[data-col="descricao"]', tr).value.trim());
    if (!vazia) tbody.insertAdjacentHTML('beforeend', linhaHTML(COLS_ORC, {}));
    const tr = vazia || tbody.lastElementChild;
    $('[data-col="descricao"]', tr).value = (sv.codigo ? sv.codigo + ' - ' : '') + sv.descricao;
    $('[data-col="qtd"]', tr).value = 1;
    $('[data-col="valor"]', tr).value = sv.valor || 0;
    atualizar();
  });
  atualizar();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!clienteValido(form)) return;
    const dados = lerForm(form);
    const itens = lerLinhas(form, COLS_ORC);
    enviando($('#salvar-orc', el), async () => {
      const numero = novo ? await DB.proximoNumero('orcamento') : o.numero;
      const salvo = DB.salvarItem('orcamentos', { ...dados, itens, desconto: num(dados.desconto), id: novo ? undefined : o.id, numero });
      avisar(novo ? `Ordem nº ${numero} criada.` : 'Alterações salvas.');
      if (novo) { abaOrcamento = 'execucao'; irPara('orcamento/' + salvo.id, true); }
    });
  });
  if (novo) return;
  $('#excluir-orc', el).addEventListener('click', () => {
    if (!confirmar(`Excluir a ordem/orçamento nº ${o.numero}?`)) return;
    DB.remover('orcamentos', o.id);
    avisar('Excluído.');
    irPara('orcamentos', true);
  });
  $('#imp-orc', el).addEventListener('click', () => imprimirOrcamento(DB.obter('orcamentos', o.id)));
  $('#imp-faes', el).addEventListener('click', () => imprimirFAES(DB.obter('orcamentos', o.id)));
  painelExecucao($('[data-painel="execucao"]', el), o.id);
}

// Aba "Execução do técnico": link para o técnico e o que ele preencheu.
function painelExecucao(caixa, id) {
  const desenhar = () => {
    const o = DB.obter('orcamentos', id);
    const x = o.execucao || {};
    const tec = DB.catalogo('colaboradores').find((c) => c.id === o.controlador);
    const nomesPragas = Object.fromEntries(FAES.PRAGAS.flatMap((g) => g.itens));
    const lista = (chaves, tabela) => (chaves || []).map((k) => (Object.fromEntries(tabela))[k] || k).join(', ') || '—';
    const msgWhats = `Ordem de serviço nº ${o.numero} - ${nomeCliente(o.clienteId)}\nPreencha a execução e colha a assinatura do cliente:\n`;
    // mantém a etiqueta de situação do topo da página em dia (ex.: "Executado" após o técnico enviar)
    const etiqueta = document.querySelector('.pagina-topo > .tag');
    if (etiqueta) etiqueta.outerHTML = tag(statusOrc(o), STATUS_ORC);
    const abaExec = document.querySelector('[data-aba="execucao"]');
    if (abaExec) abaExec.innerHTML = 'Execução do técnico' + (x.enviadoEm ? ' <span class="cont">assinada</span>' : '');
    caixa.innerHTML = `
      <h3>Link para o técnico</h3>
      <p class="ajuda">Envie o link ao técnico. Ele abre no celular (sem precisar de login), marca os produtos e as pragas,
        digita as quantidades e colhe a assinatura do cliente. O que ele enviar aparece aqui.</p>
      ${o.tokenTecnico ? `
        <div class="link-tecnico"><input id="link" readonly value="${esc(linkTecnico(o))}">
          <button class="btn sec" id="copiar">Copiar</button>
          <a class="btn" id="whats" target="_blank" rel="noopener" href="https://wa.me/${tec && tec.telefone ? '55' + digitos(tec.telefone) : ''}?text=${encodeURIComponent(msgWhats + linkTecnico(o))}">Enviar por WhatsApp${tec ? ' para ' + esc(tec.nome.split(' ')[0]) : ''}</a>
        </div>
        <p class="ajuda"><button class="btn sec peq" id="novo-link">Gerar novo link</button> O link anterior deixa de funcionar.</p>`
      : '<button class="btn" id="gerar-link">Gerar link para o técnico</button>'}
      <h3 style="margin-top:22px">Execução ${x.enviadoEm ? `<span class="tag verde">Enviada em ${dataHoraBR(x.enviadoEm)}</span>` : '<span class="tag amarelo">Aguardando o técnico</span>'}
        <button class="btn sec peq" id="atualizar-exec" style="margin-left:8px">Atualizar</button></h3>
      ${x.enviadoEm ? `
        <div class="conta-info">
          <div><span>Data da execução</span><b>${dataBR(x.dataExecucao) || '—'} ${esc([x.horaInicio, x.horaFim].filter(Boolean).join(' às '))}</b></div>
          <div><span>Áreas</span><b>Interna ${esc(x.areaInterna || '—')} m² · Externa ${esc(x.areaExterna || '—')} m²</b></div>
          <div class="full"><span>Pragas</span><b>${(x.pragas || []).map((k) => nomesPragas[k] || k).join(', ') || '—'}${x.outrasPragas ? ' · Outras: ' + esc(x.outrasPragas) : ''}</b></div>
          <div class="full"><span>Produtos utilizados</span><b>${(x.produtos || []).map((p) => `${esc((FAES.PRODUTOS.find((f) => f.id === FAES.idProduto(p)) || p).nome)}: ${esc(p.quantidade || '—')}${p.local ? ' (' + esc(p.local) + ')' : ''}${p.lote ? ' · lote ' + esc(p.lote) : ''}`).join('<br>') || '—'}</b></div>
          <div><span>Grau de infestação</span><b>Interna: ${esc(x.grauInterno || '—')} · Externa: ${esc(x.grauExterno || '—')}</b></div>
          <div><span>Mapeamento de iscas</span><b>${x.mapeamentoIscas === 'sim' ? 'Sim' : x.mapeamentoIscas === 'nao' ? 'Não' : '—'}</b></div>
          <div><span>Equipamentos</span><b>${lista(x.equipamentos, FAES.EQUIPAMENTOS)}</b></div>
          <div><span>EPI</span><b>${lista(x.epi, FAES.EPI)}</b></div>
          ${x.encontradas ? `<div class="full"><span>Pragas encontradas / situações que favorecem</span><b>${esc(x.encontradas)}</b></div>` : ''}
          ${x.observacoes ? `<div class="full"><span>Observações do técnico</span><b>${esc(x.observacoes)}</b></div>` : ''}
          <div class="full"><span>Assinatura do cliente${x.assinaturaNome ? ' — ' + esc(x.assinaturaNome) : ''}</span>
            ${x.assinatura ? `<img src="${x.assinatura}" class="assinatura-ver" alt="Assinatura do cliente">` : '<b>—</b>'}</div>
          <div class="full"><span>Assinatura do técnico${x.tecnicoNome ? ' — ' + esc(x.tecnicoNome) : ''}</span>
            ${x.assinaturaTecnico ? `<img src="${x.assinaturaTecnico}" class="assinatura-ver" alt="Assinatura do técnico">` : '<b>—</b>'}</div>
        </div>
        <div class="acoes">
          <button class="btn" id="imp-faes2">Imprimir FAES / PDF</button>
          ${statusOrc(o) !== 'finalizado' ? '<button class="btn sec" id="finalizar">Marcar como finalizado</button>' : ''}
          <button class="btn sec" id="liberar">Liberar para o técnico corrigir</button>
        </div>` : '<p class="ajuda">Quando o técnico enviar, os dados e a assinatura aparecem aqui.</p>'}`;
  };
  caixa.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const o = DB.obter('orcamentos', id);
    if (b.id === 'gerar-link' || b.id === 'novo-link') {
      if (b.id === 'novo-link' && !confirmar('Gerar um novo link? O link enviado antes deixa de funcionar.')) return;
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const token = Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join('');
      DB.salvarItem('orcamentos', { id, tokenTecnico: token, ...(statusOrc(o) === 'pendente' ? { status: 'em_execucao' } : {}) });
      desenhar();
      avisar('Link gerado. Copie ou envie pelo WhatsApp.');
    }
    if (b.id === 'copiar') {
      const campoLink = $('#link', caixa);
      campoLink.select();
      try { await navigator.clipboard.writeText(campoLink.value); } catch { document.execCommand('copy'); }
      avisar('Link copiado.');
    }
    if (b.id === 'atualizar-exec') {
      await enviando(b, async () => { await DB.carregar(); desenhar(); });
    }
    if (b.id === 'imp-faes2') imprimirFAES(o);
    if (b.id === 'finalizar') { DB.salvarItem('orcamentos', { id, status: 'finalizado' }); avisar('Ordem finalizada.'); render(); }
    if (b.id === 'liberar') {
      if (!confirmar('Liberar para o técnico enviar de novo? Os dados atuais continuam salvos até ele reenviar.')) return;
      DB.salvarItem('orcamentos', { id, execucao: { ...o.execucao, enviadoEm: null, liberadoEm: new Date().toISOString() } });
      desenhar();
      avisar('Liberado: o técnico pode abrir o mesmo link e enviar novamente.');
    }
  });
  desenhar();
}

function imprimirFAES(o) {
  const cliente = DB.obter('clientes', o.clienteId) || {};
  imprimir(FAES.documento({ ordem: o, cliente, empresa: DB.config(), colaboradores: DB.catalogo('colaboradores') }));
}

function imprimirOrcamento(o) {
  const cli = DB.obter('clientes', o.clienteId);
  const sub = (o.itens || []).reduce((s, i) => s + num(i.qtd || 1) * num(i.valor), 0);
  imprimir(`<div class="doc">${cabecalhoDoc()}
    <h2>Orçamento nº ${o.numero}</h2>
    <div class="info"><div><b>Emissão:</b> ${o.data ? dataBR(o.data) : '—'}</div><div><b>Válido até:</b> ${o.data ? dataBR(somarDias(o.data, o.validadeDias || 15)) : '—'}</div></div>
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

/* Laudos (certificado de dedetização e laudo de caixa d'água): js/laudos.js */

/* =====================================================================
   FINANCEIRO
   ===================================================================== */
const estadoFin = { mes: hojeISO().slice(0, 7), tipo: '' };

function financeiro(el) {
  const hoje = hojeISO(), amanha = somarDias(hoje, 1);
  const doMes = DB.listar('financeiro').filter((f) => (f.vencimento || '').startsWith(estadoFin.mes));
  // "Contas a pagar/receber em aberto" mostra tudo que não foi pago, de qualquer mês.
  const emAberto = { apagar: 'despesa', areceber: 'receita' }[estadoFin.tipo];
  const lista = (emAberto
    ? DB.listar('financeiro').filter((f) => f.tipo === emAberto && !f.pago)
    : doMes.filter((f) => !estadoFin.tipo || f.tipo === estadoFin.tipo))
    .sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
  const somaLista = (fn) => lista.filter(fn).reduce((s, f) => s + num(f.valor), 0);
  const soma = (fn) => doMes.filter(fn).reduce((s, f) => s + num(f.valor), 0);
  const receitas = soma((f) => f.tipo === 'receita');
  const despesas = soma((f) => f.tipo === 'despesa');
  const recebido = soma((f) => f.tipo === 'receita' && f.pago);
  const aReceber = soma((f) => f.tipo === 'receita' && !f.pago);

  el.innerHTML = `
    <div class="cabecalho"><h2>Financeiro</h2>
      <div class="acoes">
        <input type="month" class="busca" style="min-width:0" id="mes" value="${estadoFin.mes}" ${emAberto ? 'hidden' : ''}>
        <select class="busca" style="min-width:0" id="tipo">${opcoes([['', 'Todos'], ['receita', 'Receitas'], ['despesa', 'Despesas'],
          ['apagar', 'Contas a pagar em aberto'], ['areceber', 'Contas a receber em aberto']], estadoFin.tipo)}</select>
        <button class="btn" id="nova-rec">+ Receita</button>
        <button class="btn perigo" id="nova-desp">+ Despesa</button>
        <button class="btn sec" id="importar-extrato">Importar extrato</button>
      </div></div>
    ${emAberto ? `<div class="grade-kpi">
      <div class="kpi"><div class="rotulo">Total ${emAberto === 'despesa' ? 'a pagar' : 'a receber'} em aberto</div><div class="valor">${moeda(somaLista(() => true))}</div></div>
      <div class="kpi"><div class="rotulo">Vencidas</div><div class="valor" style="color:var(--vermelho)">${moeda(somaLista((f) => f.vencimento < hoje))}</div></div>
      <div class="kpi"><div class="rotulo">Vencem hoje e amanhã</div><div class="valor" style="color:#a64500">${moeda(somaLista((f) => f.vencimento === hoje || f.vencimento === amanha))}</div></div>
      <div class="kpi"><div class="rotulo">Próximos 30 dias</div><div class="valor">${moeda(somaLista((f) => f.vencimento > amanha && f.vencimento <= somarDias(hoje, 30)))}</div></div>
    </div>` : `<div class="grade-kpi">
      <div class="kpi"><div class="rotulo">Receitas do mês</div><div class="valor" style="color:var(--primaria)">${moeda(receitas)}</div></div>
      <div class="kpi"><div class="rotulo">Despesas do mês</div><div class="valor" style="color:var(--vermelho)">${moeda(despesas)}</div></div>
      <div class="kpi"><div class="rotulo">Resultado previsto</div><div class="valor">${moeda(receitas - despesas)}</div></div>
      <div class="kpi"><div class="rotulo">Recebido / a receber</div><div class="valor" style="font-size:18px">${moeda(recebido)} / ${moeda(aReceber)}</div></div>
    </div>`}
    <div class="cartao" style="padding:0">${lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Cliente</th><th>Categoria</th><th class="num">Valor</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
      ${lista.map((f) => {
        const sit = f.pago ? `<span class="tag verde">${f.tipo === 'receita' ? 'Recebido' : 'Pago'}${f.dataPagamento ? ' ' + dataBR(f.dataPagamento) : ''}</span>`
          : f.vencimento < hoje ? '<span class="tag vermelho">Vencido</span>'
          : f.vencimento === hoje ? '<span class="tag laranja">Vence hoje</span>'
          : f.vencimento === amanha ? '<span class="tag amarelo">Vence amanhã</span>' : '<span class="tag cinza">Em aberto</span>';
        return `<tr><td>${dataBR(f.vencimento)}</td><td>${esc(f.descricao)}</td><td>${f.clienteId ? esc(nomeCliente(f.clienteId)) : ''}</td><td>${esc(f.categoria)}</td>
        <td class="num" style="color:${f.tipo === 'receita' ? 'var(--primaria)' : 'var(--vermelho)'}">${f.tipo === 'despesa' ? '- ' : ''}${moeda(f.valor)}</td><td>${sit}</td>
        <td><div class="acoes">
          ${!f.pago ? `<button class="btn peq" data-acao="pagar" data-id="${f.id}">${f.tipo === 'receita' ? 'Recebido' : 'Pago'}</button>` : ''}
          <button class="btn sec peq" data-acao="editar" data-id="${f.id}">Editar</button>
          <button class="btn sec peq" data-acao="excluir" data-id="${f.id}">Excluir</button>
        </div></td></tr>`;
      }).join('')}
    </tbody></table></div>` : `<div class="vazio">${emAberto ? 'Nenhuma conta em aberto.' : 'Nenhum lançamento neste mês.'}</div>`}</div>`;

  $('#mes', el).addEventListener('change', (e) => { estadoFin.mes = e.target.value || hojeISO().slice(0, 7); financeiro(el); });
  $('#tipo', el).addEventListener('change', (e) => { estadoFin.tipo = e.target.value; financeiro(el); });
  $('#nova-rec', el).addEventListener('click', () => formFinanceiro(null, { tipo: 'receita', categoria: 'Serviços' }));
  $('#nova-desp', el).addEventListener('click', () => formFinanceiro(null, { tipo: 'despesa' }));
  $('#importar-extrato', el).addEventListener('click', importarExtrato);
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
   CADASTROS: serviços, colaboradores e produtos (somente administrador)
   ===================================================================== */
const FUNCOES_COLAB = [['atendimento', 'Atendimento / preenchimento'], ['avaliador', 'Avaliação prévia'],
  ['responsavel_tecnico', 'Responsável técnico'], ['controlador', 'Técnico / controlador de pragas'], ['vendedor', 'Vendedor']];
// Exemplos tirados da FAES em papel, usados quando os cadastros ainda estão vazios.
const EXEMPLOS_CADASTRO = {
  servicos: [{ codigo: '48', descricao: 'MANUTENÇÃO DEDETIZAÇÃO E DESRATIZAÇÃO', valor: 260 }],
  colaboradores: [
    { codigo: '2', nome: 'LUCIANO', funcoes: ['atendimento', 'avaliador', 'vendedor'] },
    { codigo: '19', nome: 'RICARDO M. PEDROSO', funcoes: ['responsavel_tecnico'] },
    { codigo: '27', nome: 'JUNIOR BERBET', funcoes: ['controlador'] },
  ],
  produtos: [
    { nome: 'LAMBDA-CIALOTRINA', registro: '3.3308.0007', grupo: 'PIRETRINAS E PIRETRÓIDES', concentracao: '5% Lambdacialotrina', diluente: 'Água', antidoto: 'Anti-histamínicos e tratamento sintomático', acao: 'Toxicidade aguda' },
    { nome: 'FIPRONIL', registro: '3.0404.0029', grupo: 'FENIL PIRAZOL', concentracao: '2,5% Fipronil', diluente: 'Água', antidoto: 'Tratamento sintomático', acao: 'Toxicidade aguda' },
    { nome: 'DICLORVÓS', registro: '3.03308-0', grupo: 'ORGANOFOSFORADOS', concentracao: '76,27% Diclorvós', diluente: 'Água', antidoto: 'Atropina, oximas e tratamento', acao: 'Toxicidade aguda' },
    { nome: 'DIFETIALONA', registro: '3.3222.0007', grupo: 'BENZOTIOPIRANONAS', concentracao: '0,005% Difenacoum', diluente: 'Bloco', antidoto: 'Vitamina K1 e tratamento sintomático', acao: 'Toxicidade aguda' },
  ],
};
const DEF_CADASTRO = {
  servicos: {
    titulo: 'Serviços', singular: 'serviço',
    colunas: [['codigo', 'Cód.'], ['descricao', 'Descrição'], ['valor', 'Valor', (v) => moeda(v)]],
    campos: (x) => `${campo('Código', 'codigo', x.codigo)}${campo('Valor padrão (R$)', 'valor', x.valor, 'number', 'step="0.01" min="0"')}
      ${campo('Descrição *', 'descricao', x.descricao, 'text', 'required full')}
      ${campo('Detalhes (opcional)', 'detalhes', x.detalhes, 'textarea', 'full')}`,
    ler: (d) => ({ ...d, valor: num(d.valor) }),
  },
  colaboradores: {
    titulo: 'Colaboradores', singular: 'colaborador',
    colunas: [['codigo', 'Cód.'], ['nome', 'Nome'], ['funcoes', 'Funções', (v) => (v || []).map((f) => (FUNCOES_COLAB.find(([k]) => k === f) || [f, f])[1]).join(', ')],
      ['registro', 'Registro no conselho'], ['telefone', 'Telefone']],
    campos: (x) => `${campo('Código', 'codigo', x.codigo)}${campo('Nome *', 'nome', x.nome, 'text', 'required')}
      ${campo('Telefone / WhatsApp', 'telefone', x.telefone, 'tel')}${campo('Nº registro no conselho de classe', 'registro', x.registro, 'text', 'placeholder="Ex.: CRQ 123456"')}
      <div class="full permissoes"><b>Funções na ordem de serviço</b><div class="grade-perm">
        ${FUNCOES_COLAB.map(([k, r]) => `<label class="check"><input type="checkbox" name="f_${k}" ${(x.funcoes || []).includes(k) ? 'checked' : ''}> ${r}</label>`).join('')}</div></div>`,
    ler: (d) => {
      const resto = { ...d };
      const funcoes = FUNCOES_COLAB.map(([k]) => k).filter((k) => resto['f_' + k]);
      FUNCOES_COLAB.forEach(([k]) => delete resto['f_' + k]);
      return { ...resto, funcoes };
    },
  },
  produtos: {
    titulo: 'Produtos', singular: 'produto',
    colunas: [['codigo', 'Cód.'], ['nome', 'Nome'], ['registro', 'Nº registro'], ['grupo', 'Grupo'], ['concentracao', 'Concentração'], ['antidoto', 'Antídoto e tratamento']],
    campos: (x) => `${campo('Código', 'codigo', x.codigo)}${campo('Nome do produto *', 'nome', x.nome, 'text', 'required')}${campo('Nº registro (MS)', 'registro', x.registro)}
      ${campo('Grupo químico', 'grupo', x.grupo)}${campo('Concentração', 'concentracao', x.concentracao)}
      ${campo('Diluente', 'diluente', x.diluente, 'text', 'placeholder="Água, bloco, outros..."')}${campo('Ação tóxica', 'acao', x.acao)}
      ${campo('Antídoto e tratamento', 'antidoto', x.antidoto, 'text', 'full')}`,
    ler: (d) => d,
  },
};
let abaCadastro = 'servicos';

function cadastros(el) {
  const def = DEF_CADASTRO[abaCadastro];
  const lista = DB.catalogo(abaCadastro);
  el.innerHTML = `
    <div class="cabecalho"><h2>Cadastros</h2><div class="acoes">
      ${abaCadastro !== 'colaboradores' ? '<button class="btn sec perigo-texto" id="excluir-tudo">Excluir tudo</button><button class="btn sec" id="importar-itens">Importar planilha</button>' : ''}
      <button class="btn" id="novo-item">+ Novo ${def.singular}</button></div></div>
    <p class="ajuda">Serviços e colaboradores usados na criação das ordens de serviço.${abaCadastro === 'produtos' ? ' Os venenos da ordem de serviço (FAES) são sempre os 4 da ficha (Lambida-Cialotrina, Fipronil, Diclovos e Difetialona); este cadastro é só para consulta.' : ''}</p>
    <div class="abas">${Object.entries(DEF_CADASTRO).map(([k, d]) => `<button class="aba ${abaCadastro === k ? 'ativa' : ''}" data-aba="${k}">${d.titulo} <span class="cont">${DB.catalogo(k).length}</span></button>`).join('')}</div>
    <div class="cartao" style="padding:0" id="lista-cad">${lista.length ? `<div class="tabela-wrap"><table><thead><tr>${def.colunas.map(([, r]) => `<th>${r}</th>`).join('')}<th>Situação</th><th>Ações</th></tr></thead><tbody>
    ${lista.slice().sort((a, b) => (Number(a.codigo) || 0) - (Number(b.codigo) || 0) || String(a.nome || a.descricao || '').localeCompare(String(b.nome || b.descricao || '')))
      .map((x) => `<tr class="${x.ativo === false ? 'inativo' : ''}">${def.colunas.map(([k, , f]) => `<td>${f ? f(x[k]) : esc(x[k] || '')}</td>`).join('')}
      <td>${x.ativo === false ? '<span class="tag cinza">Inativo</span>' : '<span class="tag verde">Ativo</span>'}</td>
      <td><div class="acoes"><button class="btn sec peq" data-editar="${x.id}">Editar</button>
        <button class="btn sec peq" data-ativo="${x.id}">${x.ativo === false ? 'Ativar' : 'Desativar'}</button></div></td></tr>`).join('')}
    </tbody></table></div>`
    : `<div class="vazio">Nenhum ${def.singular} cadastrado.
       <p><button class="btn sec" id="exemplos">Começar com os exemplos da ficha FAES</button></p></div>`}</div>`;

  $('.abas', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-aba]');
    if (b) { abaCadastro = b.dataset.aba; cadastros(el); }
  });
  $('#novo-item', el).addEventListener('click', () => formCadastro(abaCadastro, null, () => cadastros(el)));
  const imp = $('#importar-itens', el);
  if (imp) imp.addEventListener('click', () => importarItensCadastro(() => cadastros(el)));
  const exc = $('#excluir-tudo', el);
  if (exc) exc.addEventListener('click', () => excluirTudo(abaCadastro));
  const ex = $('#exemplos', el);
  if (ex) ex.addEventListener('click', () => enviando(ex, async () => {
    await DB.salvarCatalogo(abaCadastro, EXEMPLOS_CADASTRO[abaCadastro].map((x) => ({ ...x, id: DB.novoId(), ativo: true })));
    avisar('Exemplos cadastrados. Confira e ajuste o que precisar.');
    cadastros(el);
  }));
  $('#lista-cad', el).addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-editar]');
    if (ed) formCadastro(abaCadastro, ed.dataset.editar, () => cadastros(el));
    const at = e.target.closest('[data-ativo]');
    if (at) {
      const nova = DB.catalogo(abaCadastro).map((x) => (x.id === at.dataset.ativo ? { ...x, ativo: x.ativo === false } : x));
      await enviando(at, () => DB.salvarCatalogo(abaCadastro, nova));
      cadastros(el);
    }
  });
}

function formCadastro(tipo, id, aoSalvar) {
  const def = DEF_CADASTRO[tipo];
  const x = (id && DB.catalogo(tipo).find((y) => y.id === id)) || { ativo: true, codigo: DB.proximoCodigo(tipo) };
  abrirModal(`${id ? 'Editar' : 'Novo'} ${def.singular}`, `
    <form class="form">${def.campos(x)}
      <label class="check full"><input type="checkbox" name="ativo" ${x.ativo === false ? '' : 'checked'}> Ativo (aparece para escolher nas ordens)</label>
      <div class="form-acoes">
        ${id ? '<button type="button" class="btn sec perigo-texto" id="excluir-cad" style="margin-right:auto">Excluir</button>' : ''}
        <button type="button" class="btn sec" data-cancelar>Cancelar</button><button class="btn" id="salvar-cad">Salvar</button></div>
    </form>`, (raiz) => {
    const form = $('form', raiz);
    $('[data-cancelar]', raiz).addEventListener('click', fecharModal);
    if (id) {
      $('#excluir-cad', raiz).addEventListener('click', (e) => {
        if (!confirmar(`Excluir este ${def.singular}? Ordens antigas que o usam deixam de mostrar o nome. Se ele só não for mais usado, prefira "Desativar".`)) return;
        enviando(e.target, async () => {
          await DB.salvarCatalogo(tipo, DB.catalogo(tipo).filter((y) => y.id !== id));
          fecharModal();
          aoSalvar();
        });
      });
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const dados = def.ler(lerForm(form));
      if (dados.codigo && DB.catalogo(tipo).some((y) => y.id !== id && String(y.codigo) === String(dados.codigo))) {
        avisar(`O código ${dados.codigo} já está em uso.`, 'erro');
        return;
      }
      enviando($('#salvar-cad', raiz), async () => {
        const lista = DB.catalogo(tipo);
        const item = { ...x, ...dados, id: id || DB.novoId() };
        await DB.salvarCatalogo(tipo, id ? lista.map((y) => (y.id === id ? item : y)) : [...lista, item]);
        fecharModal();
        avisar('Salvo.');
        aoSalvar();
      });
    });
  });
}

// Importa serviços e produtos de uma planilha de itens (ex.: a lista de itens do sistema antigo).
// Cada linha pode ir para Serviços, Produtos ou ficar de fora; o app sugere pelo tipo, NCM e descrição.
const CAMPOS_IMPORTACAO_ITENS = [
  ['codigo', 'Código', ['codigo', 'cod', 'codigo do item', 'id']],
  ['descricao', 'Descrição *', ['descricao', 'nome', 'item', 'produto', 'servico', 'descricao do item']],
  ['valor', 'Valor', ['valor de venda', 'valor', 'preco', 'preco de venda', 'valor venda']],
  ['tipo', 'Tipo', ['tipo', 'tipo do item']],
  ['ncm', 'NCM', ['ncm']],
  ['unidade', 'Unidade', ['unidade', 'un', 'und']],
  ['situacao', 'Situação', ['situacao', 'status', 'ativo']],
];
const PALAVRAS_SERVICO = /^(limpeza|dedetiz|desratiz|descupin|desentup|instalac|tratamento|retirada|revestimento|fechamento|capina|manutenc|reforco|sanitiz|troca|visita|orcamento|renovac|deslocamento|esvaziamento|aplicac|boia|repelente)/;
function destinoSugerido(item) {
  if (normalizar(item.situacao).startsWith('inativ')) return '';
  if (PALAVRAS_SERVICO.test(normalizar(item.descricao))) return 'servicos';
  if (digitos(item.ncm).startsWith('3808')) return 'produtos';
  return normalizar(item.tipo).startsWith('servi') ? 'servicos' : '';
}

function importarItensCadastro(aoTerminar) {
  abrirModal('Importar serviços e produtos de planilha', `
    <div class="importacao">
      <p>Escolha o arquivo <b>.csv</b> com os itens. A primeira linha deve ter os nomes das colunas
        (por exemplo: codigo; descricao; valor de venda; tipo; situacao).</p>
      <p class="ajuda">Para cada linha você escolhe se ela entra como <b>serviço</b>, como <b>produto</b> (veneno/isca usado na ficha FAES)
        ou se fica de fora. Itens que já existem (mesmo código ou mesma descrição) são atualizados, sem duplicar.</p>
      <div class="acoes"><label class="btn">Escolher arquivo .csv<input type="file" id="arquivo-csv" accept=".csv,text/csv,.txt" hidden></label></div>
      <div id="etapa-itens"></div>
    </div>`, (raiz) => {
    $('#arquivo-csv', raiz).addEventListener('change', async (e) => {
      const arq = e.target.files[0];
      e.target.value = '';
      if (!arq) return;
      try {
        const linhas = lerCSV(await lerArquivoTexto(arq));
        if (linhas.length < 2) throw new Error('O arquivo precisa ter a linha de títulos e pelo menos um item.');
        const mapa = sugerirColunas(linhas[0].map((c) => c.trim()), CAMPOS_IMPORTACAO_ITENS);
        if (mapa.descricao === undefined) throw new Error('Não encontrei a coluna de descrição do item.');
        etapaItens($('#etapa-itens', raiz), arq.name, linhas.slice(1), mapa, aoTerminar);
      } catch (err) {
        avisar('Não foi possível ler o arquivo: ' + err.message, 'erro');
      }
    });
  });
}

function etapaItens(el, nomeArquivo, corpo, mapa, aoTerminar) {
  const v = (linha, k) => (mapa[k] === undefined ? '' : String(linha[mapa[k]] ?? '').trim());
  const itens = corpo.map((linha) => ({
    codigo: v(linha, 'codigo').replace(/\.0+$/, ''), descricao: v(linha, 'descricao').replace(/\s+/g, ' ').trim(),
    valor: valorImportado(v(linha, 'valor')), tipo: v(linha, 'tipo'), ncm: v(linha, 'ncm'),
    unidade: v(linha, 'unidade'), situacao: v(linha, 'situacao'),
  })).filter((x) => x.descricao);
  itens.forEach((x) => (x.destino = destinoSugerido(x)));
  // Mesma descrição repetida no arquivo: a primeira vale, as outras ficam de fora (pode mudar).
  const vistos = new Set();
  itens.forEach((x) => {
    if (!x.destino) return;
    const k = x.destino + ':' + normalizar(x.descricao);
    if (vistos.has(k)) { x.destino = ''; x.repetido = true; } else vistos.add(k);
  });

  // Procura o item já cadastrado: pelo código ou, se o cadastrado não tiver código, pela descrição/nome.
  const existente = (x, destino, lista = DB.catalogo(destino), usados = new Set()) => {
    const nome = (y) => normalizar(destino === 'servicos' ? y.descricao : y.nome);
    const livres = lista.filter((y) => !usados.has(y.id));
    return (x.codigo && livres.find((y) => String(y.codigo || '') === x.codigo))
      || livres.find((y) => (!y.codigo || !x.codigo) && nome(y) === normalizar(x.descricao));
  };
  const OPCOES = [['servicos', 'Serviço'], ['produtos', 'Produto'], ['', 'Não importar']];
  el.innerHTML = `
    <h3>Arquivo: ${esc(nomeArquivo)} (${itens.length} itens)</h3>
    <div class="acoes"><span class="ajuda">Mudar todos os da lista para:</span>
      ${OPCOES.map(([k, r]) => `<button type="button" class="btn sec peq" data-todos="${k}">${r}</button>`).join('')}</div>
    <div class="tabela-wrap itens-import"><table><thead><tr><th>Cód.</th><th>Descrição</th><th>No arquivo</th><th class="num">Valor</th><th>Importar como</th><th></th></tr></thead><tbody>
      ${itens.map((x, i) => `<tr><td>${esc(x.codigo)}</td><td>${esc(x.descricao)}</td>
        <td>${esc([x.tipo, x.situacao].filter(Boolean).join(' · '))}${x.repetido ? ' <span class="tag amarelo">repetido</span>' : ''}</td>
        <td class="num">${moeda(x.valor)}</td>
        <td><select data-item="${i}">${OPCOES.map(([k, r]) => `<option value="${k}" ${x.destino === k ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
        <td data-estado="${i}"></td></tr>`).join('')}
    </tbody></table></div>
    <div id="resumo-itens" class="resumo-importacao"></div>
    <div class="form-acoes"><button type="button" class="btn sec" data-cancelar>Cancelar</button>
      <button type="button" class="btn" id="confirmar-itens">Importar</button></div>`;

  const atualizarResumo = () => {
    const cont = { servicos: [0, 0], produtos: [0, 0] };
    const usados = new Set();
    itens.forEach((x, i) => {
      const cel = $(`[data-estado="${i}"]`, el);
      if (!x.destino) { cel.innerHTML = ''; return; }
      const ja = existente(x, x.destino, undefined, usados);
      if (ja) usados.add(ja.id);
      cont[x.destino][ja ? 1 : 0]++;
      cel.innerHTML = ja ? '<span class="tag cinza">já existe, atualiza</span>' : '<span class="tag verde">novo</span>';
    });
    const fora = itens.filter((x) => !x.destino).length;
    $('#resumo-itens', el).innerHTML = `
      <span class="tag verde">Serviços: ${cont.servicos[0]} novos${cont.servicos[1] ? `, ${cont.servicos[1]} atualizados` : ''}</span>
      <span class="tag laranja">Produtos: ${cont.produtos[0]} novos${cont.produtos[1] ? `, ${cont.produtos[1]} atualizados` : ''}</span>
      ${fora ? `<span class="tag cinza">${fora} ficam de fora</span>` : ''}`;
    $('#confirmar-itens', el).disabled = fora === itens.length;
  };
  el.addEventListener('change', (e) => {
    const s = e.target.closest('[data-item]');
    if (s) { itens[s.dataset.item].destino = s.value; atualizarResumo(); }
  });
  $$('[data-todos]', el).forEach((b) => b.addEventListener('click', () => {
    itens.forEach((x) => (x.destino = b.dataset.todos));
    $$('[data-item]', el).forEach((s) => (s.value = b.dataset.todos));
    atualizarResumo();
  }));
  $('[data-cancelar]', el).addEventListener('click', fecharModal);
  $('#confirmar-itens', el).addEventListener('click', (e) => enviando(e.target, async () => {
    const res = [];
    for (const destino of ['servicos', 'produtos']) {
      const lista = DB.catalogo(destino).map((y) => ({ ...y }));
      let novos = 0, atualizados = 0;
      const usados = new Set();
      for (const x of itens.filter((y) => y.destino === destino)) {
        const base = destino === 'servicos'
          ? { descricao: x.descricao, ...(x.valor > 0 ? { valor: x.valor } : {}) }
          : { nome: x.descricao };
        const dados = { ...base, ...(x.codigo ? { codigo: x.codigo } : {}), ...(x.unidade ? { unidade: x.unidade } : {}) };
        const alvo = existente(x, destino, lista, usados);
        if (alvo) { Object.assign(alvo, dados); usados.add(alvo.id); atualizados++; } else {
          lista.push({ ...(destino === 'servicos' ? { valor: 0 } : {}), ...dados, id: DB.novoId(), ativo: true });
          novos++;
        }
      }
      if (novos || atualizados) {
        await DB.salvarCatalogo(destino, lista);
        res.push(`${destino === 'servicos' ? 'Serviços' : 'Produtos'}: ${novos} novos, ${atualizados} atualizados`);
      }
    }
    fecharModal();
    avisar((res.join('. ') || 'Nada importado') + '.');
    aoTerminar();
  }));
  atualizarResumo();
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

/* ---------- Excluir tudo (clientes ou orçamentos), só administrador ---------- */
function excluirTudo(col) {
  // Serviços e produtos ficam nos cadastros (catálogos), não em tabelas próprias.
  const catalogo = ['servicos', 'produtos'].includes(col);
  const nomes = { clientes: ['clientes', 'cliente'], orcamentos: ['orçamentos/ordens de serviço', 'orçamento'],
    servicos: ['serviços cadastrados', 'serviço'], produtos: ['produtos cadastrados', 'produto'] }[col];
  const total = catalogo ? DB.catalogo(col).length : DB.listar(col).length;
  if (!total) { avisar(`Não há ${nomes[0]} para excluir.`, 'erro'); return; }
  const PALAVRA = 'EXCLUIR TUDO';
  abrirModal(`Excluir todos os ${nomes[0]}`, `
    <div class="alerta-perigo">
      <p><b>Atenção:</b> isto apaga <b>${total.toLocaleString('pt-BR')} ${nomes[0]}</b> do banco de dados, para todos os usuários.
        <b>Não é possível desfazer.</b></p>
      ${col === 'clientes' ? '<p>Orçamentos, agendamentos, laudos e lançamentos ligados a esses clientes continuam no sistema, mas ficam sem o nome do cliente.</p>'
        : catalogo ? '<p>As ordens já criadas continuam com o que foi gravado nelas. Se quiser só tirar um item das próximas ordens, prefira "Desativar".</p>'
        : '<p>A numeração dos próximos orçamentos continua de onde parou (não volta para 1).</p>'}
    </div>
    <p>1. Antes, baixe uma cópia de segurança: <button type="button" class="btn sec peq" id="ex-backup">Baixar backup</button></p>
    <form class="form" id="form-ex">
      <label class="full">2. Para confirmar, digite <b>${PALAVRA}</b><input name="confirma" autocomplete="off" placeholder="${PALAVRA}"></label>
      <div class="form-acoes"><button type="button" class="btn sec" data-cancelar>Cancelar</button>
        <button class="btn perigo" id="ex-confirmar" disabled>Excluir ${total.toLocaleString('pt-BR')} ${nomes[0]}</button></div>
    </form>`, (raiz) => {
    const form = $('#form-ex', raiz);
    const botao = $('#ex-confirmar', raiz);
    $('[data-cancelar]', raiz).addEventListener('click', fecharModal);
    $('#ex-backup', raiz).addEventListener('click', baixarBackup);
    form.confirma.addEventListener('input', () => (botao.disabled = form.confirma.value.trim().toUpperCase() !== PALAVRA));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (form.confirma.value.trim().toUpperCase() !== PALAVRA) return;
      enviando(botao, async () => {
        if (catalogo) await DB.salvarCatalogo(col, []); else await DB.removerTudo(col);
        fecharModal();
        avisar(`Todos os ${nomes[0]} foram excluídos.`);
        render();
      });
    });
  });
}

/* =====================================================================
   CONFIGURAÇÕES (somente administrador)
   ===================================================================== */
function baixarBackup() {
  const blob = new Blob([DB.exportar()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `backup-berbert-${hojeISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function configuracoes(el) {
  const c = DB.config();
  el.innerHTML = `
    <div class="cabecalho"><h2>Configurações</h2></div>
    <div class="cartao"><h3>Dados da empresa (aparecem nos orçamentos e laudos)</h3>
      <form class="form" id="form-cfg">
        ${campo('Nome da empresa', 'empresa', c.empresa || 'Dedetizadora Berbert', 'text', 'full')}
        ${campo('CNPJ', 'cnpj', c.cnpj)}
        ${campo('Inscrição estadual (IE)', 'ie', c.ie)}
        ${campo('Licença sanitária / alvará', 'licenca', c.licenca)}
        ${campo('Licença ambiental', 'licencaAmbiental', c.licencaAmbiental)}
        ${campo('Telefone em caso de intoxicação', 'telefoneIntoxicacao', c.telefoneIntoxicacao || '0800-771-3733')}
        ${campo('Telefone', 'telefone', c.telefone)}
        ${campo('E-mail', 'email', c.email)}
        ${campo('Endereço', 'endereco', c.endereco, 'text', 'full')}
        ${campo('Responsável técnico', 'responsavelTecnico', c.responsavelTecnico)}
        ${campo('Registro do responsável (CRQ/CRBio)', 'registroResp', c.registroResp)}
        <div class="form-acoes"><button class="btn" id="salvar-cfg">Salvar dados</button></div>
      </form></div>
    <div class="cartao"><h3>Ligações (vencimentos e prospecção)</h3>
      <form class="form" id="form-lig">
        ${campo('Prazo de retorno padrão (meses depois do último serviço)', 'prazoRetorno', c.prazoRetorno || 6, 'number', 'min="1" max="36"')}
        <label class="full">Prazos por tipo de serviço (uma regra por linha: palavra da descrição = meses)
          <textarea name="regrasRetorno" rows="4">${esc(c.regrasRetorno ?? REGRAS_RETORNO)}</textarea></label>
        <label class="full">Mensagem de WhatsApp para vencimentos ({nome}, {servico}, {data}, {vencimento}, {empresa})
          <textarea name="msgVencimento" rows="3">${esc(c.msgVencimento || MSG_VENCIMENTO)}</textarea></label>
        <label class="full">Mensagem de WhatsApp para prospecção ({nome}, {empresa})
          <textarea name="msgProspeccao" rows="3">${esc(c.msgProspeccao || MSG_PROSPECCAO)}</textarea></label>
        <div class="form-acoes"><button class="btn" id="salvar-lig">Salvar</button></div>
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
  $('#form-lig', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const dados = lerForm(e.target);
    enviando($('#salvar-lig', el), async () => {
      await DB.salvarConfig(dados);
      avisar('Configurações das ligações salvas.');
    });
  });
  $('#exportar', el).addEventListener('click', baixarBackup);
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
  $('#notif').hidden = true;
  $('#notif-painel').hidden = true;
  resumoMostrado = false;
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
