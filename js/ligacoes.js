// Aba "Ligações": lista de quem está para vencer (pelo último serviço ou pelo contrato)
// e prospecção de empresas por cidade e categoria que ainda não são clientes.
// A atendente só liga, manda a mensagem e registra o resultado.

const RESULTADOS_LIGACAO = [
  ['agendado', 'Agendado / fechou', 'verde'],
  ['retornar', 'Retornar depois', 'amarelo'],
  ['mensagem', 'Mensagem enviada', 'azul'],
  ['nao_atende', 'Não atende', 'cinza'],
  ['sem_interesse', 'Sem interesse', 'vermelho'],
  ['ja_tem', 'Já tem empresa', 'vermelho'],
  ['numero_errado', 'Número errado', 'vermelho'],
];
const MSG_VENCIMENTO = 'Olá, {nome}! Aqui é da {empresa}. O último serviço feito com a gente ({servico}) foi em {data} e o prazo vence em {vencimento}. Podemos agendar a renovação?';
const MSG_PROSPECCAO = 'Olá! Aqui é da {empresa}. Trabalhamos com dedetização, desratização, descupinização e limpeza de caixa d\'água, com certificado para a Vigilância Sanitária. Podemos enviar um orçamento sem compromisso para {nome}?';
const REGRAS_RETORNO = 'caixa = 6\ncisterna = 6\ncupim = 12\ndescupiniz = 12';
const MESES_NOME = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/* ---------- Utilitários ---------- */
function somarMeses(iso, meses) {
  const [a, m, d] = iso.split('-').map(Number);
  const ultimoDia = new Date(a, m - 1 + meses + 1, 0).getDate();
  return isoData(new Date(a, m - 1 + meses, Math.min(d, ultimoDia)));
}
// Telefones de um texto como "(44) 9996-9000 - (44) 99927-2046" -> [{ texto, numero (com DDD) }]
function extrairTelefones(texto) {
  const ddd = digitos(DB.config().telefone).slice(0, 2) || '44';
  const achados = String(texto || '').match(/(\(?\d{2}\)?[\s.-]*)?9?\s?\d{4}[\s.-]?\d{4}/g) || [];
  const vistos = new Set();
  return achados.map((t) => {
    let n = digitos(t).replace(/^0+/, '').replace(/^55(?=\d{10,11}$)/, '');
    if (n.length === 8 || n.length === 9) n = ddd + n;
    return { texto: t.trim(), numero: n };
  }).filter((t) => (t.numero.length === 10 || t.numero.length === 11) && !vistos.has(t.numero) && vistos.add(t.numero));
}
const linkWhats = (numero, msg) => `https://wa.me/55${numero}?text=${encodeURIComponent(msg)}`;
const preencherMsg = (modelo, campos) => modelo.replace(/\{(\w+)\}/g, (_, k) => campos[k] ?? '');
function regrasRetorno() {
  return String(DB.config().regrasRetorno ?? REGRAS_RETORNO).split('\n').map((l) => l.split('='))
    .map(([p, m]) => [normalizar(p), parseInt(m, 10)]).filter(([p, m]) => p && m > 0);
}
// Fim do contrato escrito no cadastro, ex.: "CONTRATO DE JULHO/2025 A JUNHO/2026" -> '2026-06-30'
function fimContrato(c) {
  const t = normalizar([c.ramo, c.obs].filter(Boolean).join(' '));
  if (!t.includes('contrato')) return '';
  const m = t.match(new RegExp(`\\b(?:a|ate)\\s+(${MESES_NOME.join('|')})\\s*(?:\\/|de)?\\s*(\\d{4})`));
  if (!m) return '';
  const mes = MESES_NOME.indexOf(m[1]);
  return isoData(new Date(Number(m[2]), mes + 1, 0));
}

/* ---------- Página ---------- */
let abaLigacoes = 'vencimentos';
let cacheServicos = null; // { em, mapa }
async function ultimosServicosPorCliente(forcar) {
  if (!forcar && cacheServicos && Date.now() - cacheServicos.em < 5 * 60 * 1000) return cacheServicos.mapa;
  const lista = await DB.ultimosServicos();
  cacheServicos = { em: Date.now(), mapa: new Map(lista.map((s) => [s.clienteId, s])) };
  return cacheServicos.mapa;
}

