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
