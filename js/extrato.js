// Financeiro: importa o extrato do banco (OFX ou CSV) e lança as entradas como receitas recebidas.
// Entradas que batem com uma receita em aberto (mesmo valor, data próxima) dão baixa nela em vez de duplicar.
// O que já foi importado antes (mesmo código da transação ou mesma data, valor e descrição) é pulado.

// Lê um arquivo OFX (o formato que quase todo banco exporta). Funciona com OFX antigo (sem fechar as tags) e com XML.
function lerOFX(texto) {
  const campo = (bloco, tag) => {
    const m = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
    return m ? m[1].trim() : '';
  };
  return (texto.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) || []).map((b) => {
    const dt = campo(b, 'DTPOSTED');
    const valor = parseFloat(campo(b, 'TRNAMT').replace(',', '.'));
    return {
      data: dt.length >= 8 ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : '',
      valor, id: campo(b, 'FITID'),
      descricao: [campo(b, 'MEMO'), campo(b, 'NAME')].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' - ') || campo(b, 'TRNTYPE'),
    };
  }).filter((t) => t.data && !isNaN(t.valor));
}

// CSV de extrato: acha as colunas de data, descrição e valor (ou crédito/débito separados).
const CAMPOS_EXTRATO = [
  ['data', 'Data', ['data', 'data lancamento', 'data do lancamento', 'data movimento', 'dt lancamento', 'data mov']],
  ['descricao', 'Descrição', ['descricao', 'historico', 'lancamento', 'detalhes', 'descricao do lancamento', 'memo', 'titulo']],
  ['valor', 'Valor', ['valor', 'valor (r$)', 'valor r$', 'montante', 'quantia']],
  ['credito', 'Crédito / entrada', ['credito', 'entrada', 'entradas', 'creditos', 'valor credito']],
  ['debito', 'Débito / saída', ['debito', 'saida', 'saidas', 'debitos', 'valor debito']],
  ['id', 'Código da transação', ['documento', 'n documento', 'numero documento', 'identificador', 'id', 'codigo']],
];
function dataExtrato(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return dataImportada(s);
}
function valorExtrato(v) {
  const s = String(v || '').trim();
  if (!s) return NaN;
  const negativo = /^-|-$|\(.*\)|\bD$/i.test(s.replace(/\s+/g, ' ').trim());
  const n = valorImportado(s.replace(/[()]/g, '').replace(/\s*[CD]$/i, '').replace(/^-|-$/g, ''));
  return negativo ? -n : n;
}
function lerCSVExtrato(linhas) {
  // Alguns bancos colocam linhas de cabeçalho antes da tabela: usa a primeira linha que tenha "data" e "valor"/"crédito".
  const i = linhas.findIndex((l) => { const n = l.map(normalizar); return n.some((c) => c.startsWith('data')) && n.some((c) => /valor|credito|entrada/.test(c)); });
  if (i < 0) throw new Error('não encontrei as colunas de data e valor no arquivo.');
  const mapa = sugerirColunas(linhas[i].map((c) => c.trim()), CAMPOS_EXTRATO);
  const v = (l, k) => (mapa[k] === undefined ? '' : String(l[mapa[k]] ?? '').trim());
  return linhas.slice(i + 1).map((l) => {
    let valor = mapa.valor !== undefined ? valorExtrato(v(l, 'valor')) : NaN;
    if (isNaN(valor)) {
      const c = valorExtrato(v(l, 'credito')), d = valorExtrato(v(l, 'debito'));
      valor = !isNaN(c) && c ? Math.abs(c) : !isNaN(d) && d ? -Math.abs(d) : NaN;
    }
    return { data: dataExtrato(v(l, 'data')), descricao: v(l, 'descricao'), valor, id: v(l, 'id') };
  }).filter((t) => t.data && !isNaN(t.valor) && t.valor !== 0 && !/^saldo/i.test(normalizar(t.descricao)));
}

