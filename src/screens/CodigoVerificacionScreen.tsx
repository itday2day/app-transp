import React, { useRef, useState } from "react";
import { Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { CampoTexto } from "@/components/CampoTexto";
import { BotonPrimario } from "@/components/BotonPrimario";
import { ProveedorEnfoqueTeclado } from "@/context/EnfoqueTecladoContext";
import { useAuth } from "@/context/AuthContext";
import { useCuentaRegresiva } from "@/hooks/useCuentaRegresiva";
import { verificarCodigo, reenviarCodigo, pedirRecuperacion } from "@/services/authCore";
import { supabase } from "@/lib/supabase";
import {
  normalizarCodigo,
  codigoCompleto,
  accionDeResultadoCodigo,
  accionDeResultadoReenvio,
  confirmarConSesion,
} from "./logicaCodigoVerificacion";
import { RootStackParamList, RootStackNavigationProp } from "@/navigation/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

type CodigoVerificacionRouteProp = RouteProp<RootStackParamList, "CodigoVerificacion">;

// spec_app_registro_paso5.md: implementa los dos tipos.
//
// Back por gesto/hardware: comportamiento por defecto del stack, sin lógica propia -- en NINGUNO
// de los dos tipos hay, en ESTA pantalla, una sesión de Supabase abierta que cancelar al volver
// atrás. "signup": el signUp (authCore.ts, registrarChofer()) no deja sesión abierta hasta que
// verifyOtp() tiene éxito (confirmado leyendo verificarCodigo(): `data.user` solo existe tras un
// verifyOtp exitoso, nunca antes). "recovery": verifyOtp() SÍ deja una sesión abierta como efecto
// colateral, pero recién DESPUÉS de un código correcto -- en ese instante esta pantalla ya
// reemplaza (navigation.replace) a NuevaContrasenaScreen, que es la que de verdad necesita la
// protección (ver R1 ahí). Volver atrás ANTES de acertar el código nunca deja nada abierto.
export default function CodigoVerificacionScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<RootStackNavigationProp>();
  const { params } = useRoute<CodigoVerificacionRouteProp>();
  const { correo, tipo, origen } = params;
  const { establecerSesion } = useAuth();

  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // origen "registro" (signUp) y "recuperacion" (pedirRecuperacion, RecuperarContrasenaScreen) YA
  // mandaron un correo real para llegar a esta pantalla (criterio 6) -> arrancan en 60s. origen
  // "login" (correoSinConfirmar): NO se envía nada automático al entrar (criterio 8) -> 0s, el
  // botón de reenviar queda disponible de entrada.
  const cuenta = useCuentaRegresiva(origen === "login" ? 0 : 60);

  async function manejarConfirmar() {
    if (!codigoCompleto(codigo) || enviando) return;
    setError(null);
    setEnviando(true);
    try {
      const resultado = await verificarCodigo(correo, normalizarCodigo(codigo), tipo, supabase);
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
      } else if (accion.tipo === "confirmadoRecovery") {
        // El código YA se consumió -- reemplaza, no apila, así que volver atrás desde
        // NuevaContrasenaScreen no regresa a un código ya gastado.
        navigation.replace("NuevaContrasena", { correo });
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

  // criterio 8: en la pantalla de código llegada desde el login (correoSinConfirmar) se ofrecen
  // DOS salidas -- "Enviar un código nuevo" (manejarReenviar, abajo) y "Olvidé mi contraseña".
  // Esta reemplaza, no apila: el correo ya se conoce, no hace falta volver a pedirlo en
  // RecuperarContrasenaScreen.
  //
  // M1 (corrección): pedirRecuperacion() puede fallar (sin red, 429, error del servidor) -- antes
  // esta función navegaba SIEMPRE a la pantalla de código, como si el correo hubiera salido. Pasa
  // el resultado por accionDeResultadoReenvio() (mismo árbol que manejarReenviar) y solo navega si
  // la clave es "reenviado". origen:"recuperacion" (NO "login"): ya se mandó un correo real, la
  // cuenta regresiva de la pantalla destino debe arrancar en 60s, no en 0 (ver el comentario de
  // `cuenta` más arriba).
  const [enviandoOlvide, setEnviandoOlvide] = useState(false);
  async function manejarOlvideContrasena() {
    if (enviandoOlvide) return;
    setError(null);
    setEnviandoOlvide(true);
    try {
      const resultado = await pedirRecuperacion(correo, supabase);
      const accion = accionDeResultadoReenvio(resultado);
      if (accion.tipo === "reenviado") {
        navigation.replace("CodigoVerificacion", { correo, tipo: "recovery", origen: "recuperacion" });
      } else if (accion.tipo === "esperar") {
        setError(t(accion.textoClave, { segundos: accion.segundos }));
      } else {
        setError(t(accion.textoClave));
      }
    } finally {
      setEnviandoOlvide(false);
    }
  }

  async function manejarReenviar() {
    if (!cuenta.terminada || reenviando) return;
    setError(null);
    setMensaje(null);
    setReenviando(true);
    try {
      // Mismo ResultadoEnvioCodigo para los dos -- reenviarCodigo() (resend signup) y
      // pedirRecuperacion() (resetPasswordForEmail) comparten accionDeResultadoReenvio().
      const resultado =
        tipo === "signup"
          ? await reenviarCodigo(correo, supabase)
          : await pedirRecuperacion(correo, supabase);
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
            // Criterio 14 (ronda de ajustes): SIN maxLength nativo a propósito -- recortaría el
            // texto CRUDO antes de que onChangeText se entere (Android InputFilter.LengthFilter
            // / iOS shouldChangeCharactersInRange), y V6 pega "12 34 56 78" (11 caracteres
            // crudos) esperando que normalizarCodigo() limpie los espacios ANTES de contar los
            // 6, no después. El único límite real es normalizarCodigo().slice(0,6).
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

          {tipo === "signup" && origen === "login" ? (
            <>
              <BotonPrimario
                titulo={t("login.olvideContrasena")}
                onPress={manejarOlvideContrasena}
                cargando={enviandoOlvide}
                variante="secundario"
                estilo={estilos.botonReenviar}
              />
              <Text style={estilos.ayuda}>{t("codigo.correoNoEsElTuyo")}</Text>
            </>
          ) : null}
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
  ayuda: {
    ...tipografia.ayuda,
    color: colores.textoSecundario,
    marginTop: espaciado.sm,
    textAlign: "center",
  },
});
