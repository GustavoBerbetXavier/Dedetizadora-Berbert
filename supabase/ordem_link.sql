-- =====================================================================
-- Link da Ordem de Serviço para o técnico (sem login)
-- Execute este arquivo no "SQL Editor" do Supabase (pode rodar mais de uma vez).
--
-- O técnico recebe um link com um código secreto (token). Estas funções
-- deixam quem tem o link ver SOMENTE os dados daquela ordem e gravar SOMENTE
-- a execução dela (produtos, pragas, assinatura...). O restante do banco
-- continua protegido pelo login.
-- =====================================================================

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
