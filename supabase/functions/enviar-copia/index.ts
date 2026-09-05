// enviar-copia — le manda al vendedor la copia de su aplicación, apenas la somete.
//
// Manda por el CRM que Auto Republic YA paga (GoHighLevel). No hace falta contratar
// ningún servicio de correo aparte: se comprobó que el token del CRM puede enviar.
//
// Vive en el servidor y no en el navegador porque el token del CRM no puede quedar
// en una página pública.
//
// Si algo falla responde el motivo en vez de romperse: la aplicación ya quedó
// guardada y el vendedor ya tiene su link. Un problema de correo no puede parecerle
// un error suyo ni dejarlo esperando.

const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";
const GHL_LOC   = Deno.env.get("GHL_LOCATION") ?? "";
const COPIA     = Deno.env.get("CORREO_COPIA") ?? "";        // opcional: Finance / Saúl
const SUPA      = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITIO     = Deno.env.get("SITIO_URL") ?? "https://saul-sketch.github.io/ar-app/";
const DISCORD   = Deno.env.get("DISCORD_APLICACIONES") ?? "";   // canal de aplicaciones

const GHL = "https://services.leadconnectorhq.com";
const hGhl = (v = "2021-07-28") => ({
  Authorization: `Bearer ${GHL_TOKEN}`, Version: v, "Content-Type": "application/json",
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const ET: Record<string, Record<string, string>> = {
  trade_in: { no: "No tiene trade-in", pagado: "Sí, pagado", debe: "Sí, todavía debe dinero" },
  urgencia: { hoy: "Hoy", "2-3dias": "En los próximos 2–3 días", semana: "Esta semana", mes: "Este mes", sin_fecha: "No tiene fecha específica" },
  co_buyer: { solo: "Solo él/ella", ya_aplico: "Hay co-buyer y ya aplicó", no_aplico: "Hay co-buyer pero todavía no ha aplicado", podria: "Podría conseguir uno si fuera necesario" },
  tipo_carro: { sedan: "Sedan", suv: "SUV", pickup: "Pickup", tres_filas: "3 filas", economico: "Económico", abierto: "Abierto a opciones", especifico: "Vehículo específico" },
  placa: { nueva: "Tablilla nueva", transferencia: "Transferencia de placa", no_sabe: "No sabe todavía" },
};
const et = (c: string, v: string) => ET[c]?.[v] ?? v ?? "";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const money = (n: unknown) => (n === null || n === undefined || n === "") ? "—" : "$" + Math.round(Number(n)).toLocaleString("en-US");
const fono = (t: unknown) => { const d = String(t ?? "").replace(/\D/g, "").slice(-10); return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : String(t ?? ""); };
// Hora del este (Orlando): para hablar con un cliente hace falta la hora real.
const fechaHora = (iso: string) => {
  try{
    const d = new Date(iso);
    const f = d.toLocaleDateString("es-ES", { timeZone:"America/New_York", day:"numeric", month:"short" });
    const h = d.toLocaleTimeString("es-ES", { timeZone:"America/New_York", hour:"numeric", minute:"2-digit", hour12:true });
    return f + " · " + h.replace("a. m.","am").replace("p. m.","pm");
  }catch(_e){ return ""; }
};

/** El vendedor tiene que existir como contacto para que el CRM le pueda escribir.
 *  Se busca primero; solo se crea si no está, y siempre con la etiqueta
 *  "interno-vendedor" para que se pueda excluir de cualquier campaña de marketing. */
async function contactoDelVendedor(emailCrudo: string, nombre: string): Promise<string | null> {
  // En minúsculas SIEMPRE. La busqueda del CRM distingue mayusculas: Anthony escribio
  // "Anthony@auto-republic.com" y su contacto existia como "anthony@...", asi que no lo
  // encontro, intento crearlo y el CRM lo rechazo por duplicado. Un correo es el mismo
  // se escriba como se escriba.
  const email = String(emailCrudo || "").trim().toLowerCase();
  if (!email) return null;

  const b = await fetch(`${GHL}/contacts/search`, {
    method: "POST", headers: hGhl(),
    body: JSON.stringify({ locationId: GHL_LOC, pageLimit: 1,
      filters: [{ field: "email", operator: "eq", value: email }] }),
  }).then((r) => r.json()).catch(() => null);
  const hallado = b?.contacts?.[0]?.id;
  if (hallado) return hallado;

  const partes = String(nombre || "").trim().split(/\s+/);
  const c = await fetch(`${GHL}/contacts/`, {
    method: "POST", headers: hGhl(),
    body: JSON.stringify({
      locationId: GHL_LOC, email,
      firstName: partes[0] || "Vendedor",
      lastName: partes.slice(1).join(" ") || "AR",
      tags: ["interno-vendedor"],
      source: "Online Application",
    }),
  }).then((r) => r.json()).catch(() => null);
  const creado = c?.contact?.id;
  // Si aun asi choca por duplicado, el propio error trae el id del que ya existe.
  // Sin esto se perdia el correo por una diferencia de mayusculas.
  if (!creado) return c?.meta?.contactId ?? null;

  // El CRM tiene 81 automatizaciones publicadas, varias de nurturing. Un vendedor que
  // entra como contacto nuevo puede acabar recibiendo publicidad de comprar carro.
  // Se le apagan SMS, llamadas y WhatsApp de una vez. El email se deja vivo a
  // proposito: es el canal por el que le mandamos su copia.
  await fetch(`${GHL}/contacts/${creado}`, {
    method: "PUT", headers: hGhl(),
    body: JSON.stringify({ dndSettings: {
      SMS:      { status: "active", message: "Vendedor interno — no es cliente", code: "101" },
      Call:     { status: "active", message: "Vendedor interno — no es cliente", code: "101" },
      WhatsApp: { status: "active", message: "Vendedor interno — no es cliente", code: "101" },
    } }),
  }).catch(() => {});
  return creado;
}

/** Encontrar el lead del cliente en el CRM, por telefono. Importa el formato: con
 *  "contains" y 10 digitos no encuentra nada; hay que buscar +1 y los 10, exacto. */
async function leadDelCliente(tel: string): Promise<string | null> {
  const d = String(tel || "").replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return null;
  const r = await fetch(`${GHL}/contacts/search`, {
    method: "POST", headers: hGhl(),
    body: JSON.stringify({ locationId: GHL_LOC, pageLimit: 1,
      filters: [{ field: "phone", operator: "eq", value: "+1" + d }] }),
  }).then((x) => x.json()).catch(() => null);
  return r?.contacts?.[0]?.id ?? null;
}

/** Dejar la nota en el lead, con el link. Asi Finance ve la aplicacion desde el CRM,
 *  donde ya trabaja, sin que nadie tenga que pegar nada a mano. */
async function notaEnElLead(contactId: string, a: Record<string, any>, link: string) {
  const tipos = (a.tipo_carro ?? []).filter((t: string) => t !== "especifico").map((t: string) => et("tipo_carro", t));
  if (a.vehiculo_especifico) tipos.push(a.vehiculo_especifico);
  const txt = [
    "APLICACION ONLINE — " + link,
    "",
    `La lleno: ${a.vendedor_nombre}${a.location ? " (" + a.location + ")" : ""}`,
    `Enviada: ${fechaHora(a.created_at)}`,
    a.deal_number ? `Deal #${a.deal_number}` : "",
    "",
    `Quiere pagar: ${money(a.pago_mensual)} al mes`,
    `Down hoy: ${money(a.down_hoy)}` + (a.down_max ? ` · podria llegar a ${money(a.down_max)}` : ""),
    a.down_cuando ? `Lo tendria: ${a.down_cuando}` : "",
    `Trade-in: ${et("trade_in", a.trade_in)}` + (a.trade_in === "debe" ? ` · debe ${money(a.trade_payoff)}` : ""),
    `Placa: ${et("placa", a.placa)}`,
    `Necesita comprar: ${et("urgencia", a.urgencia)}`,
    tipos.length ? `Busca: ${tipos.join(" · ")}` : "",
    `Co-buyer: ${et("co_buyer", a.co_buyer)}`,
    a.notas ? "\nLo que dijo el cliente: " + a.notas : "",
  ].filter(Boolean).join("\n");
  const r = await fetch(`${GHL}/contacts/${contactId}/notes`, {
    method: "POST", headers: hGhl(), body: JSON.stringify({ body: txt }),
  }).then((x) => x.json()).catch(() => null);
  return r?.note?.id ?? null;
}

function cuerpo(a: Record<string, any>, link: string) {
  const tipos = (a.tipo_carro ?? []).filter((t: string) => t !== "especifico").map((t: string) => et("tipo_carro", t));
  if (a.vehiculo_especifico) tipos.push(a.vehiculo_especifico);
  const fila = (k: string, v: string) =>
    `<tr><td style="padding:9px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px">${esc(k)}</td>
         <td style="padding:9px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;font-size:15px">${esc(v)}</td></tr>`;
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111827">
    <div style="background:#1a1a2e;color:#fff;border-radius:14px 14px 0 0;padding:20px">
      <div style="font-size:18px;font-weight:700">Online Application</div>
      <div style="font-size:12px;opacity:.7;margin-top:3px">Finance Handoff · Auto Republic</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 14px 14px;padding:20px">
      <div style="background:#f3f4f6;border-radius:10px;padding:14px;margin-bottom:16px">
        <div style="font-size:19px;font-weight:700">${esc(a.cliente_nombre)}${a.deal_number ? ` <span style="font-size:14px;color:#3b82f6;background:#dbeafe;border-radius:6px;padding:2px 8px">Deal #${esc(a.deal_number)}</span>` : ""}</div>
        <div style="font-size:16px;color:#3b82f6;font-weight:600;margin-top:2px">${esc(fono(a.cliente_telefono))}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:6px">Enviada ${esc(fechaHora(a.created_at))}</div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        ${fila("Quiere pagar mensual", money(a.pago_mensual))}
        ${fila("Down disponible hoy", money(a.down_hoy))}
        ${fila("Podría conseguir hasta", money(a.down_max))}
        ${a.down_cuando ? fila("¿Para cuándo?", a.down_cuando) : ""}
        ${fila("Trade-in", et("trade_in", a.trade_in))}
        ${a.trade_in === "debe" ? fila("VIN", a.trade_vin ?? "—") + fila("Payoff", money(a.trade_payoff)) : ""}
        ${fila("Placa", et("placa", a.placa))}
        ${fila("Necesita comprar", et("urgencia", a.urgencia))}
        ${fila("Busca", tipos.join(" · ") || "—")}
        ${fila("Co-buyer", et("co_buyer", a.co_buyer))}
      </table>
      ${a.notas ? `<div style="background:#fffbeb;border-left:3px solid #f59e0b;border-radius:8px;padding:12px;margin-top:14px;font-size:14px;line-height:1.55">${esc(a.notas)}</div>` : ""}
      <a href="${esc(link)}" style="display:block;text-align:center;background:#1a1a2e;color:#fff;text-decoration:none;padding:14px;border-radius:10px;font-weight:700;margin-top:18px">Abrir la aplicación</a>
      <div style="text-align:center;color:#9ca3af;font-size:12px;margin-top:10px">${esc(link)}</div>
    </div>
  </div>`;
}

async function mandar(contactId: string, para: string, asunto: string, html: string) {
  const r = await fetch(`${GHL}/conversations/messages`, {
    method: "POST", headers: hGhl("2021-04-15"),
    body: JSON.stringify({ type: "Email", contactId, emailTo: para, subject: asunto, html }),
  });
  const j = await r.json().catch(() => ({}));
  if (j?.messageId || j?.conversationId) return { ok: true };
  // "se dio de baja" es lo más común y tiene arreglo distinto a un fallo técnico:
  // hay que resuscribirlo en el CRM, no reintentar.
  const dado_de_baja = String(j?.canonicalCode ?? "").includes("UNSUBSCRIBED");
  return { ok: false, motivo: dado_de_baja ? "dado_de_baja" : "correo_rechazado",
           detalle: String(j?.message ?? "").slice(0, 200) };
}

/** Deja escrito si la copia salió o no. Sin esto un correo que falla es un
 *  silencio: el vendedor ve un aviso y quizá lo ignora, y nadie mas se entera. */
async function anotar(id: string, estado: string, detalle = "") {
  await fetch(`${SUPA}/rest/v1/ar_online_applications?id=eq.${id}`, {
    method: "PATCH",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ copia_estado: estado, copia_detalle: detalle.slice(0, 300), copia_at: new Date().toISOString() }),
  }).catch(() => {});
}

/** Avisar al canal de Discord. Se manda de una vez al someter: es lo unico que hace
 *  que alguien se entere sin tener que abrir el panel. Nunca frena nada — si no hay
 *  canal configurado o falla, la aplicacion ya quedo guardada igual. */
async function aDiscord(a: Record<string, any>, link: string) {
  if (!DISCORD) return;
  const urg = et("urgencia", a.urgencia);
  const corre = a.urgencia === "hoy" || a.urgencia === "2-3dias";
  const campos = [
    { name: "Vendedor", value: `${a.vendedor_nombre}${a.location ? " · " + a.location : ""}`, inline: true },
    { name: "Necesita comprar", value: urg || "—", inline: true },
    { name: "Mensual", value: money(a.pago_mensual), inline: true },
    { name: "Down hoy", value: money(a.down_hoy), inline: true },
    { name: "Trade-in", value: et("trade_in", a.trade_in) || "—", inline: true },
    { name: "Placa", value: et("placa", a.placa) || "—", inline: true },
  ];
  if (a.visita_fecha) campos.push({ name: "Viene al dealer", value: `${a.visita_fecha}${a.visita_hora ? " · " + a.visita_hora : ""}`, inline: true });
  if (a.deal_number) campos.push({ name: "Deal #", value: String(a.deal_number), inline: true });
  if (a.notas) campos.push({ name: "Lo que dijo el cliente", value: String(a.notas).slice(0, 900), inline: false });

  // ?wait=true hace que Discord devuelva el mensaje que acaba de crear. Se guarda su id
  // para poder EDITAR este mismo mensaje cuando Finance ponga el veredicto, en vez de
  // publicar otro aparte: así el canal tiene una tarjeta por aplicación, siempre al día.
  try {
    const r = await fetch(DISCORD + "?wait=true", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: corre ? "**Compra ya** — conviene mirarla pronto" : "",
        embeds: [{
          title: `${a.cliente_nombre}${a.deal_number ? " · #" + a.deal_number : ""}`,
          url: link,
          description: `${fono(a.cliente_telefono)}\nEnviada ${fechaHora(a.created_at)}`,
          color: corre ? 0xef4444 : 0x1a1a2e,
          fields: campos,
          footer: { text: "Aplicación online · Auto Republic" },
        }],
      }),
    });
    if (r.ok) {
      const msg = await r.json().catch(() => null);
      if (msg?.id) {
        await fetch(`${SUPA}/rest/v1/rpc/ar_oa_discord_id`, {
          method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
          body: JSON.stringify({ p_id: a.id, p_msg: String(msg.id) }),
        }).catch(() => {});
      }
    }
  } catch (_) { /* el aviso nunca puede frenar la aplicación, que ya está guardada */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { codigo } = await req.json();
    if (!codigo) return json({ ok: false, motivo: "sin_codigo" }, 400);
    if (!GHL_TOKEN || !GHL_LOC) return json({ ok: false, motivo: "sin_llave" });

    const r = await fetch(`${SUPA}/rest/v1/ar_online_applications?codigo=eq.${encodeURIComponent(codigo)}&select=*`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
    const [a] = await r.json();
    if (!a) return json({ ok: false, motivo: "no_existe" }, 404);

    const contactId = await contactoDelVendedor(a.vendedor_email, a.vendedor_nombre);
    if (!contactId) { await anotar(a.id, "sin_contacto"); return json({ ok: false, motivo: "sin_contacto" }, 502); }

    const link = SITIO.replace(/\/?$/, "/") + a.codigo;
    // Primero el aviso: es lo que hace que alguien se entere. No espera al correo.
    aDiscord(a, link).catch(() => {});
    const html = cuerpo(a, link);
    const asunto = `Online Application — ${a.cliente_nombre}` + (a.deal_number ? ` (Deal #${a.deal_number})` : "");
    const destino = String(a.vendedor_email || "").trim().toLowerCase();
    const res = await mandar(contactId, destino, asunto, html);
    if (!res.ok) { await anotar(a.id, res.motivo!, res.detalle ?? ""); return json({ ...res, para: destino }, 200); }
    await anotar(a.id, "enviada", destino);

    // Enganchar con el lead del CRM y dejarle la nota. Va DESPUES del correo y sin
    // frenarlo: si el cliente no esta en el CRM (pasa en 1 de cada 4) no es un error,
    // simplemente no hay a quien pegarle la nota.
    try{
      if (!a.crm_contact_id) {
        const cid = await leadDelCliente(a.cliente_telefono);
        if (cid) {
          const nid = await notaEnElLead(cid, a, link);
          await fetch(`${SUPA}/rest/v1/ar_online_applications?id=eq.${a.id}`, {
            method: "PATCH",
            headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ crm_contact_id: cid, crm_nota_id: nid }),
          }).catch(() => {});
        }
      }
    }catch(_e){ /* nunca frena la copia */ }

    // Copia opcional a Finance / Saúl, por si la quieren. Nunca frena la del vendedor.
    if (COPIA) {
      for (const dir of COPIA.split(",").map((x) => x.trim()).filter(Boolean)) {
        const cid = await contactoDelVendedor(dir, "Finance AR").catch(() => null);
        if (cid) await mandar(cid, dir, asunto, html).catch(() => {});
      }
    }
    return json({ ok: true, para: destino });
  } catch (e) {
    return json({ ok: false, motivo: "error", detalle: String((e as Error)?.message ?? e).slice(0, 200) }, 500);
  }
});
