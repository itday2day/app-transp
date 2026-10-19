import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { guardarValor, obtenerValor, borrarValor } from "@/services/almacenamientoSeguro";
import { supabase } from "@/lib/supabase";
import { Usuario } from "@/types";
import { cerrarSesion as cerrarSesionApi } from "@/services/authService";
import { iniciarSesionCore, type ResultadoLogin } from "@/services/authCore";
import { restaurarSesion, resultadoGetSessionTrasRechazo } from "./restaurarSesion";
import { manejarEventoAuth } from "./manejarEventoAuth";
import { programarRecargaUsuario } from "./programarRecargaUsuario";

const CLAVE_USUARIO = "app_transp_usuario";

interface AuthContextValor {
  usuario: Usuario | null;
  cargando: boolean;
  // Paso 2c-0 (P6): ya NO lanza -- devuelve el ResultadoLogin completo (authCore.ts) para que la
  // pantalla decida qué mostrar según `clave` (ej. "correoSinConfirmar" -> navegar a la pantalla
  // de código, 2c-1) en vez de colapsar todo a un único error genérico. Llama a
  // iniciarSesionCore() directo (ya no pasa por el envoltorio de authService.ts, retirado en este
  // mismo commit por quedar sin ningún otro llamador) y, si `ok:true`, ya llamó a
  // establecerSesion() internamente -- el llamador no tiene que hacerlo de nuevo.
  iniciarSesion: (identificador: string, contrasena: string) => Promise<ResultadoLogin>;
  cerrarSesion: () => Promise<void>;
  // Único punto que establece una sesión "completa" (estado en memoria + SecureStore) -- paso 2b,
  // punto 4a. TODOS los caminos de entrada terminan acá: iniciarSesion() (arriba), y desde el paso
  // 2c, verifyOtp de signup y terminarRecuperacion() de recovery. Paso 2c-0 (P4): además de
  // guardar y aplicar, SIEMPRE dispara en segundo plano la misma recarga que antes solo corría en
  // el efecto de montaje (programarRecargaUsuario()) -- si el Usuario que llegó ya era completo
  // (no un usuarioMinimo), reaplicar el mismo dato leído de nuevo es inocuo; si era un
  // usuarioMinimo, esta es la única oportunidad de corregirlo para los caminos de entrada que no
  // sea el arranque en frío.
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

  // Corrección D1: antes, esta ref se sincronizaba desde un `useEffect(() => {...}, [usuario])`
  // -- un render DESPUÉS de cada `setUsuario`, no en el mismo punto. Un callback async que
  // resolviera justo en esa ventana (entre el `setUsuario` y el efecto corriendo) podía leer
  // `usuarioRef.current` todavía VIEJO. `aplicarUsuario()` (abajo) es ahora el ÚNICO camino para
  // cambiar el Usuario -- pone la ref y el estado de React en el MISMO punto, sin esperar a
  // ningún render ni efecto. Ningún otro lugar de este archivo llama a `setUsuario` directo.
  const usuarioRef = useRef<Usuario | null>(usuario);
  const aplicarUsuario = useCallback((nuevoUsuario: Usuario | null) => {
    usuarioRef.current = nuevoUsuario;
    setUsuario(nuevoUsuario);
  }, []);

  const establecerSesion = useCallback(
    async (nuevoUsuario: Usuario) => {
      await guardarValor(CLAVE_USUARIO, JSON.stringify(nuevoUsuario));
      aplicarUsuario(nuevoUsuario);
      programarRecargaUsuario(nuevoUsuario.id, {
        cliente: supabase,
        obtenerUsuarioActual: () => usuarioRef.current,
        aplicarUsuario,
        persistirUsuario: (u) => guardarValor(CLAVE_USUARIO, JSON.stringify(u)),
      });
    },
    [aplicarUsuario]
  );

