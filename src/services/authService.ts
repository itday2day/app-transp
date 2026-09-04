import { ErrorApi } from "./api";
import { supabase } from "@/lib/supabase";
import { NuevoRegistro, Usuario } from "@/types";

// Supabase Auth exige correo con dominio de MX real (dominios inventados como
// "*.internal" o un ".com" sin registrar son rechazados por su validación),
// así que se usa gmail.com con un sufijo fijo de alta entropía — el chofer
// sigue identificándose por numeroEmpleado en toda la UI, esto solo se usa
// para hablar con Auth, y como "Confirm email" está desactivado nunca se le
// envía nada a esa dirección.
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

  const { data: perfil, error: errorPerfil } = await supabase
    .from("choferes")
    .select("nombre")
    .eq("id", data.user.id)
    .single();

  if (errorPerfil || !perfil) {
    throw new ErrorApi(401, "No se pudo cargar el perfil del chofer.");
  }

  return { id: data.user.id, nombre: perfil.nombre, numeroEmpleado };
}

export async function cerrarSesion(): Promise<void> {
  await supabase.auth.signOut();
}

export async function registrarCuenta(datos: NuevoRegistro): Promise<void> {
  const { data, error } = await supabase.auth.signUp({
    email: numeroEmpleadoAEmail(datos.numeroEmpleado),
    password: datos.contrasena,
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      throw new ErrorApi(409, "Ese número de empleado ya está registrado.");
    }
    if (error.status === 429) {
      throw new ErrorApi(429, error.message);
    }
    throw new ErrorApi(500, error.message);
  }
  if (!data.user) {
    throw new ErrorApi(500, "No se pudo crear la cuenta.");
  }

  const { error: errorPerfil } = await supabase.from("choferes").insert({
    id: data.user.id,
    numero_empleado: datos.numeroEmpleado,
    nombre: datos.nombre,
    apellidos: datos.apellidos,
    dni: datos.dni,
    fecha_nacimiento: datos.fechaNacimiento,
    pais_nacimiento: datos.paisNacimiento,
    sexo: datos.sexo,
  });
  if (errorPerfil) {
    throw new ErrorApi(500, errorPerfil.message);
  }
}
