import React, { useRef, useState } from "react";
import { Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { CampoTexto } from "@/components/CampoTexto";
import { BotonPrimario } from "@/components/BotonPrimario";
import { ProveedorEnfoqueTeclado } from "@/context/EnfoqueTecladoContext";
import { useAuth } from "@/context/AuthContext";
import { useCuentaRegresiva } from "@/hooks/useCuentaRegresiva";
import { verificarCodigo, reenviarCodigo } from "@/services/authCore";
import { supabase } from "@/lib/supabase";
import {
  normalizarCodigo,
  codigoCompleto,
  accionDeResultadoCodigo,
  accionDeResultadoReenvio,
  confirmarConSesion,
} from "./logicaCodigoVerificacion";
import { RootStackParamList } from "@/navigation/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

type CodigoVerificacionRouteProp = RouteProp<RootStackParamList, "CodigoVerificacion">;

// spec_app_registro_paso5.md, paso 2c-1: esta ronda SOLO implementa `tipo: "signup"` -- el
// comportamiento de `tipo: "recovery"` (verifyOtp sin construir Usuario, ver verificarCodigo() en
// authCore.ts) lo completa 2c-2, cuando exista NuevaContrasenaScreen para recibirlo. No hay ningún
// camino en este archivo que lea `route.params.tipo` todavía -- se agrega en 2c-2, no acá, para no
// dejar una rama "recovery" a medio escribir.
//
// Back por gesto/hardware: comportamiento por defecto del stack (sin lógica propia). Es seguro
// porque, en el camino "signup", NO hay ninguna sesión de Supabase pendiente que cancelar al
// volver atrás -- el signUp (authCore.ts, registrarChofer()) no deja sesión abierta hasta que
// verifyOtp() tiene éxito (confirmado leyendo verificarCodigo(): `data.user` solo existe tras un
// verifyOtp exitoso, nunca antes) -- a diferencia del camino "recovery" (2c-2), donde
// verifyOtp() SÍ deja una sesión abierta como efecto colateral y por eso ESE camino necesita
// cancelarRecuperacionPendiente() en el back (ver R1, pendiente de evidencia aparte).
export default function CodigoVerificacionScreen() {
  const { t } = useTranslation();
  const { params } = useRoute<CodigoVerificacionRouteProp>();
  const { correo, origen } = params;
  const { establecerSesion } = useAuth();

  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // origen "registro": el signUp que acaba de pasar YA cuenta como un envío (criterio 6) -> 60s.
  // origen "login" (correoSinConfirmar): NO se envía nada automático al entrar (criterio 8) -> 0s,
  // el botón de reenviar queda disponible de entrada.
  const cuenta = useCuentaRegresiva(origen === "registro" ? 60 : 0);

  async function manejarConfirmar() {
    if (!codigoCompleto(codigo) || enviando) return;
    setError(null);
    setEnviando(true);
    try {
      const resultado = await verificarCodigo(correo, normalizarCodigo(codigo), "signup", supabase);
      const accion = accionDeResultadoCodigo(resultado);
      if (accion.tipo === "confirmado") {
        // El código YA se consumió (verifyOtp tuvo éxito) -- si establecerSesion() rechaza
        // (E1: guardarValor()/SecureStore puede fallar), no hay código que reintentar: se avisa y
        // el chofer entra a mano. RootNavigator.tsx cambia de stack solo si sí hay sesión -- no se
        // navega a mano en ningún caso.
        const resultadoSesion = await confirmarConSesion(accion.usuario, establecerSesion);
        if (resultadoSesion.tipo === "confirmadoSinSesion") {
          setError(t("codigo.confirmadoSinSesion"));
        }
      } else if (accion.tipo === "esperar") {
        setError(t(accion.textoClave, { segundos: accion.segundos }));
        cuenta.reiniciar(accion.segundos);
      } else {
        setError(t(accion.textoClave));
      }
    } finally {
      setEnviando(false);
    }
  }

  async function manejarReenviar() {
    if (!cuenta.terminada || reenviando) return;
    setError(null);
    setMensaje(null);
    setReenviando(true);
    try {
      const resultado = await reenviarCodigo(correo, supabase);
      const accion = accionDeResultadoReenvio(resultado);
      if (accion.tipo === "reenviado") {
        setMensaje(t(accion.textoClave));
        cuenta.reiniciar(accion.segundosReinicio);
      } else if (accion.tipo === "esperar") {
        setError(t(accion.textoClave, { segundos: accion.segundos }));
        cuenta.reiniciar(accion.segundos);
      } else {
        setError(t(accion.textoClave));
      }
    } finally {
      setReenviando(false);
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
          <Text style={estilos.instruccion}>{t("codigo.instruccion", { correo })}</Text>

          <CampoTexto
            etiqueta={t("codigo.etiquetaCodigo")}
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            value={codigo}
            onChangeText={(texto) => setCodigo(normalizarCodigo(texto))}
          />

          {error ? <Text style={estilos.error}>{error}</Text> : null}
          {mensaje ? <Text style={estilos.mensaje}>{mensaje}</Text> : null}

          <BotonPrimario
            titulo={t("codigo.confirmar")}
            onPress={manejarConfirmar}
            cargando={enviando}
            deshabilitado={!codigoCompleto(codigo)}
            estilo={estilos.boton}
          />

          <BotonPrimario
            titulo={
              cuenta.terminada
                ? t("codigo.reenviar")
                : t("codigo.reenviarEn", { segundos: cuenta.segundosRestantes })
            }
            onPress={manejarReenviar}
            cargando={reenviando}
            deshabilitado={!cuenta.terminada}
            variante="secundario"
            estilo={estilos.botonReenviar}
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
  botonReenviar: {
    marginTop: espaciado.md,
  },
  error: {
    ...tipografia.cuerpo,
    color: colores.peligro,
    marginTop: espaciado.sm,
    textAlign: "center",
  },
  mensaje: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
    marginTop: espaciado.sm,
    textAlign: "center",
  },
});
