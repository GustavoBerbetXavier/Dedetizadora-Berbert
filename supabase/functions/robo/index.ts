// Robô de atendimento da Berbert para WhatsApp e Instagram (Supabase Edge Function "robo").
//
// - A Meta chama esta função a cada mensagem recebida (webhook). O robô grava a mensagem,
//   segue o roteiro (menu, agendamento, orçamento, chamar atendente) e responde pela API oficial.
// - A tela "Conversas" do sistema chama esta mesma função para um funcionário responder
//   (assim as chaves da Meta ficam só aqui, nos "Secrets" do Supabase, e nunca no navegador).
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   META_VERIFY_TOKEN     uma senha qualquer, a mesma digitada no painel da Meta ao cadastrar o webhook
//   META_APP_SECRET       "Chave secreta do app" (Configurações do app -> Básico) - confere que quem chamou é a Meta
//   WHATSAPP_TOKEN        token de acesso permanente (usuário do sistema) com permissão whatsapp_business_messaging
//   WHATSAPP_PHONE_ID     "Identificação do número de telefone" (WhatsApp -> Configuração da API)
//   INSTAGRAM_TOKEN       token de acesso da conta do Instagram (Instagram -> Configuração da API com login do Instagram)
//   INSTAGRAM_APP_SECRET  "Chave secreta do app do Instagram" (se for diferente da META_APP_SECRET)
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já vêm preenchidos pelo Supabase.
//
// Ao publicar, DESATIVE a verificação de JWT ("Verify JWT"): a Meta não manda login do Supabase.
// A função confere sozinha a assinatura da Meta e o login de quem usa a tela Conversas.

declare const Deno: any;

function env(k: string): string {
  if (typeof Deno !== 'undefined') return Deno.env.get(k) || '';
  return (globalThis as any).process?.env?.[k] || '';
}

const VERSAO_API = () => env('META_API_VERSION') || 'v23.0';
const URL_WHATSAPP = () => `https://graph.facebook.com/${VERSAO_API()}/${env('WHATSAPP_PHONE_ID')}/messages`;
const URL_INSTAGRAM = () => env('INSTAGRAM_API_URL') || `https://graph.instagram.com/${VERSAO_API()}/me/messages`;
const FUSO = 'America/Sao_Paulo';
const HORA = 3600 * 1000;

/* ---------- Configuração do robô (editável no sistema: Configurações -> Robô) ---------- */
export const PADRAO = {
  ativo: true,
  empresa: 'Dedetizadora Berbert',
  boasVindas: 'Olá, {nome}! Aqui é da {empresa}. Como podemos ajudar?',
  servicos: ['Dedetização', 'Desratização', 'Descupinização', 'Controle de escorpiões', "Limpeza de caixa d'água", 'Outro serviço'],
  dias: [1, 2, 3, 4, 5, 6], // dias da semana com atendimento (0 = domingo)
  antecedencia: 1,          // primeiro dia oferecido: 1 = amanhã
  diasOferecidos: 6,
  limitePeriodo: 3,         // agendamentos por período (manhã ou tarde) em cada dia
  horaManha: '08:00',
  horaTarde: '13:30',
  msgAtendente: 'Certo! Já avisei a nossa equipe. Logo alguém responde você por aqui.',
  msgOrcamento: 'Para o orçamento, conte para a gente o que você precisa: qual praga ou serviço, o tipo de imóvel (casa, apartamento, comércio...) e o bairro.',
};
type Config = typeof PADRAO;

export function montarConfig(robo: any = {}, empresa: any = {}): Config {
  const c: any = { ...PADRAO };
  for (const [k, v] of Object.entries(robo || {})) if (v !== '' && v !== null && v !== undefined) c[k] = v;
  if (typeof c.servicos === 'string') c.servicos = c.servicos.split('\n');
  c.servicos = c.servicos.map((s: string) => String(s).trim()).filter(Boolean).slice(0, 10);
  if (!c.servicos.length) c.servicos = PADRAO.servicos;
  c.dias = (Array.isArray(c.dias) ? c.dias : PADRAO.dias).map(Number).filter((d: number) => d >= 0 && d <= 6);
  for (const k of ['antecedencia', 'diasOferecidos', 'limitePeriodo']) c[k] = Math.max(0, parseInt(c[k], 10) || 0);
  c.diasOferecidos = Math.min(Math.max(c.diasOferecidos, 1), 9);
  c.ativo = c.ativo !== false && c.ativo !== 'false';
  c.empresa = (empresa && empresa.empresa) || PADRAO.empresa;
  return c;
}

/* ---------- Utilitários ---------- */
export const normalizar = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9/]+/g, ' ').trim();
const digitos = (s: any) => String(s ?? '').replace(/\D/g, '');
const corta = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const preencher = (modelo: string, campos: Record<string, string>) =>
  modelo.replace(/\{(\w+)\}/g, (_, k) => campos[k] ?? '').replace(/,\s*([!?.])/g, '$1').replace(/\s{2,}/g, ' ').trim();
