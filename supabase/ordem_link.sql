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

-- ============================================================
-- FIM DO ARQUIVO. Se esta linha aparece no editor, o texto foi copiado inteiro.
-- ============================================================
