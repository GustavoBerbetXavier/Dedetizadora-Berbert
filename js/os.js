// Página do técnico (aberta pelo link da ordem de serviço, sem login).
// Mostra os dados da ordem e recebe a execução: produtos usados e quantidades,
// pragas, áreas, EPI, equipamentos e as assinaturas do cliente e do técnico.
(async () => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dataBR = (iso) => { if (!iso) return ''; const [a, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${a}`; };
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const agora = () => new Date().toTimeString().slice(0, 5);
  const el = $('#os-conteudo');
  const avisar = (msg, erro) => {
    const a = $('#aviso-flutuante');
    a.textContent = msg; a.className = erro ? 'erro' : 'ok'; a.hidden = false;
    clearTimeout(avisar.t); avisar.t = setTimeout(() => (a.hidden = true), erro ? 6000 : 3000);
  };
  const erro = (msg) => { el.innerHTML = `<div class="cartao os-msg"><h2>Não foi possível abrir</h2><p>${esc(msg)}</p></div>`; };

  const token = new URLSearchParams(location.search).get('t');
  const cfg = window.BERBERT_CONFIG || {};
  if (!token) return erro('Link incompleto. Peça ao escritório para enviar o link de novo.');
  if (!cfg.supabaseUrl) return erro('Sistema não configurado.');
  const sb = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let info;
  try {
    const { data, error } = await sb.rpc('os_publica', { p_token: token });
    if (error) throw error;
    if (!data) throw new Error('Link inválido ou substituído por um novo. Peça ao escritório o link atualizado.');
    info = data;
  } catch (e) {
    const m = (e && e.message) || String(e);
    return erro(/Failed to fetch|NetworkError/i.test(m) ? 'Sem conexão com a internet. Tente de novo.' : m.replace(/^.*?:\s*/, ''));
  }

  const o = info.ordem || {};
  const c = info.cliente || {};
  const colab = (id) => { const k = (info.colaboradores || []).find((x) => x.id === id); return k ? k.nome : ''; };
  const x = o.execucao || {};
  const enviado = !!x.enviadoEm;
  // Rascunho guardado no aparelho, para não perder o preenchimento se a página fechar.
  const chaveRascunho = 'berbert-os-' + token.slice(0, 12);
  let rascunho = {};
  try { rascunho = JSON.parse(localStorage.getItem(chaveRascunho) || '{}'); } catch { /* sem armazenamento */ }
  const v = { ...x, ...rascunho };
  const usados = Object.fromEntries((v.produtos || []).map((p) => [p.id, p]));
  const marcado = (lista, k) => (v[lista] || []).includes(k) ? 'checked' : '';
  const enderecoCompleto = [c.endereco, c.bairro, c.cidade].filter(Boolean).join(', ');

  const cabecalho = `
    <div class="cartao os-cab">
      <div class="os-num">Ordem de serviço <b>nº ${esc(info.numero)}</b></div>
      <h1>${esc(c.codigo ? c.codigo + ' - ' : '')}${esc(c.nome || '')}</h1>
      ${c.fantasia ? `<div class="sub">${esc(c.fantasia)}</div>` : ''}
      <div class="os-dados">
        ${enderecoCompleto ? `<div>Endereço: <a href="https://maps.google.com/?q=${encodeURIComponent(enderecoCompleto)}" target="_blank" rel="noopener">${esc(enderecoCompleto)}</a></div>` : ''}
        ${c.telefone ? `<div>Telefone: <a href="tel:${esc(String(c.telefone).replace(/\D/g, ''))}">${esc(c.telefone)}</a>${c.contato ? ' · ' + esc(c.contato) : ''}</div>` : ''}
        <div>Avaliação: <b>${dataBR(o.dataAvaliacao || o.data)}</b>${o.horaInicio ? ' às ' + esc(o.horaInicio) : ''}</div>
        ${colab(o.controlador) ? `<div>Técnico: <b>${esc(colab(o.controlador))}</b></div>` : ''}
        ${colab(o.responsavelTecnico) ? `<div>Responsável técnico: ${esc(colab(o.responsavelTecnico))}</div>` : ''}
      </div>
      ${(o.itens || []).length ? `<div class="os-servicos"><b>Serviços:</b><ul>${o.itens.map((i) => `<li>${esc(i.descricao)}${Number(i.qtd) > 1 ? ' × ' + i.qtd : ''}</li>`).join('')}</ul></div>` : ''}
      ${o.caracteristicas ? `<div><b>Características das áreas:</b> ${esc(o.caracteristicas)}</div>` : ''}
      ${o.obsTecnico ? `<div class="os-obs"><b>Observações do escritório:</b> ${esc(o.obsTecnico)}</div>` : ''}
    </div>`;

  if (enviado) {
    el.innerHTML = cabecalho + `<div class="cartao os-msg"><h2>Execução já enviada</h2>
      <p>Enviada em ${new Date(x.enviadoEm).toLocaleString('pt-BR')}${x.assinaturaNome ? `, assinada por ${esc(x.assinaturaNome)}` : ''}.</p>
      <p class="ajuda">Se precisar corrigir algo, peça ao escritório para liberar a correção e abra este link de novo.</p></div>`;
    return;
  }

  const caixas = (lista, nome) => lista.map(([k, r]) => `<label class="opcao"><input type="checkbox" name="${nome}" value="${k}" ${marcado(nome, k)}><span>${r}</span></label>`).join('');
  const radios = (nome, lista, atual) => lista.map(([k, r]) => `<label class="opcao"><input type="radio" name="${nome}" value="${k}" ${atual === k ? 'checked' : ''}><span>${r}</span></label>`).join('');

  el.innerHTML = cabecalho + `
    <form id="form-exec" autocomplete="off">
      <section class="cartao">
        <h2>1. Produtos (venenos) utilizados</h2>
        <p class="ajuda">Marque os produtos usados e digite a quantidade.</p>
        ${(info.produtos || []).length ? info.produtos.map((p) => { const u = usados[p.id] || {}; return `
          <div class="produto ${usados[p.id] ? 'usado' : ''}" data-produto="${esc(p.id)}">
            <label class="opcao grande"><input type="checkbox" class="usa-produto" ${usados[p.id] ? 'checked' : ''}>
              <span><b>${esc(p.nome)}</b><small>${esc([p.grupo, p.concentracao].filter(Boolean).join(' · '))}</small></span></label>
            <div class="produto-campos">
              <label>Quantidade aplicada *<input name="quantidade" value="${esc(u.quantidade || '')}" placeholder="Ex.: 200 ml, 5 L, 12 blocos" inputmode="text"></label>
              <label>Local de aplicação<input name="local" value="${esc(u.local || '')}" placeholder="Ex.: cozinha, área externa"></label>
              <label>Lote / validade<input name="lote" value="${esc(u.lote || '')}" placeholder="Opcional"></label>
            </div>
          </div>`; }).join('') : '<p class="ajuda">Nenhum produto cadastrado no sistema.</p>'}
      </section>

      <section class="cartao">
        <h2>2. Pragas tratadas / prevenidas</h2>
        ${FAES.PRAGAS.map((g) => `<div class="grupo-opcoes"><div class="grupo-titulo">${g.grupo}</div>${caixas(g.itens, 'pragas')}</div>`).join('')}
        <label class="campo">Outras pragas<input name="outrasPragas" value="${esc(v.outrasPragas || '')}" placeholder="Opcional"></label>
      </section>

      <section class="cartao">
        <h2>3. Local e avaliação</h2>
        <div class="duas-colunas">
          <label class="campo">Área interna (m²)<input name="areaInterna" inputmode="decimal" value="${esc(v.areaInterna || '')}"></label>
          <label class="campo">Área externa (m²)<input name="areaExterna" inputmode="decimal" value="${esc(v.areaExterna || '')}"></label>
        </div>
        <div class="grupo-opcoes"><div class="grupo-titulo">Grau de infestação — área interna</div>${radios('grauInterno', FAES.GRAUS, v.grauInterno)}</div>
        <div class="grupo-opcoes"><div class="grupo-titulo">Grau de infestação — área externa</div>${radios('grauExterno', FAES.GRAUS, v.grauExterno)}</div>
        <label class="campo">Pragas encontradas e situações que favorecem
          <textarea name="encontradas" rows="3">${esc(v.encontradas || '')}</textarea></label>
      </section>

      <section class="cartao">
        <h2>4. Execução</h2>
        <div class="duas-colunas">
          <label class="campo">Data da execução<input type="date" name="dataExecucao" value="${esc(v.dataExecucao || hoje())}"></label>
          <label class="campo">Hora de início<input type="time" name="horaInicio" value="${esc(v.horaInicio || o.horaInicio || '')}"></label>
          <label class="campo">Hora de término<input type="time" name="horaFim" value="${esc(v.horaFim || '')}"></label>
        </div>
        <div class="grupo-opcoes"><div class="grupo-titulo">Equipamentos utilizados</div>${caixas(FAES.EQUIPAMENTOS, 'equipamentos')}</div>
        <div class="grupo-opcoes"><div class="grupo-titulo">EPI utilizados</div>${caixas(FAES.EPI, 'epi')}</div>
        <div class="grupo-opcoes"><div class="grupo-titulo">Mapeamento de iscas</div>${radios('mapeamentoIscas', [['sim', 'Sim'], ['nao', 'Não']], v.mapeamentoIscas)}</div>
        <label class="campo">Observações<textarea name="observacoes" rows="3">${esc(v.observacoes || '')}</textarea></label>
      </section>

      <section class="cartao">
        <h2>5. Assinatura do cliente</h2>
        <p class="ajuda">O cliente declara que recebeu a relação de medidas preventivas, cópia das licenças sanitária e ambiental
          e que as embalagens dos produtos foram recolhidas pela empresa.</p>
        <label class="campo">Nome de quem está assinando *<input name="assinaturaNome" value="${esc(v.assinaturaNome || '')}" placeholder="Nome do cliente ou responsável"></label>
        <div class="assinatura-caixa" id="ass-cliente"><canvas></canvas><span class="assinatura-dica">Assine aqui com o dedo</span></div>
        <button type="button" class="btn sec peq" data-limpar="ass-cliente">Limpar assinatura</button>
      </section>

      <section class="cartao">
        <h2>6. Assinatura do técnico</h2>
        <label class="campo">Nome do técnico / controlador de pragas *<input name="tecnicoNome" value="${esc(v.tecnicoNome || colab(o.controlador) || '')}" placeholder="Seu nome"></label>
        <div class="assinatura-caixa" id="ass-tecnico"><canvas></canvas><span class="assinatura-dica">Técnico: assine aqui com o dedo</span></div>
        <button type="button" class="btn sec peq" data-limpar="ass-tecnico">Limpar assinatura</button>
      </section>

      <div class="os-enviar"><button class="btn" id="enviar">Enviar e finalizar</button></div>
    </form>`;

  const form = $('#form-exec');

  // Produtos: mostra os campos só para os marcados.
  $$('.produto', form).forEach((bloco) => {
    const cb = $('.usa-produto', bloco);
    const sync = () => { bloco.classList.toggle('usado', cb.checked); if (cb.checked && !$('[name=quantidade]', bloco).value) $('[name=quantidade]', bloco).focus(); };
    cb.addEventListener('change', sync);
  });

  // Quadro de assinatura com o dedo / mouse.
  function quadroAssinatura(caixa) {
    const canvas = $('canvas', caixa);
    const ctx = canvas.getContext('2d');
    const dica = $('.assinatura-dica', caixa);
    let assinou = false, desenhando = false, ultimo = null;
    const ajustar = () => {
      const r = canvas.getBoundingClientRect();
      const escala = window.devicePixelRatio || 1;
      const copia = assinou ? canvas.toDataURL() : null;
      canvas.width = r.width * escala; canvas.height = r.height * escala;
      ctx.setTransform(escala, 0, 0, escala, 0, 0);
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
      if (copia) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height); img.src = copia; }
    };
    ajustar();
    window.addEventListener('resize', ajustar);
    const ponto = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.addEventListener('pointerdown', (e) => { desenhando = true; ultimo = ponto(e); canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
    canvas.addEventListener('pointermove', (e) => {
      if (!desenhando) return;
      const p = ponto(e);
      ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ultimo = p;
      if (!assinou) { assinou = true; dica.hidden = true; }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => canvas.addEventListener(ev, () => (desenhando = false)));
    return {
      caixa,
      assinou: () => assinou,
      limpar() { ctx.clearRect(0, 0, canvas.width, canvas.height); assinou = false; dica.hidden = false; },
      // PNG reduzido (fundo branco) para ficar leve
      png() {
        const r = canvas.getBoundingClientRect();
        const tmp = document.createElement('canvas');
        tmp.width = Math.min(600, Math.round(r.width)); tmp.height = Math.round(tmp.width * r.height / r.width);
        const t = tmp.getContext('2d'); t.fillStyle = '#fff'; t.fillRect(0, 0, tmp.width, tmp.height); t.drawImage(canvas, 0, 0, tmp.width, tmp.height);
        return tmp.toDataURL('image/png');
      },
    };
  }
  const assCliente = quadroAssinatura($('#ass-cliente'));
  const assTecnico = quadroAssinatura($('#ass-tecnico'));
  $$('[data-limpar]', form).forEach((b) => b.addEventListener('click', () => (b.dataset.limpar === 'ass-cliente' ? assCliente : assTecnico).limpar()));

  const ler = () => {
    const fd = new FormData(form);
    const dados = {};
    ['outrasPragas', 'areaInterna', 'areaExterna', 'encontradas', 'dataExecucao', 'horaInicio', 'horaFim', 'observacoes', 'assinaturaNome', 'tecnicoNome',
      'grauInterno', 'grauExterno', 'mapeamentoIscas'].forEach((k) => { const val = fd.get(k); if (val) dados[k] = String(val).trim(); });
    ['pragas', 'equipamentos', 'epi'].forEach((k) => (dados[k] = fd.getAll(k)));
    dados.produtos = $$('.produto', form).filter((b) => $('.usa-produto', b).checked).map((b) => {
      const p = (info.produtos || []).find((y) => y.id === b.dataset.produto) || {};
      return { id: b.dataset.produto, nome: p.nome, diluente: p.diluente,
        quantidade: $('[name=quantidade]', b).value.trim(), local: $('[name=local]', b).value.trim(), lote: $('[name=lote]', b).value.trim() };
    });
    return dados;
  };
  // Guarda o rascunho a cada alteração.
  form.addEventListener('input', () => { try { localStorage.setItem(chaveRascunho, JSON.stringify(ler())); } catch { /* sem armazenamento */ } });
  form.addEventListener('change', () => { try { localStorage.setItem(chaveRascunho, JSON.stringify(ler())); } catch { /* sem armazenamento */ } });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = ler();
    const semQtd = dados.produtos.find((p) => !p.quantidade);
    if (semQtd) { avisar(`Digite a quantidade aplicada de ${semQtd.nome}.`, true); return; }
    if (!dados.assinaturaNome) { avisar('Digite o nome de quem está assinando.', true); form.assinaturaNome.focus(); return; }
    if (!assCliente.assinou()) { avisar('Falta a assinatura do cliente.', true); assCliente.caixa.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (!dados.tecnicoNome) { avisar('Digite o nome do técnico.', true); form.tecnicoNome.focus(); return; }
    if (!assTecnico.assinou()) { avisar('Falta a assinatura do técnico.', true); assTecnico.caixa.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (!dados.produtos.length && !confirm('Nenhum produto foi marcado. Enviar mesmo assim?')) return;
    dados.assinatura = assCliente.png();
    dados.assinaturaTecnico = assTecnico.png();
    dados.enviadoPor = 'link do técnico';
    if (!dados.horaFim) dados.horaFim = agora();
    const botao = $('#enviar');
    botao.disabled = true; botao.textContent = 'Enviando...';
    try {
      const { data: resultado, error } = await sb.rpc('os_enviar', { p_token: token, p_execucao: dados });
      if (error) throw error;
      if (resultado !== 'ok') {
        throw new Error({
          invalido: 'Este link não vale mais. Peça ao escritório o link atualizado.',
          ja_enviado: 'Esta ordem já foi enviada. Peça ao escritório para liberar uma correção.',
        }[resultado] || 'Não foi possível gravar (dados inválidos ou assinatura muito grande).');
      }
      try { localStorage.removeItem(chaveRascunho); } catch { /* sem armazenamento */ }
      el.innerHTML = cabecalho + `<div class="cartao os-msg"><h2>Enviado com sucesso</h2>
        <p>A execução e a assinatura de ${esc(dados.assinaturaNome)} foram registradas no sistema.</p>
        <p class="ajuda">Pode fechar esta página.</p></div>`;
      window.scrollTo(0, 0);
    } catch (err) {
      const m = (err && err.message) || String(err);
      avisar(/Failed to fetch|NetworkError/i.test(m) ? 'Sem internet. O preenchimento ficou salvo neste aparelho; tente enviar de novo.' : m, true);
      botao.disabled = false; botao.textContent = 'Enviar e finalizar';
    }
  });
})();
