-- =====================================================================
-- Dedetizadora Berbert - estrutura do banco de dados (Supabase)
-- Execute este arquivo inteiro no "SQL Editor" do Supabase, uma única vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funcionários (perfis de acesso)
-- Cada login do Supabase Auth tem um perfil com as permissões dele.
-- Módulos possíveis em "permissoes": clientes, agenda, orcamentos, laudos, financeiro
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  email text not null default '',
  admin boolean not null default false,
  ativo boolean not null default false,
  permissoes text[] not null default '{}',
  criado_em timestamptz not null default now()
);

-- Funções de verificação usadas pelas regras de segurança (RLS).
create or replace function public.usuario_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ativo from perfis where id = auth.uid()), false);
$$;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ativo and admin from perfis where id = auth.uid()), false);
$$;

create or replace function public.tem_acesso(modulo text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ativo and (admin or modulo = any (permissoes))
                   from perfis where id = auth.uid()), false);
$$;

-- Cria o perfil automaticamente quando um login é criado.
-- O PRIMEIRO usuário vira administrador. Os demais começam DESATIVADOS e sem
-- permissões, até que um administrador os libere na tela "Funcionários".
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  primeiro boolean;
begin
  perform pg_advisory_xact_lock(4242);
  primeiro := not exists (select 1 from perfis);
  insert into perfis (id, nome, email, admin, ativo)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', ''), coalesce(new.email, ''), primeiro, primeiro);
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.novo_usuario();

alter table public.perfis enable row level security;

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select
  using (id = auth.uid() or public.eh_admin());

drop policy if exists perfis_admin_alterar on public.perfis;
create policy perfis_admin_alterar on public.perfis for update
  using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists perfis_admin_excluir on public.perfis;
create policy perfis_admin_excluir on public.perfis for delete
  using (public.eh_admin() and id <> auth.uid());