function ligacoes(el) {
  const semTabela = DB.tabelaFaltando('ligacoes');
  el.innerHTML = `
    <div class="cabecalho"><h2>Ligações</h2></div>
    ${semTabela ? `<div class="cartao alerta-perigo"><b>Falta um passo no banco de dados.</b> Para registrar as ligações, o administrador precisa
      executar o arquivo <b>supabase/ligacoes.sql</b> no SQL Editor do Supabase (uma vez). Até lá dá para ver a lista e ligar, mas não registrar.</div>` : ''}
    <div class="abas">
      <button class="aba ${abaLigacoes === 'vencimentos' ? 'ativa' : ''}" data-aba="vencimentos">Vencimentos</button>
      <button class="aba ${abaLigacoes === 'prospeccao' ? 'ativa' : ''}" data-aba="prospeccao">Prospecção (novos clientes)</button>
    </div>
    <div id="conteudo-lig"></div>`;
  $('.abas', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-aba]');
    if (b) { abaLigacoes = b.dataset.aba; ligacoes(el); }
  });
  const caixa = $('#conteudo-lig', el);
  if (abaLigacoes === 'vencimentos') telaVencimentos(caixa); else telaProspeccao(caixa);
}

// Contatos registrados de um cliente (ou de uma empresa da prospecção), do mais novo ao mais antigo.
function contatosDe(filtro) {
  return DB.listar('ligacoes').filter(filtro).sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
}
function tagResultado(r) {
  const x = RESULTADOS_LIGACAO.find(([k]) => k === r);
  return x ? `<span class="tag ${x[2]}">${x[1]}</span>` : '';
}
function resumoContato(c) {
  if (!c) return '<span class="ajuda">Nenhum contato</span>';
  return `${tagResultado(c.resultado)}<div class="ajuda">${new Date(c.criadoEm).toLocaleDateString('pt-BR')}${c.autor ? ' · ' + esc(c.autor) : ''}
    ${c.retornarEm ? `<br>Retornar em ${dataBR(c.retornarEm)}` : ''}${c.obs ? '<br>' + esc(c.obs) : ''}</div>`;
}
function registrarLigacao(base, resultado, obs = '', retornarEm = '') {
  return DB.salvarItem('ligacoes', {
    ...base, resultado, obs, retornarEm, autor: (DB.perfil() || {}).nome || '', criadoEm: new Date().toISOString(),
  });
}
// Formulário do resultado da ligação.
function formResultado(titulo, base, aoSalvar) {
  if (DB.tabelaFaltando('ligacoes')) { avisar('Execute o arquivo supabase/ligacoes.sql no Supabase para registrar as ligações.', 'erro'); return; }
  abrirModal(`Resultado do contato — ${titulo}`, `
    <form class="form">
      <div class="full opcoes-resultado">${RESULTADOS_LIGACAO.map(([k, r], i) => `<label class="check"><input type="radio" name="resultado" value="${k}" ${i === 0 ? 'required' : ''}> ${r}</label>`).join('')}</div>
      ${campo('Retornar em', 'retornarEm', '', 'date')}
      ${campo('Observação', 'obs', '', 'textarea', 'full')}
      <div class="form-acoes"><button type="button" class="btn sec" data-cancelar>Cancelar</button><button class="btn">Salvar</button></div>
    </form>`, (raiz) => {
    const form = $('form', raiz);
    $('[data-cancelar]', raiz).addEventListener('click', fecharModal);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = lerForm(form);
      if (d.resultado === 'retornar' && !d.retornarEm) { avisar('Informe quando retornar.', 'erro'); return; }
      registrarLigacao(base, d.resultado, d.obs || '', d.retornarEm || '');
      fecharModal();
      avisar('Contato registrado.');
      aoSalvar();
    });
  });
}
function botoesContato(telefones, msg) {
  if (!telefones.length) return '<span class="ajuda">Sem telefone</span>';
  return telefones.map((t) => `<div class="tel-linha"><a class="btn sec peq" href="tel:+55${t.numero}">${esc(t.texto)}</a>
    <a class="btn sec peq whats" href="${linkWhats(t.numero, msg)}" target="_blank" rel="noopener" data-whats>WhatsApp</a></div>`).join('');
}

/* ---------- Vencimentos ---------- */
let estadoVenc = null;

