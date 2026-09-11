// resumen-pendientes — a las 11am y a las 4pm (hora de Orlando), en el canal de cada
// equipo, la lista de aprobadas y con posibilidad que todavía no han comprado,
// agrupada por vendedor y con la fecha de la aprobación.
//
// Reglas que pidió Saúl:
//   · solo nombre del cliente (sin teléfono: el canal lo ven todos)
//   · agrupado por vendedor, cada uno mencionado para que le suene
//   · en el canal de SU equipo (call center / Orlando / Kissimmee)
//   · si un equipo no tiene nada pendiente, no se le manda nada
//
// Lo corre pg_cron cada hora; la hora se decide aquí para que el cambio de horario
// de invierno no lo corra.

const SUPA    = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BOT     = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const GUILD   = "1467661813545046183";
const HORAS   = [11, 16];
const SIN_NADIE = "⚠️ Sin nadie asignado";
const GHL     = Deno.env.get("GHL_API_TOKEN") ?? "";
const LOC     = Deno.env.get("GHL_LOCATION_ID") ?? "";
const GH = (v = "2021-04-15") => ({ Authorization: `Bearer ${GHL}`, Version: v, Accept: "application/json" });

/* Último contacto REAL con el cliente: la última llamada o mensaje que le hizo una
   persona del equipo, según el CRM (el marcador deja ahí cada llamada). Los mensajes
   automáticos no cuentan: no tienen a nadie detrás. */
const TIPOS = new Set(["TYPE_CUSTOM_CALL", "TYPE_CALL", "TYPE_CUSTOM_SMS", "TYPE_SMS", "TYPE_WHATSAPP", "TYPE_EMAIL", "TYPE_CUSTOM_EMAIL"]);
// Una sola descarga de la lista de usuarios, aunque la pidan 5 fichas a la vez.
let USUARIOS: Promise<Record<string, string>> | null = null;
function usuarios(): Promise<Record<string, string>> {
  USUARIOS ??= (async () => {
    const m: Record<string, string> = {};
    try {
      const r = await fetch(`https://services.leadconnectorhq.com/users/?locationId=${LOC}`, { headers: GH("2021-07-28") });
      const j = await r.json();
      for (const u of j.users ?? []) m[u.id] = String(u.firstName || u.name || "").trim();
    } catch { /* sin nombres */ }
    return m;
  })();
  return USUARIOS;
}
async function ghl(url: string, v?: string): Promise<any> {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: GH(v) });
    if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 1500)); continue; }
    return r.ok ? r.json() : null;
  }
  return null;
}
async function ultimoContacto(contactId: string | null, tel: string): Promise<{ fecha: string; tipo: string; quien: string } | null | undefined> {
  if (!GHL || !LOC) return undefined;
  let cid = contactId;
  if (!cid && tel.length === 10) {
    const j = await ghl(`https://services.leadconnectorhq.com/contacts/search/duplicate?locationId=${LOC}&number=${encodeURIComponent("+1" + tel)}`, "2021-07-28");
    cid = j?.contact?.id ?? null;
  }
  if (!cid) return undefined;                       // no está en el CRM
  const conv = await ghl(`https://services.leadconnectorhq.com/conversations/search?locationId=${LOC}&contactId=${cid}`);
  let mejor: any = null;
  for (const c of conv?.conversations ?? []) {
    const m = await ghl(`https://services.leadconnectorhq.com/conversations/${c.id}/messages?limit=60`);
    for (const x of m?.messages?.messages ?? []) {
      if (x.direction !== "outbound" || !x.userId || !TIPOS.has(x.messageType)) continue;
      if (!mejor || x.dateAdded > mejor.dateAdded) mejor = x;
      break;                                        // vienen del más nuevo al más viejo
    }
  }
  if (!mejor) return null;
  const u = await usuarios();
  return { fecha: mejor.dateAdded, tipo: /CALL/.test(mejor.messageType) ? "📞" : "💬", quien: u[mejor.userId] || "" };
}

// Los mismos canales que usa discord-estado para el aviso de aprobada.
const CANAL_EQUIPO: Record<string, string> = {
  "call-center":       "1467924390657261579",   // #call-center-general
  "closers-orlando":   "1468209039685976075",   // #sales-team-orlando
  "closers-kissimmee": "1468208867086307359",   // #sales-team-kissimmee
};
const CANAL_TIENDA: Record<string, string> = {
  "orlando":   "1468209039685976075",
  "kissimmee": "1468208867086307359",
};
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const hoyNY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const diaNY = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const corta = (ymd: string) => { const p = ymd.split("-"); return `${+p[2]}/${+p[1]}`; };
const dias = (iso: string) => Math.max(0, Math.round((Date.parse(hoyNY()) - Date.parse(diaNY(iso))) / 864e5));

// Mención por nombre y apellido; con solo el nombre de pila se podría mencionar al equivocado.
async function mencionDe(nombre: string): Promise<string | null> {
  const partes = sinTildes(String(nombre || "")).split(/\s+/).filter((p) => p.length > 2);
  if (!BOT || !partes.length) return null;
  try {
    // Discord frena las búsquedas seguidas (429): se espera lo que pide y se reintenta.
    let r: Response | null = null;
    for (let i = 0; i < 4; i++) {
      r = await fetch(`https://discord.com/api/v10/guilds/${GUILD}/members/search?query=${encodeURIComponent(partes[0])}&limit=10`,
        { headers: { Authorization: `Bot ${BOT}` } });
      if (r.status !== 429) break;
      const j = await r.json().catch(() => ({}));
      await new Promise((ok) => setTimeout(ok, Math.ceil((Number(j.retry_after) || 1) * 1000) + 100));
    }
    if (!r || !r.ok) return null;
    const ms = await r.json();
    let mejor: any = null, puntos = 0;
    for (const m of Array.isArray(ms) ? ms : []) {
      const et = [m.nick, m.user?.global_name, m.user?.username].filter(Boolean).map(sinTildes);
      let p = 0; for (const x of partes) if (et.some((e: string) => e.includes(x))) p++;
      if (p > puntos) { puntos = p; mejor = m; }
    }
    return (mejor && puntos >= (partes.length > 1 ? 2 : 1)) ? `<@${mejor.user.id}>` : null;
  } catch { return null; }
}

