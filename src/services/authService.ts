import { ErrorApi } from "./api";
import { supabase } from "@/lib/supabase";
import { Usuario } from "@/types";

// Supabase Auth exige correo con dominio de MX real (dominios inventados como
// "*.internal" o un ".com" sin registrar son rechazados por su validación),
// así que se usa gmail.com con un sufijo fijo de alta entropía — el chofer
// sigue identificándose por numeroEmpleado en toda la UI, esto solo se usa
// para hablar con Auth, y como "Confirm email" está desactivado nunca se le
// envía nada a esa dirección.
//
// ⚠️ COPIADA (no compartida) en dashboard/lib/choferes.ts, con el mismo comentario de costo del
// otro lado — el Dashboard ahora crea choferes (spec_alta_choferes_dashboard.md) y tiene que
// generar EXACTAMENTE esta misma cadena. Si se toca acá, tocar también allá en el mismo commit.
function numeroEmpleadoAEmail(numeroEmpleado: string): string {
  return `apptransp.chofer.${numeroEmpleado}.f83a1c@gmail.com`;
}

// La contraseña viaja una sola vez, por HTTPS, directo a Supabase Auth
// (GoTrue) — nunca se guarda ni se compara en texto plano en ningún punto.
export async function iniciarSesion(numeroEmpleado: string, contrasena: string): Promise<Usuario> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: numeroEmpleadoAEmail(numeroEmpleado),
    password: contrasena,
  });

  if (error || !data.user) {
    throw new ErrorApi(401, "Número de empleado o contraseña incorrectos.");
  }

  // debe_cambiar_contrasena decide si RootNavigator.tsx manda a
  // CambiarContrasenaObligatorioScreen en vez de la app normal. No se chequea `activo` acá:
  // Supabase Auth ya lo hizo arriba — un chofer dado de baja tiene su credencial baneada
  // (ban_duration, ver dashboard/app/api/choferes/editar/route.ts) y signInWithPassword falla
  // antes de llegar a esta consulta. Un segundo chequeo acá sería una segunda fuente de verdad
  // que podría desincronizarse de la primera.
  const { data: perfil, error: errorPerfil } = await supabase
    .from("choferes")
    .select("nombre, debe_cambiar_contrasena")
    .eq("id", data.user.id)
    .single();

  if (errorPerfil || !perfil) {
    throw new ErrorApi(401, "No se pudo cargar el perfil del chofer.");
  }

  return {
    id: data.user.id,
    nombre: perfil.nombre,
    numeroEmpleado,
    debeCambiarContrasena: perfil.debe_cambiar_contrasena,
  };
}

export async function cerrarSesion(): Promise<void> {
  await supabase.auth.signOut();
}

// El alta pasó a ser exclusiva del Dashboard (spec_alta_choferes_dashboard.md) — el registro
// propio desde la app se deshabilitó, RegistroScreen.tsx ya no llama a nada de este archivo.
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

// Cambio voluntario (spec_deudas_app_movil.md, Parte A) — a diferencia de
// cambiarContrasenaObligatoria(), acá el chofer YA tiene una contraseña que él mismo eligió y
// puede cambiarla cuando quiera, no solo la primera vez. Dos diferencias con la obligatoria:
//
// 1. ⚠️ Verifica la contraseña ACTUAL de verdad, no solo la pide. `updateUser()` de Supabase no
//    la comprueba — cambia la contraseña de quien tenga sesión válida, sin preguntar nada. La
//    verificación real es un segundo `signInWithPassword` con la contraseña que el chofer dice
//    tener: si el servidor la acepta, es la correcta (y de paso, como efecto colateral inocuo,
//    refresca la sesión con tokens nuevos — no hay nada que limpiar ni reautenticar después). Si
//    la rechaza, se corta ACÁ, antes de tocar nada — el error 401 de iniciarSesion() ya significa
//    "credenciales incorrectas" en este mismo archivo, así que se reusa el mismo status en vez de
//    inventar uno nuevo, y CambiarContrasenaScreen lo distingue para mostrar el mensaje propio.
// 2. NO toca `debe_cambiar_contrasena` — ya está en false (si no, la pantalla que llama a esto ni
//    se vería, ver RootNavigator.tsx) y un cambio voluntario no es un reseteo: no tiene que volver
//    a obligar a nada en el próximo ingreso.
//
// Ninguna de las dos llamadas de acá abajo cierra la sesión ni toca SQLite — confirmado leyendo
// cerrarSesion() (arriba, este mismo archivo) y almacenamientoSeguro.ts: el logout solo borra la
// clave `app_transp_usuario` de SecureStore, nunca la base de jornadas. `updateUser()` tampoco
// invalida el token vigente. Es la pieza más importante de esta spec: si esto disparara un logout
// y el logout limpiara SQLite, un chofer con una jornada abierta sin sincronizar la perdería por
// hacer lo correcto.
export async function cambiarContrasenaVoluntaria(
  numeroEmpleado: string,
  contrasenaActual: string,
  contrasenaNueva: string
): Promise<void> {
  const { error: errorReauth } = await supabase.auth.signInWithPassword({
    email: numeroEmpleadoAEmail(numeroEmpleado),
    password: contrasenaActual,
  });
  if (errorReauth) {
    throw new ErrorApi(401, "La contraseña actual no es correcta.");
  }

  const { error } = await supabase.auth.updateUser({ password: contrasenaNueva });
  if (error) {
    throw new ErrorApi(500, error.message);
  }
}
