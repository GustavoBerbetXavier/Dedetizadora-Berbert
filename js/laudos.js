// Laudos: certificado de dedetização e laudo de limpeza de caixa d'água (com fotos do antes e depois).
// Os formulários usam opções para marcar e selecionar; o texto livre fica só para "outros" e observações.

const PRAGAS_LAUDO = ['Baratas', 'Formigas', 'Ratos', 'Cupins', 'Escorpiões', 'Aranhas', 'Moscas', 'Mosquitos', 'Pulgas',
  'Percevejos', 'Carrapatos', 'Traças', 'Pombos', 'Morcegos', 'Abelhas / vespas'];
const AREAS_LAUDO = ['Cozinha', 'Banheiros', 'Salas', 'Quartos', 'Escritórios', 'Depósito / estoque', 'Área externa', 'Garagem',
  'Jardim', 'Telhado / forro', 'Rede de esgoto', 'Caixas de gordura', 'Áreas comuns', 'Área de produção'];
const METODOS_LAUDO = ['Pulverização', 'Gel', 'Iscas em bloco', 'Iscas granuladas', 'Porta-iscas', 'Polvilhamento',
  'Atomização / nebulização', 'Termonebulização', 'Barreira química'];
const RECOMENDACOES_DEDET = [
  'Manter o ambiente fechado por pelo menos 2 horas após a aplicação.',
  'Evitar contato de crianças e animais com as áreas tratadas até a secagem completa.',
  'Não lavar as áreas tratadas por 7 dias.',
  'Não remover nem mexer nos porta-iscas instalados.',
  'Guardar alimentos e utensílios fechados durante a aplicação.',
];
const GARANTIAS = [[30, '30 dias'], [60, '60 dias'], [90, '90 dias'], [120, '120 dias'], [180, '6 meses'], [365, '1 ano']];

const TIPOS_RESERV = ["Caixa d'água", 'Cisterna', 'Reservatório elevado', 'Reservatório enterrado'];
const MATERIAIS_RESERV = ['Polietileno', 'Fibra de vidro', 'Concreto', 'Fibrocimento (amianto)', 'Inox', 'Metálico'];
const CAPACIDADES = [250, 310, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 25000, 30000, 40000, 50000];
const LOCAIS_RESERV = ['Telhado / forro', 'Sobre a laje', 'Torre', 'Térreo', 'Subsolo / enterrado', 'Área externa'];
const CONDICOES_CAIXA = ['Sedimentos / sujeira no fundo', 'Lodo ou limo nas paredes', 'Insetos ou larvas', 'Animais mortos',
  'Tampa ausente, quebrada ou mal vedada', 'Rachaduras ou infiltrações', 'Ferrugem / corrosão', 'Boia com defeito',
  'Bom estado de conservação'];
const PROCEDIMENTOS_CAIXA = [
  'Fechamento do registro de entrada e esvaziamento do reservatório.',
  'Vedação da saída para a sujeira não descer pela tubulação.',
  'Escovação das paredes, fundo e tampa com escova de fibra (sem sabão, detergente ou produtos abrasivos).',
  'Remoção dos resíduos e da água suja, com enxágue.',
  'Desinfecção das paredes com solução clorada, respeitando o tempo de contato.',
  'Esvaziamento, enxágue final e reabastecimento.',
  'Fechamento com a tampa e verificação da vedação.',
];
const DESINFETANTES = ['Hipoclorito de sódio 2,5%', 'Hipoclorito de sódio 10 a 12%', 'Hipoclorito de cálcio (cloro granulado)'];
const CONCENTRACOES_SOL = ['50 ppm de cloro livre', '100 ppm de cloro livre', '200 ppm de cloro livre'];
const TEMPOS_CONTATO = ['30 minutos', '1 hora', '2 horas'];
const VALIDADES_CAIXA = [[3, '3 meses'], [6, '6 meses'], [12, '12 meses']];
const RECOMENDACOES_CAIXA = [
  'Realizar nova limpeza e desinfecção a cada 6 meses.',
  'Manter o reservatório sempre tampado e bem vedado.',
  'Não usar a água nas primeiras horas após o reabastecimento, se houver cheiro forte de cloro.',
  'Verificar periodicamente a boia e a tampa.',
  'Manter o acesso ao reservatório limpo e livre de entulho.',
];

