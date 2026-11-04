import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, BackHandler, Alert, AppState } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { useNetwork } from "@/context/NetworkContext";
import { MAX_INTENTOS } from "@/services/syncService";
import { obtenerNoSincronizadasDeChofer } from "@/db/jornadasRepo";
import { siguienteEstadoFranjaEnvio, EstadoFranjaEnvio } from "@/services/avisoEnvioCore";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

// Hallazgo #82 (spec_enviado_visible_y_aviso_al_salir.md). Franja no bloqueante montada en
// PrincipalTabs, ARRIBA de AvisoVersionFranja (RootNavigator.tsx): esta avisa de algo urgente y
// transitorio ("no cierres la app, hay datos sin enviar"), la del aviso de versión es informativa
// y descartable con "Más tarde" -- lo más apremiante va primero, pegado a la barra de estado. Las
// dos son simples hermanos en una columna flex (RootNavigator.tsx:79-81): no hay overlap posible
// por construcción, cada una ocupa su propio alto cuando está visible.
//
// Criterio 6 (sin parpadeos): RETRASO_MOSTRAR_MS demora la aparición de "enviando"/"error" -- si
// el envío termina antes de que venza el temporizador, nunca llega a mostrarse nada. No se aplica
// a una franja YA visible (pasar de "enviando" a "error", o a "enviado", es inmediato: demorar un
// cambio sobre algo que el chofer ya está viendo no evita parpadeo, solo se siente lento).
// DURACION_ENVIADO_MS es cuánto se queda "Enviado" antes de ocultarse sola (criterio 3 original).
const RETRASO_MOSTRAR_MS = 400;
const DURACION_ENVIADO_MS = 3000;

