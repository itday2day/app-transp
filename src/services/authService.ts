import { ErrorApi } from "./api";
import { supabase } from "@/lib/supabase";

// Punto 3.4: numeroEmpleadoAEmail() YA NO tiene su propia copia acá -- se importa de authCore.ts
// (abajo), que es quien la exporta ahora. Queda UNA sola copia en toda la app (más la del
// Dashboard, dashboard/lib/choferes.ts -- dos en total, no tres): el comentario de costo
// completo (por qué gmail.com con ese sufijo, Supabase Auth exigiendo un dominio de MX real,
// "Confirm email" desactivado) vive en authCore.ts, donde está la función de verdad.

// Paso 2c-0 (P6): el envoltorio `iniciarSesion()` que vivía acá se retiró -- AuthContext.tsx ya
// llama a iniciarSesionCore() directo con el singleton `supabase`, y colapsar todos los errores a
// un 401 genérico (lo que hacía este envoltorio) es exactamente lo que el paso 2c necesitaba dejar
// de hacer para poder distinguir "correoSinConfirmar" de una credencial incorrecta de verdad. Sin
// otro llamador en el repo (confirmado: solo AuthContext.tsx lo usaba), queda sin reemplazo acá.

export async function cerrarSesion(): Promise<void> {
  await supabase.auth.signOut();
}

// El alta por Dashboard con contraseña temporal (acá abajo) sigue vigente para choferes que ya
// dio de alta Administración. RegistroScreen.tsx (el registro propio viejo, de antes de
// spec_alta_choferes_dashboard.md) ya no existe -- el registro propio se está REINTRODUCIENDO por
// un camino distinto (Hallazgo #51, spec_app_registro_paso5.md): ver authCore.ts
// (registrarChofer/verificarCodigo, paso 2b) y las pantallas del paso 2c, no este archivo.
//
// Llamada obligatoria en el primer ingreso (o después de un reseteo) — CambiarContrasenaObligatorioScreen
// es la única pantalla que la usa. Cambia la contraseña en Auth y apaga la bandera en el perfil;
// las dos operaciones son sobre el propio usuario autenticado (RLS "chofer actualiza su propio
// perfil" ya lo permite, sin cambios de política).
export async function cambiarContrasenaObligatoria(nuevaContrasena: string): Promise<void> {
  const { data, error } = await supabase.auth.updateUser({ password: nuevaContrasena });
  if (error || !data.user) {
    throw new ErrorApi(500, error?.message ?? "No se pudo cambiar la contraseña.");
  }

  const { error: errorPerfil } = await supabase
    .from("choferes")
    .update({ debe_cambiar_contrasena: false })
    .eq("id", data.user.id);
  if (errorPerfil) {
    throw new ErrorApi(500, errorPerfil.message);
  }
}
