// discord-estado — mantiene al día la tarjeta de Discord de una aplicación.
//
// Cuando Finance pone un veredicto o escribe una nota, se EDITA el mismo mensaje que
// se publicó al someter la aplicación: cambia de color, aparece el veredicto con quién
// lo puso, y la última nota. Un mensaje por aplicación, siempre al día — en vez de un
// canal lleno de avisos sueltos que hay que ir juntando a mano.
//
// Editar un mensaje NO le avisa a nadie. Por eso, cuando lo que cambió es el veredicto
// (que es la noticia), se publica además una línea corta: es lo que hace sonar el
// teléfono. Las notas solo actualizan la tarjeta, sin ruido.

const SUPA     = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DISCORD  = Deno.env.get("DISCORD_APLICACIONES") ?? "";
// Canales donde están los vendedores, uno por tienda. Al vendedor le importa UNA cosa:
// si puede llamar al cliente y traerlo. Por eso el aviso va a su canal y no al de
// Finance, que es donde se discute el crédito.
const CANAL_TIENDA: Record<string, string> = {
  "orlando":   Deno.env.get("DISCORD_VEND_ORLANDO") ?? "",
  "kissimmee": Deno.env.get("DISCORD_VEND_KISSIMMEE") ?? "",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

const VER = {
  aprobado:  { txt: "APROBADA",        color: 0x16a34a, emoji: "✅" },
  posible:   { txt: "CON POSIBILIDAD", color: 0xf59e0b, emoji: "🟡" },
  negado:    { txt: "NEGADA",          color: 0xef4444, emoji: "❌" },
  historico: { txt: "Historial",       color: 0x6b7280, emoji: "📁" },
} as Record<string, { txt: string; color: number; emoji: string }>;

const money = (n: unknown) =>
  (n === null || n === undefined || n === "") ? "—" : "$" + Math.round(Number(n)).toLocaleString("en-US");
const fono = (t: unknown) => {
  const d = String(t ?? "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : String(t ?? "—");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!SUPA || !SERVICE) return json({ ok: false, motivo: "sin_config" }, 500);
    if (!DISCORD) return json({ ok: false, motivo: "sin_canal" });

    const { codigo, id } = await req.json().catch(() => ({}));
    if (!codigo || !id) return json({ ok: false, motivo: "faltan_datos" }, 400);

    // Solo un manager con clave válida puede mover la tarjeta del canal.
    const qq = await fetch(`${SUPA}/rest/v1/rpc/ar_oa_quien`, {
      method: "POST", headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ p_codigo: codigo }),
    });
    const quien = qq.ok ? await qq.json() : null;
    if (!quien) return json({ ok: false, motivo: "sin_permiso" }, 403);

    const r = await fetch(`${SUPA}/rest/v1/ar_online_applications?id=eq.${id}&select=*`, { headers: H });
    const filas = r.ok ? await r.json() : [];
    const a = filas[0];
    if (!a) return json({ ok: false, motivo: "no_existe" }, 404);
    // Las aplicaciones de antes de esta función no tienen tarjeta que editar. En vez de
    // quedarse callado —que sería lo peor: Finance aprueba y el canal no dice nada— se
    // publica una tarjeta nueva y se guarda su id, para que de ahí en adelante se edite.
    let msgId: string | null = a.discord_msg_id || null;

    const v = a.veredicto ? VER[a.veredicto] : null;
    const notas = (a.bitacora || []).filter((x: any) => x && x.tipo !== "etapa" && x.tipo !== "veredicto");
    const ultima = notas[notas.length - 1];

    const campos: Array<Record<string, unknown>> = [
      { name: "Vendedor", value: `${a.vendedor_nombre ?? "—"}${a.location ? " · " + a.location : ""}`, inline: true },
      { name: "Mensual", value: money(a.pago_mensual), inline: true },
      { name: "Down hoy", value: money(a.down_hoy), inline: true },
    ];
    if (v) {
      campos.push({ name: "Veredicto", inline: false,
        value: `${v.emoji} **${v.txt}**` + (a.veredicto_por ? ` — ${a.veredicto_por}` : "") });
    }
    const fico = a.fico ?? a.fico_txt;
    const ficoCo = a.fico_co ?? a.fico_co_txt;
    if (fico || ficoCo) {
      campos.push({ name: "FICO", inline: true,
        value: `${fico ?? "—"}${ficoCo ? ` · co-signer ${ficoCo}` : ""}` });
    }
    if (a.deal_number) campos.push({ name: "Deal #", value: String(a.deal_number), inline: true });
    if (ultima?.texto) {
      campos.push({ name: `Última nota${ultima.quien ? " · " + ultima.quien : ""}`,
                    value: String(ultima.texto).slice(0, 900), inline: false });
    }
    if ((a.docs || []).length) {
      campos.push({ name: "Documentos", value: `${a.docs.length} archivo(s) cargado(s)`, inline: true });
    }

    const embed = {
      title: `${a.cliente_nombre}${a.deal_number ? " · #" + a.deal_number : ""}`,
      url: `https://saul-sketch.github.io/ar-app/${a.codigo}`,
      description: `${fono(a.cliente_telefono)}`,
      color: v ? v.color : 0x1a1a2e,
      fields: campos,
      footer: { text: v ? `Revisada · ${quien}` : "Aplicación online · Auto Republic" },
    };

    if (msgId) {
      const ed = await fetch(`${DISCORD}/messages/${msgId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });
      // Si el mensaje ya no existe (alguien lo borró del canal), se publica uno nuevo.
      if (!ed.ok) msgId = null;
    }
    if (!msgId) {
      const nu = await fetch(DISCORD + "?wait=true", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });
      if (!nu.ok) return json({ ok: false, motivo: "no_publico" });
      const m = await nu.json().catch(() => null);
      if (m?.id) {
        msgId = String(m.id);
        await fetch(`${SUPA}/rest/v1/rpc/ar_oa_discord_id`, {
          method: "POST", headers: { ...H, "Content-Type": "application/json" },
          body: JSON.stringify({ p_id: a.id, p_msg: msgId }),
        }).catch(() => {});
      }
    }

    // Editar no notifica. Si lo que cambió es el veredicto, va una línea corta aparte
    // para que suene; las notas no arman ruido en el canal.
    if (v && a.veredicto !== "historico") {
      await fetch(DISCORD, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `${v.emoji} **${a.cliente_nombre}** — ${v.txt}${a.veredicto_por ? ` · ${a.veredicto_por}` : ""}` +
                   `${ultima?.texto ? `\n> ${String(ultima.texto).slice(0, 300)}` : ""}`,
        }),
      }).catch(() => {});
    }
    // Avisarle al vendedor en el canal de su tienda. Solo cuando hay veredicto: una
    // nota suelta no le sirve de nada si todavía no le dijeron sí o no.
    if (v && a.veredicto !== "historico") {
      const canal = CANAL_TIENDA[String(a.location || "").toLowerCase().trim()];
      if (canal) {
        const quéHacer = a.veredicto === "aprobado"
          ? "Llama al cliente y tráelo."
          : a.veredicto === "posible"
            ? "Falta algo para cerrarla — mira la nota."
            : "No pasó. Si consigues co-signer o más down, avísale a Finance.";
        await fetch(canal, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            embeds: [{
              title: `${v.emoji} ${a.cliente_nombre} — ${v.txt}`,
              url: `https://saul-sketch.github.io/ar-app/${a.codigo}`,
              description: `**${a.vendedor_nombre ?? "—"}** · ${fono(a.cliente_telefono)}\n${quéHacer}`,
              color: v.color,
              fields: ultima?.texto
                ? [{ name: "Nota de Finance", value: String(ultima.texto).slice(0, 600), inline: false }]
                : [],
              footer: { text: `Revisada por ${a.veredicto_por ?? quien}` },
            }],
          }),
        }).catch(() => {});
      }
    }
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, motivo: String((e as Error)?.message || e) }, 500);
  }
});
