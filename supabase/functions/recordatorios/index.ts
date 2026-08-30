// recordatorios — cada hora, en horario laboral, avisa qué aplicaciones siguen sin que
// nadie las toque. "Tocarla" es ponerle veredicto o escribirle una nota; abrirla no
// cuenta, porque abrirla no le sirve de nada al cliente que está esperando.
//
// Reglas que pidió Saúl:
//   · primera a las 10am, última a las 6pm (hora de Orlando)
//   · cada hora, y cada vez SOLO lo que sigue pendiente
//   · separado por tienda: Orlando por un lado, Kissimmee por otro
//   · si no hay nada pendiente, no manda nada
//
// Lo corre pg_cron cada hora. El horario se decide aquí adentro y no en el cron, para
// que el cambio de hora de invierno no lo desfase.

const DISCORD = Deno.env.get("DISCORD_APLICACIONES") ?? "";
const SUPA    = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITIO   = Deno.env.get("SITIO_URL") ?? "https://saul-sketch.github.io/ar-app/";

const HORAS_SIN_TOCAR = 1;
const PRIMERA = 10, ULTIMA = 18;          // 10am y 6pm, hora del este

const URG: Record<string,string> = { hoy:"Hoy", "2-3dias":"En 2–3 días", semana:"Esta semana", mes:"Este mes", sin_fecha:"Sin fecha" };
const COLOR: Record<string,number> = { Orlando: 0x3b82f6, Kissimmee: 0x8b5cf6 };
const money = (n: unknown) => (n === null || n === undefined || n === "") ? "—" : "$" + Math.round(Number(n)).toLocaleString("en-US");
const fono = (t: unknown) => { const d = String(t ?? "").replace(/\D/g,"").slice(-10); return d.length===10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : String(t ?? ""); };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    if (!DISCORD) return json({ ok:false, motivo:"sin_canal" });
    let forzar = false;
    try { forzar = (await req.json())?.forzar === true; } catch (_e) { /* sin cuerpo */ }

    const h = Number(new Date().toLocaleString("en-US", { timeZone:"America/New_York", hour:"2-digit", hour12:false }));
    if (!forzar && (h < PRIMERA || h > ULTIMA)) return json({ ok:true, motivo:"fuera_de_horario", hora:h });

    const r = await fetch(`${SUPA}/rest/v1/ar_online_applications?select=*&veredicto=is.null&borrada_at=is.null&order=created_at.asc`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
    const filas = await r.json();
    if (!Array.isArray(filas)) return json({ ok:false, motivo:"no_se_pudo_leer" });

    const ahora = Date.now();
    const pendientes = filas.filter((a: Record<string, any>) => {
      if ((ahora - new Date(a.created_at).getTime()) / 36e5 < HORAS_SIN_TOCAR) return false;
      // Una nota escrita por alguien cuenta como atendida. Los apuntes automáticos
      // (cambios de etapa o de veredicto) no: esos no dicen nada al cliente.
      return !(a.bitacora ?? []).some((n: Record<string, any>) => !n.tipo);
    });
    // Si no hay nada pendiente, no se manda nada. Un canal que avisa "todo bien" cada
    // hora deja de leerse.
    if (!pendientes.length) return json({ ok:true, avisadas:0 });

    const porTienda: Record<string, Record<string, any>[]> = {};
    pendientes.forEach((a: Record<string, any>) => {
      (porTienda[a.location || "Sin tienda"] ??= []).push(a);
    });

    const linea = (a: Record<string, any>) => {
      const hs = Math.round((ahora - new Date(a.created_at).getTime()) / 36e5);
      const t = hs >= 24 ? Math.round(hs/24) + " d" : hs + " h";
      const ya = a.urgencia === "hoy" || a.urgencia === "2-3dias" ? "🔴 " : "";
      return `${ya}**[${a.cliente_nombre}](${SITIO.replace(/\/?$/,"/")}${a.codigo})** — ${t} sin tocar · ${URG[a.urgencia] ?? a.urgencia}\n${fono(a.cliente_telefono)} · ${money(a.pago_mensual)}/mes · down ${money(a.down_hoy)} · ${a.vendedor_nombre}`;
    };

    // Un embed por tienda: cada manager mira lo suyo sin tener que filtrar con la vista.
    const embeds = Object.keys(porTienda).sort().map((t) => {
      const lista = porTienda[t];
      const urg = lista.filter((a) => a.urgencia === "hoy" || a.urgencia === "2-3dias").length;
      return {
        title: `${t} — ${lista.length} sin revisar`,
        description: lista.slice(0, 10).map(linea).join("\n\n")
          + (lista.length > 10 ? `\n\n…y ${lista.length - 10} más` : ""),
        color: COLOR[t] ?? 0xf59e0b,
        footer: { text: urg ? `${urg} dijeron que compran ya` : "Nadie les ha puesto veredicto ni nota" },
      };
    });

    const totalUrg = pendientes.filter((a: Record<string,any>) => a.urgencia === "hoy" || a.urgencia === "2-3dias").length;
    await fetch(DISCORD, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: totalUrg ? `**${pendientes.length} pendientes · ${totalUrg} compran ya**` : `**${pendientes.length} pendientes**`,
        embeds,
      }),
    });

    return json({ ok:true, avisadas: pendientes.length, urgentes: totalUrg,
                  por_tienda: Object.fromEntries(Object.entries(porTienda).map(([k,v]) => [k, v.length])) });
  } catch (e) {
    return json({ ok:false, motivo:String((e as Error)?.message ?? e).slice(0,200) }, 500);
  }
});
