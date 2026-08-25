-- Número de deal de DealerCenter, opcional: a veces el vendedor ya lo tiene cuando
-- llena esto, y es por donde Finance va a buscar la aplicación después.
alter table public.ar_online_applications add column if not exists deal_number text;
create index if not exists ar_oa_deal on public.ar_online_applications (deal_number);
