// spec_app_registro_paso5.md, paso 2b: valida SOLO el largo mínimo de contraseña que exige el
// propio servidor -- no inventa ninguna regla de complejidad porque el servidor no las exige.
//
// LARGO_MINIMO_CONTRASENA viene de una medición real, no de una suposición: panel de Supabase,
// Authentication > Policies > Password, "Minimum password length" = 6, medido el 2026-10-18. Si
// ese valor cambiara en el panel, hay que actualizar esta constante a mano -- no hay forma de
// leerlo desde el cliente.
//
// Cuenta caracteres TAL CUAL, sin recortar espacios: una contraseña con espacios al borde
// (" abc12") es una contraseña válida para el servidor (updateUser()/signUp() no la recorta), así
// que recortarla acá antes de contar rechazaría contraseñas que el servidor aceptaría.
//
// El código de error real del servidor para contraseña rechazada es "weak_password" (clave
// `contrasenaDebil`) -- NO existe todavía en mapearError.ts ni en ningún otro lugar de src/
// (confirmado por grep al escribir este archivo); queda fuera de este commit, pendiente de
// agregar cuando haga falta mapear un signUp/updateUser real que lo devuelva. Mientras tanto, el
// servidor sigue siendo la garantía real, igual que el trigger lo es para validarDatosRegistro():
// si esta función y el servidor alguna vez discrepan, manda el servidor.

const LARGO_MINIMO_CONTRASENA = 6;

export type ClaveErrorContrasena = "contrasenaCorta";

/** `null` significa "sin error". Única regla: largo mínimo, sin recortar espacios. */
export function validarContrasena(contrasena: string): ClaveErrorContrasena | null {
  return contrasena.length < LARGO_MINIMO_CONTRASENA ? "contrasenaCorta" : null;
}
