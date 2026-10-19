-- Prospecção pela nuvem: o Supabase busca as empresas no OpenStreetMap em vez do navegador.
-- Serve para quando o navegador ou o antivírus bloqueia a busca ("Failed to fetch").
-- Execute este arquivo inteiro no SQL Editor do Supabase (pode rodar mais de uma vez).

create extension if not exists http with schema extensions;

create or replace function public.prospectar(p_consulta text) returns jsonb
language sql volatile security definer set search_path = public, extensions
set http.timeout_msec = 7000
as $fn$
  select case
    when public.tem_acesso('ligacoes') and length(coalesce(p_consulta, '')) between 10 and 4000 then
      (select content::jsonb from extensions.http_get(
        'https://overpass-api.de/api/interpreter?data=' || extensions.urlencode(p_consulta)))
    else null
  end
$fn$;

revoke all on function public.prospectar(text) from public, anon;
grant execute on function public.prospectar(text) to authenticated;

-- ============================================================
-- FIM DO ARQUIVO. Se esta linha aparece no editor, o texto foi copiado inteiro.
-- ============================================================