async function telaVencimentos(el) {
  estadoVenc = estadoVenc || carregarEstado('vencimentos', { periodo: 'mes', mes: hojeISO().slice(0, 7), cidade: '', busca: '', situacao: 'pendentes', pagina: 1 });
  el.innerHTML = '<div class="cartao"><p class="ajuda">Analisando o último serviço de cada cliente...</p></div>';
  let servicos;
  try {
    servicos = await ultimosServicosPorCliente();
  } catch (err) {
    el.innerHTML = `<div class="cartao alerta-perigo"><b>Não foi possível ler os serviços.</b> ${esc(err.message)}<br>
      Se for a primeira vez, o administrador precisa executar o arquivo <b>supabase/ligacoes.sql</b> no SQL Editor do Supabase.</div>`;
    return;
  }
  if (!el.isConnected) return;
  const cfg = DB.config();
  const prazo = parseInt(cfg.prazoRetorno, 10) || 6;
  const regras = regrasRetorno();
  const hoje = hojeISO();
  const empresa = cfg.empresa || 'Dedetizadora Berbert';

  // Monta a lista: cada cliente ativo com serviço feito recebe a data de vencimento.
  const todos = [];
  for (const c of DB.listar('clientes')) {
    if (!clienteAtivo(c)) continue;
    const s = servicos.get(c.id);
    const contrato = fimContrato(c);
    if (!s && !contrato) continue;
    let venc = '', origem = '';
    if (s) {
      const desc = normalizar(s.descricao);
      const regra = regras.find(([p]) => desc.includes(p));
      venc = somarMeses(s.data.slice(0, 10), regra ? regra[1] : prazo);
      origem = regra ? `${regra[1]} meses (${regra[0]})` : `${prazo} meses`;
    }
    if (contrato && (!venc || contrato >= (s ? s.data.slice(0, 10) : ''))) { venc = contrato; origem = 'fim do contrato'; }
    const desde = s ? s.data.slice(0, 10) : somarMeses(venc, -2);
    const contatos = contatosDe((l) => l.clienteId === c.id && String(l.criadoEm).slice(0, 10) >= desde);
    todos.push({ c, s, venc, origem, ultimo: contatos[0] });
  }

  const opMes = (() => {
    const lista = [];
    for (let i = -3; i <= 6; i++) {
      const iso = somarMeses(hoje.slice(0, 7) + '-01', i).slice(0, 7);
      const [a, m] = iso.split('-');
      lista.push([iso, `${MESES_NOME[Number(m) - 1].replace('marco', 'março')}/${a}`]);
    }
    return lista;
  })();
  const cidades = [...new Set(todos.map((x) => (x.c.cidade || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  el.innerHTML = `
    <div class="cartao filtros-lig">
      <label>Vencimento<select id="v-periodo">
        <option value="mes">Vence no mês</option><option value="atrasados">Vencidos nos últimos 12 meses</option>
        <option value="antigos">Vencidos há mais de 1 ano</option><option value="retornos">Retornos marcados até hoje</option></select></label>
      <label id="v-mes-l">Mês<select id="v-mes">${opMes.map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></label>
      <label>Cidade<input id="v-cidade" list="v-cidades" placeholder="Todas"><datalist id="v-cidades">${cidades.map((x) => `<option value="${esc(x)}">`).join('')}</datalist></label>
      <label>Buscar<input id="v-busca" placeholder="Nome, código ou telefone"></label>
      <label>Situação<select id="v-situacao"><option value="pendentes">Ainda não contatados</option><option value="todos">Todos</option>
        <option value="contatados">Já contatados</option></select></label>
    </div>
    <div id="v-resumo" class="resumo-importacao"></div>
    <div class="cartao" style="padding:0" id="v-lista"></div>
    <p class="ajuda">O vencimento é calculado pelo último serviço feito (não cancelado) + ${prazo} meses, ou pelo fim do contrato escrito no
      cadastro (ex.: "CONTRATO DE JULHO/2025 A JUNHO/2026"). ${DB.perfil().admin ? 'O prazo e a mensagem do WhatsApp podem ser mudados em Configurações.' : ''}</p>`;

  const ids = { periodo: '#v-periodo', mes: '#v-mes', cidade: '#v-cidade', busca: '#v-busca', situacao: '#v-situacao' };
  Object.entries(ids).forEach(([k, s]) => { $(s, el).value = estadoVenc[k]; });
  const lista = $('#v-lista', el);

  const desenhar = () => {
    const e = estadoVenc;
    $('#v-mes-l', el).hidden = e.periodo !== 'mes';
    const umAnoAtras = somarMeses(hoje, -12);
    const cidade = normalizar(e.cidade);
    const busca = normalizar(e.busca);
    const buscaDig = digitos(e.busca);
    let sel = todos.filter((x) => {
      if (e.periodo === 'mes' && x.venc.slice(0, 7) !== e.mes) return false;
      if (e.periodo === 'atrasados' && !(x.venc < hoje && x.venc >= umAnoAtras)) return false;
      if (e.periodo === 'antigos' && !(x.venc < umAnoAtras)) return false;
      if (e.periodo === 'retornos' && !(x.ultimo && x.ultimo.resultado === 'retornar' && x.ultimo.retornarEm && x.ultimo.retornarEm <= hoje)) return false;
      if (cidade && !normalizar(x.c.cidade).includes(cidade)) return false;
      if (busca && !(normalizar(x.c.nome).includes(busca) || normalizar(x.c.fantasia).includes(busca) || String(x.c.codigo || '') === e.busca.trim()
        || (buscaDig.length >= 4 && digitos(x.c.telefone).includes(buscaDig)))) return false;
      return true;
    });
    const contatados = sel.filter((x) => x.ultimo).length;
    $('#v-resumo', el).innerHTML = `<span class="tag laranja">${sel.length.toLocaleString('pt-BR')} na lista</span>
      <span class="tag verde">${contatados.toLocaleString('pt-BR')} já contatados</span>
      <span class="tag cinza">${(sel.length - contatados).toLocaleString('pt-BR')} faltam</span>`;
    if (e.periodo !== 'retornos') {
      if (e.situacao === 'pendentes') sel = sel.filter((x) => !x.ultimo);
      if (e.situacao === 'contatados') sel = sel.filter((x) => x.ultimo);
    }
    const exato = (x) => (e.busca.trim() && String(x.c.codigo || '') === e.busca.trim() ? 0 : 1);
    sel.sort((a, b) => exato(a) - exato(b) || a.venc.localeCompare(b.venc) || (a.c.nome || '').localeCompare(b.c.nome || ''));
    const pag = paginar(sel, e);
    guardarEstado('vencimentos', e);
    if (!sel.length) { lista.innerHTML = '<div class="vazio">Ninguém nesta lista.</div>'; return; }
    lista.innerHTML = `<div class="tabela-wrap"><table class="tabela-lig"><thead><tr><th>Cliente</th><th>Último serviço</th><th>Vence</th>
      <th>Ligar / mensagem</th><th>Último contato</th><th></th></tr></thead><tbody>
      ${pag.itens.map((x) => {
        const servico = x.s ? (x.s.descricao || 'Serviço') : 'Contrato';
        const msg = preencherMsg(cfg.msgVencimento || MSG_VENCIMENTO, {
          nome: x.c.contato || x.c.fantasia || x.c.nome, empresa, servico: servico.replace(/\s*\(importado do sistema anterior\)/i, ''),
          data: x.s ? dataBR(x.s.data.slice(0, 10)) : '', vencimento: dataBR(x.venc),
        });
        const situacaoVenc = x.venc < hoje ? 'vermelho' : x.venc.slice(0, 7) === hoje.slice(0, 7) ? 'laranja' : 'cinza';
        return `<tr data-cliente="${x.c.id}">
          <td><a href="#" data-abrir="${x.c.id}"><b>${esc(x.c.codigo ? x.c.codigo + ' - ' : '')}${esc(x.c.nome)}</b></a>
            ${x.c.fantasia ? `<div class="ajuda">${esc(x.c.fantasia)}</div>` : ''}<div class="ajuda">${esc(x.c.cidade || '')}${x.c.contato ? ' · ' + esc(x.c.contato) : ''}</div></td>
          <td>${x.s ? `nº ${esc(x.s.numero)} · ${dataBR(x.s.data.slice(0, 10))}<div class="ajuda">${esc(servico)}${x.s.valor ? ' · ' + moeda(x.s.valor) : ''}</div>` : '<span class="ajuda">—</span>'}</td>
          <td><span class="tag ${situacaoVenc}">${dataBR(x.venc)}</span><div class="ajuda">${esc(x.origem)}</div></td>
          <td>${botoesContato(extrairTelefones(x.c.telefone), msg)}</td>
          <td>${resumoContato(x.ultimo)}</td>
          <td><button class="btn peq" data-registrar="${x.c.id}">Registrar</button></td></tr>`;
      }).join('')}</tbody></table></div>${pag.html}`;
  };
  el.addEventListener('change', (ev) => {
    // Busca e cidade já atualizam ao digitar; redesenhar de novo ao sair do campo faria perder o clique num botão da lista.
    const k = ['periodo', 'mes', 'situacao'].find((key) => ev.target.matches(ids[key]));
    if (k) { estadoVenc[k] = ev.target.value; estadoVenc.pagina = 1; desenhar(); }
  });
  $('#v-busca', el).addEventListener('input', (ev) => { estadoVenc.busca = ev.target.value; estadoVenc.pagina = 1; desenhar(); });
  $('#v-cidade', el).addEventListener('input', (ev) => { estadoVenc.cidade = ev.target.value; estadoVenc.pagina = 1; desenhar(); });
  ligarPaginacao(lista, estadoVenc, desenhar);
  lista.addEventListener('click', (ev) => {
    const ab = ev.target.closest('[data-abrir]');
    if (ab) { ev.preventDefault(); irPara('cliente/' + ab.dataset.abrir); return; }
    const reg = ev.target.closest('[data-registrar]');
    const linha = ev.target.closest('[data-cliente]');
    if (!linha) return;
    const x = todos.find((y) => y.c.id === linha.dataset.cliente);
    const base = { tipo: 'vencimento', clienteId: x.c.id, nome: x.c.nome, cidade: x.c.cidade || '', vencimento: x.venc };
    const aoSalvar = () => {
      x.ultimo = contatosDe((l) => l.clienteId === x.c.id)[0];
      desenhar();
    };
    if (reg) formResultado(x.c.nome, base, aoSalvar);
    else if (ev.target.closest('[data-whats]') && !DB.tabelaFaltando('ligacoes')) {
      registrarLigacao(base, 'mensagem');
      setTimeout(aoSalvar, 300);
    }
  });
  desenhar();
}

/* ---------- Prospecção (OpenStreetMap) ---------- */
// Categorias de empresa e as marcações correspondentes no OpenStreetMap.
const CATEGORIAS_PROSPECCAO = [
  ['restaurantes', 'Restaurantes, lanchonetes e cafés', ['amenity~"^(restaurant|fast_food|cafe|food_court|ice_cream)$"']],
  ['padarias', 'Padarias e confeitarias', ['shop~"^(bakery|pastry|confectionery)$"']],
  ['mercados', 'Mercados e supermercados', ['shop~"^(supermarket|convenience|greengrocer|butcher|wholesale)$"']],
  ['bares', 'Bares e casas noturnas', ['amenity~"^(bar|pub|nightclub|biergarten)$"']],
  ['saude', 'Hospitais, clínicas e consultórios', ['amenity~"^(hospital|clinic|doctors|dentist|veterinary)$"', 'healthcare']],
  ['farmacias', 'Farmácias', ['amenity=pharmacy', 'shop=chemist']],
  ['escolas', 'Escolas, creches e faculdades', ['amenity~"^(school|kindergarten|college|university|childcare)$"']],
  ['hoteis', 'Hotéis e pousadas', ['tourism~"^(hotel|motel|guest_house|hostel)$"']],
  ['condominios', 'Condomínios e edifícios', ['building~"^(apartments|residential)$"', 'landuse=residential][name~"(condom|resid|edif)",i']],
  ['industrias', 'Indústrias e armazéns', ['landuse=industrial', 'man_made~"^(works|silo|storage_tank)$"', 'building~"^(industrial|warehouse)$"', 'industrial']],
  ['agro', 'Agro (cooperativas, silos, cerealistas)', ['shop=agrarian', 'man_made=silo', 'office=cooperative', 'industrial~"^(grain|agriculture)"']],
  ['pet', 'Pet shops e clínicas veterinárias', ['shop=pet', 'amenity=veterinary']],
  ['academias', 'Academias e clubes', ['leisure~"^(fitness_centre|sports_centre|sports_hall)$"', 'club']],
  ['igrejas', 'Igrejas', ['amenity=place_of_worship']],
  ['escritorios', 'Escritórios e empresas', ['office']],
  ['oficinas', 'Oficinas e lojas de veículos', ['shop~"^(car_repair|car|tyres|motorcycle|car_parts)$"']],
  ['lojas', 'Lojas em geral', ['shop']],
  ['todas', 'Todas as empresas', ['shop', 'amenity~"^(restaurant|fast_food|cafe|bar|pub|hospital|clinic|doctors|dentist|pharmacy|school|kindergarten|veterinary)$"', 'office', 'craft', 'tourism~"^(hotel|motel|guest_house)$"']],
];
const UFS = { AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo',
  GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul', MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco',
  PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RO: 'Rondônia', RR: 'Roraima', RS: 'Rio Grande do Sul',
  SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins' };
let estadoProsp = null;
let resultadoProsp; // { titulo, cidade, uf, empresas } da última pesquisa

// Servidores públicos do OpenStreetMap: se um estiver fora do ar ou ocupado, tenta o próximo.
const SERVIDORES_OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
async function buscarJSON(url, opcoes, etapa) {
  let r;
  try { r = await fetch(url, opcoes); } catch (err) {
    throw new Error(`${etapa}: sem resposta do servidor (${err.message}). Verifique a internet; antivírus ou rede da empresa podem bloquear.`);
  }
  if (!r.ok) throw new Error(`${etapa}: o servidor respondeu com erro ${r.status}.`);
  try { return await r.json(); } catch { throw new Error(`${etapa}: resposta inválida do servidor.`); }
}
// Acha a cidade no mapa: primeiro pelos campos cidade/estado, depois pelo texto livre.
async function acharCidade(cidade, uf) {
  const estado = UFS[uf] || uf;
  const base = 'https://nominatim.openstreetmap.org/search?format=json&limit=10&countrycodes=br&accept-language=pt-BR';
  const tentativas = [`${base}&city=${encodeURIComponent(cidade)}&state=${encodeURIComponent(estado)}`,
    `${base}&q=${encodeURIComponent(`${cidade}, ${estado}, Brasil`)}`];
  let primeiro = null;
  for (const url of tentativas) {
    const lugares = await buscarJSON(url, {}, 'Procurar a cidade');
    const rel = lugares.filter((l) => l.osm_type === 'relation').sort((a, b) => (b.class === 'boundary') - (a.class === 'boundary'))[0];
    if (rel) return rel;
    primeiro = primeiro || lugares[0];
  }
  if (primeiro) return primeiro;
  throw new Error(`Procurar a cidade: "${cidade} - ${uf}" não foi encontrada no mapa. Confira o nome (com acento) e a UF.`);
}
async function consultarOverpass(consulta) {
  let ultimoErro;
  for (const url of SERVIDORES_OVERPASS) {
    try {
      return await buscarJSON(url, { method: 'POST', body: 'data=' + encodeURIComponent(consulta),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 'Buscar as empresas');
    } catch (err) { ultimoErro = err; }
  }
  throw ultimoErro;
}

async function buscarEmpresas(cidade, uf, categoria, nome) {
  const lugar = await acharCidade(cidade, uf);
  const cat = CATEGORIAS_PROSPECCAO.find(([k]) => k === categoria) || CATEGORIAS_PROSPECCAO[0];
  const filtroNome = nome ? `[name~"${nome.replace(/["\\]/g, '')}",i]` : '[name]';
  const montar = (onde) => `[out:json][timeout:90];${onde.prefixo}(\n${cat[2].map((f) => `nwr[${f}]${filtroNome}${onde.filtro};`).join('\n')}\n);out tags center 1500;`;
  // Pela área do município; se vier vazio (área ainda não gerada no mapa), pelo retângulo da cidade.
  let elementos = [];
  if (lugar.osm_type === 'relation') {
    elementos = (await consultarOverpass(montar({ prefixo: `area(${3600000000 + Number(lugar.osm_id)})->.a;`, filtro: '(area.a)' }))).elements || [];
  }
  if (!elementos.length && Array.isArray(lugar.boundingbox)) {
    const [s, n, w, e] = lugar.boundingbox.map(Number);
    elementos = (await consultarOverpass(montar({ prefixo: '', filtro: `(${s},${w},${n},${e})` }))).elements || [];
  }
  const vistos = new Set();
  return elementos.map((e) => {
    const t = e.tags || {};
    const fones = [t.phone, t['contact:phone'], t.mobile, t['contact:mobile'], t['contact:whatsapp']].filter(Boolean).join(' / ');
    return {
      chave: `${e.type}/${e.id}`, nome: t.name, telefone: fones,
      endereco: [[t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', '), t['addr:suburb']].filter(Boolean).join(' - '),
      cep: t['addr:postcode'] || '', site: t.website || t['contact:website'] || '', email: t.email || t['contact:email'] || '',
      lat: e.lat ?? (e.center || {}).lat, lon: e.lon ?? (e.center || {}).lon,
    };
  }).filter((x) => x.nome && !vistos.has(normalizar(x.nome)) && vistos.add(normalizar(x.nome)))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

// Procura a empresa no cadastro de clientes pelo nome (razão ou fantasia) ou pelo telefone.
function indiceClientes() {
  const porNome = new Map(), porFone = new Map();
  const limpar = (s) => normalizar(s).replace(/\b(ltda|me|epp|eireli|s\/?a|cia|e)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  for (const c of DB.listar('clientes')) {
    [c.nome, c.fantasia].map(limpar).filter((n) => n.length >= 3).forEach((n) => porNome.set(n, c));
    extrairTelefones(c.telefone).forEach((t) => porFone.set(t.numero.slice(-8), c));
  }
  return (emp) => {
    const n = limpar(emp.nome);
    if (porNome.has(n)) return porNome.get(n);
    for (const t of extrairTelefones(emp.telefone)) if (porFone.has(t.numero.slice(-8))) return porFone.get(t.numero.slice(-8));
    return null;
  };
}

function telaProspeccao(el) {
  estadoProsp = estadoProsp || carregarEstado('prospeccao', { cidade: 'Campo Mourão', uf: 'PR', categoria: 'restaurantes', nome: '',
    mostrarClientes: false, esconderRecusas: true, soComTelefone: false, pagina: 1 });
  if (resultadoProsp === undefined) {
    try { resultadoProsp = JSON.parse(sessionStorage.getItem('berbert-prospeccao') || 'null'); } catch { resultadoProsp = null; }
  }
  const e = estadoProsp;
  el.innerHTML = `
    <form class="cartao filtros-lig" id="p-form">
      <label>Cidade<input name="cidade" value="${esc(e.cidade)}" required></label>
      <label>UF<select name="uf">${Object.keys(UFS).map((u) => `<option ${u === e.uf ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
      <label>Tipo de empresa<select name="categoria">${CATEGORIAS_PROSPECCAO.map(([k, r]) => `<option value="${k}" ${k === e.categoria ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <label>Nome contém (opcional)<input name="nome" value="${esc(e.nome)}" placeholder="Ex.: pizzaria"></label>
      <div class="acoes"><button class="btn" id="p-buscar">Pesquisar</button>
        <a class="btn sec" id="p-google" target="_blank" rel="noopener">Ver no Google Maps</a></div>
    </form>
    <div class="acoes filtros-check">
      <label class="check"><input type="checkbox" id="p-clientes" ${e.mostrarClientes ? 'checked' : ''}> Mostrar quem já é cliente</label>
      <label class="check"><input type="checkbox" id="p-recusas" ${e.esconderRecusas ? 'checked' : ''}> Esconder quem já recusou</label>
      <label class="check"><input type="checkbox" id="p-fone" ${e.soComTelefone ? 'checked' : ''}> Só com telefone</label>
    </div>
    <div id="p-resumo" class="resumo-importacao"></div>
    <div class="cartao" style="padding:0" id="p-lista"></div>
    <p class="ajuda">A pesquisa usa o mapa gratuito OpenStreetMap: nem toda empresa está cadastrada lá, e algumas aparecem sem telefone.
      Use "Ver no Google Maps" para completar a lista. Quem já é cliente (mesmo nome ou telefone do cadastro) fica escondido.</p>`;
  const form = $('#p-form', el);
  const lista = $('#p-lista', el);
  const atualizarGoogle = () => {
    const d = lerForm(form);
    const cat = (CATEGORIAS_PROSPECCAO.find(([k]) => k === d.categoria) || [])[1] || '';
    $('#p-google', el).href = `https://www.google.com/maps/search/${encodeURIComponent(`${d.nome || cat.split(/,| e /)[0]} em ${d.cidade} ${d.uf}`)}`;
  };
  form.addEventListener('input', atualizarGoogle);
  form.addEventListener('change', atualizarGoogle);
  atualizarGoogle();

  const desenhar = () => {
    if (!resultadoProsp) { lista.innerHTML = '<div class="vazio">Escolha a cidade e o tipo de empresa e clique em Pesquisar.</div>'; $('#p-resumo', el).innerHTML = ''; return; }
    const acharCliente = indiceClientes();
    const ultimos = new Map();
    contatosDe((l) => l.tipo === 'prospeccao').forEach((l) => { if (!ultimos.has(l.chave)) ultimos.set(l.chave, l); });
    const todas = resultadoProsp.empresas.map((x) => ({ ...x, cliente: acharCliente(x), ultimo: ultimos.get(x.chave) }));
    const clientes = todas.filter((x) => x.cliente).length;
    const recusas = (x) => x.ultimo && ['sem_interesse', 'ja_tem', 'numero_errado'].includes(x.ultimo.resultado);
    const sel = todas.filter((x) => (e.mostrarClientes || !x.cliente) && (!e.esconderRecusas || !recusas(x))
      && (!e.soComTelefone || extrairTelefones(x.telefone).length));
    $('#p-resumo', el).innerHTML = `<b>${esc(resultadoProsp.titulo)}:</b>
      <span class="tag laranja">${todas.length} encontradas</span><span class="tag verde">${todas.length - clientes} não são clientes</span>
      <span class="tag cinza">${clientes} já são clientes</span>`;
    const pag = paginar(sel, e);
    guardarEstado('prospeccao', e);
    if (!sel.length) { lista.innerHTML = `<div class="vazio">${todas.length ? 'Todas as empresas encontradas já são clientes ou já recusaram (veja as caixas acima).'
      : 'O mapa gratuito não tem empresas deste tipo cadastradas nesta cidade. Tente outro tipo (ou "Todas as empresas") ou use "Ver no Google Maps".'}</div>`; return; }
    const empresa = DB.config().empresa || 'Dedetizadora Berbert';
    lista.innerHTML = `<div class="tabela-wrap"><table class="tabela-lig"><thead><tr><th>Empresa</th><th>Ligar / mensagem</th><th>Último contato</th><th></th></tr></thead><tbody>
      ${pag.itens.map((x) => `<tr data-chave="${esc(x.chave)}">
        <td><b>${esc(x.nome)}</b>${x.cliente ? ` <span class="tag cinza">Já é cliente${x.cliente.codigo ? ' (' + esc(x.cliente.codigo) + ')' : ''}</span>` : ''}
          <div class="ajuda">${esc(x.endereco || 'Endereço não informado')}</div>
          <div class="ajuda">${x.site ? `<a href="${esc(/^https?:/.test(x.site) ? x.site : 'https://' + x.site)}" target="_blank" rel="noopener">site</a> · ` : ''}
            <a href="https://www.google.com/maps/search/${encodeURIComponent(x.nome + ' ' + resultadoProsp.cidade)}" target="_blank" rel="noopener">procurar telefone no Google</a></div></td>
        <td>${botoesContato(extrairTelefones(x.telefone), preencherMsg(DB.config().msgProspeccao || MSG_PROSPECCAO, { nome: x.nome, empresa }))}</td>
        <td>${resumoContato(x.ultimo)}</td>
        <td><div class="acoes"><button class="btn peq" data-registrar>Registrar</button>
          ${!x.cliente && DB.pode('clientes') ? '<button class="btn sec peq" data-cadastrar>Cadastrar cliente</button>' : ''}</div></td></tr>`).join('')}
      </tbody></table></div>${pag.html}`;
    lista._empresas = todas;
  };
  ligarPaginacao(lista, e, desenhar);
  lista.addEventListener('click', (ev) => {
    const linha = ev.target.closest('[data-chave]');
    if (!linha) return;
    const x = (lista._empresas || []).find((y) => y.chave === linha.dataset.chave);
    if (!x) return;
    const base = { tipo: 'prospeccao', chave: x.chave, nome: x.nome, telefone: x.telefone, cidade: resultadoProsp.cidade };
    if (ev.target.closest('[data-registrar]')) formResultado(x.nome, base, desenhar);
    else if (ev.target.closest('[data-whats]') && !DB.tabelaFaltando('ligacoes')) { registrarLigacao(base, 'mensagem'); setTimeout(desenhar, 300); }
    else if (ev.target.closest('[data-cadastrar]')) {
      if (!confirmar(`Cadastrar "${x.nome}" como cliente?`)) return;
      const novo = DB.salvarItem('clientes', {
        codigo: geradorCodigos()(), nome: x.nome, tipo: 'PJ', telefone: x.telefone, email: x.email, endereco: x.endereco,
        cidade: `${resultadoProsp.cidade} - ${resultadoProsp.uf}`.toUpperCase(), cep: x.cep, obs: 'Cadastrado pela prospecção (ligações).',
      });
      avisar('Cliente cadastrado. Complete os dados na página dele.');
      irPara('cliente/' + novo.id);
    }
  });
  const marcar = (sel, k) => $(sel, el).addEventListener('change', (ev) => { e[k] = ev.target.checked; e.pagina = 1; desenhar(); });
  marcar('#p-clientes', 'mostrarClientes'); marcar('#p-recusas', 'esconderRecusas'); marcar('#p-fone', 'soComTelefone');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const d = lerForm(form);
    Object.assign(e, { cidade: d.cidade.trim(), uf: d.uf, categoria: d.categoria, nome: (d.nome || '').trim(), pagina: 1 });
    enviando($('#p-buscar', el), async () => {
      try {
        const empresas = await buscarEmpresas(e.cidade, e.uf, e.categoria, e.nome);
        const cat = (CATEGORIAS_PROSPECCAO.find(([k]) => k === e.categoria) || [])[1];
        resultadoProsp = { titulo: `${cat}${e.nome ? ' com "' + e.nome + '"' : ''} em ${e.cidade} - ${e.uf}`, cidade: e.cidade, uf: e.uf, empresas };
        try { sessionStorage.setItem('berbert-prospeccao', JSON.stringify(resultadoProsp)); } catch { /* sem armazenamento */ }
        desenhar();
      } catch (err) {
        $('#p-resumo', el).innerHTML = '';
        lista.innerHTML = `<div class="alerta-perigo" style="margin:12px"><b>A pesquisa não funcionou.</b><br>${esc(err.message)}
          <p class="ajuda">Tente de novo em alguns segundos. Enquanto isso, use o botão "Ver no Google Maps".</p></div>`;
      }
    });
  });
  desenhar();
}