  // Hueco cerrado tras el punto 4.3: si el refresh falla de forma NO retryable mientras la app
  // sigue abierta (ej. un refresh token revocado/rotado, no un corte de red/infraestructura),
  // auth-js lo emite como "SIGNED_OUT" -- medido (ver manejarEventoAuth.ts): SOLO en ese caso,
  // nunca con un 503 ni con un fetch que rechaza (esos, confirmado, no emiten nada salvo el
  // "INITIAL_SESSION" de la suscripción misma). Sin esto, el Usuario en memoria/SecureStore
  // quedaba congelado indefinidamente aunque supabase-js ya supiera que la sesión murió.
  //
  // Se suscribe ANTES del efecto de abajo (que puede llamar su propio signOut({scope:"local"}) en
  // "caducada") para que esa emisión también pase por este mismo manejador -- ver manejarEventoAuth.ts,
  // que ya es idempotente frente a eso (usuario ya null -> no-op, nunca doble borrado).
  useEffect(() => {
    const { data: suscripcion } = supabase.auth.onAuthStateChange((event) => {
      // Diferido con setTimeout(…, 0): este callback corre DENTRO de la notificación interna de
      // auth-js (_notifyAllSubscribers) -- hacer cualquier trabajo (no solo llamar a supabase-js
      // de nuevo) directo acá es el riesgo de bloqueo documentado para onAuthStateChange. Nada de
      // lo de abajo hace await de ningún método de `supabase` -- manejarEventoAuth() ni siquiera
      // conoce el cliente -- pero el setTimeout sigue siendo la práctica defensiva recomendada
      // para TODO el cuerpo de este callback, no solo para llamadas a supabase-js.
      //
      // Corrección C2: la decisión (manejarEventoAuth) y el efecto secundario (borrarValor) corren
      // AFUERA de `setUsuario` -- el updater queda puro (solo pone `null`, vía aplicarUsuario).
      // `usuarioRef.current` (no el `usuario` del closure de este efecto, que quedó fijo en el
      // valor del montaje) es la lectura correcta del Usuario actual -- y ahora SIEMPRE está al
      // día, sin la ventana de desfase que tenía el efecto de sincronización viejo (punto D1).
      setTimeout(() => {
        const decision = manejarEventoAuth(event, usuarioRef.current);
        if (decision.accion === "ignorar") return;
        void borrarValor(CLAVE_USUARIO);
        aplicarUsuario(null);
      }, 0);
    });
    return () => suscripcion.subscription.unsubscribe();
  }, [aplicarUsuario]);

