import React, { useRef, useState } from "react";
import { Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { CampoTexto } from "@/components/CampoTexto";
import { BotonPrimario } from "@/components/BotonPrimario";
import { ProveedorEnfoqueTeclado } from "@/context/EnfoqueTecladoContext";
import { pedirRecuperacion } from "@/services/authCore";
import { supabase } from "@/lib/supabase";
import { accionDeResultadoReenvio } from "./logicaCodigoVerificacion";
import { accionAlEnviarRecuperacion } from "./logicaRecuperarContrasena";
import { RootStackNavigationProp } from "@/navigation/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

// spec_app_registro_paso5.md, paso 2c-2: pide el correo y llama a resetPasswordForEmail
// (pedirRecuperacion() en authCore.ts) -- MISMO ResultadoEnvioCodigo que reenviarCodigo(), así que
// reusa accionDeResultadoReenvio() (logicaCodigoVerificacion.ts, ya probada) en vez de duplicar el
// árbol de decisión. Sin sesión antes de este punto -- no hay nada que cancelar al volver atrás,
// comportamiento por defecto.
export default function RecuperarContrasenaScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<RootStackNavigationProp>();
  const [correo, setCorreo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // criterio 12: resetPasswordForEmail responde IDÉNTICO para un correo registrado y uno
  // inexistente -- la pantalla nunca puede saltar directo al código sin mostrar antes el mensaje
  // neutral ("Si {{correo}} está registrado..."), o el silencio mismo delataría cuál es cuál.
  const [enviado, setEnviado] = useState(false);
  // Parte 2 (cierre de 2c): sugerencia de dominio pendiente de decidir, o null si no hay ninguna
  // (o ya se decidió). `correoDecidido` guarda el correo (recortado) para el que YA se contestó
  // la pregunta -- "solo se pregunta una vez por valor de correo" (accionAlEnviarRecuperacion()).
  const [sugerencia, setSugerencia] = useState<string | null>(null);
  const [correoDecidido, setCorreoDecidido] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const puedeEnviar = correo.trim().length > 0;

  async function enviarRecuperacion(destino: string) {
    setError(null);
    setEnviando(true);
    try {
      const resultado = await pedirRecuperacion(destino, supabase);
      const accion = accionDeResultadoReenvio(resultado);
      if (accion.tipo === "reenviado") {
        setEnviado(true);
      } else if (accion.tipo === "esperar") {
        setError(t(accion.textoClave, { segundos: accion.segundos }));
      } else {
        setError(t(accion.textoClave));
      }
    } finally {
      setEnviando(false);
    }
  }

  function manejarEnviar() {
    if (!puedeEnviar || enviando) return;
    const accion = accionAlEnviarRecuperacion(correo, correoDecidido);
    if (accion.tipo === "preguntarSugerencia") {
      setSugerencia(accion.sugerencia);
      return;
    }
    void enviarRecuperacion(correo.trim());
  }

  function manejarUsarSugerencia() {
    if (!sugerencia) return;
    const destino = sugerencia;
    setCorreo(destino);
    setCorreoDecidido(destino);
    setSugerencia(null);
    void enviarRecuperacion(destino);
  }

  function manejarMantenerEscrito() {
    const destino = correo.trim();
    setCorreoDecidido(destino);
    setSugerencia(null);
    void enviarRecuperacion(destino);
  }

  function manejarCambiarCorreo(texto: string) {
    setCorreo(texto);
    // El correo cambió -- una sugerencia pendiente ya no corresponde a lo que hay en el campo.
    setSugerencia(null);
  }

  function manejarContinuar() {
    navigation.navigate("CodigoVerificacion", {
      correo: correo.trim(),
      tipo: "recovery",
      origen: "recuperacion",
    });
  }

  return (
    <ProveedorEnfoqueTeclado scrollRef={scrollRef}>
      <KeyboardAvoidingView style={estilos.pantalla} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={estilos.contenido}
          keyboardShouldPersistTaps="handled"
        >
          {enviado ? (
            <>
              <Text style={estilos.instruccion}>
                {t("recuperarContrasena.mensajeEnviado", { correo: correo.trim() })}
              </Text>
              <BotonPrimario
                titulo={t("recuperarContrasena.botonContinuar")}
                onPress={manejarContinuar}
                estilo={estilos.boton}
              />
            </>
          ) : sugerencia ? (
            <>
              <Text style={estilos.instruccion}>
                {t("registro.sugerenciaCorreoPregunta", { sugerido: sugerencia })}
              </Text>
              <BotonPrimario
                titulo={t("recuperarContrasena.botonUsarSugerencia", { sugerido: sugerencia })}
                onPress={manejarUsarSugerencia}
                cargando={enviando}
                estilo={estilos.boton}
              />
              <BotonPrimario
                titulo={t("recuperarContrasena.botonMantenerEscrito")}
                onPress={manejarMantenerEscrito}
                cargando={enviando}
                variante="secundario"
                estilo={estilos.boton}
              />
            </>
          ) : (
            <>
              <Text style={estilos.instruccion}>{t("recuperarContrasena.instruccion")}</Text>

              <CampoTexto
                etiqueta={t("login.correoEtiqueta")}
                placeholder={t("login.correoPlaceholder")}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
                returnKeyType="go"
                onSubmitEditing={manejarEnviar}
                value={correo}
                onChangeText={manejarCambiarCorreo}
              />

              {error ? <Text style={estilos.error}>{error}</Text> : null}

              <BotonPrimario
                titulo={t("recuperarContrasena.boton")}
                onPress={manejarEnviar}
                cargando={enviando}
                deshabilitado={!puedeEnviar}
                estilo={estilos.boton}
              />
            </>
          )}
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
