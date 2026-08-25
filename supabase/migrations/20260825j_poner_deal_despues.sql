-- Poner el Deal # después, desde el panel. Muchas veces todavía no existe cuando el
-- vendedor llena el formulario, y es justo por donde Finance cruza esto con DealerCenter.
create or replace function public.ar_oa_deal(p_codigo text, p_id uuid, p_deal text)
returns setof public.ar_online_applications
language sql security definer volatile set search_path = public as $$
  update public.ar_online_applications
     set deal_number = nullif(trim(p_deal), '')
   where id = p_id and upper(trim(p_codigo)) = 'FINANCE2026'
  returning *
$$;
revoke all on function public.ar_oa_deal(text,uuid,text) from public;
grant execute on function public.ar_oa_deal(text,uuid,text) to anon;
notify pgrst, 'reload schema';
