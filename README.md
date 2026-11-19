# Registro de Artículos (beta 0.2)

App web para el teléfono (Android o iPhone): escanea códigos de barras con la cámara, registra artículos y exporta un Excel con las columnas de la plantilla para importarlo en el punto de venta.

## Cómo se usa
1. **Escanear**: toca "Activar cámara" y apunta al código. Si el código ya está registrado, se abre para editarlo; si no, se abre un artículo nuevo con las Barras ya llenas.
2. **Artículos**: lista con buscador; toca uno para editarlo o borrarlo.
3. **Exportar**: "Descargar Excel" genera `Productos_AAAAMMDD_HHMM.xlsx` (hoja "Productos") con lo que registraste o actualizaste. "Excel + fotos (ZIP)" agrega una carpeta `fotos/`; la columna Foto trae el nombre de cada archivo (código de barras + .jpg).
4. **Catálogo del punto de venta**: en Exportar, "Cargar catálogo" lee el Excel/CSV que exportas de tu punto de venta. Al escanear, la app avisa "Ya existe en tu punto de venta" (y llena el formulario con sus datos) o "Nuevo". El catálogo solo se consulta; no se exporta.

Los datos se guardan solo en el teléfono (en el navegador). Exporta seguido como respaldo.

## Cambiar las columnas
Edita solo `columnas.js`. Cada línea es una columna, en el orden del Excel. Después sube el número `VERSION` en `sw.js` y publica.

## Instalar en el teléfono
Abre el enlace https en Chrome (Android) o Safari (iPhone) y usa "Agregar a pantalla de inicio".