  useEffect(() => {
    Promise.all([
      obtenerValor(CLAVE_USUARIO),
      // Espera a que supabase-js termine de restaurar (y refrescar si hace
      // falta) la sesión persistida en SecureStore antes de dar por lista la
      // carga — si no, las primeras consultas RLS del árbol de pantallas
      // podrían dispararse todavía sin sesión activa.
      //
      // E4: .catch() propio -- si getSession() alguna vez RECHAZA (nunca medido así, ver
      // restaurarSesion.ts), este Promise.all() no debe propagar ese rechazo sin atrapar: sin
      // esto, el .then() de abajo (donde se llama a restaurarSesion()) nunca correría, y el
      // Usuario guardado quedaría sin aplicar para siempre (hallazgo de la observación 0.2).
      // resultadoGetSessionTrasRechazo() lo convierte en el MISMO shape que un
      // AuthRetryableFetchError real -- restaurarSesion() ya sabe decidir con eso.
      supabase.auth.getSession().catch(() => resultadoGetSessionTrasRechazo()),
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
          //
          // Punto 4.1: además de borrar `app_transp_usuario`, se cierra la sesión de supabase-js
          // con `signOut({ scope: "local" })` -- cubre el caso inverso (hay sesión de supabase-js
          // pero NO hay Usuario guardado: un registro o una recuperación interrumpidos a mitad de
          // camino, ver verificarCodigo()/cambiarContrasena() en authCore.ts, que dejan sesión
          // abierta antes de que la app establezca ningún Usuario). `scope: "local"` -- no
          // `"global"` -- porque esto corre SIEMPRE que restaurarSesion() da "caducada", incluida
          // la rama donde la razón YA es de red/servidor caído (ver restaurarSesion.ts): un
          // `signOut` sin `scope: "local"` intenta avisarle al servidor (llamada de red) antes de
          // limpiar el storage local, y esa llamada podría fallar o demorar sin necesidad --
          // `"local"` solo limpia el storage de este dispositivo, sin depender de que el servidor
          // responda.
          if (guardado) await borrarValor(CLAVE_USUARIO);
          await supabase.auth.signOut({ scope: "local" });
          aplicarUsuario(null);
          return;
        }

        aplicarUsuario(restaurado.usuario);

        // "valida" o "indeterminada" (sin red: se conserva el Usuario para que el chofer pueda
        // seguir trabajando offline con el token vencido). En los dos casos se re-persiste el
        // Usuario ya normalizado -- si el guardado era viejo (con `numeroEmpleado`, sin
        // `empresaDefecto`/`rutaDefecto`), restaurarSesion() ya lo reconstruyó sin ese campo;
        // volver a guardarlo acá deja SecureStore con la forma nueva (punto 4c).
        await guardarValor(CLAVE_USUARIO, JSON.stringify(restaurado.usuario));

        // Punto 4.2 (y, desde 2c-0, P4): SOLO con "valida" (hay sesión real confirmada, no solo el
        // Usuario cacheado) se dispara una recarga EN SEGUNDO PLANO -- corrige `nombre: ""` (si el
        // guardado venía de un usuarioMinimo) y los `empresaDefecto`/`rutaDefecto` en null de un
        // guardado viejo, sin esperarla para bajar `cargando` (no bloquea el arranque). Con
        // "indeterminada" NO se intenta (no hay red; sería una llamada perdida).
        //
        // programarRecargaUsuario() (ya no inline acá, ver ese archivo) es el MISMO mecanismo que
        // establecerSesion() usa para login/verifyOtp(signup)/terminarRecuperacion() -- un solo
        // lugar que decide si aplicar o descartar un resultado tardío (resultadoRecargaUsuario(),
        // corrección C1), en vez de una copia de esa orquestación por cada camino de entrada.
        if (restaurado.resultado === "valida") {
          programarRecargaUsuario(restaurado.usuario.id, {
            cliente: supabase,
            obtenerUsuarioActual: () => usuarioRef.current,
            aplicarUsuario,
            persistirUsuario: (u) => guardarValor(CLAVE_USUARIO, JSON.stringify(u)),
          });
        }
      })
      .finally(() => setCargando(false));
  }, [aplicarUsuario]);

  const iniciarSesion = useCallback(
    async (identificador: string, contrasena: string): Promise<ResultadoLogin> => {
      const resultado = await iniciarSesionCore(identificador, contrasena, supabase);
      if (resultado.ok) {
        try {
          await establecerSesion(resultado.usuario);
        } catch {
          // Observación 0.3 (cierre de 2c-0): establecerSesion() llama a guardarValor()
          // (SecureStore.setItemAsync, una operación nativa real) ANTES de aplicarUsuario() -- si
          // ese guardado rechaza, ni se persiste ni se aplica el Usuario, y supabase-js YA
          // autenticó la sesión (iniciarSesionCore corrió signInWithPassword con éxito antes de
          // llegar acá). Nunca se deja que ese rechazo suba sin atrapar -- la pantalla lo vería
          // como una promesa rechazada y, sin su propio try/finally, podría quedar con el botón
          // "cargando" trabado para siempre. Se devuelve "generico" (no hay una clave más
          // específica: esto no es un error de credenciales ni de red, es un fallo de
          // almacenamiento local). La sesión de Supabase que quedó abierta sin Usuario
          // persistido se limpia sola en el próximo arranque: restaurarSesion.ts:121
          // (`if (!guardadoJson) return { resultado: "caducada" }`) -- sin `app_transp_usuario`
          // guardado, el próximo mount la trata como "caducada" y llama
          // `signOut({ scope: "local" })` (AuthContext.tsx, rama "caducada" del efecto de
          // montaje) -- el mismo camino que ya cubre un registro/recuperación interrumpidos.
          return { ok: false, clave: "generico" };
        }
      }
      return resultado;
    },
    [establecerSesion]
  );

  const cerrarSesion = useCallback(async () => {
    await cerrarSesionApi();
    await borrarValor(CLAVE_USUARIO);
    aplicarUsuario(null);
  }, [aplicarUsuario]);

  const marcarContrasenaCambiada = useCallback(async () => {
    const actual = usuarioRef.current;
    if (!actual) return;
    const actualizado = { ...actual, debeCambiarContrasena: false };
    await guardarValor(CLAVE_USUARIO, JSON.stringify(actualizado));
    aplicarUsuario(actualizado);
  }, [aplicarUsuario]);

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
