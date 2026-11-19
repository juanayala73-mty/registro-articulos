// =====================================================================
//  COLUMNAS DEL EXCEL
//  Este es el ÚNICO archivo que hay que editar para cambiar los campos.
//  El orden de esta lista es el orden de las columnas en el Excel.
//
//  clave       : nombre interno (sin espacios ni acentos). No lo cambies
//                si ya tienes artículos guardados, o se perderá ese dato.
//  titulo      : encabezado exacto que aparece en el Excel.
//  tipo        : "texto" | "numero" | "precio" | "opciones" | "foto"
//                (foto: en el Excel va el nombre del archivo; las fotos salen en el ZIP)
//  obligatorio : true si no se puede guardar vacío.
//  defecto     : valor que se pone solo al crear un artículo nuevo.
//  opciones    : lista de valores permitidos (solo para tipo "opciones").
//  escanear    : true en la columna donde va el código leído con la cámara.
//  sugerir     : true para sugerir valores ya usados (ej. categorías).
//  ayuda       : texto pequeño debajo del campo.
//  exportar    : false = dato personal; se guarda y se busca en la app, pero
//                NO sale en el Excel del punto de venta (sí en el respaldo).
// =====================================================================

window.NOMBRE_HOJA = "Productos";

window.COLUMNAS = [
  { clave: "codigo",    titulo: "Código",    tipo: "texto",
    ayuda: "Déjalo vacío para que el punto de venta genere uno." },
  { clave: "barras",    titulo: "Barras",    tipo: "texto", escanear: true },
  { clave: "nombre",    titulo: "Nombre",    tipo: "texto", obligatorio: true },
  { clave: "categoria", titulo: "Categoría", tipo: "texto", sugerir: true },
  { clave: "unidad",    titulo: "Unidad",    tipo: "texto", defecto: "pieza", sugerir: true },
  { clave: "tipo",      titulo: "Tipo",      tipo: "opciones", opciones: ["Producto", "Servicio"], defecto: "Producto" },
  { clave: "precio",    titulo: "Precio",    tipo: "precio", obligatorio: true },
  { clave: "activo",    titulo: "Activo",    tipo: "opciones", opciones: ["Sí", "No"], defecto: "Sí" },
  // --- datos personales (no van al punto de venta) ---
  { clave: "costo",     titulo: "Costo tienda", tipo: "precio", exportar: false,
    ayuda: "Lo que te costó en la tienda donde lo compraste." },
  { clave: "tienda",    titulo: "Tienda",    tipo: "texto", sugerir: true, exportar: false },
  { clave: "foto",      titulo: "Foto",      tipo: "foto", exportar: false },
];
