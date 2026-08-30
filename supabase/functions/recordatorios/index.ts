// recordatorios — avisa al canal cuando una aplicación lleva demasiado sin que nadie
// la toque. "Tocarla" es ponerle veredicto o escribirle una nota; abrirla no cuenta,
// porque abrirla no le sirve de nada al cliente que está esperando.
//
// Lo corre pg_cron cada 15 minutos. No manda de madrugada (nadie va a actuar a las
// 3am y a las 8 el aviso ya se perdió arriba) y no repite el mismo caso antes de 4
// horas, para que el canal no se vuelva ruido que se ignora.

const DISCORD = Deno.env.get("DISCORD_APLICACIONES") ?? "";
const SUPA    = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITIO   = Deno.env.get("SITIO_URL") ?? "https://saul-sketch.github.io/ar-app/";

const HORAS_SIN_TOCAR = 1;    // lo que pidió Saúl
const HORAS_ENTRE_AVISOS = 4; // no repetir el mismo caso antes de esto
const DESDE_HORA = 8, HASTA_HORA = 21;   // hora del este

const URG: Record<string,string> = { hoy:"Hoy", "2-3dias":"En 2–3 días", semana:"Esta semana", mes:"Este mes", sin_fecha:"Sin fecha" };
const money = (n: unknown) => (n === null || n === undefined || n === "") ? "—" : "$" + Math.round(Number(n)).toLocaleString("en-US");
const fono = (t: unknown) => { const d = String(t ?? "").replace(/\D/g,"").slice(-10); return d.length===10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : String(t ?? ""); };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    if (!DISCORD) return json({ ok:false, motivo:"sin_canal" });
    // forzar: para probarlo o dispararlo a mano fuera de horario.
    let forzar = false;
    try { forzar = (await req.json())?.forzar === true; } catch (_e) { /* sin cuerpo */ }

    // Hora de Orlando, no la del servidor.
    const h = Number(new Date().toLocaleString("en-US", { timeZone:"America/New_York", hour:"2-digit", hour12:false }));
    if (!forzar && (h < DESDE_HORA || h >= HASTA_HORA)) return json({ ok:true, motivo:"fuera_de_horario", hora:h });

    const r = await fetch(`${SUPA}/rest/v1/ar_online_applications?select=*&veredicto=is.null&borrada_at=is.null&order=created_at.asc`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
    const filas = await r.json();
    if (!Array.isArray(filas)) return json({ ok:false, motivo:"no_se_pudo_leer" });

    const ahora = Date.now();
    const olvidadas = filas.filter((a: Record<string, any>) => {
      const horas = (ahora - new Date(a.created_at).getTime()) / 36e5;
      if (horas < HORAS_SIN_TOCAR) return false;
      // Una nota escrita por alguien cuenta como atendida. Los apuntes automáticos
      // (cambios de etapa o de veredicto) no: esos no dicen nada al cliente.
      const notas = (a.bitacora ?? []).filter((n: Record<string, any>) => !n.tipo);
      if (notas.length) return false;
      if (a.recordatorio_at && (ahora - new Date(a.recordatorio_at).getTime()) / 36e5 < HORAS_ENTRE_AVISOS) return false;
      return true;
    });
    if (!olvidadas.length) return json({ ok:true, avisadas:0 });

    // Un solo mensaje con todas: 6 avisos sueltos se ignoran, uno con 6 se lee.
    const linea = (a: Record<string, any>) => {
      const horas = Math.round((ahora - new Date(a.created_at).getTime()) / 36e5);
      const t = horas >= 24 ? Math.round(horas/24) + " d" : horas + " h";
      return `• **[${a.cliente_nombre}](${SITIO.replace(/\/?$/,"/")}${a.codigo})** — ${t} sin tocar · ${URG[a.urgencia] ?? a.urgencia} · ${money(a.pago_mensual)}/mes · down ${money(a.down_hoy)}\n ${fono(a.cliente_telefono)} · la llenó ${a.vendedor_nombre}${a.location ? " ("+a.location+")" : ""}`;
    };
    const urgentes = olvidadas.filter((a: Record<string,any>) => a.urgencia === "hoy" || a.urgencia === "2-3dias");

    await fetch(DISCORD, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: urgentes.length ? `**${urgentes.length} de estas dijeron que compran ya**` : "",
        embeds: [{
          title: olvidadas.length === 1 ? "1 aplicación sin revisar" : `${olvidadas.length} aplicaciones sin revisar`,
          description: olvidadas.slice(0, 12).map(linea).join("\n\n")
            + (olvidadas.length > 12 ? `\n\n…y ${olvidadas.length - 12} más` : ""),
          color: urgentes.length ? 0xef4444 : 0xf59e0b,
          footer: { text: "Nadie les ha puesto veredicto ni nota" },
        }],
      }),
    });

    // Anotar a quién ya se avisó, para no repetirlo en 4 horas.
    await fetch(`${SUPA}/rest/v1/ar_online_applications?id=in.(${olvidadas.map((a: Record<string,any>) => a.id).join(",")})`, {
      method: "PATCH",
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ recordatorio_at: new Date().toISOString() }),
    }).catch(() => {});

    return json({ ok:true, avisadas: olvidadas.length, urgentes: urgentes.length });
  } catch (e) {
    return json({ ok:false, motivo:String((e as Error)?.message ?? e).slice(0,200) }, 500);
  }
});
