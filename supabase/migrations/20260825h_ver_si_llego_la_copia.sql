-- Que se vea si la copia le llegó al vendedor o no. Sin esto, un correo que no
-- sale es un silencio: el vendedor ve un aviso en su pantalla y quizá lo ignora,
-- y Saúl nunca se entera. Un vacío nunca debe venir de un error.
alter table public.ar_online_applications add column if not exists copia_estado  text;
alter table public.ar_online_applications add column if not exists copia_detalle text;
alter table public.ar_online_applications add column if not exists copia_at timestamptz;
