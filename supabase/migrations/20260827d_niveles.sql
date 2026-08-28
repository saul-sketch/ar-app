-- Dos niveles explicitos, para que agregar gente no dependa de adivinar:
--   manager  ve TODAS, pone veredictos y escribe notas
--   user     ve solo lo que el mismo sometio, solo para leer
-- Quien no este en la tabla y venga del CRM entra como user por su correo.
alter table public.ar_oa_usuarios add column if not exists nivel text not null default 'manager';
update public.ar_oa_usuarios set nivel = 'manager' where nivel is null or nivel = '';
alter table public.ar_oa_usuarios add constraint ar_oa_nivel_valido check (nivel in ('manager','user')) not valid;

-- ar_oa_quien solo reconoce MANAGERS: es la puerta de todo lo que escribe.
create or replace function public.ar_oa_quien(p_codigo text)
returns text language sql security definer stable set search_path = public as $$
  select nombre from public.ar_oa_usuarios
   where upper(trim(codigo)) = upper(trim(p_codigo)) and activo and nivel = 'manager'
$$;

create or replace function public.ar_oa_quien_crm(p_email text, p_nombre text)
returns text language sql security definer stable set search_path = public as $$
  select nombre from public.ar_oa_usuarios
   where activo and nivel = 'manager' and (
     (email is not null and lower(email) = lower(trim(p_email)))
     or lower(nombre) = lower(split_part(trim(p_nombre), ' ', 1))
     or lower(nombre) = lower(split_part(trim(p_email), '@', 1))
   )
   limit 1
$$;

-- Para dar de alta a alguien sin tocar la base a mano.
create or replace function public.ar_oa_alta(p_codigo text, p_nuevo_codigo text, p_nombre text, p_nivel text, p_email text)
returns text language plpgsql security definer volatile set search_path = public as $$
declare v_quien text;
begin
  v_quien := public.ar_oa_quien(p_codigo);
  if v_quien is null then return null; end if;              -- solo un manager da de alta
  if coalesce(p_nivel,'user') not in ('manager','user') then return null; end if;
  insert into public.ar_oa_usuarios (codigo, nombre, nivel, email)
  values (upper(trim(p_nuevo_codigo)), trim(p_nombre), coalesce(p_nivel,'user'), nullif(trim(p_email),''))
  on conflict (codigo) do update
    set nombre = excluded.nombre, nivel = excluded.nivel, email = excluded.email, activo = true;
  return trim(p_nombre);
end $$;
revoke all on function public.ar_oa_alta(text,text,text,text,text) from public;
grant execute on function public.ar_oa_alta(text,text,text,text,text) to anon;
notify pgrst, 'reload schema';
