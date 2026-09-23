import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { guardarValor, obtenerValor, borrarValor } from "@/services/almacenamientoSeguro";
import { supabase } from "@/lib/supabase";
import { Usuario } from "@/types";
import { iniciarSesion as iniciarSesionApi, cerrarSesion as cerrarSesionApi } from "@/services/authService";

const CLAVE_USUARIO = "app_transp_usuario";

interface AuthContextValor {
  usuario: Usuario | null;
  cargando: boolean;
  iniciarSesion: (numeroEmpleado: string, contrasena: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
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

  useEffect(() => {
    Promise.all([
      obtenerValor(CLAVE_USUARIO),
      // Espera a que supabase-js termine de restaurar (y refrescar si hace
      // falta) la sesión persistida en SecureStore antes de dar por lista la
      // carga — si no, las primeras consultas RLS del árbol de pantallas
      // podrían dispararse todavía sin sesión activa.
      supabase.auth.getSession(),
    ])
      .then(([guardado]) => {
        if (guardado) setUsuario(JSON.parse(guardado));
      })
      .finally(() => setCargando(false));
  }, []);

  const iniciarSesion = useCallback(async (numeroEmpleado: string, contrasena: string) => {
    const usuarioAutenticado = await iniciarSesionApi(numeroEmpleado, contrasena);
    await guardarValor(CLAVE_USUARIO, JSON.stringify(usuarioAutenticado));
    setUsuario(usuarioAutenticado);
  }, []);

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
      value={{ usuario, cargando, iniciarSesion, cerrarSesion, marcarContrasenaCambiada }}
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
