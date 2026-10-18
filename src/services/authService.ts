import { ErrorApi } from "./api";
import { supabase } from "@/lib/supabase";
import { Usuario } from "@/types";
import { iniciarSesionCore, correoParaReautenticar } from "./authCore";

// Punto 3.4: numeroEmpleadoAEmail() YA NO tiene su propia copia acá -- se importa de authCore.ts
// (arriba), que es quien la exporta ahora. Queda UNA sola copia en toda la app (más la del
// Dashboard, dashboard/lib/choferes.ts -- dos en total, no tres): el comentario de costo
// completo (por qué gmail.com con ese sufijo, Supabase Auth exigiendo un dominio de MX real,
// "Confirm email" desactivado) vive en authCore.ts, donde está la función de verdad.

// Envoltorio sobre authCore.ts/iniciarSesionCore() (paso 2b) con el singleton `supabase` real --
// mismo contrato que usan hoy las pantallas (LoginScreen.tsx, CambiarContrasenaScreen.tsx): recibe
// lo que hoy siempre es un número de empleado (identificadorACorreo(), dentro del núcleo, ya sabe
// resolver un correo real también, pero ninguna pantalla envía uno todavía -- eso es del paso 2c)
// y devuelve un Usuario o lanza ErrorApi(401, ...), igual que antes. Colapsa TODOS los resultados
// de error del núcleo (credenciales, sin confirmar, dado de baja, red) al mismo 401 genérico de
// siempre -- distinguirlos de verdad en la UI es trabajo de las pantallas nuevas del paso 2c, que
// van a llamar a iniciarSesionCore() directo en vez de a esta función.
export async function iniciarSesion(identificador: string, contrasena: string): Promise<Usuario> {
  const resultado = await iniciarSesionCore(identificador, contrasena, supabase);
  if (!resultado.ok) {
    throw new ErrorApi(401, "Número de empleado o contraseña incorrectos.");
  }
  return resultado.usuario;
}

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
// Corrección C4: el `numeroEmpleado` que recibe esta función es el que el chofer TIPEÓ en
// CambiarContrasenaScreen.tsx (un campo de texto de esa pantalla, que vive SIN sesión, antes de
// cualquier login) -- NO viene del tipo `Usuario` (que ya no tiene `numeroEmpleado` desde el paso
// 2b punto 1) ni de ningún Usuario en memoria. Antes, re-autenticaba SIEMPRE con
// `numeroEmpleadoAEmail(numeroEmpleado)`, es decir, con el correo SINTÉTICO -- correcto solo para
// cuentas viejas (hoy, solo chofer 01) y roto para cualquier chofer que ya se registró con su
// propio correo real (paso 5, Hallazgo #51): esa cuenta NO tiene el correo sintético en Auth, el
// `signInWithPassword` fallaría siempre con "credenciales incorrectas", aunque la contraseña
// actual fuera correcta. Ahora intenta leer el correo REAL de la sesión ya activa
// (`supabase.auth.getSession()` -- esta función solo se llama con sesión válida, ver el comentario
// de arriba) y solo cae al sintético si esa sesión no trae correo (chofer 01, o cualquier cuenta
// vieja que siga usando el correo sintético en Auth).
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
  const correo = await correoParaReautenticar(numeroEmpleado, supabase);
  const { error: errorReauth } = await supabase.auth.signInWithPassword({
    email: correo,
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
