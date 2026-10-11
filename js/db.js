// Camada de dados: login dos funcionários e armazenamento no Supabase.
// Os registros que o funcionário pode ver ficam em memória para as telas
// serem rápidas; toda alteração é gravada no banco em seguida, em ordem.
const DB = (() => {
  const COLECOES = ['clientes', 'agendamentos', 'orcamentos', 'laudos', 'financeiro'];
  // Módulo exigido para ler cada coleção (clientes: qualquer funcionário ativo).
  const MODULO = { clientes: null, agendamentos: 'agenda', orcamentos: 'orcamentos', laudos: 'laudos', financeiro: 'financeiro' };
  const MODULOS = [
    ['clientes', 'Clientes'],
    ['agenda', 'Agenda'],
    ['orcamentos', 'Orçamentos'],
    ['laudos', 'Laudos'],
    ['financeiro', 'Financeiro'],
  ];

  let sb = null;
  let perfil = null;
  let usuario = null;
  let dados = vazio();
  let config = {};
  let fila = Promise.resolve();
  let aoErro = (msg) => alert(msg);
  let ultimaCarga = 0;

  function vazio() {
    const base = {};
    COLECOES.forEach((c) => (base[c] = []));
    return base;
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function configurado() {
    const c = window.BERBERT_CONFIG || {};
    return Boolean(c.supabaseUrl && c.supabaseAnonKey);
  }
  function traduzirErro(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(m)) return 'E-mail ainda não confirmado. Desative a confirmação de e-mail no Supabase (veja o README).';
    if (/already registered|already been registered/i.test(m)) return 'Já existe um login com este e-mail.';
    if (/Password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (/row-level security|permission denied|Sem permissão/i.test(m)) return 'Você não tem permissão para esta ação.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com a internet.';
    return m;
  }
  function pode(modulo) {
    if (!perfil || !perfil.ativo) return false;
    return perfil.admin || (perfil.permissoes || []).includes(modulo);
  }
  function podeLer(col) {
    return MODULO[col] === null ? Boolean(perfil && perfil.ativo) : pode(MODULO[col]);
  }
  // Grava no banco em sequência, para que as alterações cheguem na ordem certa.
  function enfileirar(acao) {
    const p = fila.then(acao).then(({ error }) => {
      if (error) throw error;
    });
    fila = p.catch((e) => {
      aoErro('Não foi possível salvar no banco: ' + traduzirErro(e));
      carregar().catch(() => {});
    });
    return p;
  }

  async function carregarPerfil() {
    const { data: s } = await sb.auth.getSession();
    if (!s.session) { perfil = null; usuario = null; return null; }
    usuario = s.session.user;
    const { data, error } = await sb.from('perfis').select('*').eq('id', s.session.user.id).maybeSingle();
    if (error) throw error;
    perfil = data;
    return perfil;
  }

  async function carregar() {
    const novos = vazio();
    await Promise.all(COLECOES.filter(podeLer).map(async (col) => {
      const linhas = [];
      // O Supabase devolve no máximo 1000 linhas por consulta; busca em páginas.
      for (let de = 0; ; de += 1000) {
        const { data, error } = await sb.from(col).select('id, dados').range(de, de + 999);
        if (error) throw error;
        linhas.push(...data);
        if (data.length < 1000) break;
      }
      novos[col] = linhas.map((l) => ({ ...l.dados, id: l.id }));
    }));
    const { data: cfg, error } = await sb.from('config').select('valor').eq('chave', 'empresa').maybeSingle();
    if (error) throw error;
    dados = novos;
    config = (cfg && cfg.valor) || {};
    ultimaCarga = Date.now();
  }

  return {
    MODULOS,
    configurado,
    traduzirErro,
    pode,
    definirAoErro: (fn) => (aoErro = fn),
    perfil: () => perfil,
    usuario: () => usuario,

    /* ---------- Sessão ---------- */
    async iniciar() {
      const c = window.BERBERT_CONFIG;
      sb = supabase.createClient(c.supabaseUrl, c.supabaseAnonKey);
      return carregarPerfil();
    },
    async entrar(email, senha) {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw new Error(traduzirErro(error));
      return carregarPerfil();
    },
    async sair() {
      await sb.auth.signOut();
      perfil = null;
      usuario = null;
      dados = vazio();
      config = {};
    },
    async alterarMinhaSenha(senha) {
      const { error } = await sb.auth.updateUser({ password: senha });
      if (error) throw new Error(traduzirErro(error));
    },
    carregar,
    carregadoHa: () => Date.now() - ultimaCarga,

    /* ---------- Registros ---------- */
    listar: (col) => dados[col].slice(),
    obter: (col, id) => dados[col].find((x) => x.id === id) || null,
    salvarItem(col, item) {
      let final;
      if (!item.id) {
        final = { ...item, id: uid(), criadoEm: new Date().toISOString() };
        dados[col].push(final);
      } else {
        const i = dados[col].findIndex((x) => x.id === item.id);
        final = i >= 0 ? { ...dados[col][i], ...item } : item;
        if (i >= 0) dados[col][i] = final; else dados[col].push(final);
      }
      const { id, ...resto } = final;
      enfileirar(() => sb.from(col).upsert({ id, dados: resto, atualizado_em: new Date().toISOString() }));
      return final;
    },
    remover(col, id) {
      dados[col] = dados[col].filter((x) => x.id !== id);
      enfileirar(() => sb.from(col).delete().eq('id', id));
    },
    async proximoNumero(tipo) {
      const { data, error } = await sb.rpc('proximo_numero', { tipo });
      if (error) throw new Error(traduzirErro(error));
      return Number(data);
    },

    /* ---------- Configurações da empresa ---------- */
    config: () => ({ ...config }),
    async salvarConfig(cfg) {
      const novo = { ...config, ...cfg };
      const { error } = await sb.from('config').upsert({ chave: 'empresa', valor: novo });
      if (error) throw new Error(traduzirErro(error));
      config = novo;
    },

    /* ---------- Funcionários (somente administrador) ---------- */
    async listarFuncionarios() {
      const { data, error } = await sb.from('perfis').select('*').order('nome');
      if (error) throw new Error(traduzirErro(error));
      return data;
    },
    async criarFuncionario({ nome, email, senha, admin, permissoes }) {
      // Cliente separado, sem guardar sessão, para não desconectar o administrador.
      const c = window.BERBERT_CONFIG;
      const temp = supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'berbert-temp' },
      });
      const { data, error } = await temp.auth.signUp({ email, password: senha, options: { data: { nome } } });
      if (error) throw new Error(traduzirErro(error));
      if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
        throw new Error('Já existe um login com este e-mail.');
      }
      await this.atualizarFuncionario(data.user.id, { nome, admin, permissoes, ativo: true });
    },
    async atualizarFuncionario(id, campos) {
      const { error } = await sb.from('perfis').update(campos).eq('id', id);
      if (error) throw new Error(traduzirErro(error));
      if (perfil && id === perfil.id) await carregarPerfil();
    },
    async enviarRedefinicaoSenha(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
      if (error) throw new Error(traduzirErro(error));
    },

    /* ---------- Backup ---------- */
    exportar() {
      return JSON.stringify({ ...dados, config, exportadoEm: new Date().toISOString() }, null, 2);
    },
    async importar(texto) {
      const obj = JSON.parse(texto);
      if (!obj || typeof obj !== 'object' || !Array.isArray(obj.clientes)) {
        throw new Error('Arquivo de backup inválido');
      }
      for (const col of COLECOES) {
        const linhas = (obj[col] || []).filter((x) => x && x.id).map(({ id, ...resto }) => ({ id: String(id), dados: resto }));
        for (let i = 0; i < linhas.length; i += 500) {
          const { error } = await sb.from(col).upsert(linhas.slice(i, i + 500));
          if (error) throw new Error(traduzirErro(error));
        }
      }
      const { seqOrcamento, seqLaudo, ...empresa } = obj.config || {};
      if (Object.keys(empresa).length) await this.salvarConfig(empresa);
      const maior = (col) => Math.max(0, ...(obj[col] || []).map((x) => Number(x.numero) || 0));
      const { error } = await sb.rpc('ajustar_numeracao', {
        orcamento: Math.max(Number(seqOrcamento) || 0, maior('orcamentos')),
        laudo: Math.max(Number(seqLaudo) || 0, maior('laudos')),
      });
      if (error) throw new Error(traduzirErro(error));
      await carregar();
    },
  };
})();