const primeiroNome = (n: string) => (String(n || '').trim().split(/\s+/)[0] || '').replace(/[^\p{L}'-]/gu, '');

export function hojeLocal(agora = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(agora));
}
export function somarDias(iso: string, n: number) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}
const diaSemana = (iso: string) => { const [a, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); };
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const SEMANA_LONGA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const rotuloDia = (iso: string) => `${SEMANA[diaSemana(iso)]}, ${diaMes(iso)}`;
const rotuloDiaLongo = (iso: string) => `${SEMANA_LONGA[diaSemana(iso)]}, ${diaMes(iso)}`;
const PERIODOS: Record<string, string> = { manha: 'Manhã', tarde: 'Tarde' };

// Número do WhatsApp (5544999990000) -> { ddd: '44', final: '99990000' } e "(44) 99999-0000"
function partesTelefone(numero: string) {
  let n = digitos(numero);
  if ((n.length === 12 || n.length === 13) && n.startsWith('55')) n = n.slice(2);
  if (n.length !== 10 && n.length !== 11) return null;
  return { ddd: n.slice(0, 2), local: n.slice(2), final: n.slice(-8) };
}
export function formatarTelefone(numero: string) {
  const p = partesTelefone(numero);
  if (!p) return String(numero || '');
  const local = p.local.length === 8 && /^[6-9]/.test(p.local) ? '9' + p.local : p.local; // celular sem o 9
  return `(${p.ddd}) ${local.slice(0, -4)}-${local.slice(-4)}`;
}

/* ---------- Roteiro do robô ---------- */
type Opcao = { id: string; titulo: string; palavras?: RegExp };
type Resposta = { texto: string; opcoes?: Opcao[] };
export type Entrada = { canal: string; contato: string; nome?: string; texto: string; opcaoId?: string; externoId?: string; endereco?: string };

const OP_MENU: Opcao[] = [
  { id: 'agendar', titulo: 'Agendar serviço', palavras: /agend|marcar|visita|horario/ },
  { id: 'orcamento', titulo: 'Pedir orçamento', palavras: /orcamento|preco|valor|quanto|custa/ },
  { id: 'atendente', titulo: 'Falar com atendente', palavras: /atendente|humano|pessoa|falar/ },
];
const OP_CONFIRMAR: Opcao[] = [
  { id: 'confirmar', titulo: 'Confirmar', palavras: /^(sim|s|ok|isso|pode|confirm|certo|correto)/ },
  { id: 'corrigir', titulo: 'Corrigir', palavras: /corrig|errad|mudar|alterar|trocar/ },
  { id: 'cancelar', titulo: 'Cancelar', palavras: /cancel|desist|nao quero/ },
];
const OP_ENDERECO: Opcao[] = [
  { id: 'sim', titulo: 'Sim, esse endereço', palavras: /^(sim|s|isso|esse|mesmo|pode|ok)/ },
  { id: 'outro', titulo: 'Outro endereço', palavras: /outro|nao|diferente/ },
];
// Palavras que o cliente costuma escrever no lugar do nome do serviço (ex.: "barata" -> Dedetização).
const PRAGAS: [RegExp, string][] = [
  [/barata|formiga|pulga|percevejo|mosquito|aranha|traca|carrapato|inseto/, 'dedetiz'],
  [/rato|ratazana|camundongo|roedor/, 'desratiz'],
  [/cupim/, 'cupin'],
  [/escorpi/, 'escorpi'],
  [/caixa|cisterna|reservatorio/, 'caixa'],
];
function palavrasServico(titulo: string) {
  const n = normalizar(titulo);
  const achadas = PRAGAS.filter(([, chave]) => n.includes(chave)).map(([re]) => re.source);
  return achadas.length ? new RegExp(achadas.join('|')) : undefined;
}
const COMANDO_MENU = /^(menu|inicio|voltar|recomecar|0)$/;
const COMANDO_ATENDENTE = /^(falar com )?(um |uma )?(atendente|humano|pessoa)$/;
const AGRADECIMENTO = /obrigad|valeu|^ok\b|^blz|beleza|^show|perfeito|^certo|combinado|^top\b|^otimo/;

export function escolher(entrada: { texto?: string; opcaoId?: string }, opcoes: Opcao[]): Opcao | null {
  if (entrada.opcaoId) {
    const o = opcoes.find((x) => x.id === entrada.opcaoId);
    if (o) return o;
  }
  const t = normalizar(entrada.texto);
  if (!t) return null;
  const n = t.match(/^(\d{1,2})$/);
  if (n) return opcoes[Number(n[1]) - 1] || null;
  return opcoes.find((o) => normalizar(o.titulo) === t)
    || (t.length >= 3 ? opcoes.find((o) => normalizar(o.titulo).includes(t)) : undefined)
    || opcoes.find((o) => o.palavras && o.palavras.test(t))
    || null;
}

