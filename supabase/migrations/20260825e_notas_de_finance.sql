-- Notas de Finance sobre cada aplicación. Histórico, no un campo que se pisa:
-- cada nota queda con quién la escribió y cuándo, como en Pólizas.
alter table public.ar_online_applications add column if not exists bitacora jsonb not null default '[]'::jsonb;

-- Agregar una nota. Entra por el mismo código del panel — las notas son internas.
create or replace function public.ar_oa_nota(p_codigo text, p_id uuid, p_quien text, p_texto text)
returns setof public.ar_online_applications
language plpgsql security definer volatile set search_path = public as $$
begin
  if upper(trim(p_codigo)) <> 'FINANCE2026' then return; end if;
  if coalesce(trim(p_texto),'') = '' then return; end if;
  return query
  update public.ar_online_applications
     set bitacora = coalesce(bitacora,'[]'::jsonb) || jsonb_build_object(
           'id',    gen_random_uuid(),
           'quien', coalesce(nullif(trim(p_quien),''),'Finance'),
           'texto', trim(p_texto),
           'cuando', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"')
         )
   where id = p_id
  returning *;
end $$;

revoke all on function public.ar_oa_nota(text,uuid,text,text) from public;
grant execute on function public.ar_oa_nota(text,uuid,text,text) to anon;
notify pgrst, 'reload schema';
