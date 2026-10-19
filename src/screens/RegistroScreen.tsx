import React, { useEffect, useRef, useState } from "react";
import { Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { CampoTexto } from "@/components/CampoTexto";
import { CampoTelefono } from "@/components/CampoTelefono";
import { SelectorFecha } from "@/components/SelectorFecha";
import { BotonPrimario } from "@/components/BotonPrimario";
import { TextoEnlace } from "@/components/TextoEnlace";
import { ProveedorEnfoqueTeclado } from "@/context/EnfoqueTecladoContext";
import { validarInvitacion, obtenerDatosInvitacion, registrarChofer } from "@/services/authCore";
import { supabase } from "@/lib/supabase";
import { validarDatosRegistro, type DatosRegistro } from "@/utils/validarDatosRegistro";
import { validarContrasena } from "@/utils/validarContrasena";
import { sugerirCorreccionCorreo, CORREO_VALIDO_REGEX } from "@/utils/correo";
import {
  accionDeResultadoValidarInvitacion,
  accionDeResultadoRegistro,
  claveErrorCampo,
} from "./logicaRegistro";
import { RootStackParamList, RootStackNavigationProp } from "@/navigation/types";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

type RegistroRouteProp = RouteProp<RootStackParamList, "Registro">;

// spec_app_registro_paso5.md, paso 2c-3. Dos caminos de entrada: por enlace con token (route.params.token,
// 32 hex) -- precarga datos y bloquea el DNI -- o por código de 8 escrito a mano (DNI editable).
// En los DOS, validar_invitacion corre ANTES de mostrar el formulario (criterio 2) -- nunca se
// confía solo en obtener_datos_invitacion (0 filas ahí no distingue "no existe" de "ya usada",
// medido en la Fase 1b).
export default function RegistroScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<RootStackNavigationProp>();
  const { params } = useRoute<RegistroRouteProp>();
  const tokenInicial = params?.token;

  const [fase, setFase] = useState<"invitacion" | "formulario" | "confirmarCorreo">(
    tokenInicial ? "invitacion" : "invitacion"
  );
  const [invitacion, setInvitacion] = useState(tokenInicial ?? "");
  const [validandoInvitacion, setValidandoInvitacion] = useState(Boolean(tokenInicial));
  const [errorInvitacion, setErrorInvitacion] = useState<string | null>(null);
  const [dniBloqueado, setDniBloqueado] = useState(false);

  const [dni, setDni] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState<string | null>(null);
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [confirmarContrasena, setConfirmarContrasena] = useState("");
  const [tocado, setTocado] = useState<Record<string, boolean>>({});
  const [intentoEnvio, setIntentoEnvio] = useState(false);
  const [sugerenciaCorreo, setSugerenciaCorreo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  // criterio 5: ya existe una cuenta CONFIRMADA con ese correo -- reemplaza el botón normal de
  // "confirmarCorreo" por las DOS salidas que pide la spec (Iniciar sesión / Recuperar contraseña).
  const [correoYaRegistrado, setCorreoYaRegistrado] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Sin token: queda en fase "invitacion" esperando el código de 8 -- el efecto de abajo (precarga
  // + validarInvitacion) solo corre si HAY token.
  useEffect(() => {
    if (!tokenInicial) return;
    obtenerDatosInvitacion(tokenInicial, supabase).then((datos) => {
      if (!datos) return;
      setDni(datos.dni);
      setNombre(datos.nombre);
      setApellidos(datos.apellidos);
      setTelefono(datos.telefono);
      setFechaNacimiento(datos.fecha_nacimiento);
      setCorreo(datos.email);
      setDniBloqueado(true);
    });
    validarInvitacion(tokenInicial, supabase)
      .then((resultado) => {
        const accion = accionDeResultadoValidarInvitacion(resultado);
        if (accion.tipo === "valida") setFase("formulario");
        else setErrorInvitacion(t(accion.textoClave));
      })
      .finally(() => setValidandoInvitacion(false));
    // Solo al montar -- el token no cambia durante la vida de la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function manejarValidarInvitacionManual() {
    if (invitacion.trim().length === 0 || validandoInvitacion) return;
    setErrorInvitacion(null);
    setValidandoInvitacion(true);
    try {
      const resultado = await validarInvitacion(invitacion.trim(), supabase);
      const accion = accionDeResultadoValidarInvitacion(resultado);
      if (accion.tipo === "valida") setFase("formulario");
      else setErrorInvitacion(t(accion.textoClave));
    } finally {
      setValidandoInvitacion(false);
    }
  }

  const datosCampos: DatosRegistro = {
    dni,
    nombre,
    apellidos,
    fechaNacimiento: fechaNacimiento ?? "",
    telefono,
  };
  const erroresCampo = validarDatosRegistro(datosCampos);
  const errorContrasena = validarContrasena(contrasena);
  const contrasenasCoinciden = confirmarContrasena.length === 0 || confirmarContrasena === contrasena;
  const correoValido = CORREO_VALIDO_REGEX.test(correo.trim());

  const puedeContinuar =
    Object.keys(erroresCampo).length === 0 &&
    !errorContrasena &&
    confirmarContrasena.length > 0 &&
    contrasenasCoinciden &&
    correoValido;

  function marcarTocado(campo: string) {
    setTocado((actual) => ({ ...actual, [campo]: true }));
  }

  function errorDeCampo(campo: string, clave: keyof typeof erroresCampo): string | undefined {
    if (!(tocado[campo] || intentoEnvio)) return undefined;
    const claveError = erroresCampo[clave];
    return claveError ? t(claveErrorCampo(claveError)) : undefined;
  }

  function manejarContinuar() {
    if (!puedeContinuar) {
      setIntentoEnvio(true);
      return;
    }
    setSugerenciaCorreo(sugerirCorreccionCorreo(correo.trim()));
    setFase("confirmarCorreo");
  }

  async function manejarRegistrar() {
    if (enviando) return;
    setErrorEnvio(null);
    setEnviando(true);
    try {
      const resultado = await registrarChofer(
        {
          invitacion,
          dni,
          nombre,
          apellidos,
          fechaNacimiento: fechaNacimiento ?? "",
          telefono,
          correo: correo.trim(),
          contrasena,
        },
        supabase
      );
      const accion = accionDeResultadoRegistro(resultado);
      if (accion.tipo === "pantallaCodigo") {
        navigation.replace("CodigoVerificacion", {
          correo: correo.trim(),
          tipo: "signup",
          origen: "registro",
        });
      } else if (accion.tipo === "correoYaRegistrado") {
        // criterio 5: ya existe una cuenta CONFIRMADA con ese correo -- NO se abre la pantalla de
        // código, dos salidas en vez de un error simple.
        setCorreoYaRegistrado(true);
      } else if (accion.tipo === "esperar") {
        setErrorEnvio(t(accion.textoClave, { segundos: accion.segundos }));
      } else {
        setErrorEnvio(t(accion.textoClave));
      }
    } finally {
      setEnviando(false);
    }
  }

  if (fase === "invitacion") {
    return (
      <ProveedorEnfoqueTeclado scrollRef={scrollRef}>
        <KeyboardAvoidingView
          style={estilos.pantalla}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={estilos.contenido}
            keyboardShouldPersistTaps="handled"
          >
            <CampoTexto
              etiqueta={t("registro.invitacionEtiqueta")}
              placeholder={t("registro.invitacionPlaceholder")}
              autoCapitalize="characters"
              autoCorrect={false}
              value={invitacion}
              onChangeText={setInvitacion}
            />
            {errorInvitacion ? <Text style={estilos.error}>{errorInvitacion}</Text> : null}
            <BotonPrimario
              titulo={t("registro.botonValidarInvitacion")}
              onPress={manejarValidarInvitacionManual}
              cargando={validandoInvitacion}
              deshabilitado={invitacion.trim().length === 0}
              estilo={estilos.boton}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </ProveedorEnfoqueTeclado>
    );
  }

  if (fase === "confirmarCorreo") {
    return (
      <ProveedorEnfoqueTeclado scrollRef={scrollRef}>
        <KeyboardAvoidingView
          style={estilos.pantalla}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={estilos.contenido}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={estilos.aviso}>{t("registro.avisoRevisaCorreo")}</Text>
            <Text style={estilos.correoConfirmar}>{correo.trim()}</Text>

            {sugerenciaCorreo ? (
              <>
                <Text style={estilos.pregunta}>
                  {t("registro.sugerenciaCorreoPregunta", { sugerido: sugerenciaCorreo })}
                </Text>
                <BotonPrimario
                  titulo={t("registro.botonUsarSugerido")}
                  onPress={() => {
                    setCorreo(sugerenciaCorreo);
                    setSugerenciaCorreo(null);
                  }}
                  estilo={estilos.boton}
                />
                <BotonPrimario
                  titulo={t("registro.botonCorreoEstaBien")}
                  onPress={() => setSugerenciaCorreo(null)}
                  variante="secundario"
                  estilo={estilos.boton}
                />
              </>
            ) : correoYaRegistrado ? (
              // criterio 5: identities:[] -- ya existe una cuenta CONFIRMADA con este correo. Dos
              // salidas, NUNCA la pantalla de código.
              <>
                <Text style={estilos.error}>{t("registro.correoYaRegistrado")}</Text>
                <BotonPrimario
                  titulo={t("registro.botonIniciarSesion")}
                  onPress={() => navigation.navigate("Login")}
                  estilo={estilos.boton}
                />
                <BotonPrimario
                  titulo={t("registro.botonRecuperarContrasena")}
                  onPress={() => navigation.navigate("RecuperarContrasena")}
                  variante="secundario"
                  estilo={estilos.boton}
                />
              </>
            ) : (
              <>
                {errorEnvio ? <Text style={estilos.error}>{errorEnvio}</Text> : null}
                <BotonPrimario
                  titulo={t("registro.botonCrearCuenta")}
                  onPress={manejarRegistrar}
                  cargando={enviando}
                  estilo={estilos.boton}
                />
                <TextoEnlace texto={t("comun.cancelar")} onPress={() => setFase("formulario")} />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </ProveedorEnfoqueTeclado>
    );
  }

  return (
    <ProveedorEnfoqueTeclado scrollRef={scrollRef}>
      <KeyboardAvoidingView style={estilos.pantalla} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={estilos.contenido}
          keyboardShouldPersistTaps="handled"
        >
          <CampoTexto
            etiqueta={t("registro.dniEtiqueta")}
            placeholder={t("registro.dniPlaceholder")}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!dniBloqueado}
            value={dni}
            onChangeText={setDni}
            onBlur={() => marcarTocado("dni")}
            error={errorDeCampo("dni", "dni")}
          />
          {dniBloqueado ? <Text style={estilos.ayuda}>{t("registro.dniBloqueadoAviso")}</Text> : null}

          <CampoTexto
            etiqueta={t("registro.nombreEtiqueta")}
            placeholder={t("registro.nombrePlaceholder")}
            value={nombre}
            onChangeText={setNombre}
            onBlur={() => marcarTocado("nombre")}
            error={errorDeCampo("nombre", "nombre")}
          />

          <CampoTexto
            etiqueta={t("registro.apellidosEtiqueta")}
            placeholder={t("registro.apellidosPlaceholder")}
            value={apellidos}
            onChangeText={setApellidos}
            onBlur={() => marcarTocado("apellidos")}
            error={errorDeCampo("apellidos", "apellidos")}
          />

          <SelectorFecha
            etiqueta={t("registro.fechaNacimientoEtiqueta")}
            valor={fechaNacimiento}
            onCambiar={setFechaNacimiento}
          />
          {(tocado.fechaNacimiento || intentoEnvio) && erroresCampo.fechaNacimiento ? (
            <Text style={estilos.error}>{t(claveErrorCampo(erroresCampo.fechaNacimiento))}</Text>
          ) : null}

          <CampoTelefono
            etiqueta={t("registro.telefonoEtiqueta")}
            valor={telefono}
            onCambiar={(v) => {
              setTelefono(v);
              marcarTocado("telefono");
            }}
            error={errorDeCampo("telefono", "telefono")}
          />

          <CampoTexto
            etiqueta={t("login.correoEtiqueta")}
            placeholder={t("login.correoPlaceholder")}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            value={correo}
            onChangeText={setCorreo}
            onBlur={() => marcarTocado("correo")}
            error={(tocado.correo || intentoEnvio) && !correoValido ? t("comun.campoObligatorio") : undefined}
          />

          <CampoTexto
            etiqueta={t("login.contrasenaEtiqueta")}
            placeholder={t("cambiarContrasena.contrasenaNuevaPlaceholder")}
            secureTextEntry
            alternarVisibilidad
            autoCapitalize="none"
            value={contrasena}
            onChangeText={setContrasena}
            onBlur={() => marcarTocado("contrasena")}
            error={
              (tocado.contrasena || intentoEnvio) && errorContrasena ? t("comun.contrasenaCorta") : undefined
            }
          />

          <CampoTexto
            etiqueta={t("cambiarContrasena.confirmarContrasenaNuevaEtiqueta")}
            placeholder={t("cambiarContrasena.confirmarContrasenaNuevaPlaceholder")}
            secureTextEntry
            alternarVisibilidad
            autoCapitalize="none"
            value={confirmarContrasena}
            onChangeText={setConfirmarContrasena}
            onBlur={() => marcarTocado("confirmarContrasena")}
            error={
              (tocado.confirmarContrasena || intentoEnvio) && !contrasenasCoinciden
                ? t("cambiarContrasena.contrasenasNoCoinciden")
                : undefined
            }
          />

          <BotonPrimario
            titulo={t("registro.botonContinuar")}
            onPress={manejarContinuar}
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
    padding: espaciado.lg,
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
  ayuda: {
    ...tipografia.ayuda,
    color: colores.textoSecundario,
    marginTop: -espaciado.sm,
    marginBottom: espaciado.md,
  },
  aviso: {
    ...tipografia.cuerpo,
    color: colores.textoSecundario,
    textAlign: "center",
    marginBottom: espaciado.sm,
  },
  correoConfirmar: {
    ...tipografia.subtitulo,
    textAlign: "center",
    marginBottom: espaciado.lg,
  },
  pregunta: {
    ...tipografia.cuerpo,
    textAlign: "center",
    marginBottom: espaciado.md,
  },
});