export type Contexto = {
  cfg: Config;
  agora: number;
  // [{ data: '2026-10-27', periodos: ['manha', 'tarde'] }] - só dias com vaga
  diasLivres: () => Promise<{ data: string; periodos: string[] }[]>;
  cliente: (id: string) => Promise<any>;
  agendar: (conversa: any, dados: any) => Promise<{ agendamentoId: string; clienteId: string }>;
};

export function enderecoCliente(c: any) {
  return [c.endereco, c.bairro, c.cidade].map((x) => String(x || '').trim()).filter(Boolean).join(', ');
}

// Recebe a conversa e a mensagem do cliente; devolve o novo estado e as respostas do robô.
export async function roteiro(conv: any, entrada: Entrada, ctx: Contexto) {
  const { cfg } = ctx;
  const r = {
    estado: conv.estado || 'inicio',
    dados: { ...(conv.dados || {}) } as any,
    atendimento: conv.atendimento === 'encerrada' ? 'robo' : (conv.atendimento || 'robo'),
    cliente_id: conv.cliente_id || null,
    respostas: [] as Resposta[],
  };
  const diz = (texto: string, opcoes?: Opcao[]) => { r.respostas.push(opcoes ? { texto, opcoes } : { texto }); };
  const t = normalizar(entrada.texto);
  const d = r.dados;

  // Troca as respostas guardadas (sem trocar o objeto: "d" continua apontando para ele).
  const limpar = (manter: any = {}) => { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, manter); };
  const menu = (texto?: string) => {
    r.estado = 'menu';
    limpar();
    diz(texto || preencher(cfg.boasVindas, { nome: primeiroNome(conv.nome), empresa: cfg.empresa }), OP_MENU);
  };
  const chamarAtendente = (texto = cfg.msgAtendente) => {
    r.atendimento = 'humano';
    r.estado = 'inicio';
    diz(texto);
  };
  // Resposta que não serve para a pergunta: repete a pergunta; na terceira vez, chama alguém da equipe.
  const naoEntendi = (pergunta: string, opcoes?: Opcao[]) => {
    d.erros = (d.erros || 0) + 1;
    if (d.erros >= 3) return chamarAtendente('Vou chamar alguém da nossa equipe para te ajudar. Só um instante!');
    diz((opcoes ? 'Não entendi 🙂 Toque numa das opções ou responda com o número.\n\n' : '') + pergunta, opcoes);
  };
  const servicos = (): Opcao[] => cfg.servicos.map((s, i) => ({ id: 's' + (i + 1), titulo: s, palavras: palavrasServico(s) }));

  // Pergunta o próximo dado que falta para o agendamento.
  const avancar = async (): Promise<void> => {
    d.erros = 0;
    const cli = r.cliente_id ? await ctx.cliente(r.cliente_id) : null;
    if (!d.servico) { r.estado = 'servico'; return diz('Qual serviço você precisa?', servicos()); }
    if (!cli && !d.nome) { r.estado = 'nome'; return diz('Qual é o seu nome completo?'); }
    if (!cli && conv.canal !== 'whatsapp' && !d.telefone) { r.estado = 'telefone'; return diz('Qual é o seu telefone (de preferência WhatsApp) com DDD?'); }
    if (!d.endereco) {
      const end = cli ? enderecoCliente(cli) : '';
      if (end && !d.outroEndereco) { r.estado = 'endereco_cadastro'; return diz(`O serviço é neste endereço?\n${end}`, OP_ENDERECO); }
      r.estado = 'endereco';
      return diz('Qual é o endereço do serviço? (rua, número, bairro e cidade)');
    }
    if (!d.data) {
      const dias = await ctx.diasLivres();
      if (!dias.length) return chamarAtendente('A agenda dos próximos dias está cheia. Já avisei a nossa equipe para encontrar um horário para você!');
      r.estado = 'dia';
      return diz('Qual dia fica melhor para você?', dias.map((x) => ({ id: 'd:' + x.data, titulo: rotuloDia(x.data) })));
    }
    if (!d.periodo) {
      const dia = (await ctx.diasLivres()).find((x) => x.data === d.data);
      if (!dia) { delete d.data; diz('Esse dia acabou de lotar. Escolha outro, por favor:'); return avancar(); }
      r.estado = 'periodo';
      return diz(`${rotuloDia(d.data)}: qual período?`, dia.periodos.map((p) => ({ id: p, titulo: PERIODOS[p] })));
    }
    r.estado = 'confirmar';
    diz(`Confira o agendamento:\n\n• Serviço: ${d.servico}\n• Dia: ${rotuloDiaLongo(d.data)}, período da ${PERIODOS[d.periodo].toLowerCase()}\n• Endereço: ${d.endereco}`
      + (cli ? '' : `\n• Nome: ${d.nome}`) + (d.telefone ? `\n• Telefone: ${d.telefone}` : '') + '\n\nEstá tudo certo?', OP_CONFIRMAR);
  };

  const parada = conv.ultima_do_cliente_em && ctx.agora - Date.parse(conv.ultima_do_cliente_em) > 12 * HORA;
  if (COMANDO_ATENDENTE.test(t)) { chamarAtendente(); return r; }
  if (COMANDO_MENU.test(t) || conv.atendimento === 'encerrada' || (parada && r.estado !== 'concluido')) r.estado = 'inicio';

  switch (r.estado) {
    case 'inicio':
      // Toque num botão de uma mensagem antiga do menu: segue direto. Qualquer outra coisa: mostra o menu.
      if (!entrada.opcaoId || !escolher(entrada, OP_MENU)) { menu(); break; }
      r.estado = 'menu';
    // falls through
    case 'menu': {
      const op = escolher(entrada, OP_MENU);
      if (!op) { naoEntendi('Como podemos ajudar?', OP_MENU); break; }
      limpar();
      if (op.id === 'agendar') await avancar();
      else if (op.id === 'orcamento') { r.estado = 'orcamento'; diz(cfg.msgOrcamento); }
      else chamarAtendente();
      break;
    }
    case 'orcamento':
      limpar({ orcamento: entrada.texto });
      chamarAtendente('Recebemos! Nossa equipe vai preparar o orçamento e responder você por aqui em breve.');
      break;
    case 'servico': {
      const op = escolher(entrada, servicos());
      if (!op) { naoEntendi('Qual serviço você precisa?', servicos()); break; }
      d.servico = op.titulo;
      await avancar();
      break;
    }
    case 'nome': {
      const nome = String(entrada.texto || '').trim().replace(/\s+/g, ' ');
      if (nome.length < 2 || !/\p{L}/u.test(nome) || /^\[.*\]$/.test(nome)) { naoEntendi('Qual é o seu nome completo?'); break; }
      d.nome = corta(nome, 80);
      await avancar();
      break;
    }
    case 'telefone': {
      const tel = partesTelefone(entrada.texto);
      if (!tel) { naoEntendi('Não consegui entender o número. Mande com DDD, por exemplo: (44) 99999-0000'); break; }
      d.telefone = formatarTelefone(entrada.texto);
      await avancar();
      break;
    }
    case 'endereco_cadastro': {
      const op = escolher(entrada, OP_ENDERECO);
      if (!op) { naoEntendi('O serviço é no endereço do cadastro?', OP_ENDERECO); break; }
      if (op.id === 'sim') d.endereco = enderecoCliente(await ctx.cliente(r.cliente_id));
      else d.outroEndereco = true;
      await avancar();
      break;
    }
    case 'endereco': {
      const end = entrada.endereco || String(entrada.texto || '').trim();
      if (end.length < 5 || /^\[.*\]$/.test(end)) { naoEntendi('Qual é o endereço do serviço? (rua, número, bairro e cidade)'); break; }
      d.endereco = corta(end, 200);
      await avancar();
      break;
    }
    case 'dia': {
      const dias = await ctx.diasLivres();
      const opcoes = dias.map((x) => ({ id: 'd:' + x.data, titulo: rotuloDia(x.data) }));
      const op = escolher(entrada, opcoes);
      if (!op) {
        if (!opcoes.length) { chamarAtendente('A agenda dos próximos dias está cheia. Já avisei a nossa equipe para encontrar um horário para você!'); break; }
        naoEntendi('Qual dia fica melhor para você?', opcoes);
        break;
      }
      d.data = op.id.slice(2);
      await avancar();
      break;
    }
    case 'periodo': {
      const dia = (await ctx.diasLivres()).find((x) => x.data === d.data);
      if (!dia) { await avancar(); break; } // o dia lotou: avancar() avisa e oferece outros
      const opcoes = dia.periodos.map((p) => ({ id: p, titulo: PERIODOS[p], palavras: p === 'manha' ? /manha|cedo/ : /tarde/ }));
      const op = escolher(entrada, opcoes);
      if (!op) {
        const cheio = /manha|cedo/.test(t) ? 'manhã' : /tarde/.test(t) ? 'tarde' : '';
        if (cheio) { diz(`A ${cheio} desse dia já está cheia.`); await avancar(); break; }
        naoEntendi('Qual período?', opcoes);
        break;
      }
      d.periodo = op.id;
      await avancar();
      break;
    }
    case 'confirmar': {
      const op = escolher(entrada, OP_CONFIRMAR);
      if (!op) { naoEntendi('Está tudo certo?', OP_CONFIRMAR); break; }
      if (op.id === 'cancelar') { r.estado = 'inicio'; limpar(); diz('Tudo bem! Quando precisar, é só chamar. 😊'); break; }
      if (op.id === 'corrigir') {
        limpar({ nome: d.nome, telefone: d.telefone });
        diz('Sem problemas, vamos de novo.');
        await avancar();
        break;
      }
      const feito = await ctx.agendar(conv, d);
      r.cliente_id = feito.clienteId;
      r.estado = 'concluido';
      limpar({ agendamentoId: feito.agendamentoId, servico: d.servico, data: d.data, periodo: d.periodo });
      diz(`Pronto! ✅ Agendamos ${d.servico} para ${rotuloDiaLongo(d.data)}, no período da ${PERIODOS[d.periodo].toLowerCase()}.\n\nNossa equipe confirma o horário certinho por aqui. Obrigado!`);
      break;
    }
    case 'concluido':
      if (AGRADECIMENTO.test(t)) { diz('Nós que agradecemos! Até breve. 😊'); break; }
      menu(d.data && d.data >= hojeLocal(ctx.agora)
        ? `Seu agendamento (${d.servico}) está marcado para ${rotuloDiaLongo(d.data)}, período da ${PERIODOS[d.periodo]?.toLowerCase()}. Posso ajudar em mais alguma coisa?`
        : undefined);
      break;
    default:
      menu();
  }
  return r;
}

