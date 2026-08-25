// enviar-copia — le manda al vendedor la copia de su aplicación, apenas la somete.
//
// Vive aquí y no en el navegador por una razón: la llave del servicio de correo no
// puede quedar en una página pública. El formulario solo dice "manda la del código
// K7M2X9"; esta función busca la aplicación y arma el correo.
//
// Si no hay llave configurada responde {ok:false, motivo:"sin_llave"} en vez de
// romperse — el formulario ya guardó la aplicación y no debe fallarle al vendedor
// por un correo. Un vacío nunca debe verse como un error de él.

const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const DESDE  = Deno.env.get("CORREO_DESDE") ?? "Auto Republic <onboarding@resend.dev>";
const COPIA  = Deno.env.get("CORREO_COPIA") ?? "";           // opcional: Finance / Saúl
const SUPA   = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITIO  = Deno.env.get("SITIO_URL") ?? "https://saul-sketch.github.io/ar-app/";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { codigo } = await req.json();
    if (!codigo) return json({ ok: false, motivo: "sin_codigo" }, 400);
    if (!RESEND) return json({ ok: false, motivo: "sin_llave" });   // no es un error del vendedor

    const r = await fetch(`${SUPA}/rest/v1/ar_online_applications?codigo=eq.${encodeURIComponent(codigo)}&select=*`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
    const [a] = await r.json();
    if (!a) return json({ ok: false, motivo: "no_existe" }, 404);

    const link = SITIO.replace(/\/?$/, "/") + a.codigo;
    const env = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: DESDE,
        to: [a.vendedor_email],
        ...(COPIA ? { bcc: COPIA.split(",").map((x) => x.trim()).filter(Boolean) } : {}),
        subject: `Online Application — ${a.cliente_nombre}`,
        html: cuerpo(a, link),
      }),
    });
    if (!env.ok) return json({ ok: false, motivo: "correo_rechazado", detalle: (await env.text()).slice(0, 300) }, 502);
    return json({ ok: true, para: a.vendedor_email });
  } catch (e) {
    return json({ ok: false, motivo: "error", detalle: String((e as Error)?.message ?? e).slice(0, 200) }, 500);
  }
});
