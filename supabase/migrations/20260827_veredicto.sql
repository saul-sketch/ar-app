-- Veredicto de Finance. Es OTRA cosa que la etapa, no la reemplaza: IRIS está
-- aprobada Y esperando al cliente el sábado. En un solo campo se perdería uno.
alter table public.ar_online_applications add column if not exists veredicto text;
alter table public.ar_online_applications add column if not exists veredicto_por text;
alter table public.ar_online_applications add column if not exists veredicto_at timestamptz;
create index if not exists ar_oa_veredicto on public.ar_online_applications (veredicto);

-- Poner el veredicto ya ES revisarla: queda con el nombre de quien lo puso, sin que
-- nadie tenga que acordarse de marcar una casilla aparte.
create or replace function public.ar_oa_veredicto(p_codigo text, p_id uuid, p_veredicto text)
returns setof public.ar_online_applications
language plpgsql security definer volatile set search_path = public as $$
declare v_quien text; v_antes text; v_txt text;
begin
  v_quien := public.ar_oa_quien(p_codigo);
  if v_quien is null then return; end if;
  if p_veredicto is not null and p_veredicto not in ('aprobado','posible','negado') then return; end if;
  select veredicto into v_antes from public.ar_online_applications where id = p_id;
  if v_antes is not distinct from p_veredicto then
    return query select * from public.ar_online_applications where id = p_id;
    return;
  end if;
  v_txt := case p_veredicto
             when 'aprobado' then 'la marcó APROBADA'
             when 'posible'  then 'la marcó CON POSIBILIDAD'
             when 'negado'   then 'la marcó NEGADA'
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
revoke all on function public.ar_oa_veredicto(text,uuid,text) from public;
grant execute on function public.ar_oa_veredicto(text,uuid,text) to anon;
notify pgrst, 'reload schema';
