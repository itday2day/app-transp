import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { guardarValor, obtenerValor, borrarValor } from "@/services/almacenamientoSeguro";
import { supabase } from "@/lib/supabase";
import { Usuario } from "@/types";
import { iniciarSesion as iniciarSesionApi, cerrarSesion as cerrarSesionApi } from "@/services/authService";
import { restaurarSesion } from "./restaurarSesion";

const CLAVE_USUARIO = "app_transp_usuario";

interface AuthContextValor {
  usuario: Usuario | null;
  cargando: boolean;
  iniciarSesion: (identificador: string, contrasena: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
  // Único punto que establece una sesión "completa" (estado en memoria + SecureStore) -- paso 2b,
  // punto 4a. TODOS los caminos de entrada terminan acá: iniciarSesion() (login por número o, en
  // el paso 2c, por correo) y, desde el paso 2c, verifyOtp de signup y el cambiarContrasena() de
  // recovery. Antes de este paso, iniciarSesion() guardaba y seteaba por su cuenta -- ahora llama
  // a esto, para que ningún camino de entrada nuevo pueda volver a desincronizar el Usuario en
  // memoria del que persiste SecureStore.
  establecerSesion: (usuario: Usuario) => Promise<void>;
  // Llamada por CambiarContrasenaObligatorioScreen tras un cambio exitoso — actualiza el usuario
  // en memoria Y en SecureStore (si no se persistiera acá también, cerrar y reabrir la app antes
  // de la próxima sincronización de sesión volvería a mostrar la pantalla obligatoria con una
  // contraseña que ya cambió).
  marcarContrasenaCambiada: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValor | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  const establecerSesion = useCallback(async (nuevoUsuario: Usuario) => {
    await guardarValor(CLAVE_USUARIO, JSON.stringify(nuevoUsuario));
    setUsuario(nuevoUsuario);
  }, []);

  useEffect(() => {
    Promise.all([
      obtenerValor(CLAVE_USUARIO),
      // Espera a que supabase-js termine de restaurar (y refrescar si hace
      // falta) la sesión persistida en SecureStore antes de dar por lista la
      // carga — si no, las primeras consultas RLS del árbol de pantallas
      // podrían dispararse todavía sin sesión activa.
      supabase.auth.getSession(),
    ])
      .then(async ([guardado, resultadoGetSession]) => {
        // restaurarSesion() es la función pura de restaurarSesion.ts (paso 2b, punto 4b) --
        // decide entre "valida"/"caducada"/"indeterminada" según lo medido contra auth-js real
        // (ver el comentario de ese archivo), no según una suposición de qué forma tiene un
        // error de red.
        const restaurado = restaurarSesion(guardado, resultadoGetSession);

        if (restaurado.resultado === "caducada") {
          // Decisión 2, Fase 1c: un app_transp_usuario viejo sin sesión de Supabase válida se
          // trata como sesión caducada -- vuelve al login sin error visible ni cuelgue.
          if (guardado) await borrarValor(CLAVE_USUARIO);
          setUsuario(null);
          return;
        }

        // "valida" o "indeterminada" (sin red: se conserva el Usuario para que el chofer pueda
        // seguir trabajando offline con el token vencido). En los dos casos se re-persiste el
        // Usuario ya normalizado -- si el guardado era viejo (con `numeroEmpleado`, sin
        // `empresaDefecto`/`rutaDefecto`), restaurarSesion() ya lo reconstruyó sin ese campo;
        // volver a guardarlo acá deja SecureStore con la forma nueva (punto 4c).
        await guardarValor(CLAVE_USUARIO, JSON.stringify(restaurado.usuario));
        setUsuario(restaurado.usuario);
      })
      .finally(() => setCargando(false));
  }, []);

  const iniciarSesion = useCallback(
    async (identificador: string, contrasena: string) => {
      const usuarioAutenticado = await iniciarSesionApi(identificador, contrasena);
      await establecerSesion(usuarioAutenticado);
    },
    [establecerSesion]
  );

  const cerrarSesion = useCallback(async () => {
    await cerrarSesionApi();
    await borrarValor(CLAVE_USUARIO);
    setUsuario(null);
  }, []);

  const marcarContrasenaCambiada = useCallback(async () => {
    setUsuario((actual) => {
      if (!actual) return actual;
      const actualizado = { ...actual, debeCambiarContrasena: false };
      guardarValor(CLAVE_USUARIO, JSON.stringify(actualizado));
      return actualizado;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{ usuario, cargando, iniciarSesion, cerrarSesion, establecerSesion, marcarContrasenaCambiada }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValor {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error("useAuth debe usarse dentro de un AuthProvider");
  return contexto;
}
