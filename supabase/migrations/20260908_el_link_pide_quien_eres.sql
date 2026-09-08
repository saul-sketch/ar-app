-- El link de una aplicación deja de abrirse para cualquiera.
--
-- Hasta hoy, /ar-app/<código> mostraba la ficha completa —nombre, teléfono, cuánto
-- puede pagar, cuánto tiene de down, el VIN y el payoff de su trade— a quien tuviera
-- el código de 6 letras. Sin entrar, sin nada. Y ese link viaja por Discord y por
-- correo, así que un reenvío o una captura lo abría.
--
-- El link NO se le manda al cliente: la copia por correo va al vendedor. Así que no
-- hay nada afuera que dependa de que esté abierto.
--
-- Desde ahora hay que decir quién eres, y solo se abre si:
--   · eres manager (con tu código, o por tu correo del CRM) → ves todas
--   · o la aplicación la sometiste tú (tu correo = vendedor_email) → ves la tuya
--
-- La bitácora sigue saliendo vacía, como ya estaba.

create or replace function public.ar_oa_por_codigo(
  p_codigo text,
  p_codigo_usuario text default null,
  p_email text default null
)
returns setof public.ar_online_applications
language sql security definer stable set search_path = public as $$
  select jsonb_populate_record(null::public.ar_online_applications,
           to_jsonb(a) || jsonb_build_object('bitacora', '[]'::jsonb))
    from public.ar_online_applications a
   where upper(a.codigo) = upper(trim(p_codigo))
     and (
          public.ar_oa_quien(p_codigo_usuario) is not null
       or public.ar_oa_quien_crm(p_email, '') is not null
       or (coalesce(trim(p_email), '') <> ''
           and lower(trim(coalesce(a.vendedor_email, ''))) = lower(trim(p_email)))
     )
$$;

create or replace function public.ar_oa_una(
  p_id uuid,
  p_codigo_usuario text default null,
  p_email text default null
)
returns setof public.ar_online_applications
language sql security definer stable set search_path = public as $$
  select jsonb_populate_record(null::public.ar_online_applications,
           to_jsonb(a) || jsonb_build_object('bitacora', '[]'::jsonb))
    from public.ar_online_applications a
   where a.id = p_id
     and (
          public.ar_oa_quien(p_codigo_usuario) is not null
       or public.ar_oa_quien_crm(p_email, '') is not null
       or (coalesce(trim(p_email), '') <> ''
           and lower(trim(coalesce(a.vendedor_email, ''))) = lower(trim(p_email)))
     )
$$;

-- Cerrar las versiones viejas de un solo argumento: mientras existan, la puerta
-- sigue abierta aunque la página nueva pida identidad.
drop function if exists public.ar_oa_por_codigo(text);
drop function if exists public.ar_oa_una(uuid);

revoke all on function public.ar_oa_por_codigo(text, text, text) from public;
revoke all on function public.ar_oa_una(uuid, text, text) from public;
grant execute on function public.ar_oa_por_codigo(text, text, text) to anon;
grant execute on function public.ar_oa_una(uuid, text, text) to anon;

notify pgrst, 'reload schema';