let VISTA: { canal: string; content: string }[] | null = null;   // vista previa: no manda
async function publicar(canal: string, content: string): Promise<boolean> {
  if (VISTA) { VISTA.push({ canal, content }); return true; }
  const r = await fetch(`https://discord.com/api/v10/channels/${canal}/messages`, {
    method: "POST", headers: { Authorization: `Bot ${BOT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content, allowed_mentions: { parse: ["users"] } }),
  });
  return r.ok;
}

Deno.serve(async (req) => {
  try {
    if (!SUPA || !SERVICE || !BOT) return json({ ok: false, motivo: "sin_config" }, 500);
    let cuerpo: Record<string, unknown> = {};
    try { cuerpo = await req.json(); } catch { /* sin cuerpo */ }
    const h = Number(new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }));
    if (cuerpo.forzar !== true && !HORAS.includes(h)) return json({ ok: true, motivo: "fuera_de_hora", hora: h });
    // Prueba: todo va a un solo canal en vez de a los de los equipos.
    const soloCanal = typeof cuerpo.canal === "string" ? cuerpo.canal : "";
    VISTA = cuerpo.vista === true ? [] : null;

    const r = await fetch(`${SUPA}/rest/v1/rpc/ar_oa_pendientes_por_vender`, {
      method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: "{}",
    });
    const filas = await r.json();
    if (!Array.isArray(filas)) return json({ ok: false, motivo: "no_se_pudo_leer", detalle: filas }, 500);
    if (!filas.length) return json({ ok: true, enviados: 0 });

    // Último contacto de cada cliente, de 5 en 5 para no ahogar al CRM.
    for (let i = 0; i < filas.length; i += 5) {
      await Promise.all(filas.slice(i, i + 5).map(async (a: any) => {
        a.ult = await ultimoContacto(a.crm_contact_id, a.telefono || "");
      }));
    }
    // canal → vendedor → fichas
    const porCanal: Record<string, Record<string, any[]>> = {};
    for (const a of filas) {
      const canal = soloCanal || CANAL_EQUIPO[a.equipo] || CANAL_TIENDA[String(a.location || "").toLowerCase().trim()];
      if (!canal) continue;
      const vend = a.activo
        ? String(a.vendedor_nombre || "Sin vendedor").trim().toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())
        : SIN_NADIE;
      ((porCanal[canal] ??= {})[vend] ??= []).push(a);
    }

    const titulo = `**📋 Pendientes por vender — ${h < 13 ? "11am" : "4pm"} · ${corta(hoyNY())}**\nAprobadas y con posibilidad que todavía no han comprado. 📞/💬 = último contacto real (llamada o mensaje) y quién lo hizo.`;
    const enviados: string[] = [];
    for (const [canal, porVend] of Object.entries(porCanal)) {
      const bloques: string[] = [];
      for (const vend of Object.keys(porVend).sort((x, y) => (x === SIN_NADIE ? 1 : 0) - (y === SIN_NADIE ? 1 : 0) || x.localeCompare(y))) {
        const lista = porVend[vend].sort((x, y) => Date.parse(x.veredicto_at) - Date.parse(y.veredicto_at));
        const men = vend === SIN_NADIE ? `**${SIN_NADIE}** — el vendedor ya no está, hay que pasarlos a alguien` : await mencionDe(vend);
        const lineas = lista.map((a) => {
          const d = dias(a.veredicto_at);
          const que = a.veredicto === "aprobado" ? "✅ Aprobada" : "🟡 Posible";
          const nom = String(a.cliente_nombre || "").replace(/[\d()+-]{7,}/g, "").replace(/\s+/g, " ").trim();   // hay quien mete el teléfono en el nombre
          let ult = "";
          if (a.ult === undefined) ult = " · no está en el CRM";
          else if (a.ult === null || a.ult.fecha < a.veredicto_at) ult = " · ⚠️ nadie lo contacta desde la aprobación";
          else ult = ` · ${a.ult.tipo} ${corta(diaNY(a.ult.fecha))}${a.ult.quien ? " " + a.ult.quien : ""}`;
          const era = vend === SIN_NADIE ? ` (era de ${String(a.vendedor_nombre).split(" ")[0]})` : "";
          return `• ${nom}${era} — ${que} ${corta(diaNY(a.veredicto_at))} (${d === 0 ? "hoy" : d === 1 ? "1 día" : d + " días"})${a.vino ? " · vino, no compró" : ""}${ult}`;
        });
        bloques.push(`${men ?? `**${vend}**`} (${lista.length})\n${lineas.join("\n")}`);
      }
      // Discord corta a 2000 caracteres: se parte por vendedor, nunca a mitad de uno.
      let msg = titulo;
      for (const b of bloques) {
        if ((msg + "\n\n" + b).length > 1900) { if (await publicar(canal, msg)) enviados.push(canal); msg = b; }
        else msg += "\n\n" + b;
      }
      if (await publicar(canal, msg)) enviados.push(canal);
    }
    return json({ ok: true, pendientes: filas.length, mensajes: enviados.length, vista: VISTA });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
