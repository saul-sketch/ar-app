// documentos — sube, abre y borra los archivos del cliente (ID, talones, estados de
// cuenta) de una aplicación.
//
// Por qué existe esta función y no se sube directo desde el navegador: el bucket es
// PRIVADO y para escribir en él hace falta la llave de servicio. Esa llave no puede
// vivir en una página que cualquiera puede leer. Aquí sí, porque esto corre en el
// servidor. El navegador solo manda el archivo y su clave de acceso.
//
// Quién puede: un manager con su clave, o quien tenga el id Y el código de la
// aplicación — el vendedor que la acaba de llenar. Lo decide la base de datos
// (ar_oa_puede_docs), no esta función, para que la regla viva en un solo lugar.
//
// Los archivos NUNCA quedan públicos: para verlos se pide un enlace que dura 10
// minutos. Son documentos de identidad y bancarios de gente real.

const SUPA = Deno.env.get("SUPABASE_URL") ?? "";
const SVC  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "ar-oa-docs";
const MAX = 15 * 1024 * 1024;              // 15 MB, lo mismo que aguanta el de pólizas

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const H = { apikey: SVC, Authorization: `Bearer ${SVC}` };

// ¿Esta clave puede tocar los documentos de esta aplicación?
async function puede(codigo: string, id: string): Promise<boolean> {
  const r = await fetch(`${SUPA}/rest/v1/rpc/ar_oa_puede_docs`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ p_codigo: codigo, p_id: id }),
  });
  if (!r.ok) return false;
  return (await r.json()) === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!SUPA || !SVC) return json({ error: "sin_config" }, 500);
    const body = await req.json().catch(() => ({}));
    const accion = String(body.accion || "");
    const codigo = String(body.codigo || "").trim();
    const id     = String(body.id || "").trim();
    if (!codigo || !id) return json({ error: "faltan_datos" }, 400);
    if (!(await puede(codigo, id))) return json({ error: "sin_permiso" }, 403);

    if (accion === "subir") {
      const nombre = String(body.nombre || "documento").slice(0, 140);
      const tipo   = String(body.tipo || "application/octet-stream");
      const b64    = String(body.datos || "");
      if (!b64) return json({ error: "sin_archivo" }, 400);
      // El navegador manda el archivo en base64; ocupa ~4/3 de su tamaño real.
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      if (bin.length > MAX) return json({ error: "muy_grande" }, 413);

      const docId = "doc_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const limpio = nombre.replace(/[^\w.\- ]+/g, "_");
      const ruta = `${id}/${docId}-${limpio}`;
      const up = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${ruta}`, {
        method: "POST", headers: { ...H, "Content-Type": tipo, "x-upsert": "true" }, body: bin,
      });
      if (!up.ok) return json({ error: "no_subio", detalle: (await up.text()).slice(0, 200) }, 502);

      const doc = { id: docId, nombre, tipo, bytes: bin.length, ruta,
                    quien: String(body.quien || "").slice(0, 60) || null,
                    cuando: new Date().toISOString() };
      const add = await fetch(`${SUPA}/rest/v1/rpc/ar_oa_doc_add`, {
        method: "POST", headers: { ...H, "Content-Type": "application/json" },
        body: JSON.stringify({ p_codigo: codigo, p_id: id, p_doc: doc }),
      });
      if (!add.ok) {
        // No quedó anotado: se borra el archivo para no dejar basura suelta en el bucket.
        await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${ruta}`, { method: "DELETE", headers: H });
        return json({ error: "no_guardo" }, 502);
      }
      return json({ ok: true, doc });
    }

    if (accion === "ver") {
      const ruta = String(body.ruta || "");
      if (!ruta || !ruta.startsWith(id + "/")) return json({ error: "ruta_ajena" }, 403);
      const r = await fetch(`${SUPA}/storage/v1/object/sign/${BUCKET}/${ruta}`, {
        method: "POST", headers: { ...H, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 600 }),
      });
      if (!r.ok) return json({ error: "no_firmo" }, 502);
      const j = await r.json();
      return json({ url: SUPA + "/storage/v1" + j.signedURL });
    }

    if (accion === "borrar") {
      const docId = String(body.docId || "");
      const ruta  = String(body.ruta || "");
      if (!docId) return json({ error: "faltan_datos" }, 400);
      const del = await fetch(`${SUPA}/rest/v1/rpc/ar_oa_doc_del`, {
        method: "POST", headers: { ...H, "Content-Type": "application/json" },
        body: JSON.stringify({ p_codigo: codigo, p_id: id, p_doc_id: docId }),
      });
      if (!del.ok) return json({ error: "no_borro" }, 502);
      // El archivo se borra después de sacarlo de la lista: si esto falla queda un
      // archivo huérfano, que es mucho menos malo que una fila apuntando a la nada.
      if (ruta.startsWith(id + "/")) {
        await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${ruta}`, { method: "DELETE", headers: H });
      }
      return json({ ok: true });
    }

    return json({ error: "accion_desconocida" }, 400);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
