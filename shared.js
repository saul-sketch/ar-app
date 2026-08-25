/* Auto Republic — Online Application · pieza común a las 3 pantallas */
const SUPA_URL = 'https://xwxjutaqouaeocvxawlw.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3eGp1dGFxb3VhZW9jdnhhd2x3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNTIxMzYsImV4cCI6MjA5MjYyODEzNn0.TOigRbaNL5z3Q7hd4llJyqrC6vZwn_-1R-5JudXtJmU';
const SUPA_H = { apikey: SUPA_ANON, Authorization: 'Bearer ' + SUPA_ANON, 'Content-Type': 'application/json' };
const TABLA = SUPA_URL + '/rest/v1/ar_online_applications';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dinero = n => (n === null || n === undefined || n === '') ? null : '$' + Math.round(Number(n)).toLocaleString('en-US');
const tel = t => {
  const d = String(t || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : (t || '');
};
const millas = m => { const d = String(m ?? '').replace(/\D/g,''); return d ? Number(d).toLocaleString('en-US') : (m || ''); };
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function fechaLarga(iso){
  if(!iso) return '';
  const d = new Date(String(iso).slice(0,10) + 'T00:00:00');
  return `${d.getDate()} de ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
function cuandoRelativo(iso){
  if(!iso) return '';
  const d = new Date(iso), ahora = new Date();
  const min = Math.round((ahora - d) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dd = Math.round(h / 24);
  if (dd === 1) return 'ayer';
  if (dd < 30) return `hace ${dd} días`;
  return fechaLarga(iso);
}

/* Etiquetas legibles de cada respuesta — se usan igual en el panel y en el link público,
   para que nadie tenga que acordarse de qué significa cada código. */
const ETIQUETAS = {
  trade_in: { no: 'No tiene trade-in', pagado: 'Sí, pagado', debe: 'Sí, todavía debe dinero' },
  urgencia: { hoy: 'Hoy', '2-3dias': 'En los próximos 2–3 días', semana: 'Esta semana', mes: 'Este mes', sin_fecha: 'No tiene fecha específica' },
  co_buyer: { solo: 'Solo él/ella', ya_aplico: 'Hay co-buyer y ya aplicó', no_aplico: 'Hay co-buyer pero todavía no ha aplicado', podria: 'Podría conseguir uno si fuera necesario' },
  tipo_carro: { sedan: 'Sedan', suv: 'SUV', pickup: 'Pickup', tres_filas: '3 filas', economico: 'Económico', abierto: 'Abierto a opciones', especifico: 'Vehículo específico' },
  estado: { nueva: 'Nueva', trabajando: 'Trabajándola', esperando: 'Esperando al cliente', cerrada: 'Cerrada' }
};
const et = (campo, v) => (ETIQUETAS[campo] && ETIQUETAS[campo][v]) || v || '';

/* La urgencia manda: es lo que decide qué se trabaja primero. */
const URGENCIA_COLOR = { hoy: 'rojo', '2-3dias': 'ambar', semana: 'ambar', mes: 'gris', sin_fecha: 'gris' };

/* Código corto del link. Alfabeto sin 0/O/1/I/L: si alguien lo dicta por teléfono
   o lo copia a mano, no hay forma de confundir un cero con una O. */
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function nuevoCodigo(n){
  n = n || 6;
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, x => ALFABETO[x % ALFABETO.length]).join('');
}

/* Un id propio, generado aquí. Así el formulario no necesita permiso de LECTURA
   para saber el link: escribe y ya sabe cuál es. */
function nuevoId(){
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
const rpc = (fn, args) => fetch(SUPA_URL + '/rest/v1/rpc/' + fn,
  { method:'POST', headers: SUPA_H, body: JSON.stringify(args) }).then(r => r.json());

/* Base del sitio: .../ar-app/  — sirve igual desde index.html, panel.html o la raíz. */
function base(){ return location.origin + location.pathname.replace(/[^/]*$/, ''); }
/* El link que se le pasa a Finance: corto y sin signos raros. */
function linkPublico(codigo){ return base() + codigo; }

/* ── Notas de Finance ────────────────────────────────────────────────────────
   Histórico, no un campo que se pisa: cada nota queda con quién y cuándo. Igual
   que en Pólizas, que es donde ya funciona y a Saúl le gustó. */
function bitIniciales(n){
  const p = String(n || '').trim().split(/\s+/).filter(Boolean);
  return ((p[0]||'?')[0] + ((p[1]||'')[0] || '')).toUpperCase();
}
function bitCuando(iso){
  if(!iso) return '';
  const d = new Date(iso), hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  const hora = d.toLocaleTimeString('es-ES',{hour:'numeric',minute:'2-digit'});
  if (mismoDia) return 'hoy ' + hora;
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate()-1);
  if (d.toDateString() === ayer.toDateString()) return 'ayer ' + hora;
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0,3)} · ${hora}`;
}
