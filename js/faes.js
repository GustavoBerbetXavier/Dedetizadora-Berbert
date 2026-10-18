// Ficha Avaliativa para Execução do Serviço (FAES): listas fixas da ficha e o
// documento para imprimir/PDF. Usado pelo sistema (js/app.js) e pela página
// que o técnico abre pelo link (os.html).
const FAES = (() => {
  const PRAGAS = [
    { grupo: 'Artrópodes', itens: [['baratas', 'Baratas'], ['moscas', 'Moscas'], ['aranhas', 'Aranhas'], ['percevejos', 'Percevejos'],
      ['pulga', 'Pulga'], ['cupim', 'Cupim'], ['formigas', 'Formigas'], ['escorpioes', 'Escorpiões']] },
    { grupo: 'Roedores sinantrópicos comensais', itens: [['rattus_rattus', 'Rattus rattus'], ['mus_musculus', 'Mus musculus'],
      ['rattus_norvegicus', 'Rattus norvegicus']] },
    { grupo: 'Outras espécies', itens: [['pombos_morcegos', 'Pombos / Morcegos']] },
  ];
  const EQUIPAMENTOS = [['bomba_manual', 'Bomba manual'], ['atomizador', 'Atomizador elétrico'], ['bomba_motorizada', 'Bomba motorizada']];
  const EPI = [['mascara', 'Máscara'], ['roupa', 'Roupa'], ['botas', 'Botas'], ['oculos', 'Óculos'], ['protetor', 'Protetor auricular'], ['luvas', 'Luvas']];
  const GRAUS = [['baixo', 'Baixo'], ['medio', 'Médio'], ['alto', 'Alto']];
  // Venenos da ficha: sempre estes, escritos exatamente como na FAES em papel.
  const PRODUTOS = [
    { id: 'lambida', nome: 'LAMBIDA - CIALOTRINA', registro: '3.3308.0007', grupo: 'PIRETRINAS E PIRETRÓIDES', concentracao: '5% Lambidacialotrina',
      diluente: 'ÁGUA OUTROS', antidoto: 'ANTI - HISTAMÍNICOS E TRATAMENTO SINTOMÁTICO', apelidos: ['lambda', 'lambida', 'cialotrina'] },
    { id: 'fipronil', nome: 'FIPRONIL', registro: '3.0404.0029', grupo: 'FENIL PIRAZOL', concentracao: '2,5% FIPRONIL',
      diluente: 'ÁGUA OUTROS', antidoto: 'TRATAMENTO SINTOMÁTICO', apelidos: ['fipronil'] },
    { id: 'diclovos', nome: 'DICLOVOS', registro: '3.03308-0', grupo: 'ORGANOFOSFORADOS', concentracao: '76,27% DICLOVOS',
      diluente: 'ÁGUA OUTROS', antidoto: 'ATOPRINA OXIMAS E TRATAMENTO', apelidos: ['diclovos', 'diclorvos', 'ddvp'] },
    { id: 'difetialona', nome: 'DIFETIALONA', registro: '3.3222.0007', grupo: 'BENZOTIOPIRANONAS', concentracao: '0.005% DIFENACOUM',
      diluente: 'BLOCO', antidoto: 'VITAMINA K1 E TRATAMENTO SINTOMÁTICO', apelidos: ['difetialona', 'difenacoum'] },
  ];
  const ACAO_TOXICA = 'TOXIDADE AGUDA';
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // Qual veneno da ficha corresponde a um produto gravado (também os de ordens antigas, gravados pelo cadastro).
  const idProduto = (p) => {
    if (PRODUTOS.some((f) => f.id === p.id)) return p.id;
    const nome = semAcento(p.nome);
    const f = nome && PRODUTOS.find((y) => y.apelidos.some((a) => nome.includes(a)));
    return f ? f.id : p.id;
  };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dataBR = (iso) => { if (!iso) return ''; const [a, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${a}`; };
  const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
  const marca = (sim) => `<span class="faes-x">(${sim ? 'X' : '&nbsp;&nbsp;'})</span>`;
  const colab = (lista, id) => {
    const c = (lista || []).find((x) => x.id === id);
    return c ? `${c.codigo ? c.codigo + ' - ' : ''}${c.nome}` : '';
  };

  // Nome do técnico na ficha: o do cadastro (com código); se ele digitou outro nome, o digitado.
  const nomeControlador = (digitado, cadastro) => {
    const d = String(digitado || '').trim();
    if (!d) return cadastro;
    return cadastro && cadastro.toUpperCase().endsWith(d.toUpperCase()) ? cadastro : d;
  };

  // Documento da FAES no formato da ficha em papel, preenchido com o que houver.
  function documento({ ordem: o, cliente: c = {}, empresa: e = {}, colaboradores = [] }) {
    const x = o.execucao || {};
    const pragas = new Set(x.pragas || []);
    const usados = Object.fromEntries((x.produtos || []).map((p) => [idProduto(p), p]));
    // Os 4 venenos fixos; um produto diferente usado numa ordem antiga aparece no fim.
    const listaProdutos = [...PRODUTOS, ...(x.produtos || []).filter((p) => !PRODUTOS.some((f) => f.id === idProduto(p)))];
    const rt = (colaboradores || []).find((k) => k.id === o.responsavelTecnico) || {};
    const total = (o.itens || []).reduce((s, i) => s + (Number(i.qtd) || 1) * (Number(i.valor) || 0), 0) - (Number(o.desconto) || 0);
    return `<div class="faes">
      <div class="faes-titulo">FICHA AVALIATIVA PARA EXECUÇÃO DO SERVIÇO – FAES</div>
      <div class="faes-topo">
        <div class="faes-empresa">
          <img src="img/logo-escura.webp" alt="" class="faes-logo">
          <div><b>${esc(e.empresa || 'DEDETIZADORA BERBERT LTDA')}</b><br>
            CNPJ: ${esc(e.cnpj || '')}${e.ie ? ' | IE: ' + esc(e.ie) : ''}<br>${esc(e.endereco || '')}<br>${esc(e.telefone || '')}<br>
            <b>Licença Sanitária:</b> ${esc(e.licenca || '')} &nbsp; <b>Licença Ambiental:</b> ${esc(e.licencaAmbiental || '')}</div>
        </div>
        <div class="faes-cliente">
          <div><b>Dados do Cliente</b> &nbsp; CNPJ/CPF: <b>${esc(c.documento || '')}</b> &nbsp; I.E./R.G.: ${esc(c.ie || '')}</div>
          <div><b>${esc(c.codigo ? c.codigo + ' - ' : '')}${esc(c.nome || '')}</b>${c.fantasia ? ' — Fantasia: ' + esc(c.fantasia) : ''}</div>
          <div>Endereço: ${esc([c.endereco, c.bairro].filter(Boolean).join(', '))}${c.cep ? ', CEP: ' + esc(c.cep) : ''}</div>
          <div>Município: ${esc(c.cidade || '')}</div>
          <div>Telefone de contato: ${esc(c.telefone || '')}</div>
          <div>Ramo de atividade: ${esc(c.ramo || '')}</div>
          <div class="faes-num">FAES <b>${esc(o.numero ?? '')}</b></div>
        </div>
      </div>
      <table class="faes-tab">
        <tr><td><b>PROPOSTA TÉCNICA</b><br>Data avaliação: ${dataBR(o.dataAvaliacao || o.data)}</td>
          <td>Hora de início: ${esc(x.horaInicio || o.horaInicio || '')}${x.horaFim ? ' &nbsp; Término: ' + esc(x.horaFim) : ''}</td>
          <td>Responsável pelo preenchimento:<br><b>${esc(colab(colaboradores, o.responsavelPreenchimento))}</b></td></tr>
      </table>
      <table class="faes-tab">
        <tr><td class="faes-rot">Vetores e pragas</td>
          <td colspan="3">${PRAGAS.map((g) => `<div class="faes-grupo"><i>${g.grupo}:</i> ${g.itens.map(([k, r]) => `${marca(pragas.has(k))} ${r}`).join(' &nbsp; ')}</div>`).join('')}
          ${x.outrasPragas ? `<div>Outras: ${esc(x.outrasPragas)}</div>` : ''}</td></tr>
        <tr><td class="faes-rot">Caracterização do local</td><td>Área interna: <b>${esc(x.areaInterna || '')}</b> m²</td><td>Área externa: <b>${esc(x.areaExterna || '')}</b> m²</td><td></td></tr>
        <tr><td class="faes-rot">Características das áreas</td><td colspan="3">${esc(o.caracteristicas || '')}</td></tr>
        <tr><td class="faes-rot">Pragas encontradas e situações que favorecem</td><td colspan="3">${esc(x.encontradas || '')}</td></tr>
        <tr><td class="faes-rot">Grau de infestação</td>
          <td colspan="3">Área interna: ${GRAUS.map(([k, r]) => `${marca(x.grauInterno === k)} ${r}`).join(' ')} &nbsp;&nbsp;
            Área externa: ${GRAUS.map(([k, r]) => `${marca(x.grauExterno === k)} ${r}`).join(' ')}</td></tr>
        <tr><td class="faes-rot">Responsável pela avaliação prévia</td><td>${esc(colab(colaboradores, o.responsavelAvaliacao))}</td>
          <td class="faes-rot">Parecer do responsável técnico</td><td>${esc(colab(colaboradores, o.responsavelTecnico))}${rt.registro ? '<br>Registro: ' + esc(rt.registro) : ''}</td></tr>
      </table>
      <table class="faes-tab">
        <tr><th colspan="2">Classificação dos Serviços</th></tr>
        ${(o.itens || []).map((i) => `<tr><td>${esc(i.descricao)} | ${Number(i.qtd) || 1} × ${moeda(i.valor)}</td><td class="faes-dir">${moeda((Number(i.qtd) || 1) * (Number(i.valor) || 0))}</td></tr>`).join('')}
        <tr><td class="faes-dir"><b>Total</b></td><td class="faes-dir"><b>${moeda(total)}</b></td></tr>
      </table>
      <table class="faes-tab faes-produtos">
        <tr><th colspan="9">ESPECIFICAÇÕES TÉCNICAS DOS PRODUTOS UTILIZADOS</th></tr>
        <tr><th>Nome</th><th>Grupo</th><th>Concentração</th><th>Diluente</th><th>Volume aplicado</th><th>Local de Aplicação</th><th>Antídoto e tratamento</th><th>Nº de Lote e Val do Produto</th><th>Ação tóxica</th></tr>
        ${listaProdutos.map((p, i) => { const id = idProduto(p); const u = usados[id] || {}; return `<tr>
          <td>${marca(!!usados[id])} ${esc(p.nome)}${p.registro ? '<br>Nº Registro<br>' + esc(p.registro) : ''}</td><td>${esc(p.grupo || '')}</td><td>${esc(p.concentracao || '')}</td>
          <td>${esc(p.diluente || u.diluente || '')}</td><td>${esc(u.quantidade || '')}</td><td>${esc(u.local || '')}</td><td>${esc(p.antidoto || '')}</td><td>${esc(u.lote || '')}</td>
          ${i === 0 ? `<td rowspan="${listaProdutos.length}" class="faes-acao">${ACAO_TOXICA.replace(' ', '<br><br>')}</td>` : ''}</tr>`; }).join('')}
        <tr><td colspan="9"><b>Equipamentos:</b> ${EQUIPAMENTOS.map(([k, r]) => `${marca((x.equipamentos || []).includes(k))} ${r}`).join(' &nbsp; ')}</td></tr>
        <tr><td colspan="9"><b>EPI:</b> ${EPI.map(([k, r]) => `${marca((x.epi || []).includes(k))} ${r}`).join(' &nbsp; ')}</td></tr>
        <tr><td colspan="9"><b>Mapeamento de iscas:</b> SIM ${marca(x.mapeamentoIscas === 'sim')} &nbsp; NÃO ${marca(x.mapeamentoIscas === 'nao')}</td></tr>
      </table>
      ${x.observacoes ? `<table class="faes-tab"><tr><td><b>Observações do técnico:</b> ${esc(x.observacoes)}</td></tr></table>` : ''}
      <table class="faes-tab">
        <tr><th colspan="3">COMPROVANTE DE EXECUÇÃO DO SERVIÇO — Data da execução: ${dataBR(x.dataExecucao) || '____/____/______'}
          &nbsp; | &nbsp; Em caso de intoxicação ligar para: ${esc(e.telefoneIntoxicacao || '0800-771-3733')}</th></tr>
        <tr class="faes-assin">
          <td><b>Controlador de pragas</b><br>Nome: ${esc(nomeControlador(x.tecnicoNome, colab(colaboradores, o.controlador)))}
            ${x.assinaturaTecnico ? `<img src="${x.assinaturaTecnico}" class="faes-assinatura" alt="Assinatura do técnico">` : '<div class="faes-linha"></div>'}Assinatura</td>
          <td><b>Responsável técnico</b><br>Nome: ${esc(colab(colaboradores, o.responsavelTecnico))}<br>Nº Registro Conselho de Classe: ${esc(rt.registro || '')}<div class="faes-linha"></div>Assinatura</td>
          <td><b>Cliente</b><br>Nome: ${esc(x.assinaturaNome || c.nome || '')}
            <div class="faes-decl">Declaro que recebi a relação de medidas médicas preventivas antes e após o serviço, cópia da Licença Sanitária e Ambiental vigentes, e que as embalagens dos desinfetantes domissanitários utilizados foram recolhidas pela empresa prestadora do serviço.</div>
            ${x.assinatura ? `<img src="${x.assinatura}" class="faes-assinatura" alt="Assinatura do cliente">` : '<div class="faes-linha"></div>'}Assinatura${x.enviadoEm ? ` — assinado em ${new Date(x.enviadoEm).toLocaleString('pt-BR')}` : ''}</td>
        </tr>
      </table>
    </div>`;
  }

  return { PRAGAS, EQUIPAMENTOS, EPI, GRAUS, PRODUTOS, idProduto, documento };
})();
