/* Registro de Artículos · beta 0.1
   Los campos vienen de columnas.js; este archivo no necesita cambios para agregar/quitar columnas. */
(function () {
  "use strict";
  const COLS = window.COLUMNAS;
  const HOJA = window.NOMBRE_HOJA || "Productos";
  const KEY = "registro-articulos.v1";
  const COL_SCAN = (COLS.find(c => c.escanear) || COLS[0]).clave;
  const $ = s => document.querySelector(s);

  // ---------- almacenamiento ----------
  let items = [];
  function cargar() {
    try { items = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { items = []; }
  }
  function guardarTodo() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); }
    catch (e) { aviso("No se pudo guardar: memoria llena del navegador"); }
    $("#contador").textContent = items.length + (items.length === 1 ? " artículo" : " artículos");
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  const norm = v => (v == null ? "" : String(v)).trim();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const buscarPor = (clave, valor, exceptoId) => {
    const v = norm(valor);
    if (!v) return null;
    return items.find(it => it._id !== exceptoId && norm(it[clave]) === v) || null;
  };

  // ---------- utilidades ----------
  let tt;
  function aviso(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2200);
  }
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 1200; g.gain.value = 0.15; o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.12);
    } catch (e) {}
    if (navigator.vibrate) navigator.vibrate(80);
  }
  const esc = s => norm(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtPrecio = v => (v === "" || v == null || isNaN(+v)) ? "" : "$" + (+v).toFixed(2);

  // ---------- navegación ----------
  let vista = "escanear";
  function ir(v) {
    if (vista === "escanear" && v !== "escanear") detenerCamara();
    vista = v;
    ["escanear", "form", "lista", "exportar"].forEach(n => $("#v-" + n).classList.toggle("hidden", n !== v));
    document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.v === v));
    if (v === "lista") pintarLista();
    if (v === "exportar") pintarExportar();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll("nav button").forEach(b => b.onclick = () => ir(b.dataset.v));

  // ---------- cámara ----------
  let lector = null, leyendo = false, ultimo = { code: "", t: 0 };
  const F = window.Html5QrcodeSupportedFormats || {};
  const formatos = ["EAN_13", "EAN_8", "UPC_A", "UPC_E", "CODE_128", "CODE_39", "CODE_93", "ITF", "CODABAR", "QR_CODE"]
    .map(n => F[n]).filter(v => v !== undefined);

  async function iniciarCamara() {
    if (!window.Html5Qrcode) { aviso("No se cargó el lector"); return; }
    if (!lector) lector = new Html5Qrcode("lector", {
      formatsToSupport: formatos, verbose: false,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    });
    $("#lector-msg").textContent = "Abriendo cámara…";
    try {
      await lector.start({ facingMode: "environment" },
        { fps: 12, qrbox: (w, h) => ({ width: Math.floor(w * 0.85), height: Math.floor(Math.min(h, w) * 0.45) }), aspectRatio: 1.333 },
        onLeido, () => {});
      leyendo = true;
      $("#btn-camara").textContent = "Detener cámara";
      $("#lector-msg").textContent = "Apunta al código de barras dentro del recuadro.";
    } catch (e) {
      $("#lector-msg").textContent = "No se pudo abrir la cámara. Revisa el permiso de cámara del navegador. (" + (e && e.message || e) + ")";
    }
  }
  async function detenerCamara() {
    if (lector && leyendo) { try { await lector.stop(); } catch (e) {} }
    leyendo = false;
    $("#btn-camara").textContent = "Activar cámara";
    $("#lector-msg").textContent = "Toca “Activar cámara” y apunta al código de barras.";
  }
  function onLeido(code) {
    const now = Date.now();
    if (code === ultimo.code && now - ultimo.t < 2500) return;
    ultimo = { code, t: now };
    beep();
    detenerCamara();
    abrirPorCodigo(code);
  }
  $("#btn-camara").onclick = () => leyendo ? detenerCamara() : iniciarCamara();
  $("#btn-manual").onclick = () => {
    const v = norm($("#manual").value);
    if (!v) { aviso("Escribe un código"); return; }
    $("#manual").value = ""; abrirPorCodigo(v);
  };
  $("#manual").addEventListener("keydown", e => { if (e.key === "Enter") $("#btn-manual").click(); });
  $("#btn-sin-codigo").onclick = () => abrirForm(null, "");

  function abrirPorCodigo(code) {
    const existente = buscarPor(COL_SCAN, code);
    if (existente) { aviso("Ya registrado: puedes editarlo"); abrirForm(existente); }
    else abrirForm(null, code);
  }

  // ---------- formulario ----------
  let editando = null; // id o null
  function abrirForm(item, codigoLeido) {
    editando = item ? item._id : null;
    $("#form-titulo").textContent = item ? "Editar artículo" : "Nuevo artículo";
    $("#form-sub").textContent = item ? "" : (codigoLeido ? "Código leído: " + codigoLeido : "");
    $("#btn-borrar").classList.toggle("hidden", !item);
    const form = $("#form"); form.innerHTML = "";
    COLS.forEach(c => {
      let val = item ? norm(item[c.clave]) : (c.clave === COL_SCAN && codigoLeido ? codigoLeido : norm(c.defecto));
      const id = "f-" + c.clave;
      const wrap = document.createElement("div");
      let html = `<label for="${id}">${esc(c.titulo)}${c.obligatorio ? ' <span class="req">*</span>' : ""}</label>`;
      if (c.tipo === "opciones") {
        const ops = c.opciones.slice();
        if (val && !ops.includes(val)) ops.unshift(val);
        html += `<select id="${id}" name="${c.clave}">${c.obligatorio ? "" : '<option value=""></option>'}` +
          ops.map(o => `<option${o === val ? " selected" : ""}>${esc(o)}</option>`).join("") + `</select>`;
      } else {
        const extra = c.tipo === "precio" ? 'inputmode="decimal" placeholder="0.00"'
          : c.tipo === "numero" ? 'inputmode="decimal"'
          : c.escanear ? 'inputmode="numeric"' : "";
        const lista = c.sugerir ? `list="dl-${c.clave}"` : "";
        html += `<input id="${id}" name="${c.clave}" value="${esc(val)}" autocomplete="off" ${extra} ${lista}>`;
        if (c.sugerir) {
          const vals = [...new Set(items.map(it => norm(it[c.clave])).filter(Boolean))].sort();
          html += `<datalist id="dl-${c.clave}">${vals.map(v => `<option value="${esc(v)}">`).join("")}</datalist>`;
        }
      }
      if (c.ayuda) html += `<div class="help">${esc(c.ayuda)}</div>`;
      html += `<div class="err" id="e-${c.clave}"></div>`;
      wrap.innerHTML = html;
      form.appendChild(wrap);
    });
    form.querySelectorAll("input,select").forEach(el => el.addEventListener("input", () => {
      const e = $("#e-" + el.name); if (e) e.textContent = "";
    }));
    ir("form");
    const primero = COLS.find(c => c.obligatorio && !norm(item ? item[c.clave] : ""));
    if (primero) setTimeout(() => { const el = $("#f-" + primero.clave); el && el.focus(); }, 50);
  }

  function validar(datos) {
    const errores = {};
    COLS.forEach(c => {
      const v = datos[c.clave];
      if (c.obligatorio && !v) { errores[c.clave] = "Obligatorio"; return; }
      if (!v) return;
      if (c.tipo === "precio" || c.tipo === "numero") {
        const n = Number(v.replace(",", "."));
        if (isNaN(n)) errores[c.clave] = "Debe ser un número (sin $)";
        else if (c.tipo === "precio" && n <= 0) errores[c.clave] = "Debe ser mayor que cero";
        else if (c.tipo === "precio" && !/^\d+([.,]\d{1,2})?$/.test(v)) errores[c.clave] = "Máximo dos decimales";
        else datos[c.clave] = String(n);
      }
      if (c.tipo === "opciones" && !c.opciones.includes(v)) errores[c.clave] = "Valor no permitido";
    });
    // códigos repetidos
    ["codigo", COL_SCAN].forEach(k => {
      if (!COLS.some(c => c.clave === k) || errores[k]) return;
      const otro = buscarPor(k, datos[k], editando);
      if (otro) errores[k] = "Ya existe en: " + (norm(otro.nombre) || "otro artículo");
    });
    return errores;
  }

  $("#btn-guardar").onclick = () => {
    const datos = {};
    COLS.forEach(c => { const el = $("#f-" + c.clave); datos[c.clave] = el ? norm(el.value) : ""; });
    const errores = validar(datos);
    COLS.forEach(c => { const e = $("#e-" + c.clave); if (e) e.textContent = errores[c.clave] || ""; });
    const claves = Object.keys(errores);
    if (claves.length) { const el = $("#f-" + claves[0]); el && el.focus(); aviso("Revisa los campos marcados"); return; }
    const ahora = new Date().toISOString();
    if (editando) {
      const it = items.find(x => x._id === editando);
      Object.assign(it, datos, { _mod: ahora });
      aviso("Cambios guardados");
    } else {
      items.unshift(Object.assign({ _id: uid(), _creado: ahora, _mod: ahora }, datos));
      aviso("Artículo guardado");
    }
    guardarTodo();
    ir("escanear");
  };
  $("#btn-cancelar").onclick = () => ir("escanear");
  $("#btn-borrar").onclick = () => {
    if (!editando || !confirm("¿Borrar este artículo?")) return;
    items = items.filter(x => x._id !== editando);
    guardarTodo(); aviso("Artículo borrado"); ir("lista");
  };

  // ---------- lista ----------
  const cPrecio = COLS.find(c => c.tipo === "precio");
  function pintarLista() {
    const q = norm($("#buscar").value).toLowerCase();
    const vis = q ? items.filter(it => COLS.some(c => norm(it[c.clave]).toLowerCase().includes(q))) : items;
    const cont = $("#lista");
    if (!vis.length) { cont.innerHTML = `<div class="empty">${items.length ? "Sin resultados" : "Aún no hay artículos. Escanea el primero."}</div>`; return; }
    cont.innerHTML = vis.map(it => {
      const meta = [it.codigo, it[COL_SCAN], it.categoria].map(norm).filter(Boolean).join(" · ");
      const inactivo = it.activo === "No" ? " inactive" : "";
      return `<div class="item${inactivo}" data-id="${it._id}">
        <div class="info"><div class="name">${esc(it.nombre) || "(sin nombre)"}</div><div class="meta">${esc(meta) || "&nbsp;"}</div></div>
        <div class="price">${cPrecio ? fmtPrecio(it[cPrecio.clave]) : ""}</div></div>`;
    }).join("");
    cont.querySelectorAll(".item").forEach(el => el.onclick = () => abrirForm(items.find(x => x._id === el.dataset.id)));
  }
  $("#buscar").addEventListener("input", pintarLista);

  // ---------- exportar ----------
  function pintarExportar() {
    $("#hoja-nombre").textContent = HOJA;
    $("#exp-columnas").textContent = "Columnas: " + COLS.map(c => c.titulo).join(", ");
    $("#btn-exportar").disabled = !items.length;
    $("#btn-exportar").textContent = items.length ? `Descargar Excel (${items.length})` : "No hay artículos";
    const u = localStorage.getItem(KEY + ".ultima");
    $("#exp-ultima").textContent = u ? "Última exportación: " + new Date(u).toLocaleString("es-MX") : "";
  }
  $("#btn-exportar").onclick = () => {
    const ws = {};
    COLS.forEach((c, i) => { ws[XLSX.utils.encode_cell({ r: 0, c: i })] = { t: "s", v: c.titulo }; });
    // orden: más antiguos primero
    const filas = items.slice().reverse();
    filas.forEach((it, r) => COLS.forEach((c, i) => {
      const v = norm(it[c.clave]);
      if (!v) return;
      const ref = XLSX.utils.encode_cell({ r: r + 1, c: i });
      if ((c.tipo === "precio" || c.tipo === "numero") && !isNaN(+v)) ws[ref] = { t: "n", v: +v, z: c.tipo === "precio" ? "0.00" : "General" };
      else ws[ref] = { t: "s", v: v, z: "@" }; // texto: conserva ceros iniciales
    }));
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(filas.length, 1), c: COLS.length - 1 } });
    ws["!cols"] = COLS.map(c => ({ wch: c.clave === "nombre" ? 34 : c.escanear ? 16 : 12 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, HOJA);
    const d = new Date(), p = n => String(n).padStart(2, "0");
    const nombre = `${HOJA}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.xlsx`;
    XLSX.writeFile(wb, nombre);
    localStorage.setItem(KEY + ".ultima", d.toISOString());
    pintarExportar();
    aviso("Excel generado: " + nombre);
  };

  // ---------- importar ----------
  $("#btn-importar").onclick = () => $("#archivo").click();
  $("#archivo").onchange = async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", raw: false });
      const ws = wb.Sheets[HOJA] || wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
      const quitarAcentos = s => norm(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      let nuevos = 0, actualizados = 0;
      filas.forEach(fila => {
        const datos = {};
        const keys = Object.keys(fila);
        COLS.forEach(c => {
          const k = keys.find(k => quitarAcentos(k) === quitarAcentos(c.titulo));
          datos[c.clave] = k ? norm(fila[k]).replace(/^\$/, "") : "";
        });
        if (!COLS.some(c => datos[c.clave])) return;
        const existe = buscarPor("codigo", datos.codigo) || buscarPor(COL_SCAN, datos[COL_SCAN]);
        const ahora = new Date().toISOString();
        if (existe) { Object.assign(existe, datos, { _mod: ahora }); actualizados++; }
        else { items.unshift(Object.assign({ _id: uid(), _creado: ahora, _mod: ahora }, datos)); nuevos++; }
      });
      guardarTodo();
      aviso(`Cargados: ${nuevos} nuevos, ${actualizados} actualizados`);
    } catch (err) {
      aviso("No se pudo leer el archivo");
    }
  };

  $("#btn-vaciar").onclick = () => {
    if (!items.length) { aviso("La lista ya está vacía"); return; }
    if (!confirm(`¿Borrar los ${items.length} artículos de este teléfono? Esto no se puede deshacer.`)) return;
    items = []; guardarTodo(); aviso("Lista vaciada"); pintarExportar();
  };

  // ---------- inicio ----------
  cargar(); guardarTodo();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
