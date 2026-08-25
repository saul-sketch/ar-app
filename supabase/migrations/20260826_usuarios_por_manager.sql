-- Cada manager con su propio código. El nombre de las notas sale del CÓDIGO, no de
-- lo que la persona escriba: así nadie puede firmar como otro, que es justo lo que
-- hace que el histórico sirva para algo.
create table if not exists public.ar_oa_usuarios (
  codigo text primary key,
  nombre text not null,
  activo boolean not null default true,
  creado_at timestamptz not null default now()
);
alter table public.ar_oa_usuarios enable row level security;
-- Nadie lee esta tabla desde el navegador: solo se consulta por dentro de las
-- funciones. Si se pudiera leer, los códigos quedarían a la vista.
revoke all on table public.ar_oa_usuarios from anon;

insert into public.ar_oa_usuarios (codigo, nombre) values
  ('JOSEPH-****', 'Joseph'),
  ('VICTOR-****', 'Victor'),
  ('ANDRES-****', 'Andres'),
  ('SAUL-****', 'Saul'),
  ('CHARLES-****', 'Charles')
on conflict (codigo) do update set nombre = excluded.nombre, activo = true;

-- Quién es el del código (null si no sirve). Es la puerta de todo lo demás.
create or replace function public.ar_oa_quien(p_codigo text)
returns text language sql security definer stable set search_path = public as $$
  select nombre from public.ar_oa_usuarios
   where upper(trim(codigo)) = upper(trim(p_codigo)) and activo
$$;

create or replace function public.ar_oa_conteo(p_codigo text)
returns integer language sql security definer stable set search_path = public as $$
  select case when public.ar_oa_quien(p_codigo) is null then -1
              else (select count(*)::int from public.ar_online_applications) end
$$;

create or replace function public.ar_oa_todas(p_codigo text)
returns setof public.ar_online_applications
language sql security definer stable set search_path = public as $$
  select * from public.ar_online_applications
   where public.ar_oa_quien(p_codigo) is not null
   order by created_at desc
$$;

create or replace function public.ar_oa_deal(p_codigo text, p_id uuid, p_deal text)
returns setof public.ar_online_applications
language sql security definer volatile set search_path = public as $$
  update public.ar_online_applications
     set deal_number = nullif(trim(p_deal), '')
   where id = p_id and public.ar_oa_quien(p_codigo) is not null
  returning *
$$;

-- La nota se firma con el nombre del código, no con lo que manden. p_quien se
-- mantiene en la firma para no romper nada, pero se ignora a propósito.
create or replace function public.ar_oa_nota(p_codigo text, p_id uuid, p_quien text, p_texto text)
returns setof public.ar_online_applications
language plpgsql security definer volatile set search_path = public as $$
declare v_quien text;
begin
  v_quien := public.ar_oa_quien(p_codigo);
  if v_quien is null then return; end if;
  if coalesce(trim(p_texto),'') = '' then return; end if;
  return query
  update public.ar_online_applications
     set bitacora = coalesce(bitacora,'[]'::jsonb) || jsonb_build_object(
           'id', gen_random_uuid(), 'quien', v_quien, 'texto', trim(p_texto),
           'cuando', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'))
   where id = p_id
  returning *;
end $$;

-- Cambiar de etapa también queda escrito y con nombre: saber quién la movió a
-- "Cerrada" es parte del control que se busca.
create or replace function public.ar_oa_estado(p_codigo text, p_id uuid, p_estado text)
returns setof public.ar_online_applications
language plpgsql security definer volatile set search_path = public as $$
declare v_quien text; v_antes text;
begin
  v_quien := public.ar_oa_quien(p_codigo);
  if v_quien is null then return; end if;
  if p_estado not in ('nueva','trabajando','esperando','cerrada') then return; end if;
  select estado into v_antes from public.ar_online_applications where id = p_id;
  if v_antes is null or v_antes = p_estado then
    return query select * from public.ar_online_applications where id = p_id;
    return;
  end if;
  return query
  update public.ar_online_applications
     set estado = p_estado,
         bitacora = coalesce(bitacora,'[]'::jsonb) || jsonb_build_object(
           'id', gen_random_uuid(), 'quien', v_quien, 'tipo', 'etapa',
           'texto', 'la movió a ' || p_estado,
           'cuando', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'))
   where id = p_id
  returning *;
end $$;

revoke all on function public.ar_oa_quien(text) from public;
grant execute on function public.ar_oa_quien(text) to anon;
notify pgrst, 'reload schema';

