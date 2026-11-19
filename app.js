/* Registro de Artículos · beta 0.3
   Los campos vienen de columnas.js; este archivo no necesita cambios para agregar/quitar columnas.

   Datos (todo en el teléfono, IndexedDB):
   - items    : artículos registrados o actualizados aquí (lo que se exporta)
   - catalogo : copia del catálogo del punto de venta (solo para consultar al escanear)
   - fotos    : una imagen JPEG por artículo (clave = _id del artículo) */
(function () {
  "use strict";
  const COLS = window.COLUMNAS;
  const HOJA = window.NOMBRE_HOJA || "Productos";
  const OLD_KEY = "registro-articulos.v1";
  const COL_SCAN = (COLS.find(c => c.escanear) || COLS[0]).clave;
  const COL_FOTO = (COLS.find(c => c.tipo === "foto") || {}).clave;
  const COLS_DATO = COLS.filter(c => c.tipo !== "foto");
  const COLS_POS = COLS.filter(c => c.exportar !== false);   // las que van al Excel del punto de venta
  const TIENE_CODIGO = COLS.some(c => c.clave === "codigo");
  const $ = s => document.querySelector(s);

  // ---------- IndexedDB mínima ----------
  let dbp;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open("registro-articulos", 1);
      r.onupgradeneeded = () => { r.result.createObjectStore("kv"); r.result.createObjectStore("fotos"); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function op(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction(store, mode); const st = tx.objectStore(store);
      const req = fn(st); let out;
      if (req) req.onsuccess = () => { out = req.result; };
      tx.oncomplete = () => res(out); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  }
  const kvGet = k => op("kv", "readonly", s => s.get(k));
  const kvSet = (k, v) => op("kv", "readwrite", s => s.put(v, k));
  const fotoGet = id => op("fotos", "readonly", s => s.get(id));
  const fotoSet = (id, blob) => op("fotos", "readwrite", s => s.put(blob, id));
  const fotoDel = id => op("fotos", "readwrite", s => s.delete(id));
  const fotosClear = () => op("fotos", "readwrite", s => s.clear());
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- estado ----------
  let items = [], catalogo = [], catInfo = null, fotosIds = new Set();
  const idxCat = { codigo: new Map(), scan: new Map() };
  const norm = v => (v == null ? "" : String(v)).trim();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const catKey = c => norm(c.codigo) || "b:" + norm(c[COL_SCAN]);

  function indexarCatalogo() {
    idxCat.codigo.clear(); idxCat.scan.clear();
    catalogo.forEach(c => {
      if (norm(c.codigo)) idxCat.codigo.set(norm(c.codigo), c);
      if (norm(c[COL_SCAN])) idxCat.scan.set(norm(c[COL_SCAN]), c);
    });
  }
  async function guardarItems() {
    try { await kvSet("items", items); } catch (e) { aviso("No se pudo guardar: memoria llena"); }
    $("#contador").textContent = items.length + (items.length === 1 ? " artículo" : " artículos");
  }
  const buscarItem = (clave, valor, exceptoId) => {
    const v = norm(valor); if (!v) return null;
    return items.find(it => it._id !== exceptoId && norm(it[clave]) === v) || null;
  };
  const buscarCat = (clave, valor) => {
    const v = norm(valor); if (!v) return null;
    return (clave === "codigo" ? idxCat.codigo : idxCat.scan).get(v) || null;
  };

  // ---------- utilidades ----------
  let tt;
  function aviso(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2400);
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
  const fecha = iso => iso ? new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "";
  const nombreFoto = it => (norm(it[COL_SCAN]) || norm(it.codigo) || it._id).replace(/[^\w.-]+/g, "_") + ".jpg";

  // reduce la foto a máx. 1000 px y JPEG para que no ocupe mucho
  function comprimir(file) {
    return new Promise((res, rej) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1000, k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(b => b ? res(b) : rej(new Error("foto")), "image/jpeg", 0.8);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("foto")); };
      img.src = url;
    });
  }

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
    beep(); detenerCamara(); abrirPorCodigo(code);
  }
  $("#btn-camara").onclick = () => leyendo ? detenerCamara() : iniciarCamara();
  $("#btn-manual").onclick = () => {
    const v = norm($("#manual").value);
    if (!v) { aviso("Escribe un código"); return; }
    $("#manual").value = ""; abrirPorCodigo(v);
  };
  $("#manual").addEventListener("keydown", e => { if (e.key === "Enter") $("#btn-manual").click(); });
  $("#btn-sin-codigo").onclick = () => abrirForm({ codigoLeido: "" });

  // Busca primero en lo registrado aquí, luego en el catálogo del punto de venta.
  function abrirPorCodigo(code) {
    const it = buscarItem(COL_SCAN, code) || (TIENE_CODIGO && buscarItem("codigo", code));
    if (it) return abrirForm({ item: it });
    const cat = buscarCat("scan", code) || (TIENE_CODIGO && buscarCat("codigo", code));
    if (cat) return abrirForm({ cat });
    abrirForm({ codigoLeido: code });
  }

  // ---------- formulario ----------
  let editando = null, catActual = null, fotoNueva, fotoUrl;  // fotoNueva: undefined = sin cambio, null = quitar, Blob = nueva
  function bannerHTML({ item, cat, codigoLeido }) {
    const c = cat || (item && item._cat && catalogo.find(x => catKey(x) === item._cat));
    if (c) {
      const p = COLS.find(k => k.tipo === "precio");
      return `<div class="banner ok"><b>✓ Ya existe en tu punto de venta</b>${esc(c.nombre) || "(sin nombre)"}` +
        `${p && c[p.clave] ? " · " + fmtPrecio(c[p.clave]) : ""}${c.codigo ? " · Código " + esc(c.codigo) : ""}` +
        `<div class="small">Si cambias algo y guardas, se exportará para actualizarlo.</div></div>`;
    }
    if (item) return "";
    if (!catalogo.length) return `<div class="banner warn"><b>Sin catálogo cargado</b>No se puede saber si ya existe en tu sistema. Cárgalo en Exportar.</div>`;
    return codigoLeido ? `<div class="banner new"><b>Nuevo: no está en tu punto de venta</b></div>` : "";
  }

  async function abrirForm(o) {
    const { item, cat, codigoLeido } = o;
    editando = item ? item._id : null;
    catActual = cat ? catKey(cat) : (item ? item._cat || null : null);
    fotoNueva = undefined;
    if (fotoUrl) { URL.revokeObjectURL(fotoUrl); fotoUrl = null; }
    const base = item || cat || null;
    $("#form-titulo").textContent = item ? "Editar artículo" : cat ? "Actualizar artículo" : "Nuevo artículo";
    $("#form-sub").textContent = !base && codigoLeido ? "Código leído: " + codigoLeido : "";
    $("#form-banner").innerHTML = bannerHTML(o);
    $("#btn-borrar").classList.toggle("hidden", !item);
    const form = $("#form"); form.innerHTML = "";
    COLS.forEach(c => {
      const id = "f-" + c.clave;
      const wrap = document.createElement("div");
      let html = `<label for="${id}">${esc(c.titulo)}${c.obligatorio ? ' <span class="req">*</span>' : ""}</label>`;
      if (c.tipo === "foto") {
        html += `<div class="foto-box"><div class="ph" id="foto-prev">📷</div><div class="btns">
          <input type="file" id="${id}" accept="image/*" capture="environment" class="hidden">
          <button type="button" id="foto-tomar">Tomar foto</button>
          <button type="button" id="foto-quitar" class="hidden">Quitar foto</button></div></div>`;
      } else {
        const val = base ? norm(base[c.clave]) : (c.clave === COL_SCAN && codigoLeido ? codigoLeido : norm(c.defecto));
        if (c.tipo === "opciones") {
          const ops = c.opciones.slice();
          if (val && !ops.includes(val)) ops.unshift(val);
          html += `<select id="${id}" name="${c.clave}">${c.obligatorio ? "" : '<option value=""></option>'}` +
            ops.map(op => `<option${op === val ? " selected" : ""}>${esc(op)}</option>`).join("") + `</select>`;
        } else {
          const extra = c.tipo === "precio" ? 'inputmode="decimal" placeholder="0.00"'
            : c.tipo === "numero" ? 'inputmode="decimal"' : c.escanear ? 'inputmode="numeric"' : "";
          html += `<input id="${id}" name="${c.clave}" value="${esc(val)}" autocomplete="off" ${extra} ${c.sugerir ? `list="dl-${c.clave}"` : ""}>`;
          if (c.sugerir) {
            const vals = [...new Set(items.concat(catalogo).map(it => norm(it[c.clave])).filter(Boolean))].sort().slice(0, 300);
            html += `<datalist id="dl-${c.clave}">${vals.map(v => `<option value="${esc(v)}">`).join("")}</datalist>`;
          }
        }
      }
      if (c.ayuda) html += `<div class="help">${esc(c.ayuda)}</div>`;
      html += `<div class="err" id="e-${c.clave}"></div>`;
      wrap.innerHTML = html;
      form.appendChild(wrap);
    });
    form.querySelectorAll("input[name],select").forEach(el => el.addEventListener("input", () => {
      const e = $("#e-" + el.name); if (e) e.textContent = "";
    }));
    if (COL_FOTO) {
      $("#foto-tomar").onclick = () => $("#f-" + COL_FOTO).click();
      $("#f-" + COL_FOTO).onchange = async e => {
        const f = e.target.files[0]; e.target.value = ""; if (!f) return;
        try { fotoNueva = await comprimir(f); mostrarFoto(fotoNueva); } catch (err) { aviso("No se pudo leer la foto"); }
      };
      $("#foto-quitar").onclick = () => { fotoNueva = null; mostrarFoto(null); };
      if (item && fotosIds.has(item._id)) fotoGet(item._id).then(b => { if (fotoNueva === undefined) mostrarFoto(b); });
    }
    ir("form");
    const primero = COLS.find(c => c.obligatorio && !norm(base ? base[c.clave] : ""));
    if (primero) setTimeout(() => { const el = $("#f-" + primero.clave); el && el.focus(); }, 50);
  }
  function mostrarFoto(blob) {
    if (fotoUrl) { URL.revokeObjectURL(fotoUrl); fotoUrl = null; }
    const prev = $("#foto-prev");
    if (blob) {
      fotoUrl = URL.createObjectURL(blob);
      prev.outerHTML = `<img id="foto-prev" src="${fotoUrl}" alt="Foto del producto">`;
      $("#foto-prev").onclick = () => verFoto(fotoUrl);
    } else prev.outerHTML = `<div class="ph" id="foto-prev">📷</div>`;
    $("#foto-tomar").textContent = blob ? "Cambiar foto" : "Tomar foto";
    $("#foto-quitar").classList.toggle("hidden", !blob);
  }

  function verFoto(url) { const v = $("#visor"); v.querySelector("img").src = url; v.classList.remove("hidden"); }
  $("#visor").onclick = () => $("#visor").classList.add("hidden");

  function validar(datos) {
    const errores = {};
    COLS_DATO.forEach(c => {
      const v = datos[c.clave];
      if (c.obligatorio && !v) { errores[c.clave] = "Obligatorio"; return; }
      if (!v) return;
      if (c.tipo === "precio" || c.tipo === "numero") {
        const t = v.replace(/^\$/, "").replace(",", ".");
        const n = Number(t);
        if (isNaN(n)) errores[c.clave] = "Debe ser un número (sin $)";
        else if (c.tipo === "precio" && n <= 0) errores[c.clave] = "Debe ser mayor que cero";
        else if (c.tipo === "precio" && !/^\d+(\.\d{1,2})?$/.test(t)) errores[c.clave] = "Máximo dos decimales";
        else datos[c.clave] = String(n);
      }
      if (c.tipo === "opciones" && !c.opciones.includes(v)) errores[c.clave] = "Valor no permitido";
    });
    // repetidos: contra lo registrado aquí y contra el catálogo (salvo el mismo producto)
    [TIENE_CODIGO ? "codigo" : null, COL_SCAN].forEach(k => {
      if (!k || errores[k] || !datos[k]) return;
      const otro = buscarItem(k, datos[k], editando);
      if (otro) { errores[k] = "Ya registrado en: " + (norm(otro.nombre) || "otro artículo"); return; }
      const c = buscarCat(k === "codigo" ? "codigo" : "scan", datos[k]);
      if (c && catKey(c) !== catActual) errores[k] = "Ya existe en tu punto de venta: " + (norm(c.nombre) || "otro producto");
    });
    return errores;
  }

  $("#btn-guardar").onclick = async () => {
    const datos = {};
    COLS_DATO.forEach(c => { const el = $("#f-" + c.clave); datos[c.clave] = el ? norm(el.value) : ""; });
    const errores = validar(datos);
    COLS_DATO.forEach(c => { const e = $("#e-" + c.clave); if (e) e.textContent = errores[c.clave] || ""; });
    const claves = Object.keys(errores);
    if (claves.length) { const el = $("#f-" + claves[0]); el && el.focus(); aviso("Revisa los campos marcados"); return; }
    const ahora = new Date().toISOString();
    let it;
    if (editando) {
      it = items.find(x => x._id === editando);
      Object.assign(it, datos, { _mod: ahora });
    } else {
      it = Object.assign({ _id: uid(), _creado: ahora, _mod: ahora, _cat: catActual }, datos);
      items.unshift(it);
    }
    try {
      if (fotoNueva instanceof Blob) { await fotoSet(it._id, fotoNueva); fotosIds.add(it._id); }
      else if (fotoNueva === null) { await fotoDel(it._id); fotosIds.delete(it._id); }
    } catch (e) { aviso("No se pudo guardar la foto"); }
    await guardarItems();
    aviso(editando ? "Cambios guardados" : "Artículo guardado");
    ir("escanear");
  };
  $("#btn-cancelar").onclick = () => ir("escanear");
  $("#btn-borrar").onclick = async () => {
    if (!editando || !confirm("¿Borrar este artículo de la lista? (No lo borra de tu punto de venta)")) return;
    items = items.filter(x => x._id !== editando);
    await fotoDel(editando).catch(() => {}); fotosIds.delete(editando);
    await guardarItems(); aviso("Artículo borrado"); ir("lista");
  };

  // ---------- lista ----------
  const cPrecio = COLS.find(c => c.tipo === "precio");
  let thumbs = [];
  const cCosto = COLS.find(c => c.clave === "costo");
  const cTienda = COLS.find(c => c.clave === "tienda");
  const llaveBusq = s => norm(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const coincide = (it, palabras) => {
    const texto = llaveBusq(COLS_DATO.map(c => it[c.clave]).join(" "));
    return palabras.every(p => texto.includes(p));
  };
  function filaHTML(it, enCatalogo) {
    const meta = [it.codigo, it[COL_SCAN], it.categoria].map(norm).filter(Boolean).join(" · ");
    const pers = [cCosto && it[cCosto.clave] ? "Costo " + fmtPrecio(it[cCosto.clave]) : "", cTienda ? norm(it[cTienda.clave]) : ""].filter(Boolean).join(" · ");
    const tag = enCatalogo ? "" : it._cat ? '<span class="tag act">Actualiza</span>' : '<span class="tag nuevo">Nuevo</span>';
    return `<div class="item${it.activo === "No" ? " inactive" : ""}" ${enCatalogo ? `data-cat="${esc(catKey(it))}"` : `data-id="${it._id}"`}>
      ${COL_FOTO ? `<img class="thumb" data-foto="${!enCatalogo && fotosIds.has(it._id) ? it._id : ""}" alt="">` : ""}
      <div class="info"><div class="name">${esc(it.nombre) || "(sin nombre)"}${tag}</div>
      <div class="meta">${esc(meta) || "&nbsp;"}</div>${pers ? `<div class="meta2">${esc(pers)}</div>` : ""}</div>
      <div class="price">${cPrecio ? fmtPrecio(it[cPrecio.clave]) : ""}</div></div>`;
  }
  async function pintarLista() {
    thumbs.forEach(u => URL.revokeObjectURL(u)); thumbs = [];
    const palabras = llaveBusq($("#buscar").value).split(/\s+/).filter(Boolean);
    const mios = palabras.length ? items.filter(it => coincide(it, palabras)) : items;
    // del catálogo: solo al buscar, y sin repetir los que ya registraste aquí
    const yaMios = new Set(items.map(it => it._cat).filter(Boolean));
    const delCat = palabras.length ? catalogo.filter(c => !yaMios.has(catKey(c)) && coincide(c, palabras)).slice(0, 50) : [];
    const cont = $("#lista");
    let html = "";
    if (mios.length) html += `<div class="sec">Mis artículos (${mios.length})</div>` + mios.slice(0, 300).map(it => filaHTML(it, false)).join("") +
      (mios.length > 300 ? `<div class="empty">Mostrando 300 de ${mios.length}. Escribe más para filtrar.</div>` : "");
    if (delCat.length) html += `<div class="sec">En tu punto de venta</div>` + delCat.map(c => filaHTML(c, true)).join("");
    if (!html) html = `<div class="empty">${palabras.length ? "Sin resultados" : "Aún no hay artículos. Escanea el primero o busca en tu catálogo."}</div>`;
    cont.innerHTML = html;
    cont.querySelectorAll(".item[data-id]").forEach(el => el.onclick = () => abrirForm({ item: items.find(x => x._id === el.dataset.id) }));
    cont.querySelectorAll(".item[data-cat]").forEach(el => el.onclick = () => abrirForm({ cat: catalogo.find(c => catKey(c) === el.dataset.cat) }));
    for (const img of cont.querySelectorAll("img[data-foto]")) {
      if (!img.dataset.foto) continue;
      const b = await fotoGet(img.dataset.foto).catch(() => null);
      if (b) { const u = URL.createObjectURL(b); thumbs.push(u); img.src = u; }
    }
  }
  $("#buscar").addEventListener("input", pintarLista);

  // ---------- exportar ----------
  async function pintarExportar() {
    $("#hoja-nombre").textContent = HOJA;
    $("#exp-columnas").textContent = "Columnas: " + COLS_POS.map(c => c.titulo).join(", ") +
      (COLS_POS.length < COLS.length ? ". No incluye tus datos personales (" + COLS.filter(c => c.exportar === false).map(c => c.titulo).join(", ") + ")." : "");
    const n = items.length;
    $("#btn-exportar").disabled = !n;
    $("#btn-exportar").textContent = n ? `Descargar Excel (${n})` : "No hay artículos";
    $("#btn-zip").disabled = !n;
    const u = await kvGet("ultima").catch(() => null);
    $("#exp-ultima").textContent = u ? "Última exportación: " + fecha(u) : "";
    $("#cat-estado").textContent = catInfo
      ? `Cargado: ${catalogo.length} productos de “${catInfo.archivo}” (${fecha(catInfo.fecha)}).`
      : "Todavía no has cargado tu catálogo.";
    $("#btn-cat-borrar").classList.toggle("hidden", !catInfo);
    $("#btn-importar").textContent = catInfo ? "Reemplazar catálogo…" : "Cargar catálogo…";
  }
  function crearLibro(COLS) {
    const ws = {};
    COLS.forEach((c, i) => { ws[XLSX.utils.encode_cell({ r: 0, c: i })] = { t: "s", v: c.titulo }; });
    const filas = items.slice().reverse(); // más antiguos primero
    filas.forEach((it, r) => COLS.forEach((c, i) => {
      const v = c.tipo === "foto" ? (fotosIds.has(it._id) ? nombreFoto(it) : "") : norm(it[c.clave]);
      if (!v) return;
      const ref = XLSX.utils.encode_cell({ r: r + 1, c: i });
      if ((c.tipo === "precio" || c.tipo === "numero") && !isNaN(+v)) ws[ref] = { t: "n", v: +v, z: c.tipo === "precio" ? "0.00" : "General" };
      else ws[ref] = { t: "s", v: v, z: "@" }; // texto: conserva ceros iniciales
    }));
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(filas.length, 1), c: COLS.length - 1 } });
    ws["!cols"] = COLS.map(c => ({ wch: c.clave === "nombre" ? 34 : c.escanear || c.tipo === "foto" ? 18 : 12 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, HOJA);
    return wb;
  }
  function sello() {
    const d = new Date(), p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }
  function descargar(blob, nombre) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function marcarExport(nombre) {
    await kvSet("ultima", new Date().toISOString()).catch(() => {});
    pintarExportar(); aviso("Listo: " + nombre);
  }
  $("#btn-exportar").onclick = async () => {
    const nombre = `${HOJA}_${sello()}.xlsx`;
    XLSX.writeFile(crearLibro(COLS_POS), nombre);
    marcarExport(nombre);
  };
  $("#btn-zip").onclick = async () => {
    const btn = $("#btn-zip"); btn.disabled = true; const txt = btn.textContent; btn.textContent = "Preparando…";
    try {
      const s = sello(), zip = new JSZip();
      zip.file("articulos.xlsx", XLSX.write(crearLibro(COLS), { bookType: "xlsx", type: "array" }));
      zip.file("articulos.json", JSON.stringify({ version: 1, items, catInfo }, null, 1));
      const carpeta = zip.folder("fotos");
      for (const it of items) if (fotosIds.has(it._id)) {
        const b = await fotoGet(it._id); if (b) carpeta.file(nombreFoto(it), b);
      }
      const nombre = `Respaldo_articulos_${s}.zip`;
      descargar(await zip.generateAsync({ type: "blob" }), nombre);
      aviso("Respaldo listo: " + nombre);
    } catch (e) { aviso("No se pudo crear el respaldo"); }
    btn.textContent = txt; btn.disabled = false;
  };
  $("#btn-restaurar").onclick = () => $("#archivo-resp").click();
  $("#archivo-resp").onchange = async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const zip = await JSZip.loadAsync(f);
      const j = zip.file("articulos.json"); if (!j) { aviso("Ese ZIP no es un respaldo de esta app"); return; }
      const datos = JSON.parse(await j.async("string"));
      if (!Array.isArray(datos.items)) throw new Error("respaldo");
      if (!confirm(`¿Reemplazar los ${items.length} artículos de este teléfono por los ${datos.items.length} del respaldo?`)) return;
      await fotosClear(); fotosIds.clear();
      for (const it of datos.items) {
        const fz = zip.file("fotos/" + nombreFoto(it));
        if (fz) { await fotoSet(it._id, new Blob([await fz.async("arraybuffer")], { type: "image/jpeg" })); fotosIds.add(it._id); }
      }
      items = datos.items; await guardarItems(); pintarExportar();
      aviso(`Respaldo restaurado: ${items.length} artículos`);
    } catch (err) { aviso("No se pudo leer el respaldo"); }
  };

  // ---------- importar catálogo del punto de venta ----------
  $("#btn-importar").onclick = () => $("#archivo").click();
  $("#archivo").onchange = async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", raw: false });
      const ws = wb.Sheets[HOJA] || wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
      const llave = s => norm(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
      const keys = filas.length ? Object.keys(filas[0]) : [];
      const mapa = {};
      COLS_DATO.forEach(c => { const k = keys.find(k => llave(k) === llave(c.titulo) || llave(k) === llave(c.clave)); if (k) mapa[c.clave] = k; });
      if (!mapa[COL_SCAN] && !mapa.codigo) { aviso("El archivo no tiene columnas Código ni Barras"); return; }
      const nuevo = [];
      filas.forEach(fila => {
        const d = {};
        COLS_DATO.forEach(c => { d[c.clave] = mapa[c.clave] ? norm(fila[mapa[c.clave]]).replace(/^\$/, "") : ""; });
        if (norm(d.codigo) || norm(d[COL_SCAN])) nuevo.push(d);
      });
      if (catalogo.length && !confirm(`¿Reemplazar el catálogo actual (${catalogo.length}) por este (${nuevo.length})?`)) return;
      catalogo = nuevo; catInfo = { archivo: f.name, fecha: new Date().toISOString() };
      await kvSet("catalogo", catalogo); await kvSet("catInfo", catInfo);
      indexarCatalogo(); pintarExportar();
      const faltan = COLS_DATO.filter(c => !mapa[c.clave]).map(c => c.titulo);
      aviso(`Catálogo cargado: ${nuevo.length} productos` + (faltan.length ? ` (sin columna: ${faltan.join(", ")})` : ""));
    } catch (err) {
      aviso("No se pudo leer el archivo");
    }
  };
  $("#btn-cat-borrar").onclick = async () => {
    if (!confirm("¿Quitar el catálogo cargado de este teléfono?")) return;
    catalogo = []; catInfo = null; indexarCatalogo();
    await kvSet("catalogo", []); await kvSet("catInfo", null);
    pintarExportar(); aviso("Catálogo quitado");
  };

  $("#btn-vaciar").onclick = async () => {
    if (!items.length) { aviso("La lista ya está vacía"); return; }
    if (!confirm(`¿Borrar los ${items.length} artículos y sus fotos de este teléfono? Esto no se puede deshacer.`)) return;
    items = []; fotosIds.clear(); await fotosClear().catch(() => {});
    await guardarItems(); aviso("Lista vaciada"); pintarExportar();
  };

  // ---------- inicio ----------
  (async function init() {
    try {
      items = (await kvGet("items")) || null;
      if (!items) { // migrar datos de la versión 0.1
        try { items = JSON.parse(localStorage.getItem(OLD_KEY) || "[]"); } catch (e) { items = []; }
        await kvSet("items", items);
      }
      catalogo = (await kvGet("catalogo")) || [];
      catInfo = (await kvGet("catInfo")) || null;
      fotosIds = new Set(await op("fotos", "readonly", s => s.getAllKeys()) || []);
    } catch (e) {
      aviso("No se pudo abrir el almacenamiento del navegador");
      items = items || [];
    }
    indexarCatalogo();
    $("#contador").textContent = items.length + (items.length === 1 ? " artículo" : " artículos");
  })();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