export function FranjaEnvio() {
  const { t } = useTranslation();
  const { usuario } = useAuth();
  const { sincronizando, ultimaSincronizacion, conectado } = useNetwork();
  const [estado, setEstado] = useState<EstadoFranjaEnvio>("oculta");
  const estadoRef = useRef<EstadoFranjaEnvio>("oculta");
  // Criterio 5: el BackHandler lee esto, NUNCA `estado` (que puede estar demorado por el
  // antiparpadeo) -- el chofer tiene que recibir el aviso al salir aunque la franja todavía no se
  // haya mostrado en pantalla.
  const hayPendientesRef = useRef(false);

  function actualizarEstado(nuevo: EstadoFranjaEnvio) {
    estadoRef.current = nuevo;
    setEstado(nuevo);
  }

  // Una sola función de recálculo, llamada desde tres disparadores distintos (abajo): el ciclo
  // normal de NetworkContext, recuperar el foco de PrincipalTabs, y AppState volviendo a "active".
  // Revisión 2026-11-04 (sección 10, defecto 3): una jornada registrada SIN conexión no cambia
  // `sincronizando` ni `ultimaSincronizacion` (sincronizarAhora() no hace nada sin red) -- sin los
  // otros dos disparadores, `hayPendientesRef` se quedaría en `false` y el aviso al salir nunca
  // aparecería para ese caso. Siempre actualiza el ref (para el BackHandler); el `estado` visible
  // solo cambia si corresponde (criterio 13: "si procede").
  const recalcular = useCallback(async () => {
    if (!usuario) return;
    const jornadas = await obtenerNoSincronizadasDeChofer(usuario.id);

    hayPendientesRef.current = jornadas.length > 0;

    const anterior = estadoRef.current;
    const siguiente = siguienteEstadoFranjaEnvio(anterior, jornadas, MAX_INTENTOS, conectado);
    if (siguiente === anterior) return;

    if (anterior === "oculta" && siguiente !== "oculta") {
      // Criterio 6 (sin parpadeos): demora la aparición -- si se resuelve antes de que venza el
      // temporizador, el chequeo de abajo (estadoRef.current === "oculta") evita mostrarlo igual.
      setTimeout(() => {
        if (estadoRef.current === "oculta") actualizarEstado(siguiente);
      }, RETRASO_MOSTRAR_MS);
    } else {
      actualizarEstado(siguiente);
    }
  }, [usuario, conectado]);

  // Criterio 13: se recalcula al montar (p. ej. recién registrada una jornada, cuando
  // `sincronizarAhora()` ya puso `sincronizando` en true) y cada vez que `sincronizando`,
  // `ultimaSincronizacion` o `conectado` cambian -- sin sondeo propio, nunca un setInterval acá: el
  // ciclo real ya lo tiene NetworkContext (INTERVALO_REVISION_MS), esto solo reacciona a sus
  // resultados. `conectado` en las dependencias (defecto 1): al volver la red, recalcula enseguida
  // y pasa de "oculta" a "enviando" sin esperar al próximo ciclo de 15 s.
  useEffect(() => {
    void recalcular();
  }, [recalcular, sincronizando, ultimaSincronizacion]);

  // Defecto 3 (sección 10): AppState "active" es el segundo disparador que falta -- volver del
  // selector de apps/pantalla bloqueada sin que `sincronizando`/`ultimaSincronizacion` hayan
  // cambiado (p. ej. se registró una jornada sin conexión mientras la app estaba en segundo plano).
  useEffect(() => {
    const suscripcion = AppState.addEventListener("change", (estado) => {
      if (estado === "active") void recalcular();
    });
    return () => suscripcion.remove();
  }, [recalcular]);

  // Auto-ocultar "Enviado" a los pocos segundos (criterio 3 original) -- si entretanto aparece una
  // jornada nueva, el efecto de arriba ya cambió `estado` a "enviando" y este temporizador, al
  // limpiarse por el cambio de `estado`, no llega a ocultar nada.
  useEffect(() => {
    if (estado !== "enviado") return;
    const id = setTimeout(() => actualizarEstado("oculta"), DURACION_ENVIADO_MS);
    return () => clearTimeout(id);
  }, [estado]);

  // Criterio 5: BackHandler + useFocusEffect, dentro de PrincipalTabs. react-navigation ya
  // registra su propio listener en NavigationContainer (useBackButton.native.tsx) que hace
  // goBack()/deja pasar -- BackHandler llama a los listeners en orden INVERSO de registro
  // (BackHandler.android.js), así que uno registrado acá (más tarde que NavigationContainer) se
  // evalúa ANTES. Si no hay pendientes, devuelve `false` y el evento cae al de react-navigation:
  // el "atrás" entre pantallas (y entre pantallas sin pendientes) sigue exactamente igual. En iOS,
  // BackHandler.addEventListener es un no-op de la propia librería (BackHandler.ios.js) -- no hace
  // falta ningún `Platform.OS === "android"` acá.
  //
  // Defecto 3 (sección 10): recalcula también al RECUPERAR el foco -- el caso típico es volver de
  // NuevoCheckInScreen/DetalleJornadaScreen (`goBack()`) justo después de registrar una jornada sin
  // conexión, que no cambia `sincronizando` ni `ultimaSincronizacion`.
  useFocusEffect(
    React.useCallback(() => {
      void recalcular();

      const suscripcion = BackHandler.addEventListener("hardwareBackPress", () => {
        if (!hayPendientesRef.current) return false;

        Alert.alert(t("franjaEnvio.avisoSalirTitulo"), t("franjaEnvio.avisoSalirCuerpo"), [
          { text: t("franjaEnvio.avisoSalirQuedarme"), style: "cancel" },
          {
            text: t("franjaEnvio.avisoSalirSalir"),
            style: "destructive",
            onPress: () => BackHandler.exitApp(),
          },
        ]);
        return true;
      });

      return () => suscripcion.remove();
    }, [t, recalcular])
  );

  if (estado === "oculta") return null;

  const estilo =
    estado === "enviado"
      ? estilos.franjaEnviado
      : estado === "error"
        ? estilos.franjaError
        : estilos.franjaEnviando;
  const texto =
    estado === "enviado"
      ? t("franjaEnvio.enviado")
      : estado === "error"
        ? t("detalleJornada.sincNecesitaReintento")
        : t("franjaEnvio.enviando");

  return (
    <View style={[estilos.franja, estilo]} accessibilityRole="alert" accessibilityLabel={texto}>
      <Text style={estilos.texto}>{texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  franja: {
    paddingVertical: espaciado.sm,
    paddingHorizontal: espaciado.md,
  },
  franjaEnviando: {
    backgroundColor: colores.primario,
  },
  franjaEnviado: {
    backgroundColor: colores.exito,
  },
  franjaError: {
    backgroundColor: colores.peligro,
  },
  texto: {
    ...tipografia.ayuda,
    color: colores.superficie,
  },
});
