import React, { useRef, useState } from "react";
import { Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useNavigation, useRoute, usePreventRemove, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { CampoTexto } from "@/components/CampoTexto";
import { BotonPrimario } from "@/components/BotonPrimario";
import { ProveedorEnfoqueTeclado } from "@/context/EnfoqueTecladoContext";
import { useAuth } from "@/context/AuthContext";
import { terminarRecuperacion, cancelarRecuperacionPendiente } from "@/services/authCore";
import { supabase } from "@/lib/supabase";
import { accionDeResultadoTerminarRecuperacion } from "./logicaNuevaContrasena";
import { confirmarConSesion } from "./logicaCodigoVerificacion";
import { RootStackParamList, RootStackNavigationProp } from "@/navigation/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

type NuevaContrasenaRouteProp = RouteProp<RootStackParamList, "NuevaContrasena">;

// spec_app_registro_paso5.md, paso 2c-2 (R1): esta pantalla es el ÚNICO punto donde una sesión de
// Supabase real (abierta por verifyOtp(recovery), ver verificarCodigo() en authCore.ts) queda
// viva SIN Usuario establecido en AuthContext -- si el chofer vuelve atrás por gesto (iOS) o por
// el botón físico (Android) antes de terminar, esa sesión quedaría abierta y sin cerrar.
//
// Evidencia citada (@react-navigation instalado):
//   - node_modules/@react-navigation/core/lib/module/usePreventRemove.js:16-47: usePreventRemove()
//     registra un listener del evento "beforeRemove" (línea 47, navigation.addListener) Y marca la
//     ruta como "preventRemove" mientras el primer argumento sea true.
//   - node_modules/@react-navigation/core/lib/module/useOnPreventRemove.js:22
//     (`if (!nextRoutesByKey.has(route.key))`): el evento "beforeRemove" SOLO se emite cuando una
//     ACCIÓN de navegación (dispatch) calcula un `nextRoutes` sin esta ruta -- un desmontaje
//     condicional por re-render de React (RootNavigator.tsx cambiando de rama porque `usuario` deja
//     de ser null) NUNCA pasa por acá: no hay ninguna `action` ni `nextRoutes` que calcular, React
//     simplemente desmonta el árbol anterior. Por eso usePreventRemove() es seguro para el camino
//     de ÉXITO (nunca intercepta la salida normal tras establecerSesion()) y SÍ intercepta
//     específicamente el gesto/back físico, que sí despacha una acción GO_BACK real.
//   - node_modules/@react-navigation/native-stack/lib/module/views/NativeStackView.native.js:181
//     (`isRemovePrevented = preventedRoutes[route.key]?.preventRemove`): native-stack lee esta
//     misma bandera para desactivar el gesto de swipe nativo (no solo el header) mientras la ruta
//     está "prevented" -- confirma que el gesto de iOS también queda cubierto, no solo el botón de
//     Android.
//
// M4 (ronda de revisión): el callback hace `navigation.dispatch(data.action)` mientras
// `usePreventRemove(!completada, ...)` SIGUE en `true` (nada cambia `completada` en este camino,
// solo en el de éxito) -- ¿ese segundo dispatch vuelve a disparar "beforeRemove" y se intercepta
// de nuevo, en bucle? NO, y no es por casualidad de timing sino por una marca explícita en la
// propia acción, confirmada leyendo el código fuente instalado:
//   - useOnPreventRemove.js:6 (`const VISITED_ROUTE_KEYS = Symbol('VISITED_ROUTE_KEYS')`) +
//     líneas 7-13 (`shouldPreventRemove`): la acción que de verdad le llega al callback como
//     `e.data.action` NO es la acción original -- es `beforeRemoveAction = {...action,
//     [VISITED_ROUTE_KEYS]: visitedRouteKeys}`, y `visitedRouteKeys` es el MISMO objeto `Set` que
//     ya existía si la acción llega de un redispatch (línea 9: lo reusa si `VISITED_ROUTE_KEYS in
//     action`), nunca uno nuevo.
//   - useOnPreventRemove.js:18-21 (`if (visitedRouteKeys.has(route.key)) continue;`) +
//     línea 29 (`visitedRouteKeys.add(route.key)`, justo ANTES de emitir "beforeRemove" para esa
//     ruta): la primera vez que esta pantalla ve la acción, su `route.key` se agrega al `Set` que
//     viaja DENTRO de la acción misma (por referencia, no por copia).
//   - useEventEmitter.js:55 (`target !== undefined ? items[target]?.slice() : ...`) + líneas
//     69-73 (`data` se pasa tal cual, por referencia): confirma que `e.data.action` que recibe
//     este callback es ESE MISMO objeto con el `Set` ya mutado, no una copia.
// Resultado: cuando este callback redespacha `data.action`, `shouldPreventRemove()` vuelve a
// envolverla pero el `Set` que lleva adentro YA tiene la clave de ESTA ruta -- el `continue` de la
// línea 18-21 se la salta sin volver a emitir "beforeRemove" para ella, así que el callback NO
// se vuelve a llamar y la navegación de verdad se completa en este segundo dispatch. Es el mismo
// mecanismo (y el mismo patrón) que usa la documentación oficial de React Navigation para su
// ejemplo de "confirmar antes de salir" -- no es un comportamiento implícito de esta pantalla.
//
// El guard `completada` es la salvedad que pidió la ronda: si por cualquier motivo el componente
// siguiera montado un instante después de un `terminarRecuperacion()` exitoso (ej. una doble
// pulsación en vuelo), `usePreventRemove(false, ...)` deja de interceptar nada, en vez de
// cancelar una sesión que la propia pantalla ya estableció. Es `useState`, no `useRef` -- ver el
// comentario junto a su declaración más abajo (react-hooks/refs).
export default function NuevaContrasenaScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<RootStackNavigationProp>();
  const { params } = useRoute<NuevaContrasenaRouteProp>();
  const { correo } = params;
  const { establecerSesion } = useAuth();

  const [contrasenaNueva, setContrasenaNueva] = useState("");
  const [confirmarContrasenaNueva, setConfirmarContrasenaNueva] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Estado, no ref -- usePreventRemove() recibe este valor EN EL RENDER (no dentro de un efecto o
  // handler), y leer un ref ahí viola react-hooks/refs (un ref leído durante el render puede dar
  // un resultado inestable entre renders). setCompletada(true) antes de establecerSesion() es
  // igual de síncrono para este propósito -- el re-render que dispara es inocuo.
  const [completada, setCompletada] = useState(false);

  const contrasenasCoinciden =
    confirmarContrasenaNueva.length === 0 || confirmarContrasenaNueva === contrasenaNueva;
  const puedeEnviar = contrasenaNueva.length >= 6 && confirmarContrasenaNueva === contrasenaNueva;

  usePreventRemove(!completada, ({ data }) => {
    cancelarRecuperacionPendiente(supabase).finally(() => {
      navigation.dispatch(data.action);
    });
  });

  async function manejarGuardar() {
    if (!puedeEnviar || enviando) return;
    setError(null);
    setEnviando(true);
    try {
      const resultado = await terminarRecuperacion(contrasenaNueva, supabase);
      const accion = accionDeResultadoTerminarRecuperacion(resultado);
      if (accion.tipo === "confirmado") {
        setCompletada(true);
        const resultadoSesion = await confirmarConSesion(accion.usuario, establecerSesion);
        if (resultadoSesion.tipo === "confirmadoSinSesion") {
          setError(t("nuevaContrasena.confirmadaSinSesion"));
        }
        // RootNavigator.tsx cambia de stack solo si sí hay sesión -- no se navega a mano.
      } else {
        setError(t(accion.textoClave));
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ProveedorEnfoqueTeclado scrollRef={scrollRef}>
      <KeyboardAvoidingView style={estilos.pantalla} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={estilos.contenido}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={estilos.instruccion}>{t("nuevaContrasena.instruccion", { correo })}</Text>

          <CampoTexto
            etiqueta={t("cambiarContrasena.contrasenaNuevaEtiqueta")}
            placeholder={t("cambiarContrasena.contrasenaNuevaPlaceholder")}
            secureTextEntry
            alternarVisibilidad
            autoCapitalize="none"
            returnKeyType="next"
            value={contrasenaNueva}
            onChangeText={setContrasenaNueva}
          />

          <CampoTexto
            etiqueta={t("cambiarContrasena.confirmarContrasenaNuevaEtiqueta")}
            placeholder={t("cambiarContrasena.confirmarContrasenaNuevaPlaceholder")}
            secureTextEntry
            alternarVisibilidad
            autoCapitalize="none"
            returnKeyType="go"
            onSubmitEditing={manejarGuardar}
            value={confirmarContrasenaNueva}
            onChangeText={setConfirmarContrasenaNueva}
            error={!contrasenasCoinciden ? t("cambiarContrasena.contrasenasNoCoinciden") : undefined}
          />

          {error ? <Text style={estilos.error}>{error}</Text> : null}

          <BotonPrimario
            titulo={t("nuevaContrasena.boton")}
            onPress={manejarGuardar}
            cargando={enviando}
            deshabilitado={!puedeEnviar}
            estilo={estilos.boton}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ProveedorEnfoqueTeclado>
  );
}

const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colores.fondo,
  },
  contenido: {
    flexGrow: 1,
    justifyContent: "center",
    padding: espaciado.lg,
  },
  instruccion: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
    textAlign: "center",
    marginBottom: espaciado.lg,
  },
  boton: {
    marginTop: espaciado.sm,
  },
  error: {
    ...tipografia.cuerpo,
    color: colores.peligro,
    marginBottom: espaciado.md,
    textAlign: "center",
  },
});