function importarExtrato() {
  abrirModal('Importar extrato do banco', `
    <div class="importacao">
      <p>Escolha o arquivo do extrato baixado do internet banking: <b>.ofx</b> (recomendado; às vezes aparece como "Money" ou "OFX")
        ou <b>.csv</b>.</p>
      <p class="ajuda">As <b>entradas</b> viram receitas já recebidas. Se uma entrada tiver o mesmo valor de uma receita em aberto
        (com vencimento até 10 dias de diferença), ela dá baixa nessa receita. O que já foi importado antes é pulado.</p>
      <div class="acoes"><label class="btn">Escolher arquivo do extrato<input type="file" id="arquivo-extrato" accept=".ofx,.csv,.txt,.qfx" hidden></label></div>
      <div id="etapa-extrato"></div>
    </div>`, (raiz) => {
    $('#arquivo-extrato', raiz).addEventListener('change', async (e) => {
      const arq = e.target.files[0];
      e.target.value = '';
      if (!arq) return;
      try {
        const texto = await lerArquivoTexto(arq);
        const ofx = /<OFX>|OFXHEADER|<STMTTRN>/i.test(texto);
        const transacoes = ofx ? lerOFX(texto) : lerCSVExtrato(lerCSV(texto));
        if (!transacoes.length) throw new Error('nenhuma movimentação encontrada no arquivo.');
        etapaExtrato($('#etapa-extrato', raiz), arq.name, transacoes);
      } catch (err) {
        avisar('Não foi possível ler o extrato: ' + err.message, 'erro');
      }
    });
  });
}

// Tenta achar o cliente pelo nome escrito no histórico (ex.: "PIX RECEBIDO - META AGROCIENCIA LTDA").
function clienteDoHistorico(descricao, clientes) {
  const d = ' ' + normalizar(descricao).replace(/[^a-z0-9]+/g, ' ') + ' ';
  let melhor = null;
  for (const c of clientes) {
    for (const nome of [c.nome, c.fantasia]) {
      const n = normalizar(nome).replace(/[^a-z0-9]+/g, ' ').trim();
      if (n.length >= 8 && n.split(' ').length >= 2 && d.includes(' ' + n + ' ') && (!melhor || n.length > melhor.n.length)) melhor = { c, n };
    }
  }
  return melhor ? melhor.c : null;
}

