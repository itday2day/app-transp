import React, { useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { CampoTexto } from "@/components/CampoTexto";
import { BotonPrimario } from "@/components/BotonPrimario";
import { LanguageSelector } from "@/components/LanguageSelector";
import { TextoEnlace } from "@/components/TextoEnlace";
import { ProveedorEnfoqueTeclado } from "@/context/EnfoqueTecladoContext";
import { accionDeResultadoLogin } from "./accionDeResultadoLogin";
import { RootStackNavigationProp } from "@/navigation/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

export default function LoginScreen() {
  const navigation = useNavigation<RootStackNavigationProp>();
  const { t } = useTranslation();
  const { iniciarSesion } = useAuth();
  // Paso 2c-1 (parte B): renombrado desde numeroEmpleado -- el campo ahora es "correo o número de
  // empleado" (identificadorACorreo(), dentro de iniciarSesionCore en authCore.ts, ya sabe
  // distinguir los dos: sin "@" se sigue tratando como número de empleado sintético --
  // TODO(barrido): retirar esa rama cuando chofer 01 tenga un correo real, ver authCore.ts).
  const [identificador, setIdentificador] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const contrasenaRef = useRef<TextInput>(null);

  const puedeEnviar = identificador.trim().length > 0 && contrasena.length > 0;

  async function manejarIngreso() {
    if (!puedeEnviar || cargando) return;
    setError(null);
    setCargando(true);
    try {
      const resultado = await iniciarSesion(identificador.trim(), contrasena);
      const accion = accionDeResultadoLogin(resultado);
      if (accion.tipo === "error") {
        setError(t(accion.textoClave));
      } else if (accion.tipo === "irACodigo") {
        navigation.navigate("CodigoVerificacion", { correo: accion.correo, tipo: "signup", origen: "login" });
      }
      // "entrar": RootNavigator.tsx cambia de stack solo (usuario deja de ser null) -- no se
      // navega a mano.
    } finally {
      setCargando(false);
    }
  }

  return (
    <ProveedorEnfoqueTeclado scrollRef={scrollRef}>
      <KeyboardAvoidingView style={estilos.pantalla} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {/* spec_marca_agua_y_navegacion_day2day.md (Hallazgo #42): marca de agua, renderizada ANTES
            del ScrollView (y no encima) para que este, al pintarse después, quede arriba sin
            necesitar zIndex. pointerEvents="none" + accessible={false} +
            importantForAccessibility/accessibilityElementsHidden: no intercepta toques ni lectores
            de pantalla. position:"relative" de `pantalla` (default de RN) es lo que ancla este
            absolute a la pantalla completa. */}
        <Image
          source={require("../../assets/isotipo-d2d.png")}
          style={estilos.marcaAgua}
          resizeMode="contain"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        />

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={estilos.contenido}
          keyboardShouldPersistTaps="handled"
        >
          {/* Fuera del bloque centrado (antes quedaba pegado encima del logo, en el medio de la
              pantalla) — ahora es el primer elemento del scroll, arriba del todo. */}
          <View style={estilos.filaIdioma}>
            <LanguageSelector />
          </View>

          <View style={estilos.bloqueCentral}>
            <View style={estilos.encabezado}>
              <Image
                source={require("../../assets/logo-negro.png")}
                style={estilos.logo}
                resizeMode="contain"
                accessibilityLabel="Day2Day Solutions"
              />
              <Text style={estilos.subtitulo}>{t("login.subtitulo")}</Text>
            </View>

            <CampoTexto
              etiqueta={t("login.correoEtiqueta")}
              placeholder={t("login.correoPlaceholder")}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              // "username" (no "emailAddress"): el campo también acepta un número de empleado sin
              // "@" (TODO(barrido) arriba) -- "username" es el tipo que Apple recomienda para un
              // identificador de acceso que no es SIEMPRE un correo real.
              textContentType="username"
              returnKeyType="next"
              // submitBehavior="submit" (no blurOnSubmit={false}, @deprecated en TextInput.d.ts
              // de la versión instalada): manda el submit sin blurear el campo, dejando el foco
              // pasar a contraseña sin que el teclado parpadee cerrándose y reabriéndose.
              submitBehavior="submit"
              onSubmitEditing={() => contrasenaRef.current?.focus()}
              value={identificador}
              onChangeText={setIdentificador}
            />

            <CampoTexto
              ref={contrasenaRef}
              etiqueta={t("login.contrasenaEtiqueta")}
              placeholder={t("login.contrasenaPlaceholder")}
              secureTextEntry
              alternarVisibilidad
              autoCapitalize="none"
              returnKeyType="go"
              onSubmitEditing={manejarIngreso}
              value={contrasena}
              onChangeText={setContrasena}
            />

            {error ? <Text style={estilos.error}>{error}</Text> : null}

            <BotonPrimario
              titulo={t("login.botonIngresar")}
              onPress={manejarIngreso}
              cargando={cargando}
              deshabilitado={!puedeEnviar}
              estilo={estilos.boton}
            />

            <View style={estilos.contenedorEnlace}>
              <TextoEnlace
                texto={t("login.olvideContrasena")}
                onPress={() => navigation.navigate("RecuperarContrasena")}
              />
            </View>
            <View style={estilos.contenedorEnlace}>
              <TextoEnlace
                texto={t("login.tengoInvitacion")}
                onPress={() => navigation.navigate("Registro", undefined)}
              />
            </View>
          </View>
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
    padding: espaciado.lg,
  },
  marcaAgua: {
    position: "absolute",
    right: -30,
    bottom: -30,
    width: "100%",
    aspectRatio: 899 / 299,
    opacity: 0.05,
  },
  filaIdioma: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: espaciado.md,
  },
  // Antes del centrado, `contenido` (el ScrollView) ya no tiene justifyContent: "center" —
  // ese centrado pasa a este bloque (flex: 1 dentro de un padre flexGrow: 1), así el selector de
  // idioma de arriba queda fijo y solo lo de abajo se centra en el espacio que le queda.
  bloqueCentral: {
    flex: 1,
    justifyContent: "center",
  },
  encabezado: {
    marginBottom: espaciado.xl,
    alignItems: "center",
  },
  logo: {
    width: 220,
    height: 56,
  },
  subtitulo: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
    textAlign: "center",
    marginTop: espaciado.xs,
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
  contenedorEnlace: {
    marginTop: espaciado.lg,
  },
});
