create table if not exists public.ar_online_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  vendedor_nombre text not null,
  vendedor_email  text not null,
  location        text,
  cliente_nombre   text not null,
  cliente_telefono text not null,
  pago_mensual numeric,
  down_hoy     numeric,
  down_max     numeric,
  down_cuando  text,
  trade_in      text,
  trade_vin     text,
  trade_millas  text,
  trade_payoff  numeric,
  urgencia      text,
  visita_fecha  date,
  visita_hora   text,
  tipo_carro        text[] default '{}',
  vehiculo_especifico text,
  co_buyer text,
  notas    text,
  estado text not null default 'nueva',
  estado_nota text
);
create index if not exists ar_oa_created  on public.ar_online_applications (created_at desc);
create index if not exists ar_oa_vendedor on public.ar_online_applications (vendedor_email);
create index if not exists ar_oa_estado   on public.ar_online_applications (estado);

alter table public.ar_online_applications enable row level security;
drop policy if exists "oa insert" on public.ar_online_applications;
drop policy if exists "oa read"   on public.ar_online_applications;
drop policy if exists "oa update" on public.ar_online_applications;
create policy "oa insert" on public.ar_online_applications for insert to anon with check (true);
create policy "oa read"   on public.ar_online_applications for select to anon using (true);
create policy "oa update" on public.ar_online_applications for update to anon using (true) with check (true);
-- a proposito NO hay politica de DELETE: desde el navegador no se puede borrar nada.

create or replace function public.ar_oa_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists ar_oa_touch on public.ar_online_applications;
create trigger ar_oa_touch before update on public.ar_online_applications
  for each row execute function public.ar_oa_touch();
