// spec_app_registro_paso5.md, paso 2c-4: inyecta el valor por defecto (Usuario.empresaDefecto/
// rutaDefecto) en una lista de catálogo si no está ya -- para que aparezca como una opción
// GENUINA del desplegable (SelectorDesplegable.tsx solo lista lo que esté en `opciones`, aunque
// el botón cerrado muestre `valor` igual sin estar en la lista), no solo como texto preseleccionado.
// Comparación normalizada (mayúsculas, sin espacios sobrantes) -- si ya existe con otra grafía, se
// usa la grafía de la lista (la fuente de verdad real, el catálogo), no la del Usuario guardado.

// Exportada (ronda de revisión del Hallazgo #57/bug de CheckInForm): aplicarDefectosCheckIn.ts
// necesita la MISMA comparación normalizada para decidir si una empresa ya resuelta coincide con
// `empresaDefecto` -- nunca una comparación `===` cruda entre una grafía de catálogo y una de
// Usuario, que pueden diferir en mayúsculas/espacios aunque sean "la misma" empresa.
export function normalizar(texto: string): string {
  return texto.trim().toUpperCase();
}

/** Si `valorDefecto` ya está en `lista` (comparación normalizada), la devuelve tal cual (sin
 * duplicar, con la grafía de la lista). Si no, la antepone. `null`/vacío -> la lista sin cambios. */
export function listaConDefecto(lista: string[], valorDefecto: string | null): string[] {
  if (!valorDefecto || valorDefecto.trim() === "") return lista;
  const existe = lista.some((item) => normalizar(item) === normalizar(valorDefecto));
  return existe ? lista : [valorDefecto, ...lista];
}

/** La grafía que de verdad hay que preseleccionar: la de `lista` si `valorDefecto` ya está ahí
 * (normalizado), o `valorDefecto` tal cual si no está (recién lo agregaría listaConDefecto()). */
export function grafiaDeLista(lista: string[], valorDefecto: string | null): string | null {
  if (!valorDefecto || valorDefecto.trim() === "") return null;
  return lista.find((item) => normalizar(item) === normalizar(valorDefecto)) ?? valorDefecto;
}
