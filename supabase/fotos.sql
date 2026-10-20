-- Fotos dos laudos (antes e depois da limpeza de caixa d'água): armazenamento de arquivos do Supabase.
-- Execute este arquivo inteiro no SQL Editor do Supabase (pode rodar mais de uma vez).
-- A pasta "fotos" é privada: só funcionários com acesso a Laudos veem e enviam fotos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists fotos_ler on storage.objects;
create policy fotos_ler on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.tem_acesso('laudos'));

drop policy if exists fotos_enviar on storage.objects;
create policy fotos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.tem_acesso('laudos'));

drop policy if exists fotos_alterar on storage.objects;
create policy fotos_alterar on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and public.tem_acesso('laudos'));

drop policy if exists fotos_excluir on storage.objects;
create policy fotos_excluir on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.tem_acesso('laudos'));

-- ============================================================
-- FIM DO ARQUIVO. Se esta linha aparece no editor, o texto foi copiado inteiro.
-- ============================================================
