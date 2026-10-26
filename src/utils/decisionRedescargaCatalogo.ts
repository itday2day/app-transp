// spec_catalogo_por_chofer.md (criterio 19, diagnóstico 6): decisión PURA de si corresponde
// forzar una redescarga del catálogo después de sincronizarPendientes() -- separada de
// NetworkContext.tsx (que no se puede probar en Node puro: importa expo-network/AuthContext) para
// poder probarse con Node puro, mismo criterio que catalogoSql.ts/catalogoUnion.ts. Esta función
// SOLO decide si hay que forzar -- nunca llama a nada ella misma (el llamador, si la respuesta es
// true, se limita a limpiar un throttle en memoria), así que no puede, por sí sola, causar ningún
// loop sincronizar -> descargar -> sincronizar: una descarga de catálogo nunca dispara, a su vez,
// una sincronización de jornadas.
export function debeForzarRedescargaCatalogo(resultadoSincronizacion: { exitosas: number }): boolean {
  return resultadoSincronizacion.exitosas > 0;
}
