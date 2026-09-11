-- Manager solo por correo exacto: antes bastaba el primer nombre ("saul@x.com" entraba como Saul).
alter table public.ar_oa_usuarios add column if not exists emails_alt text[] not null default '{}';

update public.ar_oa_usuarios set email = v.email from (values
  ('Andres','andres@auto-republic.com'), ('Charles','charles@auto-republic.com'),
  ('Freddy','fredvalderrama@gmail.com'), ('Joseph','joseph@auto-republic.com'),
  ('Victor','vppaul89@gmail.com')) v(nombre,email)
 where ar_oa_usuarios.nombre = v.nombre and ar_oa_usuarios.nivel = 'manager' and ar_oa_usuarios.email is null;

update public.ar_oa_usuarios set emails_alt = array['saul@smartwavedigital.io','saullozanoo@gmail.com','saul@auto-republic.com']
 where nombre = 'Saul' and nivel = 'manager';

create or replace function public.ar_oa_quien_crm(p_email text, p_nombre text)
returns text language sql stable security definer set search_path to 'public' as $$
  select nombre from public.ar_oa_usuarios
   where activo and nivel = 'manager' and length(trim(coalesce(p_email,''))) > 3
     and (lower(email) = lower(trim(p_email))
          or lower(trim(p_email)) = any (select lower(e) from unnest(emails_alt) e))
   limit 1
$$;
