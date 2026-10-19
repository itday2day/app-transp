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
  // neutral ("Si el correo está registrado..."), o el silencio mismo delataría cuál es cuál.
  const [enviado, setEnviado] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const puedeEnviar = correo.trim().length > 0;

  async function manejarEnviar() {
    if (!puedeEnviar || enviando) return;
    setError(null);
    setEnviando(true);
    try {
      const resultado = await pedirRecuperacion(correo.trim(), supabase);
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
              <Text style={estilos.instruccion}>{t("recuperarContrasena.mensajeEnviado")}</Text>
              <BotonPrimario
                titulo={t("recuperarContrasena.botonContinuar")}
                onPress={manejarContinuar}
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
                onChangeText={setCorreo}
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
