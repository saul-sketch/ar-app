-- Borrar aplicaciones: SOLO Saul, y sin destruirlas. Se marcan borradas y desaparecen
-- de todas las vistas, pero el registro queda. Son datos de clientes reales: un clic
-- equivocado no puede ser irreversible. Si alguna vez hace falta recuperar una, se
-- pone borrada_at en null y vuelve.
alter table public.ar_online_applications add column if not exists borrada_at timestamptz;
alter table public.ar_online_applications add column if not exists borrada_por text;

create or replace function public.ar_oa_borrar(p_codigo text, p_id uuid)
returns boolean language plpgsql security definer volatile set search_path = public as $$
declare v_quien text;
begin
  v_quien := public.ar_oa_quien(p_codigo);
  if v_quien is null or lower(v_quien) <> 'saul' then return false; end if;
  update public.ar_online_applications
     set borrada_at = now(), borrada_por = v_quien
   where id = p_id and borrada_at is null;
  return found;
end $$;
revoke all on function public.ar_oa_borrar(text,uuid) from public;
grant execute on function public.ar_oa_borrar(text,uuid) to anon;

-- Todas las vistas dejan fuera las borradas.
create or replace function public.ar_oa_todas(p_codigo text)
returns setof public.ar_online_applications
language sql security definer stable set search_path = public as $$
  select * from public.ar_online_applications
   where public.ar_oa_quien(p_codigo) is not null and borrada_at is null
   order by created_at desc
$$;
create or replace function public.ar_oa_mias(p_email text)
returns setof public.ar_online_applications
language sql security definer stable set search_path = public as $$
  select * from public.ar_online_applications
   where coalesce(trim(p_email),'') <> '' and borrada_at is null
     and lower(trim(vendedor_email)) = lower(trim(p_email))
   order by created_at desc
$$;
create or replace function public.ar_oa_conteo(p_codigo text)
returns integer language sql security definer stable set search_path = public as $$
  select case when public.ar_oa_quien(p_codigo) is null then -1
              else (select count(*)::int from public.ar_online_applications where borrada_at is null) end
$$;
notify pgrst, 'reload schema';