/* ---------- Mensagens recebidas da Meta (webhook) ---------- */
const TIPOS: Record<string, string> = {
  audio: 'áudio', image: 'imagem', video: 'vídeo', document: 'documento', sticker: 'figurinha',
  location: 'localização', contacts: 'contato', reaction: 'reação', file: 'arquivo', share: 'compartilhamento',
};

export function extrairEntradas(corpo: any): Entrada[] {
  const saida: Entrada[] = [];
  const telefoneId = env('WHATSAPP_PHONE_ID');
  for (const entry of corpo?.entry || []) {
    if (corpo.object === 'whatsapp_business_account') {
      for (const ch of entry.changes || []) {
        const v = ch.value || {};
        if (ch.field !== 'messages' || !v.messages) continue;
        if (telefoneId && v.metadata?.phone_number_id && v.metadata.phone_number_id !== telefoneId) continue;
        const nomes = Object.fromEntries((v.contacts || []).map((c: any) => [c.wa_id, c.profile?.name || '']));
        for (const m of v.messages) {
          const e: Entrada = { canal: 'whatsapp', contato: String(m.from), nome: nomes[m.from] || '', texto: '', externoId: m.id };
          if (m.type === 'text') e.texto = m.text?.body || '';
          else if (m.type === 'interactive') {
            const resp = m.interactive?.button_reply || m.interactive?.list_reply || {};
            e.texto = resp.title || ''; e.opcaoId = resp.id;
          } else if (m.type === 'button') { e.texto = m.button?.text || ''; e.opcaoId = m.button?.payload; }
          else if (m.type === 'location') {
            const l = m.location || {};
            e.endereco = [l.name, l.address].filter(Boolean).join(' - ') || `https://maps.google.com/?q=${l.latitude},${l.longitude}`;
            e.texto = `[localização] ${e.endereco}`;
          } else if (m.type === 'reaction') continue;
          else e.texto = `[${TIPOS[m.type] || m.type}]` + (m[m.type]?.caption ? ' ' + m[m.type].caption : '');
          saida.push(e);
        }
      }
    } else if (corpo.object === 'instagram') {
      for (const ev of entry.messaging || []) {
        const m = ev.message;
        if (!m || m.is_echo || m.is_deleted || !ev.sender?.id || ev.sender.id === entry.id) continue;
        const e: Entrada = { canal: 'instagram', contato: String(ev.sender.id), texto: m.text || '', externoId: m.mid };
        if (m.quick_reply?.payload) e.opcaoId = m.quick_reply.payload;
        if (!e.texto && m.attachments?.length) e.texto = `[${TIPOS[m.attachments[0].type] || m.attachments[0].type}]`;
        saida.push(e);
      }
    }
  }
  return saida;
}