-- ---------------------------------------------------------------------
-- Dados do sistema. Cada registro guarda seus campos em "dados" (JSON).
-- ---------------------------------------------------------------------
create table if not exists public.clientes (
  id text primary key, dados jsonb not null default '{}',
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create table if not exists public.agendamentos (like public.clientes including all);
create table if not exists public.orcamentos (like public.clientes including all);
create table if not exists public.laudos (like public.clientes including all);
create table if not exists public.financeiro (like public.clientes including all);

-- Configurações da empresa (nome, CNPJ, responsável técnico...)
create table if not exists public.config (
  chave text primary key, valor jsonb not null default '{}'
);

alter table public.clientes enable row level security;
alter table public.agendamentos enable row level security;
alter table public.orcamentos enable row level security;
alter table public.laudos enable row level security;
alter table public.financeiro enable row level security;
alter table public.config enable row level security;

-- Clientes: todo funcionário ativo pode VER (para aparecer o nome na agenda,
-- nos laudos etc.), mas só quem tem o módulo "clientes" pode cadastrar/alterar.
drop policy if exists clientes_ler on public.clientes;
create policy clientes_ler on public.clientes for select using (public.usuario_ativo());
drop policy if exists clientes_inserir on public.clientes;
create policy clientes_inserir on public.clientes for insert with check (public.tem_acesso('clientes'));
drop policy if exists clientes_alterar on public.clientes;
create policy clientes_alterar on public.clientes for update
  using (public.tem_acesso('clientes')) with check (public.tem_acesso('clientes'));
drop policy if exists clientes_excluir on public.clientes;
create policy clientes_excluir on public.clientes for delete using (public.tem_acesso('clientes'));

-- Demais módulos: só quem tem o módulo pode ver e alterar.
drop policy if exists agendamentos_acesso on public.agendamentos;
create policy agendamentos_acesso on public.agendamentos for all
  using (public.tem_acesso('agenda')) with check (public.tem_acesso('agenda'));

drop policy if exists orcamentos_acesso on public.orcamentos;
create policy orcamentos_acesso on public.orcamentos for all
  using (public.tem_acesso('orcamentos')) with check (public.tem_acesso('orcamentos'));

drop policy if exists laudos_acesso on public.laudos;
create policy laudos_acesso on public.laudos for all
  using (public.tem_acesso('laudos')) with check (public.tem_acesso('laudos'));

drop policy if exists financeiro_acesso on public.financeiro;
create policy financeiro_acesso on public.financeiro for all
  using (public.tem_acesso('financeiro')) with check (public.tem_acesso('financeiro'));

drop policy if exists config_ler on public.config;
create policy config_ler on public.config for select using (public.usuario_ativo());
drop policy if exists config_admin on public.config;
create policy config_admin on public.config for all
  using (public.eh_admin()) with check (public.eh_admin());

-- ---------------------------------------------------------------------
-- Numeração sequencial de orçamentos e laudos (sem números repetidos,
-- mesmo com vários funcionários emitindo ao mesmo tempo).
-- ---------------------------------------------------------------------
create sequence if not exists public.seq_orcamento;
create sequence if not exists public.seq_laudo;

create or replace function public.proximo_numero(tipo text) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if tipo = 'orcamento' and tem_acesso('orcamentos') then
    return nextval('seq_orcamento');
  elsif tipo = 'laudo' and tem_acesso('laudos') then
    return nextval('seq_laudo');
  end if;
  raise exception 'Sem permissão para gerar número de %', tipo;
end;
$$;

-- Usado ao restaurar um backup, para a numeração continuar de onde parou.
create or replace function public.ajustar_numeracao(orcamento bigint, laudo bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() then
    raise exception 'Apenas administradores';
  end if;
  if orcamento > 0 then
    perform setval('seq_orcamento', greatest(orcamento, (select last_value from seq_orcamento)));
  end if;
  if laudo > 0 then
    perform setval('seq_laudo', greatest(laudo, (select last_value from seq_laudo)));
  end if;
end;
$$;

-- Link da Ordem de Servico para o tecnico (sem login).
-- Execute este arquivo inteiro no SQL Editor do Supabase (pode rodar mais de uma vez).
-- Quem tem o link ve SOMENTE os dados daquela ordem e grava SOMENTE a execucao dela.

create index if not exists orcamentos_token_tecnico_idx on public.orcamentos ((dados ->> 'tokenTecnico'));

drop function if exists public.os_enviar(text, jsonb);

create or replace function public.os_publica(p_token text) returns jsonb
language sql stable security definer set search_path = public
as $fn$
  with ordem as (
    select dados from orcamentos
    where length(coalesce(p_token, '')) >= 24 and dados ->> 'tokenTecnico' = p_token
    limit 1
  ),
  cli as (
    select clientes.dados from clientes, ordem where clientes.id = ordem.dados ->> 'clienteId'
  ),
  emp as (
    select valor from config where chave = 'empresa'
  ),
  cat as (
    select valor from config where chave = 'catalogos'
  )
  select jsonb_build_object(
    'numero', ordem.dados -> 'numero',
    'data', ordem.dados -> 'data',
    'ordem', ordem.dados - 'tokenTecnico' - 'importado' - 'anotacoes',
    'cliente', (select jsonb_build_object(
        'codigo', cli.dados -> 'codigo', 'nome', cli.dados -> 'nome', 'fantasia', cli.dados -> 'fantasia',
        'documento', cli.dados -> 'documento', 'endereco', cli.dados -> 'endereco', 'bairro', cli.dados -> 'bairro',
        'cidade', cli.dados -> 'cidade', 'cep', cli.dados -> 'cep', 'telefone', cli.dados -> 'telefone',
        'contato', cli.dados -> 'contato') from cli),
    'empresa', (select jsonb_build_object('empresa', emp.valor -> 'empresa', 'telefone', emp.valor -> 'telefone',
        'telefoneIntoxicacao', emp.valor -> 'telefoneIntoxicacao') from emp),
    'produtos', coalesce((select jsonb_agg(prod) from cat, jsonb_array_elements(coalesce(cat.valor -> 'produtos', '[]'::jsonb)) prod
        where coalesce((prod ->> 'ativo')::boolean, true)), '[]'::jsonb),
    'colaboradores', coalesce((select jsonb_agg(jsonb_build_object('id', colab ->> 'id', 'codigo', colab ->> 'codigo', 'nome', colab ->> 'nome'))
        from cat, jsonb_array_elements(coalesce(cat.valor -> 'colaboradores', '[]'::jsonb)) colab), '[]'::jsonb)
  )
  from ordem
$fn$;

create or replace function public.os_enviar(p_token text, p_execucao jsonb) returns text
language sql security definer set search_path = public
as $fn$
  with alvo as (
    select id, (dados -> 'execucao' ->> 'enviadoEm') is not null as enviado
    from orcamentos
    where length(coalesce(p_token, '')) >= 24 and dados ->> 'tokenTecnico' = p_token
    limit 1
  ),
  gravado as (
    update orcamentos
       set dados = orcamentos.dados || jsonb_build_object(
             'execucao', p_execucao || jsonb_build_object('enviadoEm', now()),
             'status', 'executado'),
           atualizado_em = now()
      from alvo
     where orcamentos.id = alvo.id
       and not alvo.enviado
       and jsonb_typeof(p_execucao) = 'object'
       and length(p_execucao::text) <= 2000000
    returning orcamentos.id
  )
  select case
    when not exists (select 1 from alvo) then 'invalido'
    when (select enviado from alvo) then 'ja_enviado'
    when exists (select 1 from gravado) then 'ok'
    else 'dados_invalidos'
  end
$fn$;

grant execute on function public.os_publica(text) to anon, authenticated;
grant execute on function public.os_enviar(text, jsonb) to anon, authenticated;

-- Aba "Ligações": registro das ligações (vencimentos e prospecção) e o último serviço de cada cliente.
-- Execute este arquivo inteiro no SQL Editor do Supabase (pode rodar mais de uma vez).

create table if not exists public.ligacoes (
  id text primary key, dados jsonb not null default '{}',
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
alter table public.ligacoes enable row level security;

drop policy if exists ligacoes_acesso on public.ligacoes;
create policy ligacoes_acesso on public.ligacoes for all
  using (public.tem_acesso('ligacoes')) with check (public.tem_acesso('ligacoes'));

-- Último serviço (não cancelado) de cada cliente: número, data, situação, descrição e valor.
-- Quem tem a aba Ligações vê isto mesmo sem acesso aos orçamentos.
create or replace function public.ultimos_servicos() returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select coalesce(jsonb_agg(u), '[]'::jsonb) from (
    select distinct on (o.dados ->> 'clienteId')
      o.dados ->> 'clienteId' as "clienteId",
      o.dados -> 'numero' as numero,
      o.dados ->> 'data' as data,
      o.dados ->> 'status' as status,
      (select string_agg(i ->> 'descricao', ', ') from jsonb_array_elements(
        case when jsonb_typeof(o.dados -> 'itens') = 'array' then o.dados -> 'itens' else '[]'::jsonb end) i) as descricao,
      (select coalesce(sum(
          case when jsonb_typeof(i -> 'qtd') = 'number' then (i ->> 'qtd')::numeric else 1 end *
          case when jsonb_typeof(i -> 'valor') = 'number' then (i ->> 'valor')::numeric else 0 end), 0)
        from jsonb_array_elements(
        case when jsonb_typeof(o.dados -> 'itens') = 'array' then o.dados -> 'itens' else '[]'::jsonb end) i) as valor
    from orcamentos o
    where public.tem_acesso('ligacoes')
      and coalesce(o.dados ->> 'clienteId', '') <> ''
      and o.dados ->> 'status' in ('executado', 'finalizado', 'em_execucao', 'aprovado')
      and coalesce(o.dados ->> 'data', '') ~ '^\d{4}-\d{2}-\d{2}'
    order by o.dados ->> 'clienteId', o.dados ->> 'data' desc, o.id desc
  ) u
$fn$;

grant execute on function public.ultimos_servicos() to authenticated;

-- ============================================================
-- FIM DO ARQUIVO. Se esta linha aparece no editor, o texto foi copiado inteiro.
-- ============================================================
