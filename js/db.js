// Armazenamento local dos dados (localStorage do navegador).
// Toda a base fica em um único objeto JSON, o que facilita backup e restauração.
const DB = (() => {
  const KEY = 'berbert-db-v1';
  const COLECOES = ['clientes', 'agendamentos', 'orcamentos', 'laudos', 'financeiro'];

  function vazio() {
    const base = { config: { seqOrcamento: 0, seqLaudo: 0 } };
    COLECOES.forEach((c) => (base[c] = []));
    return base;
  }

  let dados = carregar();

  function carregar() {
    try {
      const bruto = localStorage.getItem(KEY);
      if (!bruto) return vazio();
      const obj = JSON.parse(bruto);
      const base = vazio();
      COLECOES.forEach((c) => (base[c] = Array.isArray(obj[c]) ? obj[c] : []));
      base.config = { ...base.config, ...(obj.config || {}) };
      return base;
    } catch (e) {
      console.error('Falha ao carregar dados', e);
      return vazio();
    }
  }

  function salvar() {
    localStorage.setItem(KEY, JSON.stringify(dados));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return {
    listar: (col) => dados[col].slice(),
    obter: (col, id) => dados[col].find((x) => x.id === id) || null,
    salvarItem(col, item) {
      if (!item.id) {
        item.id = uid();
        item.criadoEm = new Date().toISOString();
        dados[col].push(item);
      } else {
        const i = dados[col].findIndex((x) => x.id === item.id);
        if (i >= 0) dados[col][i] = { ...dados[col][i], ...item };
        else dados[col].push(item);
      }
      salvar();
      return item;
    },
    remover(col, id) {
      dados[col] = dados[col].filter((x) => x.id !== id);
      salvar();
    },
    config: () => ({ ...dados.config }),
    salvarConfig(cfg) {
      dados.config = { ...dados.config, ...cfg };
      salvar();
    },
    proximoNumero(chave) {
      dados.config[chave] = (dados.config[chave] || 0) + 1;
      salvar();
      return dados.config[chave];
    },
    exportar: () => JSON.stringify(dados, null, 2),
    importar(texto) {
      const obj = JSON.parse(texto);
      if (!obj || typeof obj !== 'object' || !Array.isArray(obj.clientes)) {
        throw new Error('Arquivo de backup inválido');
      }
      localStorage.setItem(KEY, JSON.stringify(obj));
      dados = carregar();
      salvar();
    },
  };
})();
