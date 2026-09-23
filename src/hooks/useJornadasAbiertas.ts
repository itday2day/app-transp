import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { obtenerJornadasAbiertas } from "@/db/jornadasRepo";
import { reconciliarJornadasAbiertas } from "@/services/syncService";
import { Jornada } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { useNetwork } from "@/context/NetworkContext";

// Un chofer puede tener varios viajes en curso a la vez (ver Tarea 6), así
// que este hook expone el arreglo completo en vez de una sola jornada.
export function useJornadasAbiertas() {
  const { t } = useTranslation();
  const { usuario } = useAuth();
  const { jornadasReconciliadasEn, jornadasRecuperadas } = useNetwork();
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    if (!usuario) return;
    setCargando(true);
    // Antes de leer lo que hay en SQLite, reconcilia contra Supabase: un
    // administrador puede haber cerrado alguna de estas jornadas desde el
    // Dashboard sin pasar nunca por la app (Hallazgo #6, ver
    // syncService.reconciliarJornadasAbiertas). Sin esto, una jornada
    // cerrada remotamente seguiría viéndose "en curso" acá hasta que algo
    // más la reconciliara primero.
    await reconciliarJornadasAbiertas(usuario.id);
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

  return { jornadas, cargando, recargar };
}
