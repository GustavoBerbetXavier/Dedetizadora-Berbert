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

-- ---------------------------------------------------------------------
-- Link da Ordem de Serviço para o técnico (também em supabase/ordem_link.sql)
-- ---------------------------------------------------------------------
create index if not exists orcamentos_token_tecnico_idx on public.orcamentos ((dados ->> 'tokenTecnico'));

-- Dados da ordem para a página do técnico.
create or replace function public.os_publica(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  o public.orcamentos;
  c jsonb;
  emp jsonb;
  cat jsonb;
  nome_colab jsonb;
begin
  if p_token is null or length(p_token) < 24 then
    raise exception 'Link inválido';
  end if;
  select * into o from orcamentos where dados ->> 'tokenTecnico' = p_token;
  if not found then
    raise exception 'Link inválido ou substituído por um novo';
  end if;
  select dados into c from clientes where id = o.dados ->> 'clienteId';
  select valor into emp from config where chave = 'empresa';
  select valor into cat from config where chave = 'catalogos';
  -- só o nome e o código de cada colaborador
  select coalesce(jsonb_agg(jsonb_build_object('id', x ->> 'id', 'codigo', x ->> 'codigo', 'nome', x ->> 'nome')), '[]'::jsonb)
    into nome_colab from jsonb_array_elements(coalesce(cat -> 'colaboradores', '[]'::jsonb)) x;
  return jsonb_build_object(
    'numero', o.dados -> 'numero',
    'data', o.dados -> 'data',
    'ordem', o.dados - 'tokenTecnico' - 'importado' - 'anotacoes',
    'cliente', jsonb_build_object(
      'codigo', c -> 'codigo', 'nome', c -> 'nome', 'fantasia', c -> 'fantasia', 'documento', c -> 'documento',
      'endereco', c -> 'endereco', 'bairro', c -> 'bairro', 'cidade', c -> 'cidade', 'cep', c -> 'cep',
      'telefone', c -> 'telefone', 'contato', c -> 'contato'),
    'empresa', jsonb_build_object('empresa', emp -> 'empresa', 'telefone', emp -> 'telefone',
      'telefoneIntoxicacao', emp -> 'telefoneIntoxicacao'),
    'produtos', coalesce((select jsonb_agg(p) from jsonb_array_elements(coalesce(cat -> 'produtos', '[]'::jsonb)) p
      where coalesce((p ->> 'ativo')::boolean, true)), '[]'::jsonb),
    'colaboradores', nome_colab
  );
end;
$$;

-- Grava a execução preenchida pelo técnico (uma vez; o escritório pode liberar para reenviar).
create or replace function public.os_enviar(p_token text, p_execucao jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.orcamentos;
begin
  if p_token is null or length(p_token) < 24 then
    raise exception 'Link inválido';
  end if;
  if p_execucao is null or jsonb_typeof(p_execucao) <> 'object' then
    raise exception 'Dados inválidos';
  end if;
  if length(p_execucao::text) > 2000000 then
    raise exception 'Dados muito grandes (assinatura ou textos)';
  end if;
  select * into o from orcamentos where dados ->> 'tokenTecnico' = p_token for update;
  if not found then
    raise exception 'Link inválido ou substituído por um novo';
  end if;
  if (o.dados -> 'execucao' ->> 'enviadoEm') is not null then
    raise exception 'Esta ordem já foi enviada. Peça ao escritório para liberar uma correção.';
  end if;
  update orcamentos
     set dados = dados || jsonb_build_object(
           'execucao', p_execucao || jsonb_build_object('enviadoEm', now()),
           'status', 'executado'),
         atualizado_em = now()
   where id = o.id;
end;
$$;

grant execute on function public.os_publica(text) to anon, authenticated;
grant execute on function public.os_enviar(text, jsonb) to anon, authenticated;
