-- Cuando el CRM cierra una oportunidad (compró en otro lugar, vendido, lead muerto...),
-- la aplicación lo refleja: queda anotado por qué, en qué etapa y desde cuándo.
alter table public.ar_online_applications
  add column if not exists crm_cierre text,
  add column if not exists crm_cierre_tipo text,        -- 'vendido' | 'perdido'
  add column if not exists crm_cierre_at timestamptz;

create or replace function public.ar_oa_marcar_cierre_crm(p_id uuid, p_tipo text, p_motivo text, p_at timestamptz)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_txt text;
begin
  if exists (select 1 from ar_online_applications where id = p_id
              and crm_cierre is not distinct from p_motivo and crm_cierre_tipo is not distinct from p_tipo) then
    return false;                                   -- ya estaba anotado: no repetir la nota
  end if;
  v_txt := 'El CRM la cerró: «' || p_motivo || '»'
        || coalesce(' (se movió el ' || to_char(p_at at time zone 'America/New_York', 'FMDD/FMMM') || ')', '')
        || case when p_tipo = 'vendido' then '. Cuenta como vendida.' else '. Sale del reporte de pendientes.' end;
  update ar_online_applications
     set crm_cierre = p_motivo, crm_cierre_tipo = p_tipo, crm_cierre_at = p_at,
         perdida_at     = case when p_tipo = 'perdido' then coalesce(perdida_at, p_at, now()) else perdida_at end,
         perdida_motivo = case when p_tipo = 'perdido' and perdida_at is null then 'CRM: ' || p_motivo else perdida_motivo end,
         perdida_por    = case when p_tipo = 'perdido' and perdida_at is null then 'CRM' else perdida_por end,
         bitacora = coalesce(bitacora, '[]'::jsonb) || jsonb_build_object(
           'id', gen_random_uuid(), 'quien', 'CRM', 'texto', v_txt, 'tipo', 'seguimiento',
           'cuando', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
   where id = p_id;
  return true;
end $$;
revoke all on function public.ar_oa_marcar_cierre_crm(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.ar_oa_marcar_cierre_crm(uuid, text, text, timestamptz) to service_role;
