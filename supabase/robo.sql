-- Robô de atendimento (WhatsApp e Instagram) e a tela "Conversas".
-- Execute este arquivo inteiro no SQL Editor do Supabase (pode rodar mais de uma vez).
-- Quem grava as mensagens é a função "robo" (supabase/functions/robo), com a chave de serviço;
-- os funcionários com a área "Conversas" leem as conversas e mudam quem está atendendo.

-- Uma conversa por contato e canal. id = 'whatsapp:5544999990000' ou 'instagram:<id do Instagram>'.
create table if not exists public.conversas (
  id text primary key,
  canal text not null,
  contato text not null,
  nome text not null default '',
  cliente_id text,
  -- robo: o robô responde; humano: esperando ou em atendimento por um funcionário (robô calado);
  -- encerrada: atendimento terminado (se o cliente escrever de novo, o robô recomeça).
  atendimento text not null default 'robo',
  estado text not null default 'inicio',   -- etapa do roteiro do robô
  dados jsonb not null default '{}',       -- respostas que o cliente já deu no roteiro
  ultima_mensagem text not null default '',
  ultima_em timestamptz not null default now(),
  ultima_do_cliente_em timestamptz,        -- para a janela de 24 horas da Meta
  nao_lidas int not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists conversas_ultima_idx on public.conversas (ultima_em desc);

create table if not exists public.mensagens (
  id bigint generated always as identity primary key,
  conversa_id text not null references public.conversas (id) on delete cascade,
  direcao text not null,          -- entrada (do cliente) ou saida
  autor text not null default '', -- cliente, robo ou o nome do funcionário
  texto text not null default '',
  externo_id text unique,         -- id da mensagem na Meta (evita gravar duas vezes)
  erro text,                      -- preenchido se a Meta recusou o envio
  criado_em timestamptz not null default now()
);
create index if not exists mensagens_conversa_idx on public.mensagens (conversa_id, id);

alter table public.conversas enable row level security;
alter table public.mensagens enable row level security;

drop policy if exists conversas_ler on public.conversas;
create policy conversas_ler on public.conversas for select using (public.tem_acesso('conversas'));
drop policy if exists conversas_alterar on public.conversas;
create policy conversas_alterar on public.conversas for update
  using (public.tem_acesso('conversas')) with check (public.tem_acesso('conversas'));
drop policy if exists conversas_excluir on public.conversas;
create policy conversas_excluir on public.conversas for delete using (public.eh_admin());

drop policy if exists mensagens_ler on public.mensagens;
create policy mensagens_ler on public.mensagens for select using (public.tem_acesso('conversas'));

-- Funções usadas só pelo robô (chave de serviço).
-- Cliente cujo telefone tem o DDD e os 8 últimos dígitos do número que escreveu (com ou sem o 9).
create or replace function public.robo_cliente_por_telefone(p_ddd text, p_final text) returns text
language sql stable security definer set search_path = public
as $fn$
  select id from clientes
  where p_ddd ~ '^\d{2}$' and p_final ~ '^\d{8}$'
    and coalesce((dados ->> 'ativo')::boolean, true)
    and regexp_replace(coalesce(dados ->> 'telefone', ''), '\D', '', 'g') ~ (p_ddd || '9?' || p_final)
  order by atualizado_em desc
  limit 1
$fn$;

-- Próximo código de cliente (maior código numérico + 1, mantendo os zeros à esquerda se houver).
create or replace function public.robo_proximo_codigo_cliente() returns text
language sql stable security definer set search_path = public
as $fn$
  with cods as (
    select dados ->> 'codigo' as c from clientes where coalesce(dados ->> 'codigo', '') ~ '^\d{1,15}$'
  )
  , prox as (
    select ((select coalesce(max(c::bigint), 0) from cods) + 1)::text as n,
      case when exists (select 1 from cods where length(c) > 1 and left(c, 1) = '0')
        then (select max(length(c)) from cods) else 0 end as largura
  )
  select lpad(n, greatest(largura, length(n)), '0') from prox
$fn$;

revoke execute on function public.robo_cliente_por_telefone(text, text) from public, anon, authenticated;
revoke execute on function public.robo_proximo_codigo_cliente() from public, anon, authenticated;
grant execute on function public.robo_cliente_por_telefone(text, text) to service_role;
grant execute on function public.robo_proximo_codigo_cliente() to service_role;

-- ============================================================
-- FIM DO ARQUIVO. Se esta linha aparece no editor, o texto foi copiado inteiro.
-- ============================================================
