-- Tablilla nueva o transferencia de placa. Cambia los fees de title & tags, asi que
-- Finance lo necesita antes de armar el deal.
alter table public.ar_online_applications add column if not exists placa text;
