import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { obtenerJornadasAbiertas } from "@/db/jornadasRepo";
import { sincronizarCambiosDelServidor } from "@/services/syncService";
import { Jornada } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { useNetwork } from "@/context/NetworkContext";

// Un chofer puede tener varios viajes en curso a la vez (ver Tarea 6), así
// que este hook expone el arreglo completo en vez de una sola jornada.
export function useJornadasAbiertas() {
  const { t } = useTranslation();
  const { usuario } = useAuth();
  const { jornadasReconciliadasEn, jornadasRecuperadas, jornadasCorregidas } = useNetwork();
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    if (!usuario) return;
    setCargando(true);
    // Instrumentación temporal (Hallazgo #28): esta función espera a `sincronizarCambiosDelServidor`
    // (dos consultas a Supabase) ANTES de mostrar lo que ya hay en SQLite -- si el dispositivo no
    // tiene señal y esas consultas tardan en fallar (en vez de fallar rápido), la lista local
    // queda tapada por "cargando" más tiempo del esperado. Este log mide cuánto tarda de verdad.
    const inicio = Date.now();
    // Antes de leer lo que hay en SQLite, baja los cambios del servidor: un administrador puede
    // haber cerrado alguna de estas jornadas desde el Dashboard sin pasar nunca por la app
    // (Hallazgo #6, ver syncService.sincronizarCambiosDelServidor). Sin esto, una jornada cerrada
    // remotamente seguiría viéndose "en curso" acá hasta que algo más la reconciliara primero.
    try {
      await sincronizarCambiosDelServidor(usuario.id);
    } catch (err) {
      console.error("[H28-sync] useJornadasAbiertas.recargar: sincronizarCambiosDelServidor lanzó:", err);
    }
    console.log(`[H28-sync] useJornadasAbiertas.recargar: la descarga tardó ${Date.now() - inicio}ms`);
    const abiertas = await obtenerJornadasAbiertas(usuario.id);
    setJornadas(abiertas);
    setCargando(false);
  }, [usuario]);

  useFocusEffect(
    useCallback(() => {
      recargar();
    }, [recargar])
  );

  // `NetworkContext` también reconcilia por su cuenta cada 15s en segundo
  // plano (mismo mecanismo, ver ahí) — necesario porque `useFocusEffect` de
  // arriba no dispara si el chofer está en otra pestaña (Historial) cuando
  // se cierra una jornada suya desde el Dashboard. Este efecto es el puente:
  // como este hook sigue montado igual aunque su pantalla no tenga el foco
  // (bottom-tabs no la desmonta al cambiar de pestaña), reacciona apenas
  // `NetworkContext` avisa que reconcilió algo — sin esto, la lista (y con
  // ella `useSeguimientoGPS`, que la consume para saber qué trackear)
  // quedaría desactualizada hasta el próximo focus o pull-to-refresh.
  useEffect(() => {
    if (!jornadasReconciliadasEn) return;
    // `recargar()` empieza con un `setCargando(true)` síncrono — llamarla
    // directo acá dispara el lint `react-hooks/set-state-in-effect`
    // (setState síncrono dentro de un efecto). Encolarla en un microtask con
    // `Promise.resolve().then(...)` no cambia nada en la práctica (sigue
    // corriendo apenas termina este render), solo evita que quede como una
    // llamada síncrona directa dentro del cuerpo del efecto.
    void Promise.resolve().then(() => recargar());
  }, [jornadasReconciliadasEn, recargar]);

  // Recuperación (spec_deudas_app_movil.md, Hallazgo #5): mismo puente que el efecto de arriba,
  // pero además AVISA — a diferencia de la reconciliación (que corrige algo que el chofer no
  // tiene por qué notar), acá apareció una jornada entera que el chofer no sabía que la app
  // había vuelto a ver. Automático, no a pedido (así lo pide la spec): si se esperara que el
  // chofer lo pidiera, un chofer apurado nunca lo pide y la jornada recuperable queda sin
  // recuperar. `jornadasRecuperadas` solo cambia de referencia cuando NetworkContext encontró
  // algo de verdad (ver ahí) — no hace falta un ref para evitar alertas repetidas.
  useEffect(() => {
    if (jornadasRecuperadas.length === 0) return;
    void Promise.resolve().then(() => recargar());
    Alert.alert(
      t("jornadasRecuperadas.titulo"),
      jornadasRecuperadas.length === 1
        ? t("jornadasRecuperadas.mensajeSingular", {
            matricula: jornadasRecuperadas[0].matricula,
            ruta: jornadasRecuperadas[0].ruta,
          })
        : t("jornadasRecuperadas.mensajePlural", { cantidad: jornadasRecuperadas.length })
    );
  }, [jornadasRecuperadas, recargar, t]);

  // Corrección de campo (Hallazgo #28, spec_correccion_gana_dashboard.md): mismo puente y mismo
  // criterio de "avisar en vez de refrescar en silencio" que el efecto de `jornadasRecuperadas` de
  // arriba — acá el chofer necesita enterarse de que algo que él mismo cargó (km, combustible,
  // fotos…) ya no dice lo que él puso, porque un administrador lo corrigió y esa corrección gana
  // (ver `syncService.sincronizarCambiosDelServidor`, Parte 1). `jornadasCorregidas` solo cambia
  // de referencia cuando NetworkContext aplicó algo de verdad.
  useEffect(() => {
    if (jornadasCorregidas.length === 0) return;
    void Promise.resolve().then(() => recargar());
    if (jornadasCorregidas.length === 1) {
      const [unica] = jornadasCorregidas;
      const campos = unica.campos
        .map((campo) => t(`camposJornada.${campo}`, { defaultValue: campo }))
        .join(", ");
      Alert.alert(
        t("jornadasCorregidas.titulo"),
        t("jornadasCorregidas.mensajeSingular", {
          campos,
          matricula: unica.matricula,
          ruta: unica.ruta,
        })
      );
    } else {
      Alert.alert(
        t("jornadasCorregidas.titulo"),
        t("jornadasCorregidas.mensajePlural", { cantidad: jornadasCorregidas.length })
      );
    }
  }, [jornadasCorregidas, recargar, t]);

  return { jornadas, cargando, recargar };
}