async function hmacHex(segredo: string, texto: string) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(assinatura)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function assinaturaValida(bruto: string, cabecalho: string | null) {
  const recebida = String(cabecalho || '').replace(/^sha256=/, '');
  if (!recebida) return false;
  for (const segredo of [env('META_APP_SECRET'), env('INSTAGRAM_APP_SECRET')].filter(Boolean)) {
    const esperada = await hmacHex(segredo, bruto);
    let dif = esperada.length ^ recebida.length;
    for (let i = 0; i < esperada.length; i++) dif |= esperada.charCodeAt(i) ^ (recebida.charCodeAt(i) || 0);
    if (dif === 0) return true;
  }
  return false;
}

/* ---------- Envio pela API oficial da Meta ---------- */
export function textoComOpcoes(resp: Resposta) {
  return resp.opcoes?.length ? `${resp.texto}\n\n[ ${resp.opcoes.map((o) => o.titulo).join(' | ')} ]` : resp.texto;
}
export function corpoWhatsApp(para: string, resp: Resposta) {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: para };
  const ops = resp.opcoes || [];
  if (!ops.length) return { ...base, type: 'text', text: { body: corta(resp.texto, 4096), preview_url: false } };
  const body = { text: corta(resp.texto, 1024) };
  if (ops.length <= 3) {
    return { ...base, type: 'interactive', interactive: { type: 'button', body,
      action: { buttons: ops.map((o) => ({ type: 'reply', reply: { id: o.id, title: corta(o.titulo, 20) } })) } } };
  }
  return { ...base, type: 'interactive', interactive: { type: 'list', body,
    action: { button: 'Ver opções', sections: [{ title: 'Opções', rows: ops.slice(0, 10).map((o) => ({ id: o.id, title: corta(o.titulo, 24) })) }] } } };
}
export function corpoInstagram(para: string, resp: Resposta) {
  const ops = (resp.opcoes || []).slice(0, 13);
  // O botão do Instagram mostra só 20 letras: se alguma opção for maior, lista as opções no texto também.
  const lista = ops.some((o) => o.titulo.length > 20) ? '\n\n' + ops.map((o, i) => `${i + 1}. ${o.titulo}`).join('\n') : '';
  const message: any = { text: corta(resp.texto + lista, 1000) };
  if (ops.length) message.quick_replies = ops.map((o) => ({ content_type: 'text', title: corta(o.titulo, 20), payload: o.id }));
  return { recipient: { id: para }, message };
}

