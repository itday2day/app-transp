// spec_tarjeta_jornada_empresa.md (ampliación 2026-09-30): compartida por TarjetaJornada.tsx y
// DetalleJornadaScreen.tsx — antes de esto vivía duplicada como un ternario idéntico en cada
// componente (mismo tipo de duplicación que ya causó problemas en el proyecto, ver
// desfaseMinutos(), Hallazgo #20). `empresa` es `string` no nullable en el tipo `Jornada`, pero
// una fila local vieja (de antes de que esa columna existiera en SQLite, ver
// agregarColumnasFaltantes() en database.ts) puede tener '' backfilleado — de ahí el texto de
// reemplazo en vez de una línea en blanco.
export function textoEmpresa(empresa: string, textoSinEmpresa: string): string {
  return empresa?.trim() ? empresa : textoSinEmpresa;
}
