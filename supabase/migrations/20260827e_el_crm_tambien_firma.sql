-- Saul decidio quitar el candado: el usuario del CRM tambien autoriza a escribir, y
-- todo queda firmado con ese usuario. Para no duplicar cada funcion, ar_oa_quien
-- ahora entiende DOS formas de identificarse:
--   "SAUL-UK2P"                      el codigo personal
--   "crm:correo|Nombre Completo"     el usuario que el CRM ya tiene logueado
-- Todo lo que escribe (notas, veredictos, etapas, deal #) pasa por aqui, asi que con
-- este solo cambio quedan las cuatro cosas firmadas con el nombre correcto.
create or replace function public.ar_oa_quien(p_codigo text)
returns text language sql security definer stable set search_path = public as $$
  select case
    when p_codigo like 'crm:%' then public.ar_oa_quien_crm(
           split_part(substring(p_codigo from 5), '|', 1),
           split_part(substring(p_codigo from 5), '|', 2))
    else (select nombre from public.ar_oa_usuarios
           where upper(trim(codigo)) = upper(trim(p_codigo)) and activo and nivel = 'manager')
  end
$$;
notify pgrst, 'reload schema';
