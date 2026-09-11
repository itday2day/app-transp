export const espaciado = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

// Padding inferior extra para el contentContainerStyle de un ScrollView con
// KeyboardAvoidingView, cuando el último campo del formulario es un
// TextInput que hay que poder llevar arriba del teclado al enfocarlo (ver
// CheckInForm.tsx/IncidenciasForm.tsx, manejarFocusIncidencias/Detalle). Sin
// esto, el ScrollView no tiene contenido de sobra debajo del último campo
// como para scrollear tan arriba como hace falta — se queda corto contra el
// límite de su propio contenido, sin importar qué tan preciso sea el
// cálculo de scrollTo. El valor aproxima una altura de teclado generosa
// (iOS con barra predictiva incluida); no es un token de ritmo visual como
// el resto de `espaciado`, por eso vive aparte con su propio nombre.
export const ESPACIO_EXTRA_TECLADO = 300;

export const radios = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
};