async function postarMeta(url: string, token: string, corpo: any) {
  if (!token) throw new Error('Token da Meta não configurado nos Secrets do Supabase.');
  const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `A Meta recusou o envio (HTTP ${r.status}).`);
  return j?.messages?.[0]?.id || j?.message_id || null;
}
async function enviarMeta(conv: any, resp: Resposta) {
  if (conv.canal === 'whatsapp') return postarMeta(URL_WHATSAPP(), env('WHATSAPP_TOKEN'), corpoWhatsApp(conv.contato, resp));
  if (conv.canal === 'instagram') return postarMeta(URL_INSTAGRAM(), env('INSTAGRAM_TOKEN'), corpoInstagram(conv.contato, resp));
  throw new Error('Canal desconhecido: ' + conv.canal);
}
async function nomeInstagram(id: string) {
  try {
    const r = await fetch(`https://graph.instagram.com/${VERSAO_API()}/${encodeURIComponent(id)}?fields=name,username`,
      { headers: { Authorization: 'Bearer ' + env('INSTAGRAM_TOKEN') } });
    const j: any = await r.json();
    return j.name || (j.username ? '@' + j.username : '');
  } catch { return ''; }
}

/* ---------- Banco de dados (API do Supabase) ---------- */
const CHAVE_SERVICO = () => env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY');
async function rest(caminho: string, op: { metodo?: string; corpo?: any; prefer?: string; token?: string; chave?: string } = {}) {
  const chave = op.chave || CHAVE_SERVICO();
  const token = op.token || (chave.startsWith('eyJ') ? chave : '');
  const headers: Record<string, string> = { apikey: chave, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (op.prefer) headers.Prefer = op.prefer;
  const r = await fetch(`${env('SUPABASE_URL')}/rest/v1/${caminho}`, {
    method: op.metodo || 'GET', headers, body: op.corpo === undefined ? undefined : JSON.stringify(op.corpo),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Banco (${r.status}): ${txt}`);
  return txt ? JSON.parse(txt) : null;
}
const eq = (v: string) => 'eq.' + encodeURIComponent(v);

const Banco = {
  async conversa(id: string) {
    return (await rest(`conversas?id=${eq(id)}&select=*`))[0] || null;
  },
  async criarConversa(c: any) {
    await rest('conversas?on_conflict=id', { metodo: 'POST', corpo: c, prefer: 'resolution=ignore-duplicates,return=minimal' });
    return this.conversa(c.id);
  },
  async atualizarConversa(id: string, campos: any) {
    await rest(`conversas?id=${eq(id)}`, { metodo: 'PATCH', corpo: campos, prefer: 'return=minimal' });
  },
  // Devolve a mensagem gravada, ou null se ela já existia (a Meta reenvia quando demora a resposta).
  async gravarMensagem(m: any) {
    const linhas = await rest('mensagens?on_conflict=externo_id', { metodo: 'POST', corpo: m, prefer: 'resolution=ignore-duplicates,return=representation' });
    return linhas[0] || null;
  },
  async config() {
    const linhas = await rest('config?chave=in.(robo,empresa)&select=chave,valor');
    const por = Object.fromEntries(linhas.map((l: any) => [l.chave, l.valor]));
    return montarConfig(por.robo, por.empresa);
  },
  async clientePorTelefone(numero: string) {
    const p = partesTelefone(numero);
    if (!p) return null;
    return (await rest('rpc/robo_cliente_por_telefone', { metodo: 'POST', corpo: { p_ddd: p.ddd, p_final: p.final } })) || null;
  },
  async cliente(id: string) {
    return (await rest(`clientes?id=${eq(id)}&select=dados`))[0]?.dados || null;
  },
  async diasLivres(cfg: Config, agora: number) {
    const hoje = hojeLocal(agora);
    const candidatos: string[] = [];
    for (let i = cfg.antecedencia; candidatos.length < cfg.diasOferecidos * 2 && i < 60; i++) {
      const dia = somarDias(hoje, i);
      if (cfg.dias.includes(diaSemana(dia))) candidatos.push(dia);
    }
    if (!candidatos.length) return [];
    const ags = await rest(`agendamentos?select=dados&${encodeURIComponent('dados->>data')}=in.(${candidatos.join(',')})`);
    const ocupados: Record<string, number> = {};
    for (const { dados: a } of ags) {
      if (a.status === 'cancelado') continue;
      const chave = a.data + ((a.hora || '') < '12:00' ? 'manha' : 'tarde');
      ocupados[chave] = (ocupados[chave] || 0) + 1;
    }
    return candidatos
      .map((data) => ({ data, periodos: ['manha', 'tarde'].filter((p) => (ocupados[data + p] || 0) < cfg.limitePeriodo) }))
      .filter((x) => x.periodos.length)
      .slice(0, cfg.diasOferecidos);
  },
  async agendar(conv: any, d: any, cfg: Config) {
    const agora = new Date().toISOString();
    const canal = conv.canal === 'whatsapp' ? 'WhatsApp' : 'Instagram';
    let clienteId = conv.cliente_id;
    if (!clienteId) {
      clienteId = crypto.randomUUID();
      const codigo = await rest('rpc/robo_proximo_codigo_cliente', { metodo: 'POST', corpo: {} });
      await rest('clientes', { metodo: 'POST', prefer: 'return=minimal', corpo: { id: clienteId, dados: {
        codigo, ativo: true, tipo: 'PF', nome: d.nome || conv.nome || 'Cliente do ' + canal,
        telefone: conv.canal === 'whatsapp' ? formatarTelefone(conv.contato) : (d.telefone || ''),
        endereco: d.endereco || '', obs: `Cadastrado pelo robô do ${canal}.`, origem: 'robo', criadoEm: agora,
      } } });
    }
    const agendamentoId = crypto.randomUUID();
    await rest('agendamentos', { metodo: 'POST', prefer: 'return=minimal', corpo: { id: agendamentoId, dados: {
      clienteId, data: d.data, hora: d.periodo === 'manha' ? cfg.horaManha : cfg.horaTarde, servico: d.servico,
      tecnico: '', valor: 0, status: 'agendado', origem: 'robo', conversaId: conv.id, criadoEm: agora,
      obs: `Pedido pelo ${canal} (robô), período da ${PERIODOS[d.periodo].toLowerCase()}. Confirmar o horário com o cliente.\nEndereço: ${d.endereco}`
        + (d.telefone ? `\nTelefone: ${d.telefone}` : ''),
    } } });
    return { agendamentoId, clienteId };
  },
};

/* ---------- Processamento de uma mensagem recebida ---------- */
const FALHA = 'Desculpe, tive um probleminha aqui. Já chamei alguém da nossa equipe para responder você.';

export async function processar(e: Entrada, banco: any = Banco, enviar = enviarMeta, agora = Date.now()) {
  const id = `${e.canal}:${e.contato}`;
  let conv = await banco.conversa(id);
  if (!conv) {
    const cliente_id = e.canal === 'whatsapp' ? await banco.clientePorTelefone(e.contato).catch(() => null) : null;
    const nome = e.nome || (e.canal === 'instagram' ? await nomeInstagram(e.contato) : '');
    conv = await banco.criarConversa({ id, canal: e.canal, contato: e.contato, nome, cliente_id });
  }
  if (!(await banco.gravarMensagem({ conversa_id: id, direcao: 'entrada', autor: 'cliente', texto: e.texto, externo_id: e.externoId || null }))) return;

  const cfg = await banco.config();
  let r: any = null;
  if (cfg.ativo && conv.atendimento !== 'humano') {
    try {
      r = await roteiro(conv, e, {
        cfg, agora,
        diasLivres: () => banco.diasLivres(cfg, agora),
        cliente: (cid: string) => banco.cliente(cid),
        agendar: (c: any, d: any) => banco.agendar(c, d, cfg),
      });
    } catch (err) {
      console.error('Erro no roteiro', err);
      r = { estado: 'inicio', dados: {}, atendimento: 'humano', cliente_id: conv.cliente_id, respostas: [{ texto: FALHA }] };
    }
  }
  const quando = new Date(agora).toISOString();
  const mudancas: any = { ultima_mensagem: e.texto, ultima_em: quando, ultima_do_cliente_em: quando, nao_lidas: (conv.nao_lidas || 0) + 1 };
  if (e.nome && !conv.nome) mudancas.nome = e.nome;
  if (r) Object.assign(mudancas, { estado: r.estado, dados: r.dados, atendimento: r.atendimento, cliente_id: r.cliente_id });
  await banco.atualizarConversa(id, mudancas);

  for (const resp of r?.respostas || []) {
    let externo = null, erro = null;
    try { externo = await enviar(conv, resp); } catch (err: any) { erro = String(err?.message || err); console.error('Envio', erro); }
    const texto = textoComOpcoes(resp);
    await banco.gravarMensagem({ conversa_id: id, direcao: 'saida', autor: 'robo', texto, externo_id: externo, erro });
    await banco.atualizarConversa(id, { ultima_mensagem: texto, ultima_em: new Date().toISOString() });
  }
}

/* ---------- Pedidos da tela "Conversas" (funcionário logado) ---------- */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (obj: any, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function acaoDoSistema(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const anon = env('SUPABASE_ANON_KEY') || CHAVE_SERVICO();
  const ru = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, { headers: { apikey: anon, Authorization: 'Bearer ' + token } });
  if (!token || !ru.ok) return json({ erro: 'Faça login no sistema.' }, 401);
  const usuario: any = await ru.json();
  const pode = await rest('rpc/tem_acesso', { metodo: 'POST', corpo: { modulo: 'conversas' }, chave: anon, token }).catch(() => false);
  if (pode !== true) return json({ erro: 'Você não tem acesso às Conversas.' }, 403);
  const corpo: any = await req.json().catch(() => ({}));

  if (corpo.acao === 'status') {
    return json({
      whatsapp: Boolean(env('WHATSAPP_TOKEN') && env('WHATSAPP_PHONE_ID')),
      instagram: Boolean(env('INSTAGRAM_TOKEN')),
      assinatura: Boolean(env('META_APP_SECRET') || env('INSTAGRAM_APP_SECRET')),
      verificacao: Boolean(env('META_VERIFY_TOKEN')),
    });
  }
  if (corpo.acao === 'enviar') {
    const texto = String(corpo.texto || '').trim().slice(0, 4000);
    if (!texto) return json({ erro: 'Escreva a mensagem.' }, 400);
    const conv = await Banco.conversa(String(corpo.conversa_id || ''));
    if (!conv) return json({ erro: 'Conversa não encontrada.' }, 404);
    if (!conv.ultima_do_cliente_em || Date.now() - Date.parse(conv.ultima_do_cliente_em) > 24 * HORA) {
      return json({ erro: 'Já se passaram 24 horas desde a última mensagem do cliente. Pela regra da Meta, só dá para responder por aqui depois que ele escrever de novo.' }, 422);
    }
    const perfil = (await rest(`perfis?id=${eq(usuario.id)}&select=nome,email`, { chave: anon, token }).catch(() => []))[0] || {};
    let externo = null, erro = null;
    try { externo = await enviarMeta(conv, { texto }); } catch (err: any) { erro = String(err?.message || err); }
    const mensagem = await Banco.gravarMensagem({ conversa_id: conv.id, direcao: 'saida', autor: perfil.nome || perfil.email || 'Equipe', texto, externo_id: externo, erro });
    await Banco.atualizarConversa(conv.id, { atendimento: 'humano', nao_lidas: 0, ultima_mensagem: texto, ultima_em: new Date().toISOString() });
    return json(erro ? { erro, mensagem } : { ok: true, mensagem }, erro ? 502 : 200);
  }
  return json({ erro: 'Ação desconhecida.' }, 400);
}

/* ---------- Entrada da função ---------- */
export async function tratar(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  // Verificação do webhook: a Meta chama uma vez ao cadastrar o endereço.
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && env('META_VERIFY_TOKEN')
      && url.searchParams.get('hub.verify_token') === env('META_VERIFY_TOKEN');
    return ok ? new Response(url.searchParams.get('hub.challenge') || '', { status: 200 }) : new Response('Token de verificação inválido', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('Método não permitido', { status: 405 });
  if (!req.headers.get('x-hub-signature-256')) {
    try { return await acaoDoSistema(req); } catch (err: any) { console.error(err); return json({ erro: String(err?.message || err) }, 500); }
  }
  const bruto = await req.text();
  if (!(await assinaturaValida(bruto, req.headers.get('x-hub-signature-256')))) return new Response('Assinatura inválida', { status: 401 });
  let corpo: any;
  try { corpo = JSON.parse(bruto); } catch { return new Response('ok'); }
  for (const e of extrairEntradas(corpo)) {
    try { await processar(e); } catch (err) { console.error('Erro ao processar mensagem', err); }
  }
  // Sempre 200: senão a Meta reenvia a mesma mensagem várias vezes.
  return new Response('ok');
}

if (typeof Deno !== 'undefined') Deno.serve(tratar);