function etapaExtrato(el, nomeArquivo, transacoes) {
  const lancs = DB.listar('financeiro');
  const jaImportados = new Set(lancs.filter((f) => f.extratoId).map((f) => f.extratoId));
  const chave = (t) => t.id ? 'id:' + t.id : `${t.data}|${t.valor.toFixed(2)}|${normalizar(t.descricao)}`;
  const assinaturas = new Set(lancs.filter((f) => f.extratoChave).map((f) => f.extratoChave));
  const clientes = DB.listar('clientes');
  const abertas = lancs.filter((f) => f.tipo === 'receita' && !f.pago);
  const usadas = new Set();
  let incluirSaidas = false;

  const linhas = transacoes.map((t, i) => {
    const k = chave(t);
    const repetida = (t.id && jaImportados.has(t.id)) || assinaturas.has(k);
    let baixa = null;
    if (t.valor > 0 && !repetida) {
      const perto = abertas.filter((f) => !usadas.has(f.id) && Math.abs(num(f.valor) - t.valor) < 0.01
        && Math.abs((new Date(f.vencimento) - new Date(t.data)) / 864e5) <= 10)
        .sort((a, b) => Math.abs(new Date(a.vencimento) - new Date(t.data)) - Math.abs(new Date(b.vencimento) - new Date(t.data)));
      if (perto[0]) { baixa = perto[0]; usadas.add(baixa.id); }
    }
    return { ...t, i, k, repetida, baixa, cliente: t.valor > 0 ? clienteDoHistorico(t.descricao, clientes) : null };
  });

  const atualizarBotao = () => {
    const n = $$('[data-linha]:checked', el).length;
    const botao = $('#ext-confirmar', el);
    botao.textContent = `Lançar ${n}`;
    botao.disabled = !n;
  };
  el.addEventListener('change', (e) => { if (e.target.matches('[data-linha]')) atualizarBotao(); });
  const desenhar = () => {
    const visiveis = linhas.filter((t) => t.valor > 0 || incluirSaidas);
    const entradas = linhas.filter((t) => t.valor > 0), saidas = linhas.filter((t) => t.valor < 0);
    el.innerHTML = `
      <h3>Arquivo: ${esc(nomeArquivo)}</h3>
      <div class="resumo-importacao">
        <span class="tag verde">${entradas.length} entradas (${moeda(entradas.reduce((s, t) => s + t.valor, 0))})</span>
        <span class="tag vermelho">${saidas.length} saídas (${moeda(saidas.reduce((s, t) => s + t.valor, 0))})</span>
        ${linhas.some((t) => t.repetida) ? `<span class="tag cinza">${linhas.filter((t) => t.repetida).length} já importadas antes</span>` : ''}
        ${linhas.some((t) => t.baixa) ? `<span class="tag azul">${linhas.filter((t) => t.baixa).length} dão baixa em receitas em aberto</span>` : ''}
      </div>
      <label class="check-linha"><input type="checkbox" id="ext-saidas" ${incluirSaidas ? 'checked' : ''}> Lançar também as saídas como despesas pagas</label>
      <div class="tabela-wrap itens-import"><table><thead><tr><th><input type="checkbox" id="ext-todas" checked title="Marcar todas"></th><th>Data</th><th>Histórico</th>
        <th class="num">Valor</th><th>O que vai acontecer</th><th>Categoria</th></tr></thead><tbody>
        ${visiveis.map((t) => `<tr class="${t.repetida ? 'inativo' : ''}">
          <td><input type="checkbox" data-linha="${t.i}" ${t.repetida ? '' : 'checked'}></td>
          <td>${dataBR(t.data)}</td><td>${esc(t.descricao)}${t.cliente ? `<div class="ajuda">Cliente: ${esc(t.cliente.nome)}</div>` : ''}</td>
          <td class="num" style="color:${t.valor > 0 ? 'var(--primaria)' : 'var(--vermelho)'}">${moeda(t.valor)}</td>
          <td>${t.repetida ? '<span class="tag cinza">Já importada</span>'
            : t.baixa ? `<span class="tag azul">Dar baixa</span><div class="ajuda">${esc(t.baixa.descricao)} · venc. ${dataBR(t.baixa.vencimento)}</div>`
            : `<span class="tag ${t.valor > 0 ? 'verde' : 'vermelho'}">Nova ${t.valor > 0 ? 'receita' : 'despesa'}</span>`}</td>
          <td>${t.baixa ? '' : `<input data-cat="${t.i}" list="ext-cats-${t.valor > 0 ? 'r' : 'd'}" value="${t.valor > 0 ? (t.cliente ? 'Serviços' : 'Entradas do banco') : 'Outros'}">`}</td></tr>`).join('')}
      </tbody></table></div>
      <datalist id="ext-cats-r"><option value="Serviços"><option value="Contrato mensal"><option value="Entradas do banco"><option value="Outros"></datalist>
      <datalist id="ext-cats-d"><option value="Produtos químicos"><option value="Combustível"><option value="Salários"><option value="Equipamentos">
        <option value="Aluguel"><option value="Impostos"><option value="Tarifas bancárias"><option value="Manutenção de veículo"><option value="Outros"></datalist>
      <div class="form-acoes"><button type="button" class="btn sec" data-cancelar>Cancelar</button>
        <button type="button" class="btn" id="ext-confirmar">Lançar</button></div>`;
    atualizarBotao();
    $('#ext-saidas', el).addEventListener('change', (e) => { incluirSaidas = e.target.checked; desenhar(); });
    $('#ext-todas', el).addEventListener('change', (e) => { $$('[data-linha]', el).forEach((c) => (c.checked = e.target.checked)); atualizarBotao(); });
    $('[data-cancelar]', el).addEventListener('click', fecharModal);
    $('#ext-confirmar', el).addEventListener('click', (e) => enviando(e.target, async () => {
      const escolhidas = $$('[data-linha]:checked', el).map((c) => linhas[Number(c.dataset.linha)]);
      const novos = [], baixas = [];
      for (const t of escolhidas) {
        const extra = { extratoChave: t.k, ...(t.id ? { extratoId: t.id } : {}) };
        if (t.baixa) {
          baixas.push({ id: t.baixa.id, pago: true, dataPagamento: t.data, ...extra });
        } else {
          const cat = ($(`[data-cat="${t.i}"]`, el) || {}).value || '';
          novos.push({ tipo: t.valor > 0 ? 'receita' : 'despesa', descricao: t.descricao || 'Movimentação do extrato', valor: Math.abs(t.valor),
            vencimento: t.data, pago: true, dataPagamento: t.data, categoria: cat, forma: /pix/i.test(t.descricao) ? 'pix' : 'transferencia',
            ...(t.cliente ? { clienteId: t.cliente.id } : {}), obs: 'Importado do extrato: ' + nomeArquivo, ...extra });
        }
      }
      if (baixas.length) await DB.atualizarVarios('financeiro', baixas);
      if (novos.length) await DB.adicionarVarios('financeiro', novos);
      fecharModal();
      avisar(`${novos.length} lançamento(s) criados${baixas.length ? `, ${baixas.length} receita(s) baixada(s)` : ''}.`);
      const meses = escolhidas.map((t) => t.data.slice(0, 7)).sort();
      if (meses.length) estadoFin.mes = meses[meses.length - 1];
      render();
    }));
  };
  desenhar();
}
