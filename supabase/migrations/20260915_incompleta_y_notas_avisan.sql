-- Veredicto nuevo: "aplicación incompleta". No es un sí ni un no: le falta algo al
-- vendedor (un documento, un dato, un ingreso) para que Finance pueda decidir.
-- Se le avisa al vendedor igual que un veredicto, y cuando la completa la reactiva
-- (ar_oa_reactivar ya sirve: cualquier veredicto vuelve a la fila).
create or replace function public.ar_oa_veredicto(p_codigo text, p_id uuid, p_veredicto text)
returns setof public.ar_online_applications
language plpgsql security definer volatile set search_path = public as $$
declare v_quien text; v_antes text; v_txt text;
begin
  v_quien := public.ar_oa_quien(p_codigo);
  if v_quien is null then return; end if;
  if p_veredicto is not null and p_veredicto not in ('aprobado','posible','negado','incompleto') then return; end if;
  select veredicto into v_antes from public.ar_online_applications where id = p_id;
  if v_antes is not distinct from p_veredicto then
    return query select * from public.ar_online_applications where id = p_id;
    return;
  end if;
  v_txt := case p_veredicto
             when 'aprobado'   then 'la marcó APROBADA'
             when 'posible'    then 'la marcó CON POSIBILIDAD'
             when 'negado'     then 'la marcó NEGADA'
             when 'incompleto' then 'la marcó INCOMPLETA — le falta información al vendedor'
             else 'le quitó el veredicto' end;
  return query
  update public.ar_online_applications
     set veredicto = p_veredicto,
         veredicto_por = case when p_veredicto is null then null else v_quien end,
         veredicto_at  = case when p_veredicto is null then null else now() end,
         bitacora = coalesce(bitacora,'[]'::jsonb) || jsonb_build_object(
           'id', gen_random_uuid(), 'quien', v_quien, 'tipo', 'veredicto',
           'texto', v_txt,
           'cuando', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'))
   where id = p_id
  returning *;
end $$;

-- Cuántas notas ya se le avisaron al vendedor. Si hay más notas que eso, la última
-- es noticia nueva y el aviso vuelve a sonar; si no, la tarjeta se edita en silencio.
alter table public.ar_online_applications add column if not exists discord_notas_aviso int not null default 0;
create or replace function public.ar_oa_discord_notas(p_id uuid, p_n int)
returns void language sql security definer set search_path = public as $$
  update public.ar_online_applications set discord_notas_aviso = p_n where id = p_id
$$;
revoke all on function public.ar_oa_discord_notas(uuid,int) from public;
notify pgrst, 'reload schema';
