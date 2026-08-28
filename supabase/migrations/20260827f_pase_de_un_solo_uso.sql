-- Pase de un solo uso para abrir la app fuera del CRM sin volver a identificarse.
-- No es un link que se pueda guardar ni reenviar: se canjea UNA vez, y si nadie lo
-- canjea en 10 minutos se muere. Lo que queda despues vive en ese navegador, no en
-- la direccion — asi que copiar la barra del navegador no le sirve a nadie.
create table if not exists public.ar_oa_pases (
  token text primary key,
  nombre text not null,
  email  text,
  nivel  text not null,
  creado_at timestamptz not null default now(),
  usado_at  timestamptz
);
alter table public.ar_oa_pases enable row level security;
revoke all on table public.ar_oa_pases from anon;   -- solo por dentro de las funciones

create or replace function public.ar_oa_pase_crear(p_codigo text, p_email text, p_nombre text)
returns text language plpgsql security definer volatile set search_path = public as $$
declare v_nombre text; v_nivel text; v_token text;
begin
  -- Manager: por su codigo o por su usuario del CRM.
  v_nombre := public.ar_oa_quien(coalesce(nullif(p_codigo,''), 'crm:'||coalesce(p_email,'')||'|'||coalesce(p_nombre,'')));
  if v_nombre is not null then
    v_nivel := 'manager';
  else
    -- Vendedor: solo si ese correo de verdad ha sometido algo. Si no, no hay pase.
    if not exists (select 1 from public.ar_online_applications
                    where lower(trim(vendedor_email)) = lower(trim(p_email))) then
      return null;
    end if;
    select vendedor_nombre into v_nombre from public.ar_online_applications
      where lower(trim(vendedor_email)) = lower(trim(p_email)) order by created_at desc limit 1;
    v_nivel := 'user';
  end if;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.ar_oa_pases (token, nombre, email, nivel)
  values (v_token, v_nombre, lower(trim(p_email)), v_nivel);
  return v_token;
end $$;

create or replace function public.ar_oa_pase_usar(p_token text)
returns table(nombre text, email text, nivel text)
language plpgsql security definer volatile set search_path = public as $$
begin
  return query
  update public.ar_oa_pases p
     set usado_at = now()
   where p.token = trim(p_token)
     and p.usado_at is null
     and p.creado_at > now() - interval '10 minutes'
  returning p.nombre, p.email, p.nivel;
end $$;

-- Limpieza: los pases viejos no tienen por que quedarse guardados.
create or replace function public.ar_oa_pases_limpiar() returns void
language sql security definer volatile set search_path = public as $$
  delete from public.ar_oa_pases where creado_at < now() - interval '2 days'
$$;

revoke all on function public.ar_oa_pase_crear(text,text,text) from public;
revoke all on function public.ar_oa_pase_usar(text) from public;
grant execute on function public.ar_oa_pase_crear(text,text,text) to anon;
grant execute on function public.ar_oa_pase_usar(text) to anon;
notify pgrst, 'reload schema';
