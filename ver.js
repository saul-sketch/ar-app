/* Dibuja UNA aplicación — la que abre el link. Compartido por a.html y 404.html. */
const dato = (k, v, resalta) => `<div class="dato"><div class="k">${k}</div><div class="v ${v?'':'muted'}" ${resalta?'style="color:'+resalta+'"':''}>${v ? esc(v) : '— sin dato'}</div></div>`;

(async () => {
  const out = document.getElementById('out');
  const q = new URLSearchParams(location.search);
  // El link corto es .../ar-app/K7M2X9 — GitHub Pages no lo reconoce como archivo y
  // cae aquí (404.html). También se aceptan ?c= y el ?id= viejo, por si acaso.
  const ultimo = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
  const codigo = q.get('c') || (/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5,10}$/i.test(ultimo) ? ultimo : '');
  const id = q.get('id');
  if (!codigo && !id){ out.innerHTML = '<div class="vacio">Link incompleto.</div>'; return; }
  let a;
  try{
    [a] = codigo ? await rpc('ar_oa_por_codigo', { p_codigo: codigo })
                 : await rpc('ar_oa_una', { p_id: id });
  }catch(e){}
  if (!a){ out.innerHTML = '<div class="vacio">No se encontró esta aplicación.<br>Puede que el link esté mal copiado.</div>'; return; }

  const urg = URGENCIA_COLOR[a.urgencia] || 'gris';
  const colorUrg = urg === 'rojo' ? 'var(--red)' : urg === 'ambar' ? '#b45309' : '';
  const tipos = (a.tipo_carro || []).filter(t => t !== 'especifico').map(t => et('tipo_carro', t));
  if (a.vehiculo_especifico) tipos.push(a.vehiculo_especifico);

  out.innerHTML = `
    <div class="cab">
      <div class="nombre">${esc(a.cliente_nombre)}${a.deal_number ? ` <span style="font-size:14px;font-weight:700;color:#3b82f6;background:#dbeafe;border-radius:6px;padding:2px 8px;margin-left:6px;vertical-align:middle">Deal #${esc(a.deal_number)}</span>` : ''}</div>
      <a class="tel" href="tel:${esc(String(a.cliente_telefono).replace(/\D/g,''))}">${esc(tel(a.cliente_telefono))}</a>
      <div class="meta">Lo llenó <strong>${esc(a.vendedor_nombre)}</strong>${a.location ? ' · ' + esc(a.location) : ''} · ${esc(cuandoRelativo(a.created_at))}</div>
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
    </div>

    <div class="sect"><h2>Cuándo y qué</h2>
      ${dato('Necesita comprar', et('urgencia', a.urgencia), colorUrg)}
      ${dato('Puede venir al dealer', [fechaLarga(a.visita_fecha), a.visita_hora].filter(Boolean).join(' · '))}
      ${dato('Busca', tipos.join(' · '))}
      ${dato('Co-buyer / co-signer', et('co_buyer', a.co_buyer))}
    </div>

    ${a.notas ? `<div class="sect"><h2>Lo que Finance debe saber</h2><div class="notas">${esc(a.notas)}</div></div>` : ''}
  `;
})();
