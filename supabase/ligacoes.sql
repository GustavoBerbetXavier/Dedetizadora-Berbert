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
