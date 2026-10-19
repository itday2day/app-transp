import React, { useEffect, useRef, useState } from "react";
import {
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  ActivityIndicator,
} from "react-native";
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
  tokenValido,
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
  const tokenInicial = tokenValido(params?.token);

  // M2 (corrección): con token, la fase arranca en "cargandoInvitacion" -- ni el formulario de
  // código de 8 (fase "invitacion") ni "formulario" se muestran hasta que la carga completa, para
  // no revelar un instante el campo del código con un enlace que no lo necesita.
  const [fase, setFase] = useState<"cargandoInvitacion" | "invitacion" | "formulario" | "confirmarCorreo">(
    tokenInicial ? "cargandoInvitacion" : "invitacion"
  );
  const [invitacion, setInvitacion] = useState(tokenInicial ?? "");
  const [validandoInvitacion, setValidandoInvitacion] = useState(false);
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
  //
  // M2 (corrección): obtenerDatosInvitacion() y validarInvitacion() corrían en paralelo, cada una
  // decidiendo su propio pedazo de estado por su cuenta. Si validarInvitacion() resolvía primero,
  // setFase("formulario") montaba CampoTelefono/SelectorFecha ANTES de que
  // obtenerDatosInvitacion() hubiera llamado a setTelefono()/setFechaNacimiento() -- los dos son
  // componentes con estado interno propio que solo leen su prop `valor` AL MONTARSE (useState(()
  // => separarTelefono(valor)) en CampoTelefono.tsx:29; dia/mes/año en SelectorFecha.tsx:45-47,
  // ninguno sincronizado con `valor` después del montaje), así que un valor que llega tarde queda
  // guardado en el padre pero invisible en el campo -- el chofer vería el campo vacío y podría
  // enviar un teléfono/fecha que no ve. (SelectorBuscable.tsx NO tiene este problema: lee `valor`
  // directo en cada render, sin estado propio que lo espejee -- confirmado leyendo su código,
  // SelectorBuscable.tsx:89-91.) Un solo Promise.all() espera las DOS antes de aplicar cualquier
  // estado y de decidir la fase -- CampoTelefono/SelectorFecha solo se montan (fase "formulario")
  // con los valores ya finales, nunca a mitad de carga.
  useEffect(() => {
    if (!tokenInicial) return;
    Promise.all([
      obtenerDatosInvitacion(tokenInicial, supabase),
      validarInvitacion(tokenInicial, supabase),
    ]).then(([datos, resultado]) => {
      if (datos) {
        // criterio 2: cada campo es string | null -- una invitación "abierta" compartida por
        // enlace puede no traer ninguno de estos datos (schema.sql:490-495), igual que por
        // código de 8.
        setDni(datos.dni ?? "");
        setNombre(datos.nombre ?? "");
        setApellidos(datos.apellidos ?? "");
        setTelefono(datos.telefono ?? "");
        setFechaNacimiento(datos.fecha_nacimiento);
        setCorreo(datos.email ?? "");
        // El DNI solo se bloquea si la invitación realmente lo trae atado -- una invitación
        // abierta sin DNI no puede bloquear un campo que el chofer todavía tiene que completar.
        setDniBloqueado(datos.dni !== null);
      }
      const accion = accionDeResultadoValidarInvitacion(resultado);
      if (accion.tipo === "valida") {
        setFase("formulario");
      } else {
        setErrorInvitacion(t(accion.textoClave));
        setFase("invitacion");
      }
    });
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

  if (fase === "cargandoInvitacion") {
    return (
      <View style={[estilos.pantalla, estilos.cargando]}>
        <ActivityIndicator color={colores.primario} />
      </View>
    );
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
                {/* Menor (ronda de revisión): esto no cancela nada, vuelve al formulario con los
                    datos intactos para corregirlos -- "Cancelar" prometía descartar. */}
                <TextoEnlace texto={t("registro.corregirMisDatos")} onPress={() => setFase("formulario")} />
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
            onCambiar={(fecha) => {
              setFechaNacimiento(fecha);
              // Ajuste a 1: SelectorFecha ya no marca su propio aviso de edad -- para que el
              // único mensaje que queda (registro.edadMinima) salga de inmediato al elegir la
              // fecha, en vez de recién tras pulsar "Continuar", se marca "tocado" acá mismo.
              marcarTocado("fechaNacimiento");
            }}
          />
          {(tocado.fechaNacimiento || intentoEnvio) && erroresCampo.fechaNacimiento ? (
            <Text style={estilos.error}>{t(claveErrorCampo(erroresCampo.fechaNacimiento))}</Text>
          ) : null}

          <CampoTelefono
            etiqueta={t("registro.telefonoEtiqueta")}
            valor={telefono}
            onCambiar={setTelefono}
            onBlur={() => marcarTocado("telefono")}
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
            error={
              (tocado.correo || intentoEnvio) && !correoValido
                ? t(correo.trim().length === 0 ? "comun.campoObligatorio" : "registro.correoInvalido")
                : undefined
            }
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
              // Menor (ronda de revisión): contrasenasCoinciden es TRUE a propósito cuando el
              // campo está vacío (para no mostrar "no coinciden" mientras el chofer todavía no
              // escribió nada) -- pero eso también lo dejaba sin ningún error visible si tocaba
              // "Continuar" con el campo vacío: puedeContinuar ya exige length>0, así que
              // "Continuar" no hacía nada que el chofer pudiera ver. Acá se distinguen los dos
              // casos explícitamente.
              tocado.confirmarContrasena || intentoEnvio
                ? confirmarContrasena.length === 0
                  ? t("comun.campoObligatorio")
                  : !contrasenasCoinciden
                    ? t("cambiarContrasena.contrasenasNoCoinciden")
                    : undefined
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
  cargando: {
    alignItems: "center",
    justifyContent: "center",
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