/* ---------- Ajudantes de formulário ---------- */
// Grupo de opções para marcar. 'marcados' é a lista do que já estava marcado.
function grupoMarcar(nome, opcoesLista, marcados = [], colunas = '') {
  const sel = new Set(marcados.map(normalizar));
  return `<div class="grupo-marcar ${colunas}">${opcoesLista.map((o) => `<label class="opcao-marcar"><input type="checkbox" data-grupo="${nome}" value="${esc(o)}"
    ${sel.has(normalizar(o)) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>`;
}
const lerGrupo = (raiz, nome) => $$(`[data-grupo="${nome}"]:checked`, raiz).map((c) => c.value);
// Separa um texto antigo ("Baratas, ratos, pombos no forro") no que existe nas opções e no resto.
function separarTexto(texto, opcoesLista) {
  const marcados = [], resto = [];
  String(texto || '').split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean).forEach((p) => {
    const o = opcoesLista.find((x) => normalizar(x) === normalizar(p));
    if (o) marcados.push(o); else resto.push(p);
  });
  return { marcados, outros: resto.join(', ') };
}
const juntar = (lista, outros) => [...lista, ...(outros ? [outros] : [])].join(', ');
// Responsáveis técnicos e técnicos para escolher: o do cadastro da empresa e os colaboradores.
function pessoasLaudo(funcao) {
  const cfg = DB.config();
  const lista = [];
  const com = colaboradoresAtivos().filter((c) => (c.funcoes || []).includes(funcao));
  const sem = colaboradoresAtivos().filter((c) => !(c.funcoes || []).includes(funcao));
  [...com, ...sem].forEach((c) => lista.push({ nome: (c.codigo ? c.codigo + ' - ' : '') + c.nome, registro: c.registro || '' }));
  if (funcao === 'responsavel_tecnico' && cfg.responsavelTecnico && !lista.some((p) => p.nome.endsWith(cfg.responsavelTecnico))) {
    lista.unshift({ nome: cfg.responsavelTecnico, registro: cfg.registroResp || '' });
  }
  return lista;
}
function seletorPessoa(nome, funcao, atual) {
  const lista = pessoasLaudo(funcao);
  if (atual && !lista.some((p) => p.nome === atual)) lista.unshift({ nome: atual, registro: '' });
  return `<select name="${nome}"><option value="">— selecione —</option>${lista.map((p) => `<option value="${esc(p.nome)}" data-registro="${esc(p.registro)}"
    ${p.nome === atual ? 'selected' : ''}>${esc(p.nome)}${p.registro ? ' (' + esc(p.registro) + ')' : ''}</option>`).join('')}</select>`;
}
const registroDe = (form, nome) => (form[nome].selectedOptions[0] || {}).dataset?.registro || '';
const opcoesSimples = (lista, atual) => lista.map((o) => { const [v, r] = Array.isArray(o) ? o : [o, o];
  return `<option value="${esc(v)}" ${String(v) === String(atual) ? 'selected' : ''}>${esc(r)}</option>`; }).join('');

/* ---------- Lista ---------- */
let padraoNovoLaudo = {};
function formLaudo(id, padrao = {}) {
  padraoNovoLaudo = padrao;
  irPara('laudo/' + (id || 'novo'));
}
const validadeLaudo = (l) => (l.tipo === 'caixa' ? (l.validadeMeses ? somarMeses(l.data, Number(l.validadeMeses)) : '')
  : (l.garantiaDias ? somarDias(l.data, l.garantiaDias) : ''));

function laudos(el) {
  const lista = DB.listar('laudos').sort((a, b) => b.numero - a.numero);
  el.innerHTML = `
    <div class="cabecalho"><h2>Laudos / Certificados</h2><div class="acoes">
      <button class="btn" id="novo-caixa">+ Laudo de caixa d'água</button>
      <button class="btn sec" id="novo">+ Certificado de dedetização</button></div></div>
    <div class="cartao" style="padding:0">${lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Tipo / serviço</th><th>Validade</th><th>Ações</th></tr></thead><tbody>
      ${lista.map((l) => {
        const ate = validadeLaudo(l);
        return `<tr><td>${l.numero}</td><td>${dataBR(l.data)}</td><td>${esc(nomeCliente(l.clienteId))}</td>
        <td>${l.tipo === 'caixa' ? `<span class="tag azul">Caixa d'água</span>${(l.fotos || []).length ? ` <span class="ajuda">${l.fotos.length} foto(s)</span>` : ''}` : esc(l.pragas)}</td>
        <td>${ate ? `${dataBR(ate)} ${ate < hojeISO() ? '<span class="tag cinza">vencida</span>' : '<span class="tag verde">vigente</span>'}` : '—'}</td>
        <td><div class="acoes">
          <button class="btn peq" data-acao="imprimir" data-id="${l.id}">Imprimir / PDF</button>
          <button class="btn sec peq" data-acao="editar" data-id="${l.id}">Editar</button>
          <button class="btn sec peq" data-acao="excluir" data-id="${l.id}">Excluir</button>
        </div></td></tr>`;
      }).join('')}
    </tbody></table></div>` : '<div class="vazio">Nenhum laudo emitido.</div>'}</div>`;
  $('#novo', el).addEventListener('click', () => formLaudo(null));
  $('#novo-caixa', el).addEventListener('click', () => irPara('laudo/novo-caixa'));
  el.querySelector('.cartao').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const l = DB.obter('laudos', b.dataset.id);
    if (b.dataset.acao === 'imprimir') enviando(b, () => imprimirLaudo(l));
    if (b.dataset.acao === 'editar') irPara('laudo/' + l.id);
    if (b.dataset.acao === 'excluir' && confirmar('Excluir este laudo?')) {
      const caminhos = (l.fotos || []).map((f) => f.caminho);
      DB.remover('laudos', l.id);
      if (caminhos.length) DB.removerFotos(caminhos).catch(() => {});
      render();
    }
  });
}

/* ---------- Página do laudo ---------- */
function paginaLaudo(el, id) {
  const novo = id === 'novo' || id === 'novo-caixa';
  const l = novo ? null : DB.obter('laudos', id);
  if (!novo && !l) {
    el.innerHTML = '<div class="cartao"><p>Laudo não encontrado.</p><button class="btn sec" id="voltar">Voltar</button></div>';
    $('#voltar', el).addEventListener('click', () => irPara('laudos'));
    return;
  }
  if (id === 'novo-caixa' || (l && l.tipo === 'caixa')) formCaixa(el, l);
  else formDedetizacao(el, l, novo ? padraoNovoLaudo : {});
  padraoNovoLaudo = {};
}
function topoLaudo(titulo, l) {
  return `<div class="pagina-topo"><button class="btn sec peq" id="voltar">&lsaquo; Laudos</button><h2>${titulo}</h2>
    ${l ? '<div class="acoes" style="margin-left:auto"><button class="btn peq" id="imp-laudo">Imprimir / PDF</button></div>' : ''}</div>`;
}
async function salvarLaudo(dados, l, laudoId) {
  const numero = l ? l.numero : await DB.proximoNumero('laudo');
  return DB.salvarItem('laudos', { ...(l ? {} : { criadoEm: new Date().toISOString() }), ...dados, id: laudoId, numero });
}

function formDedetizacao(el, l, padrao) {
  const cfg = DB.config();
  const x = l || { data: hojeISO(), garantiaDias: 90, responsavel: cfg.responsavelTecnico, registroResp: cfg.registroResp,
    recomendacoesLista: RECOMENDACOES_DEDET.slice(0, 3), ...padrao };
  const pr = x.pragasLista ? { marcados: x.pragasLista, outros: x.pragasOutras || '' } : separarTexto(x.pragas, PRAGAS_LAUDO);
  const ar = x.areasLista ? { marcados: x.areasLista, outros: x.areasOutras || '' } : separarTexto(x.areas, AREAS_LAUDO);
  const me = x.metodosLista ? { marcados: x.metodosLista, outros: x.metodoOutros || '' } : separarTexto(x.metodo, METODOS_LAUDO);
  const usados = Object.fromEntries((x.produtos || []).map((p) => [normalizar(p.produto), p]));
  const recs = x.recomendacoesLista || separarTexto(x.recomendacoes, RECOMENDACOES_DEDET).marcados;
  el.innerHTML = `${topoLaudo(l ? `Certificado de dedetização nº ${l.numero}` : 'Novo certificado de dedetização', l)}
    <form class="cartao form" id="form-laudo">
      ${campoCliente(x.clienteId)}
      ${campo('Data da execução', 'data', x.data, 'date', 'required')}
      <label>Garantia<select name="garantiaDias">${opcoesSimples(GARANTIAS, x.garantiaDias)}</select></label>
      <div class="full secao-form"><b>Pragas alvo</b>${grupoMarcar('pragas', PRAGAS_LAUDO, pr.marcados)}
        ${campo('Outras pragas', 'pragasOutras', pr.outros, 'text', 'placeholder="Opcional"')}</div>
      <div class="full secao-form"><b>Áreas tratadas</b>${grupoMarcar('areas', AREAS_LAUDO, ar.marcados)}
        ${campo('Outras áreas', 'areasOutras', ar.outros, 'text', 'placeholder="Opcional"')}</div>
      <div class="full secao-form"><b>Método de aplicação</b>${grupoMarcar('metodos', METODOS_LAUDO, me.marcados)}
        ${campo('Outro método', 'metodoOutros', me.outros, 'text', 'placeholder="Opcional"')}</div>
      <div class="full secao-form"><b>Produtos utilizados</b>
        <div class="produtos-laudo">${FAES.PRODUTOS.map((p) => { const u = usados[normalizar(p.nome)]; return `
          <div class="produto-laudo"><label class="opcao-marcar"><input type="checkbox" data-produto="${p.id}" ${u ? 'checked' : ''}>
            <span><b>${esc(p.nome)}</b> <small>${esc(p.grupo)} · ${esc(p.concentracao)}</small></span></label>
            <input data-qtd="${p.id}" value="${esc(u ? u.quantidade : '')}" placeholder="Quantidade / diluição (opcional)"></div>`; }).join('')}</div></div>
      <label>Responsável técnico${seletorPessoa('responsavel', 'responsavel_tecnico', x.responsavel)}</label>
      <div class="full secao-form"><b>Recomendações ao cliente</b>${grupoMarcar('recomendacoes', RECOMENDACOES_DEDET, recs, 'uma-coluna')}</div>
      ${campo('Observações', 'obs', x.obs, 'textarea', 'full')}
      <div class="form-acoes"><button type="button" class="btn sec" id="cancelar">Cancelar</button><button class="btn" id="salvar">Salvar</button></div>
    </form>`;
  const form = $('#form-laudo', el);
  ligarCampoCliente(el);
  $('#voltar', el).addEventListener('click', () => irPara('laudos'));
  $('#cancelar', el).addEventListener('click', () => irPara('laudos'));
  if (l) $('#imp-laudo', el).addEventListener('click', (e) => enviando(e.target, () => imprimirLaudo(DB.obter('laudos', l.id))));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!clienteValido(form)) return;
    const d = lerForm(form);
    const pragasLista = lerGrupo(form, 'pragas'), areasLista = lerGrupo(form, 'areas'), metodosLista = lerGrupo(form, 'metodos');
    const produtosSel = FAES.PRODUTOS.filter((p) => $(`[data-produto="${p.id}"]`, form).checked);
    const recomendacoesLista = lerGrupo(form, 'recomendacoes');
    const dados = {
      tipo: 'dedetizacao', clienteId: d.clienteId, data: d.data, garantiaDias: Number(d.garantiaDias) || 0,
      pragasLista, pragasOutras: d.pragasOutras, pragas: juntar(pragasLista, d.pragasOutras),
      areasLista, areasOutras: d.areasOutras, areas: juntar(areasLista, d.areasOutras),
      metodosLista, metodoOutros: d.metodoOutros, metodo: juntar(metodosLista, d.metodoOutros),
      produtos: produtosSel.map((p) => ({ produto: p.nome, principio: p.concentracao, grupo: p.grupo, registro: p.registro,
        quantidade: $(`[data-qtd="${p.id}"]`, form).value.trim() })),
      antidoto: produtosSel.map((p) => `${p.nome}: ${p.antidoto}`).join('\n'),
      recomendacoesLista, recomendacoes: recomendacoesLista.join('\n'),
      responsavel: d.responsavel, registroResp: registroDe(form, 'responsavel') || (l && l.responsavel === d.responsavel ? l.registroResp : ''),
      obs: d.obs,
    };
    enviando($('#salvar', el), async () => {
      await salvarLaudo(dados, l, l ? l.id : DB.novoId());
      avisar('Laudo salvo.');
      irPara('laudos');
    });
  });
}

/* ---------- Laudo de caixa d'água ---------- */
function linhaReservatorio(r = {}) {
  const capOutra = r.capacidade && !CAPACIDADES.includes(Number(r.capacidade));
  return `<div class="reservatorio">
    <label>Qtd.<select data-r="quantidade">${opcoesSimples([1, 2, 3, 4, 5, 6, 8, 10], r.quantidade || 1)}</select></label>
    <label>Tipo<select data-r="tipo">${opcoesSimples(TIPOS_RESERV, r.tipo)}</select></label>
    <label>Material<select data-r="material">${opcoesSimples(MATERIAIS_RESERV, r.material)}</select></label>
    <label>Capacidade<select data-r="capacidade">${opcoesSimples([...CAPACIDADES.map((c) => [c, c.toLocaleString('pt-BR') + ' L']), ['outra', 'Outra...']], capOutra ? 'outra' : (r.capacidade || 1000))}</select>
      <input data-r="capacidadeOutra" type="number" min="1" placeholder="Litros" value="${capOutra ? esc(r.capacidade) : ''}" ${capOutra ? '' : 'hidden'}></label>
    <label>Localização<select data-r="local">${opcoesSimples(LOCAIS_RESERV, r.local)}</select></label>
    <button type="button" class="btn sec peq rm-reserv" title="Remover">&times;</button></div>`;
}
function lerReservatorios(raiz) {
  return $$('.reservatorio', raiz).map((d) => {
    const v = (k) => $(`[data-r="${k}"]`, d).value;
    return { quantidade: Number(v('quantidade')) || 1, tipo: v('tipo'), material: v('material'),
      capacidade: v('capacidade') === 'outra' ? (Number(v('capacidadeOutra')) || 0) : Number(v('capacidade')), local: v('local') };
  });
}

// Reduz a foto (no máximo 1600 px, JPEG) antes de enviar: fica leve e rápida de abrir.
async function comprimirFoto(arquivo) {
  const img = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * escala);
  c.height = Math.round(img.height * escala);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.8));
  return blob;
}

function formCaixa(el, l) {
  const cfg = DB.config();
  const laudoId = l ? l.id : DB.novoId();
  const x = l || { data: hojeISO(), validadeMeses: 6, reservatorios: [{}], procedimentos: PROCEDIMENTOS_CAIXA.slice(),
    desinfetante: DESINFETANTES[0], concentracaoSol: CONCENTRACOES_SOL[2], tempoContato: TEMPOS_CONTATO[2],
    recomendacoesLista: RECOMENDACOES_CAIXA.slice(0, 4), responsavel: cfg.responsavelTecnico, registroResp: cfg.registroResp, fotos: [] };
  const fotos = (x.fotos || []).map((f) => ({ ...f }));
  const enviadasAgora = []; // fotos enviadas nesta edição (apagadas se cancelar)
  const removidas = []; // fotos tiradas nesta edição (apagadas ao salvar)
  let enviando_ = 0;

  el.innerHTML = `${topoLaudo(l ? `Laudo de caixa d'água nº ${l.numero}` : "Novo laudo de limpeza de caixa d'água", l)}
    <form class="cartao form" id="form-laudo">
      ${campoCliente(x.clienteId)}
      ${campo('Data da limpeza', 'data', x.data, 'date', 'required')}
      <label>Validade (próxima limpeza)<select name="validadeMeses">${opcoesSimples(VALIDADES_CAIXA, x.validadeMeses)}</select></label>
      <div class="full secao-form"><b>Reservatórios limpos</b>
        <div id="reservatorios">${(x.reservatorios && x.reservatorios.length ? x.reservatorios : [{}]).map(linhaReservatorio).join('')}</div>
        <button type="button" class="btn sec peq" id="add-reserv">+ Adicionar reservatório</button></div>
      <div class="full secao-form"><b>Condições encontradas</b>${grupoMarcar('condicoes', CONDICOES_CAIXA, x.condicoes || [])}</div>
      <div class="full secao-form"><b>Procedimento realizado</b>${grupoMarcar('procedimentos', PROCEDIMENTOS_CAIXA, x.procedimentos || [], 'uma-coluna')}</div>
      <label>Produto desinfetante<select name="desinfetante">${opcoesSimples(DESINFETANTES, x.desinfetante)}</select></label>
      <label>Concentração da solução<select name="concentracaoSol">${opcoesSimples(CONCENTRACOES_SOL, x.concentracaoSol)}</select></label>
      <label>Tempo de contato<select name="tempoContato">${opcoesSimples(TEMPOS_CONTATO, x.tempoContato)}</select></label>
      <label>Técnico que executou${seletorPessoa('tecnico', 'controlador', x.tecnico)}</label>
      <label>Responsável técnico${seletorPessoa('responsavel', 'responsavel_tecnico', x.responsavel)}</label>
      <div class="full secao-form"><b>Fotos</b>
        <p class="ajuda">Pode tirar a foto pelo celular ou escolher do computador. As fotos são reduzidas automaticamente.</p>
        <div class="fotos-etapas">
          ${['antes', 'depois'].map((etapa) => `<div class="fotos-etapa"><div class="fotos-cab"><b>${etapa === 'antes' ? 'Antes da limpeza' : 'Depois da limpeza'}</b>
            <label class="btn sec peq">Adicionar fotos<input type="file" accept="image/*" multiple hidden data-etapa="${etapa}"></label></div>
            <div class="fotos-grade" data-grade="${etapa}"></div></div>`).join('')}
        </div></div>
      <div class="full secao-form"><b>Recomendações ao cliente</b>${grupoMarcar('recomendacoes', RECOMENDACOES_CAIXA, x.recomendacoesLista || [], 'uma-coluna')}</div>
      ${campo('Observações', 'obs', x.obs, 'textarea', 'full')}
      <div class="form-acoes"><button type="button" class="btn sec" id="cancelar">Cancelar</button><button class="btn" id="salvar">Salvar</button></div>
    </form>`;
  const form = $('#form-laudo', el);
  ligarCampoCliente(el);
  const sair = async () => {
    if (enviando_) { avisar('Aguarde terminar de enviar as fotos.', 'erro'); return; }
    if (enviadasAgora.length) DB.removerFotos(enviadasAgora.map((f) => f.caminho)).catch(() => {});
    irPara('laudos');
  };
  $('#voltar', el).addEventListener('click', sair);
  $('#cancelar', el).addEventListener('click', sair);
  if (l) $('#imp-laudo', el).addEventListener('click', (e) => enviando(e.target, () => imprimirLaudo(DB.obter('laudos', l.id))));

  // Reservatórios
  const caixaReserv = $('#reservatorios', el);
  $('#add-reserv', el).addEventListener('click', () => caixaReserv.insertAdjacentHTML('beforeend', linhaReservatorio()));
  caixaReserv.addEventListener('click', (e) => {
    if (e.target.classList.contains('rm-reserv') && $$('.reservatorio', caixaReserv).length > 1) e.target.closest('.reservatorio').remove();
  });
  caixaReserv.addEventListener('change', (e) => {
    if (e.target.dataset.r === 'capacidade') {
      const outra = $('[data-r="capacidadeOutra"]', e.target.closest('label'));
      outra.hidden = e.target.value !== 'outra';
      if (!outra.hidden) outra.focus();
    }
  });

  // Fotos
  const desenharFotos = () => {
    ['antes', 'depois'].forEach((etapa) => {
      const lista = fotos.filter((f) => f.etapa === etapa);
      $(`[data-grade="${etapa}"]`, el).innerHTML = lista.length ? lista.map((f) => `<figure class="foto-item" data-caminho="${esc(f.caminho)}">
        ${f.url ? `<img src="${esc(f.url)}" alt="">` : '<div class="foto-carregando">Carregando...</div>'}
        <input data-legenda value="${esc(f.legenda || '')}" placeholder="Legenda (opcional)">
        <button type="button" class="btn sec peq" data-tirar title="Remover foto">Remover</button></figure>`).join('')
        : '<p class="ajuda">Nenhuma foto.</p>';
    });
  };
  desenharFotos();
  if (fotos.length) {
    DB.urlsFotos(fotos.map((f) => f.caminho)).then((urls) => { fotos.forEach((f) => (f.url = urls[f.caminho] || '')); desenharFotos(); })
      .catch((err) => avisar('Não foi possível mostrar as fotos: ' + err.message, 'erro'));
  }
  el.addEventListener('input', (e) => {
    if (!e.target.matches('[data-legenda]')) return;
    const f = fotos.find((y) => y.caminho === e.target.closest('[data-caminho]').dataset.caminho);
    if (f) f.legenda = e.target.value;
  });
  el.addEventListener('click', (e) => {
    if (!e.target.matches('[data-tirar]')) return;
    const caminho = e.target.closest('[data-caminho]').dataset.caminho;
    const i = fotos.findIndex((f) => f.caminho === caminho);
    if (i >= 0) removidas.push(...fotos.splice(i, 1));
    desenharFotos();
  });
  $$('[data-etapa]', el).forEach((input) => input.addEventListener('change', async () => {
    const arquivos = [...input.files];
    input.value = '';
    const salvar = $('#salvar', el);
    for (const [i, arq] of arquivos.entries()) {
      enviando_++;
      salvar.disabled = true;
      salvar.textContent = `Enviando foto ${i + 1} de ${arquivos.length}...`;
      try {
        const blob = await comprimirFoto(arq);
        const caminho = `laudos/${laudoId}/${DB.novoId()}.jpg`;
        await DB.enviarFoto(caminho, blob);
        const f = { caminho, etapa: input.dataset.etapa, legenda: '', url: URL.createObjectURL(blob) };
        fotos.push(f);
        enviadasAgora.push(f);
        desenharFotos();
      } catch (err) {
        avisar('A foto não foi enviada: ' + err.message, 'erro');
      } finally {
        enviando_--;
        if (!enviando_) { salvar.disabled = false; salvar.textContent = 'Salvar'; }
      }
    }
  }));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (enviando_) { avisar('Aguarde terminar de enviar as fotos.', 'erro'); return; }
    if (!clienteValido(form)) return;
    const d = lerForm(form);
    const reservatorios = lerReservatorios(el);
    if (reservatorios.some((r) => !r.capacidade)) { avisar('Informe a capacidade do reservatório (em litros).', 'erro'); return; }
    const dados = {
      tipo: 'caixa', clienteId: d.clienteId, data: d.data, validadeMeses: Number(d.validadeMeses) || 6,
      reservatorios, condicoes: lerGrupo(form, 'condicoes'), procedimentos: lerGrupo(form, 'procedimentos'),
      desinfetante: d.desinfetante, concentracaoSol: d.concentracaoSol, tempoContato: d.tempoContato,
      tecnico: d.tecnico, responsavel: d.responsavel,
      registroResp: registroDe(form, 'responsavel') || (l && l.responsavel === d.responsavel ? l.registroResp : ''),
      recomendacoesLista: lerGrupo(form, 'recomendacoes'), obs: d.obs,
      pragas: "Limpeza e desinfecção de reservatório",
      fotos: fotos.map(({ caminho, etapa, legenda }) => ({ caminho, etapa, legenda: legenda || '' })),
    };
    enviando($('#salvar', el), async () => {
      await salvarLaudo(dados, l, laudoId);
      if (removidas.length) DB.removerFotos(removidas.map((f) => f.caminho)).catch(() => {});
      avisar('Laudo salvo.');
      irPara('laudos');
    });
  });
}

/* ---------- Impressão ---------- */
async function imprimirLaudo(l) {
  if (l.tipo === 'caixa') return imprimirLaudoCaixa(l);
  const cli = DB.obter('clientes', l.clienteId);
  const cfg = DB.config();
  const recs = l.recomendacoesLista || String(l.recomendacoes || '').split('\n').filter(Boolean);
  imprimir(`<div class="doc">${cabecalhoDoc()}
    <h2>Certificado de Execução de Serviço nº ${l.numero}</h2>
    <div class="info"><div><b>Data da execução:</b> ${dataBR(l.data)}</div>
      <div><b>Garantia:</b> ${l.garantiaDias ? `${l.garantiaDias} dias (até ${dataBR(somarDias(l.data, l.garantiaDias))})` : '—'}</div></div>
    ${blocoCliente(cli)}
    <h3>Serviço executado</h3>
    <div class="info"><div><b>Pragas alvo:</b> ${esc(l.pragas)}</div><div><b>Método:</b> ${esc(l.metodo)}</div>
      <div style="grid-column:1/-1"><b>Áreas tratadas:</b> ${esc(l.areas)}</div></div>
    <h3>Produtos utilizados</h3>
    ${(l.produtos || []).length ? `<table><thead><tr><th>Produto</th><th>Princípio ativo / concentração</th><th>Grupo químico</th><th>Registro MS</th><th>Qtd / diluição</th></tr></thead><tbody>
      ${l.produtos.map((p) => `<tr><td>${esc(p.produto)}</td><td>${esc(p.principio)}</td><td>${esc(p.grupo)}</td><td>${esc(p.registro)}</td><td>${esc(p.quantidade)}</td></tr>`).join('')}
    </tbody></table>` : '<p>—</p>'}
    ${l.antidoto ? `<h3>Antídoto / tratamento</h3><p style="white-space:pre-line">${esc(l.antidoto)}</p>` : ''}
    <p><b>Em caso de intoxicação:</b> procure atendimento médico levando este certificado. Telefone: ${esc(cfg.telefoneIntoxicacao || '0800-771-3733')}.</p>
    ${recs.length ? `<h3>Recomendações</h3><ul>${recs.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    ${l.obs ? `<h3>Observações</h3><p style="white-space:pre-line">${esc(l.obs)}</p>` : ''}
    <div class="assinatura">
      <div>${esc(l.responsavel || cfg.responsavelTecnico || 'Responsável técnico')}<br>${esc(l.registroResp || '')}</div>
      <div>${esc(cli ? cli.nome : 'Cliente')}</div>
    </div>
  </div>`);
}

async function imprimirLaudoCaixa(l) {
  const cli = DB.obter('clientes', l.clienteId);
  const cfg = DB.config();
  const fotos = l.fotos || [];
  let urls = {};
  if (fotos.length) urls = await DB.urlsFotos(fotos.map((f) => f.caminho));
  const total = (l.reservatorios || []).reduce((s, r) => s + (r.quantidade || 1) * (r.capacidade || 0), 0);
  const blocoFotos = (etapa, titulo) => {
    const lista = fotos.filter((f) => f.etapa === etapa && urls[f.caminho]);
    return `<div class="fotos-laudo-col"><div class="fotos-laudo-tit">${titulo}</div>${lista.length ? lista.map((f) => `<figure>
      <img src="${esc(urls[f.caminho])}" alt="">${f.legenda ? `<figcaption>${esc(f.legenda)}</figcaption>` : ''}</figure>`).join('') : '<p>—</p>'}</div>`;
  };
  imprimir(`<div class="doc">${cabecalhoDoc()}
    <h2>Laudo de Limpeza e Desinfecção de Reservatório de Água nº ${l.numero}</h2>
    <div class="info"><div><b>Data da limpeza:</b> ${dataBR(l.data)}</div>
      <div><b>Validade:</b> ${l.validadeMeses} meses (próxima limpeza até ${dataBR(somarMeses(l.data, Number(l.validadeMeses)))})</div></div>
    ${blocoCliente(cli)}
    <h3>Reservatórios</h3>
    <table><thead><tr><th>Qtd.</th><th>Tipo</th><th>Material</th><th>Capacidade</th><th>Localização</th></tr></thead><tbody>
      ${(l.reservatorios || []).map((r) => `<tr><td>${r.quantidade || 1}</td><td>${esc(r.tipo)}</td><td>${esc(r.material)}</td>
        <td>${Number(r.capacidade || 0).toLocaleString('pt-BR')} litros</td><td>${esc(r.local)}</td></tr>`).join('')}
      <tr><td colspan="3" style="text-align:right"><b>Volume total</b></td><td colspan="2"><b>${total.toLocaleString('pt-BR')} litros</b></td></tr>
    </tbody></table>
    ${(l.condicoes || []).length ? `<h3>Condições encontradas</h3><ul>${l.condicoes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
    <h3>Procedimento realizado</h3><ol>${(l.procedimentos || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ol>
    <div class="info"><div><b>Produto desinfetante:</b> ${esc(l.desinfetante)}</div><div><b>Solução:</b> ${esc(l.concentracaoSol)}</div>
      <div><b>Tempo de contato:</b> ${esc(l.tempoContato)}</div></div>
    ${fotos.length ? `<h3>Registro fotográfico</h3><div class="fotos-laudo">${blocoFotos('antes', 'ANTES')}${blocoFotos('depois', 'DEPOIS')}</div>` : ''}
    ${(l.recomendacoesLista || []).length ? `<h3>Recomendações</h3><ul>${l.recomendacoesLista.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    ${l.obs ? `<h3>Observações</h3><p style="white-space:pre-line">${esc(l.obs)}</p>` : ''}
    <p class="laudo-conclusao">Certificamos que o(s) reservatório(s) descrito(s) acima foi(ram) limpo(s) e desinfetado(s) por
      ${esc(cfg.empresa || 'Dedetizadora Berbert')} na data indicada, conforme o procedimento descrito neste laudo.</p>
    <div class="assinatura">
      ${l.tecnico ? `<div>${esc(l.tecnico)}<br>Técnico executor</div>` : ''}
      <div>${esc(l.responsavel || cfg.responsavelTecnico || 'Responsável técnico')}<br>${esc(l.registroResp || 'Responsável técnico')}</div>
      <div>${esc(cli ? cli.nome : 'Cliente')}<br>Cliente</div>
    </div>
  </div>`);
}
