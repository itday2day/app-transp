import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import * as Network from "expo-network";
import { AppState } from "react-native";
import { useAuth } from "@/context/AuthContext";
import {
  hayJornadasPendientes,
  sincronizarPendientes,
  sincronizarCambiosDelServidor,
  descargarCatalogo,
  JornadaCorregida,
  MAX_INTENTOS,
} from "@/services/syncService";
import { reiniciarIntentosAgotadosDeChofer } from "@/db/jornadasRepo";
import { debeForzarRedescargaCatalogo } from "@/utils/decisionRedescargaCatalogo";
import { Jornada } from "@/types";

interface NetworkContextValor {
  conectado: boolean;
  sincronizando: boolean;
  ultimaSincronizacion: Date | null;
  sincronizarAhora: (forzarReintento?: boolean) => Promise<void>;
  /** Momento de la última corrida de `sincronizarCambiosDelServidor` que efectivamente cerró
   * alguna jornada remotamente (antes Hallazgo #9, `reconciliarJornadasAbiertas` por separado —
   * ver la consolidación en syncService.ts, spec_correccion_gana_dashboard.md) — `null` hasta que
   * pase la primera vez. `useJornadasAbiertas()` lo escucha para refrescar su lista aunque
   * `CheckInScreen` no tenga el foco en ese momento (bottom-tabs no la desmonta al cambiar de
   * pestaña, así que sigue reaccionando igual). */
  jornadasReconciliadasEn: Date | null;
  /** Última tanda de jornadas recuperadas desde Supabase (antes Hallazgo #27,
   * `recuperarJornadasAbiertas` por separado) — jornadas abiertas que existían en el servidor
   * pero no en este teléfono (desinstalación, Android limpiando almacenamiento). `[]` hasta que
   * pase la primera vez o si nunca hay nada que recuperar (el caso común). `useJornadasAbiertas()`
   * lo usa para avisar en pantalla, no solo para refrescar la lista — "se recuperó" es información
   * que el chofer tiene que ver, no un refresco silencioso. */
  jornadasRecuperadas: Jornada[];
  /** Última tanda de correcciones de campo del administrador aplicadas en este teléfono
   * (Hallazgo #28, spec_correccion_gana_dashboard.md) — incluye tanto un cierre remoto (Hallazgo
   * #6/#9, ahora una corrección de campo más) como cualquier otro campo que el trigger de
   * `schema_v10_correccion_admin_gana.sql` haya protegido. `[]` hasta que pase la primera vez o si
   * nunca hay nada que corregir (el caso común). `useJornadasAbiertas()` lo usa para avisar en
   * pantalla qué campos cambiaron, mismo criterio que `jornadasRecuperadas`: esto es información
   * que el chofer tiene que ver, no un refresco silencioso. */
  jornadasCorregidas: JornadaCorregida[];
}

const NetworkContext = createContext<NetworkContextValor | undefined>(undefined);

