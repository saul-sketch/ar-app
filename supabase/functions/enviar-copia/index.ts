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
};
const et = (c: string, v: string) => ET[c]?.[v] ?? v ?? "";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const money = (n: unknown) => (n === null || n === undefined || n === "") ? "—" : "$" + Math.round(Number(n)).toLocaleString("en-US");
const fono = (t: unknown) => { const d = String(t ?? "").replace(/\D/g, "").slice(-10); return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : String(t ?? ""); };

/** El vendedor tiene que existir como contacto para que el CRM le pueda escribir.
 *  Se busca primero; solo se crea si no está, y siempre con la etiqueta
 *  "interno-vendedor" para que se pueda excluir de cualquier campaña de marketing. */
async function contactoDelVendedor(email: string, nombre: string): Promise<string | null> {
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
  return c?.contact?.id ?? null;
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
        <div style="font-size:19px;font-weight:700">${esc(a.cliente_nombre)}</div>
        <div style="font-size:16px;color:#3b82f6;font-weight:600;margin-top:2px">${esc(fono(a.cliente_telefono))}</div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        ${fila("Quiere pagar mensual", money(a.pago_mensual))}
        ${fila("Down disponible hoy", money(a.down_hoy))}
        ${fila("Podría conseguir hasta", money(a.down_max))}
        ${a.down_cuando ? fila("¿Para cuándo?", a.down_cuando) : ""}
        ${fila("Trade-in", et("trade_in", a.trade_in))}
        ${a.trade_in === "debe" ? fila("VIN", a.trade_vin ?? "—") + fila("Payoff", money(a.trade_payoff)) : ""}
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
    const html = cuerpo(a, link);
    const asunto = `Online Application — ${a.cliente_nombre}`;
    const res = await mandar(contactId, a.vendedor_email, asunto, html);
    if (!res.ok) { await anotar(a.id, res.motivo!, res.detalle ?? ""); return json({ ...res, para: a.vendedor_email }, 200); }
    await anotar(a.id, "enviada", a.vendedor_email);

    // Copia opcional a Finance / Saúl, por si la quieren. Nunca frena la del vendedor.
    if (COPIA) {
      for (const dir of COPIA.split(",").map((x) => x.trim()).filter(Boolean)) {
        const cid = await contactoDelVendedor(dir, "Finance AR").catch(() => null);
        if (cid) await mandar(cid, dir, asunto, html).catch(() => {});
      }
    }
    return json({ ok: true, para: a.vendedor_email });
  } catch (e) {
    return json({ ok: false, motivo: "error", detalle: String((e as Error)?.message ?? e).slice(0, 200) }, 500);
  }
});
