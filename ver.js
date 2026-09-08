/* Dibuja UNA aplicación — la que abre el link. Compartido por a.html y 404.html. */
const dato = (k, v, resalta) => `<div class="dato"><div class="k">${k}</div><div class="v ${v?'':'muted'}" ${resalta?'style="color:'+resalta+'"':''}>${v ? esc(v) : '— sin dato'}</div></div>`;

/* ── Quién está abriendo ──────────────────────────────────────────────────────
   Esta ficha trae el teléfono del cliente, cuánto puede pagar, cuánto tiene de
   down y el payoff de su trade. Antes se abría con solo tener el código de 6
   letras, y ese link viaja por Discord y por correo: un reenvío o una captura
   lo abría. Ahora el servidor solo la entrega si eres manager o si la
   aplicación la sometiste tú. Se recuerda en este navegador para no preguntar
   cada vez. */
const LLAVE_CODIGO = 'ar_oa_codigo';   // el mismo que usa el panel
const LLAVE_SESION = 'ar_oa_sesion';
const leerG = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };

(async () => {
  const out = document.getElementById('out');
  const q = new URLSearchParams(location.search);
  // El link corto es .../ar-app/K7M2X9 — GitHub Pages no lo reconoce como archivo y
  // cae aquí (404.html). También se aceptan ?c= y el ?id= viejo, por si acaso.
  const ultimo = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
  const codigo = q.get('c') || (/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5,10}$/i.test(ultimo) ? ultimo : '');
  const id = q.get('id');
  if (!codigo && !id) { out.innerHTML = '<div class="vacio">Link incompleto.</div>'; return; }

  function quienSoy() {
    const porUrl = (q.get('email') || '').trim().toLowerCase();
    if (porUrl) { try { localStorage.setItem(LLAVE_SESION, JSON.stringify({ email: porUrl })); } catch (e) {} }
    let ses = null; try { ses = JSON.parse(leerG(LLAVE_SESION) || 'null'); } catch (e) {}
    return { codigo: leerG(LLAVE_CODIGO), email: porUrl || ((ses && ses.email) || '') };
  }

  async function traer() {
    const yo = quienSoy();
    if (!yo.codigo && !yo.email) return 'sin_identidad';
    try {
      const r = codigo
        ? await rpc('ar_oa_por_codigo', { p_codigo: codigo, p_codigo_usuario: yo.codigo || null, p_email: yo.email || null })
        : await rpc('ar_oa_una',        { p_id: id,        p_codigo_usuario: yo.codigo || null, p_email: yo.email || null });
      return (r && r[0]) || 'no_es_tuya';
    } catch (e) { return 'no_es_tuya'; }
  }

  function pedirIdentidad(aviso) {
    out.innerHTML = `
      <div class="sect" style="max-width:380px;margin:0 auto;">
        <h2>¿Quién eres?</h2>
        <div style="font-size:13px;color:var(--gray-500);line-height:1.5;margin:6px 0 14px;">
          Esta aplicación trae datos del cliente. Solo la abre quien la sometió, o un manager.
        </div>
        ${aviso ? `<div style="background:#fef2f2;border-left:3px solid var(--red);border-radius:8px;padding:10px 12px;font-size:13px;color:#991b1b;margin-bottom:12px;">${esc(aviso)}</div>` : ''}
        <input id="yoCampo" placeholder="Tu correo del trabajo, o tu código"
               style="width:100%;padding:12px 14px;font-size:15px;border:1px solid var(--gray-300);border-radius:10px;box-sizing:border-box;"
               autocapitalize="off" autocorrect="off" spellcheck="false">
        <button id="yoBtn" style="width:100%;margin-top:10px;padding:12px;font-size:15px;font-weight:700;color:#fff;background:var(--blue);border:0;border-radius:10px;cursor:pointer;">Abrir</button>
      </div>`;
    const campo = document.getElementById('yoCampo');
    const entrar = () => {
      const v = (campo.value || '').trim();
      if (!v) return;
      try {
        if (v.indexOf('@') > 0) localStorage.setItem(LLAVE_SESION, JSON.stringify({ email: v.toLowerCase() }));
        else localStorage.setItem(LLAVE_CODIGO, v.toUpperCase());
      } catch (e) {}
      arrancar();
    };
    document.getElementById('yoBtn').onclick = entrar;
    campo.onkeydown = (ev) => { if (ev.key === 'Enter') entrar(); };
    campo.focus();
  }

  function pintar(a) {
  const urg = URGENCIA_COLOR[a.urgencia] || 'gris';
  const colorUrg = urg === 'rojo' ? 'var(--red)' : urg === 'ambar' ? '#b45309' : '';
  const tipos = (a.tipo_carro || []).filter(t => t !== 'especifico').map(t => et('tipo_carro', t));
  if (a.vehiculo_especifico) tipos.push(a.vehiculo_especifico);

  out.innerHTML = `
    <div class="cab">
      <div class="nombre">${esc(a.cliente_nombre)}${a.deal_number ? ` <span style="font-size:14px;font-weight:700;color:#3b82f6;background:#dbeafe;border-radius:6px;padding:2px 8px;margin-left:6px;vertical-align:middle">Deal #${esc(a.deal_number)}</span>` : ''}</div>
      <a class="tel" href="tel:${esc(String(a.cliente_telefono).replace(/\D/g,''))}">${esc(tel(a.cliente_telefono))}</a>
      <div class="meta">Lo llenó <strong>${esc(a.vendedor_nombre)}</strong>${a.location ? ' · ' + esc(a.location) : ''}<br>${esc(fechaHora(a.created_at))} · ${esc(cuandoRelativo(a.created_at))}</div>
    </div>

    <div class="sect"><h2>El dinero</h2>
      ${dato('Quiere pagar mensual', dinero(a.pago_mensual))}
      ${dato('Down disponible hoy', dinero(a.down_hoy))}
      ${dato('Podría conseguir hasta', dinero(a.down_max))}
      ${dato('¿Para cuándo lo tendría?', a.down_cuando)}
    </div>

    <div class="sect"><h2>Trade-in</h2>
      ${dato('¿Tiene?', et('trade_in', a.trade_in))}
      ${a.trade_in === 'debe' ? dato('VIN', a.trade_vin) + dato('Millas', millas(a.trade_millas)) + dato('Payoff aproximado', dinero(a.trade_payoff)) : ''}
      ${dato('Placa', et('placa', a.placa))}
    </div>

    <div class="sect"><h2>Cuándo y qué</h2>
      ${dato('Necesita comprar', et('urgencia', a.urgencia), colorUrg)}
      ${dato('Puede venir al dealer', [fechaLarga(a.visita_fecha), a.visita_hora].filter(Boolean).join(' · '))}
      ${dato('Busca', tipos.join(' · '))}
      ${dato('Co-buyer / co-signer', et('co_buyer', a.co_buyer))}
    </div>

    ${a.notas ? `<div class="sect"><h2>Lo que Finance debe saber</h2><div class="notas">${esc(a.notas)}</div></div>` : ''}
  `;
  }

  async function arrancar() {
    out.innerHTML = '<div class="cargando">Cargando…</div>';
    const r = await traer();
    if (r === 'sin_identidad') return pedirIdentidad('');
    if (r === 'no_es_tuya') {
      // Se limpia lo guardado: si lo escribió mal, que pueda volver a intentar.
      try { localStorage.removeItem(LLAVE_SESION); localStorage.removeItem(LLAVE_CODIGO); } catch (e) {}
      return pedirIdentidad('Esa aplicación no es tuya, o el correo o el código no es el bueno.');
    }
    pintar(r);
  }
  await arrancar();
})();