const INTERVALO_REVISION_MS = 15000;
// spec_catalogo_empresas_rutas.md: 60 minutos entre descargas del catálogo cuando la app vuelve
// a primer plano -- aparte de la descarga al arranque en frío (ultima=null la primera vez).
const INTERVALO_CATALOGO_MS = 60 * 60 * 1000;

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth();
  const [conectado, setConectado] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimaSincronizacion, setUltimaSincronizacion] = useState<Date | null>(null);
  const [jornadasReconciliadasEn, setJornadasReconciliadasEn] = useState<Date | null>(null);
  const [jornadasRecuperadas, setJornadasRecuperadas] = useState<Jornada[]>([]);
  const [jornadasCorregidas, setJornadasCorregidas] = useState<JornadaCorregida[]>([]);
  const sincronizandoRef = useRef(false);

  const sincronizarAhora = useCallback(
    async (forzarReintento = false) => {
      // Criterio 1 (spec_sync_sin_sesion_no_agota_intentos.md, Hallazgo #56): antes esta función
      // no comprobaba `usuario` (a diferencia de sincronizarDescargaSiCorresponde/
      // descargarCatalogoSiCorresponde, más abajo) y corría igual con el Login a la vista -- sin
      // sesión, `auth.uid()` es NULL y la policy de `jornadas` rechaza el upsert, agotando los 5
      // intentos de una jornada pendiente en ~75s (ver el comentario grande de MAX_INTENTOS en
      // syncService.ts). Va antes que el guard de abajo: sin usuario, no hay nada que hacer, ni
      // siquiera vale la pena tomar sincronizandoRef.
      if (!usuario) return;
      if (sincronizandoRef.current) return;
      sincronizandoRef.current = true;
      try {
        const estado = await Network.getNetworkStateAsync();
        if (!estado.isConnected || !estado.isInternetReachable) return;

        // El chequeo corre cada 15s (ver INTERVALO_REVISION_MS) y la enorme
        // mayoría de las veces no hay nada pendiente — sin este chequeo previo,
        // el banner "Sincronizando…" de BannerConexion prendía y apagaba en
        // cada corrida, así la app estuviera al día, dando un parpadeo visible
        // cada 15s. Ahora solo se enciende cuando de verdad hay algo que subir.
        if (!(await hayJornadasPendientes(forzarReintento))) return;

        setSincronizando(true);
        try {
          const resultadoSync = await sincronizarPendientes(forzarReintento);
          setUltimaSincronizacion(new Date());
          // spec_catalogo_por_chofer.md (criterio 19, diagnóstico 6): al menos una jornada subió
          // de verdad -- si viajaba una empresa/ruta "pendiente de revisión" (recién creada por el
          // trigger del servidor), el catálogo ya cambió del lado del servidor.
          // debeForzarRedescargaCatalogo() es pura (decisionRedescargaCatalogo.ts) -- acá solo se
          // usa su resultado para limpiar el throttle de abajo (catalogoUltimaDescargaRef,
          // capturado en este cierre aunque se declare más adelante en el componente -- JS solo
          // exige que ya esté inicializado CUANDO esto corra, no que la declaración textual venga
          // antes), para que el PRÓXIMO `revisar()` (hasta INTERVALO_REVISION_MS después, nunca
          // este mismo tick) haga una descarga real por `descargarCatalogoSiCorresponde()`. Sin
          // loop: esto solo borra un flag, no llama a nada -- y una descarga nunca dispara, a su
          // vez, una sincronización.
          if (debeForzarRedescargaCatalogo(resultadoSync)) catalogoUltimaDescargaRef.current = null;
        } finally {
          setSincronizando(false);
        }
      } finally {
        sincronizandoRef.current = false;
      }
    },
    [usuario]
  );

  // Criterio 5 (spec_sync_sin_sesion_no_agota_intentos.md, Opción 1 de §2): al pasar de "sin
  // usuario" a "con usuario" (login, registro, restauración al abrir la app) se reinician los
  // intentos de las jornadas DE ESE chofer que quedaron atascadas por agotar MAX_INTENTOS, y se
  // fuerza una sincronización -- así una jornada ya atascada por una versión anterior, o por un
  // error que esta misma versión clasificó mal, se rescata sola al volver a entrar. Engancha al
  // `id` (`usuario?.id`), no a la referencia del objeto `usuario` (Fase 1, sección 3.1 punto 5:
  // `programarRecargaUsuario` puede reaplicar un Usuario con el MISMO id pero otra referencia) --
  // con `idAnteriorRef` como memoria de la última transición vista, esto corre UNA sola vez por
  // transición real "ninguno -> un id", nunca una vez por cada `aplicarUsuario` repetido con el
  // mismo id. El reinicio se espera (`await`) antes de llamar a `sincronizarAhora` para que
  // `obtenerPendientesSincronizacion` ya vea las filas reseteadas; `sincronizarAhora` sin forzar
  // alcanza (`intentosSincronizacion` ya quedó en 0) y de paso respeta su propio guard
  // (`sincronizandoRef`, criterio 6) -- nunca una segunda vía de subida en paralelo.
  const idAnteriorRef = useRef<string | null>(null);
  useEffect(() => {
    const idActual = usuario?.id ?? null;
    const idAnterior = idAnteriorRef.current;
    idAnteriorRef.current = idActual;
    if (idAnterior === null && idActual !== null) {
      reiniciarIntentosAgotadosDeChofer(idActual, MAX_INTENTOS)
        .then(() => sincronizarAhora())
        .catch((err) => console.error("reiniciarIntentosAgotadosDeChofer falló:", err));
    }
  }, [usuario?.id, sincronizarAhora]);

  // Descarga: baja de Supabase lo que cambió sin que la app estuviera mirando — un administrador
  // que cerró una jornada desde el Dashboard ("Corregir", Hallazgo #6), o una jornada abierta que
  // existe en el servidor pero el teléfono nunca llegó a conocer (Hallazgo #27). Antes eran dos
  // funciones separadas (`reconciliarJornadasAbiertas`/`recuperarJornadasAbiertas`); se
  // consolidaron en `sincronizarCambiosDelServidor()` (ver ese comentario en syncService.ts para
  // el razonamiento completo) — acá solo queda UN callback, en vez de dos corriendo en paralelo
  // sobre el mismo ciclo. Función separada de `sincronizarAhora` (no un paso más adentro de
  // ella): son dos preocupaciones distintas — "subir lo que tengo pendiente" vs. "bajar lo que
  // cambió sin mí" — que solo comparten el mismo ciclo de revisión.
  const sincronizarDescargaSiCorresponde = useCallback(async () => {
    if (!usuario) {
      console.log("[H28-sync] sincronizarDescargaSiCorresponde: sin usuario en contexto, se saltea");
      return;
    }
    try {
      const { recuperadas, cerradasRemoto, corregidas } = await sincronizarCambiosDelServidor(usuario.id);
      if (cerradasRemoto.length > 0) setJornadasReconciliadasEn(new Date());
      if (recuperadas.length > 0) setJornadasRecuperadas(recuperadas);
      if (corregidas.length > 0) setJornadasCorregidas(corregidas);
    } catch (err) {
      console.error(
        "[H28-sync] sincronizarDescargaSiCorresponde falló (excepción no capturada más adentro):",
        err
      );
      console.error("sincronizarDescargaSiCorresponde falló:", err);
    }
  }, [usuario]);

  // Catálogo de empresas/rutas (spec_catalogo_empresas_rutas.md, Hallazgo #48): preocupación
  // separada de sincronizarDescargaSiCorresponde de arriba -- "traer el catálogo compartido" no
  // tiene nada que ver con "traer cambios de MIS jornadas", aunque las dos corran en el mismo
  // ciclo de revisión. `catalogoUltimaDescargaRef` (en memoria, no persistido -- se reinicia en
  // cada arranque frío a propósito) evita volver a pedirlo en cada corrida de 15s: solo descarga
  // de nuevo si pasó más de INTERVALO_CATALOGO_MS desde la última vez que SÍ se pudo bajar. Nunca
  // antes de que haya un chofer logueado (ver el `if (!usuario)` de abajo) -- sin sesión, Supabase
  // ni se consulta.
  const catalogoUltimaDescargaRef = useRef<number | null>(null);
  // Guard de concurrencia (Hallazgo #60; spec_transaccion_catalogo_sqlite.md) -- mismo patrón que
  // sincronizandoRef más arriba. Sin esto, dos disparos seguidos de `usuario` cambiando justo
  // después de login/registro (AuthContext.tsx + programarRecargaUsuario.ts) podían arrancar dos
  // descargarCatalogo() en paralelo sobre la misma conexión SQLite compartida (src/db/database.ts
  // cachea una sola conexión para toda la app).
  const descargandoCatalogoRef = useRef(false);
  const descargarCatalogoSiCorresponde = useCallback(async () => {
    if (!usuario) return;
    if (descargandoCatalogoRef.current) return;
    const ultima = catalogoUltimaDescargaRef.current;
    if (ultima != null && Date.now() - ultima < INTERVALO_CATALOGO_MS) return;
    descargandoCatalogoRef.current = true;
    try {
      await descargarCatalogo();
      catalogoUltimaDescargaRef.current = Date.now();
    } catch (err) {
      console.error("descargarCatalogoSiCorresponde falló:", err);
    } finally {
      descargandoCatalogoRef.current = false;
    }
  }, [usuario]);

  useEffect(() => {
    let activo = true;

    async function revisar() {
      const estado = await Network.getNetworkStateAsync();
      const haySenal = Boolean(estado.isConnected && estado.isInternetReachable);
      // Instrumentación temporal (Hallazgo #28): expo-network es conocido por reportar
      // isInternetReachable en falso/null en algunos Android aunque haya señal real -- si
      // haySenal da false acá de forma persistente con datos/wifi andando, sincronizarAhora()/
      // sincronizarDescargaSiCorresponde() de abajo NUNCA se llaman, y eso explicaría que nada se
      // aplique "ni con señal, ni sin señal".
      console.log(
        `[H28-sync] revisar(): isConnected=${estado.isConnected}, isInternetReachable=${estado.isInternetReachable}, type=${estado.type}, haySenal=${haySenal}`
      );
      if (!activo) return;
      setConectado(haySenal);
      if (haySenal) {
        sincronizarAhora();
        sincronizarDescargaSiCorresponde();
        descargarCatalogoSiCorresponde();
      }
    }

    revisar();
    const intervalo = setInterval(revisar, INTERVALO_REVISION_MS);
    const suscripcion = AppState.addEventListener("change", (estado) => {
      if (estado === "active") revisar();
    });

    return () => {
      activo = false;
      clearInterval(intervalo);
      suscripcion.remove();
    };
  }, [sincronizarAhora, sincronizarDescargaSiCorresponde, descargarCatalogoSiCorresponde]);

  return (
    <NetworkContext.Provider
      value={{
        conectado,
        sincronizando,
        ultimaSincronizacion,
        sincronizarAhora,
        jornadasReconciliadasEn,
        jornadasRecuperadas,
        jornadasCorregidas,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValor {
  const contexto = useContext(NetworkContext);
  if (!contexto) throw new Error("useNetwork debe usarse dentro de un NetworkProvider");
  return contexto;
}
