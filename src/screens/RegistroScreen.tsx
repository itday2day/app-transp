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
import {
  resolverInvitacion,
  registrarChofer,
  type DatosInvitacion,
  type ResultadoValidarInvitacion,
} from "@/services/authCore";
import { supabase } from "@/lib/supabase";
import { validarDatosRegistro, normalizarDni, type DatosRegistro } from "@/utils/validarDatosRegistro";
import { validarContrasena } from "@/utils/validarContrasena";
import { sugerirCorreccionCorreo, CORREO_VALIDO_REGEX } from "@/utils/correo";
import { telefonoEsValido, separarTelefono } from "@/utils/telefonoPais";
import {
  accionDeResultadoValidarInvitacion,
  accionDeResultadoRegistro,
  accionParaEstadoInvitacion,
  claveErrorCampo,
  tokenValido,
  normalizarCodigoInvitacion,
  codigoInvitacionCompleto,
  marcasPrecargadas,
  type AccionInvitacionNoValida,
} from "./logicaRegistro";
import { RootStackParamList, RootStackNavigationProp } from "@/navigation/types";
import type { ClaveTraduccion } from "@/i18n";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado } from "@/theme/spacing";

type RegistroRouteProp = RouteProp<RootStackParamList, "Registro">;

// spec_app_registro_paso5.md, paso 2c-3. Dos caminos de entrada: por enlace con token
// (route.params.token, 32 hex) o por código de 8 escrito a mano -- spec_precarga_con_codigo_8_caracteres.md
// (2026-10-20) igualó los dos: los DOS precargan los mismos datos y bloquean el DNI si la
// invitación lo trae atado, vía resolverInvitacion() (authCore.ts), que corre
// obtenerDatosInvitacion() y validarInvitacion() en paralelo. En los DOS, el resultado de
// validarInvitacion es quien decide si se muestra el formulario (criterio 2) -- nunca se confía
// solo en obtenerDatosInvitacion (0 filas ahí no distingue "no existe" de "ya usada", medido en
// la Fase 1b).
export default function RegistroScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<RootStackNavigationProp>();
  const { params } = useRoute<RegistroRouteProp>();
  const tokenInicial = tokenValido(params?.token);

  // M2 (corrección): con token, la fase arranca en "cargandoInvitacion" -- ni el formulario de
  // código de 8 (fase "invitacion") ni "formulario" se muestran hasta que la carga completa, para
  // no revelar un instante el campo del código con un enlace que no lo necesita.
  const [fase, setFase] = useState<
    "cargandoInvitacion" | "invitacion" | "invitacionNoValida" | "formulario" | "confirmarCorreo"
  >(tokenInicial ? "cargandoInvitacion" : "invitacion");
  const [invitacion, setInvitacion] = useState(tokenInicial ?? "");
  const [validandoInvitacion, setValidandoInvitacion] = useState(false);
  const [errorInvitacion, setErrorInvitacion] = useState<string | null>(null);
  // Hallazgo #68: SOLO para el token del ENLACE -- manejarValidarInvitacionManual() (código de 8
  // a mano) sigue usando errorInvitacion/fase "invitacion" sin cambios (criterio 6 corregido).
  // `textoClave` (no el texto ya traducido) para que un cambio de idioma en vivo no deje el
  // mensaje congelado en el idioma viejo.
  const [estadoInvitacionNoValida, setEstadoInvitacionNoValida] = useState<{
    textoClave: ClaveTraduccion;
    accion: AccionInvitacionNoValida;
  } | null>(null);
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
  // Criterio 17/18: snapshot de los datos TAL CUAL llegaron de la invitación (nunca se vuelve a
  // tocar después de aplicarDatosInvitacion) -- marcasPrecargadas() lo compara contra lo que el
  // chofer tiene tecleado AHORA en cada render, para decidir qué campos llevan la marca "Cargado
  // por Administración". `null` (nunca se aplicó nada, o invitación sin datos propios) -> ningún
  // campo con marca.
  const [precargado, setPrecargado] = useState<DatosInvitacion | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Criterio 15 (spec_precarga_con_codigo_8_caracteres.md): aplica los datos de la invitación al
  // formulario -- la MISMA función para las dos entradas (enlace y código), para no duplicar esta
  // lógica. Solo se llama cuando la invitación resultó "valida" (nunca con datos de una
  // invitación usada/revocada/vencida/inexistente, aunque obtenerDatosInvitacion() hubiera
  // devuelto algo -- ver el `if (accion.tipo === "valida")` de los dos llamadores, abajo).
  //
  // M2 (corrección, previa a esta spec): obtenerDatosInvitacion() y validarInvitacion() corrían
  // en paralelo, cada una decidiendo su propio pedazo de estado por su cuenta. Si
  // validarInvitacion() resolvía primero, setFase("formulario") montaba
  // CampoTelefono/SelectorFecha ANTES de que obtenerDatosInvitacion() hubiera llamado a
  // setTelefono()/setFechaNacimiento() -- los dos son componentes con estado interno propio que
  // leen su prop `valor` AL MONTARSE, así que un valor que llega tarde queda guardado en el padre
  // pero invisible en el campo. Por eso `aplicarDatosInvitacion` se llama DESPUÉS de que
  // resolverInvitacion() (authCore.ts) ya esperó las dos llamadas, nunca antes.
  //
  // ⚠️ Hallazgo (Paso 3, probado en el iPhone con un código real): hasta una corrección posterior
  // de esta misma spec, lo de arriba era CIERTO para CampoTelefono.tsx (useState(() =>
  // separarTelefono(valor))) pero FALSO para SelectorFecha.tsx -- dia/mes/año arrancaban SIEMPRE
  // en null, sin leer `valor` en absoluto, montara antes o después de que fechaNacimiento
  // tuviera un valor real. El síntoma (desplegables vacíos con «Fecha seleccionada: null/01/null»
  // mientras el padre sí tenía la fecha) no era un problema de orden/batching de los `set*` de
  // aquí -- SelectorFecha.tsx ya corrige esto con su propio useState(() => descomponerFechaIso(valor)).
  function aplicarDatosInvitacion(datos: DatosInvitacion | null) {
    if (!datos) return;
    // criterio 6: cada campo es string | null -- una invitación "abierta" (por enlace o por
    // código) puede no traer ninguno de estos datos (schema.sql:490-495).
    setDni(datos.dni ?? "");
    setNombre(datos.nombre ?? "");
    setApellidos(datos.apellidos ?? "");
    setTelefono(datos.telefono ?? "");
    setFechaNacimiento(datos.fecha_nacimiento);
    setCorreo(datos.email ?? "");
    // El DNI solo se bloquea si la invitación realmente lo trae atado -- una invitación abierta
    // sin DNI no puede bloquear un campo que el chofer todavía tiene que completar.
    setDniBloqueado(datos.dni !== null);
    // Criterio 17/18: guarda el snapshot TAL CUAL (sin ?? "", sin tocar) -- marcasPrecargadas()
    // es quien decide, campo por campo, si lo que hay ahora sigue igual a esto.
    setPrecargado(datos);
  }

  // Hallazgo #68: resultado de resolver el token del ENLACE -- válida va al formulario; cualquier
  // otro resultado va a la fase "invitacionNoValida" (NUNCA a "invitacion", que es la del código
  // de 8 a mano). Comparte esta decisión el efecto de montaje (abajo) y manejarReintentarInvitacion.
  function procesarResultadoInvitacion(datos: DatosInvitacion | null, resultado: ResultadoValidarInvitacion) {
    const accion = accionDeResultadoValidarInvitacion(resultado);
    if (accion.tipo === "valida") {
      aplicarDatosInvitacion(datos);
      setFase("formulario");
    } else {
      setEstadoInvitacionNoValida({
        textoClave: accion.textoClave,
        accion: accionParaEstadoInvitacion(resultado),
      });
      setFase("invitacionNoValida");
    }
  }

  // Sin token: queda en fase "invitacion" esperando el código de 8 -- el efecto de abajo solo
  // corre si HAY token.
  useEffect(() => {
    if (!tokenInicial) return;
    resolverInvitacion(tokenInicial, supabase).then(({ datos, resultado }) => {
      // Criterio 1 (#68): el campo del código se vacía al salir de la carga con enlace, sin
      // importar el resultado -- así, si el chofer abre después "Tengo otro código", lo ve vacío.
      setInvitacion("");
      procesarResultadoInvitacion(datos, resultado);
    });
    // Solo al montar -- el token no cambia durante la vida de la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // «Reintentar» (criterio 5/5a): re-resuelve el MISMO tokenInicial (deriva de params?.token en
  // cada render, nunca se guardó en un estado visible) -- la pantalla no cambia mientras consulta,
  // el botón queda en `cargando` (reusa validandoInvitacion, mismo estado que la validación manual
  // -- las dos fases son mutuamente excluyentes) y nunca vacía ni sustituye el token.
  async function manejarReintentarInvitacion() {
    if (!tokenInicial || validandoInvitacion) return;
    setValidandoInvitacion(true);
    try {
      const { datos, resultado } = await resolverInvitacion(tokenInicial, supabase);
      procesarResultadoInvitacion(datos, resultado);
    } finally {
      setValidandoInvitacion(false);
    }
  }

  // «Tengo otro código» (criterio 5b): abre la fase del código de 8 con el campo vacío, sin
  // mensaje de error y "Continuar" deshabilitado hasta 8 caracteres (codigoInvitacionCompleto).
  function manejarAbrirOtroCodigo() {
    setInvitacion("");
    setErrorInvitacion(null);
    setFase("invitacion");
  }

  async function manejarValidarInvitacionManual() {
    // Criterio 15: "Continuar" no llama a resolverInvitacion si no hay 8 -- `invitacion` ya
    // viene normalizado por normalizarCodigoInvitacion() desde el propio onChangeText, así que
    // esta comprobación es solo defensiva (longitud exacta).
    if (!codigoInvitacionCompleto(invitacion) || validandoInvitacion) return;
    setErrorInvitacion(null);
    setValidandoInvitacion(true);
    try {
      const { datos, resultado } = await resolverInvitacion(invitacion, supabase);
      const accion = accionDeResultadoValidarInvitacion(resultado);
      if (accion.tipo === "valida") {
        aplicarDatosInvitacion(datos);
        setFase("formulario");
      } else {
        setErrorInvitacion(t(accion.textoClave));
      }
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
  // Criterio 17/18: se recalcula en cada render contra el snapshot de `precargado` -- editar un
  // campo (y volver a escribir el valor original) actualiza la marca sola, sin ningún efecto
  // aparte (marcasPrecargadas es pura, RegistroScreen ya re-renderiza con cada setNombre/
  // setTelefono/etc. de los campos de abajo).
  const marcas = marcasPrecargadas(precargado, { nombre, apellidos, telefono, fechaNacimiento, correo });
  const errorContrasena = validarContrasena(contrasena);
  const contrasenasCoinciden = confirmarContrasena.length === 0 || confirmarContrasena === contrasena;
  const correoValido = CORREO_VALIDO_REGEX.test(correo.trim());

  // Corrección de la revisión: validarDatosRegistro() (capa 1, erroresCampo.telefono) usa el
  // regex SUELTO que sigue siendo el filtro previo al signUp -- no basta para bloquear
  // "Continuar", porque un número con la cantidad de dígitos del regex (7 a 14) puede no ser
  // POSIBLE para el país elegido (ej. España con 8 dígitos: pasa el regex, pero isPossible() es
  // false). telefonoEsValido() es la misma función que ya decide el aviso inline (P3) -- acá se
  // reusa para que "Continuar" nunca avance con un teléfono que ese mismo aviso ya marca inválido.
  const puedeContinuar =
    Object.keys(erroresCampo).length === 0 &&
    telefonoEsValido(telefono) &&
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

  // Criterio 4: único camino de vuelta al formulario desde "confirmarCorreo" -- limpia el error
  // del intento anterior para que no se vea junto a datos nuevos.
  function manejarCorregirDatos() {
    setErrorEnvio(null);
    setFase("formulario");
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

  // Hallazgo #68: el token del enlace nunca se muestra -- esta fase no tiene ningún campo,
  // solo el mensaje de error (mismas claves de siempre) y UNA sola acción según el estado.
  if (fase === "invitacionNoValida" && estadoInvitacionNoValida) {
    return (
      <View style={[estilos.pantalla, estilos.estadoInvitacionNoValida]}>
        <Text style={estilos.error}>{t(estadoInvitacionNoValida.textoClave)}</Text>
        {estadoInvitacionNoValida.accion === "iniciarSesion" ? (
          <BotonPrimario
            titulo={t("registro.botonIniciarSesion")}
            onPress={() => navigation.navigate("Login")}
            estilo={estilos.boton}
          />
        ) : estadoInvitacionNoValida.accion === "otroCodigo" ? (
          <BotonPrimario
            titulo={t("registro.botonOtroCodigo")}
            onPress={manejarAbrirOtroCodigo}
            estilo={estilos.boton}
          />
        ) : (
          <BotonPrimario
            titulo={t("comun.botonReintentar")}
            onPress={manejarReintentarInvitacion}
            cargando={validandoInvitacion}
            deshabilitado={validandoInvitacion}
            estilo={estilos.boton}
          />
        )}
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
              // SIN maxLength nativo a propósito -- un `maxLength` de la plataforma recorta el
              // texto CRUDO antes de que onChangeText se entere (confirmado: así filtran tanto
              // Android, InputFilter.LengthFilter, como iOS, shouldChangeCharactersInRange), lo
              // que rompería "lo pegado con separadores se limpia antes de contar" (criterio 15)
              // para un pegado más largo que 8 caracteres crudos (ej. "ab cd-12 34 56", 14
              // caracteres). El único límite real es normalizarCodigoInvitacion().slice(0,8).
              value={invitacion}
              onChangeText={(texto) => setInvitacion(normalizarCodigoInvitacion(texto))}
            />
            {errorInvitacion ? <Text style={estilos.error}>{errorInvitacion}</Text> : null}
            <BotonPrimario
              titulo={t("registro.botonValidarInvitacion")}
              onPress={manejarValidarInvitacionManual}
              cargando={validandoInvitacion}
              deshabilitado={!codigoInvitacionCompleto(invitacion)}
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
                    // Revisión: limpia el error del intento anterior -- mismo criterio 4 que
                    // manejarCorregirDatos (nunca un error viejo junto a un correo nuevo).
                    setErrorEnvio(null);
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
                <Text style={estilos.informativo}>{t("registro.correoYaRegistrado")}</Text>
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
                <TextoEnlace texto={t("registro.corregirMisDatos")} onPress={manejarCorregirDatos} />
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
            // SIN maxLength nativo a propósito -- recortaría el texto CRUDO antes de que
            // onChangeText se entere (mismo motivo que registro.invitacionEtiqueta, abajo), y
            // V5 pega "99 999.903-a" (12 caracteres crudos) esperando que normalizarDni() limpie
            // ANTES de contar los 9, no después. El único límite real es
            // normalizarDni(texto).slice(0,9).
            editable={!dniBloqueado}
            value={dni}
            onChangeText={(texto) => setDni(normalizarDni(texto).slice(0, 9))}
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
            precargado={marcas.nombre}
          />

          <CampoTexto
            etiqueta={t("registro.apellidosEtiqueta")}
            placeholder={t("registro.apellidosPlaceholder")}
            value={apellidos}
            onChangeText={setApellidos}
            onBlur={() => marcarTocado("apellidos")}
            error={errorDeCampo("apellidos", "apellidos")}
            precargado={marcas.apellidos}
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
            precargado={marcas.fechaNacimiento}
          />
          {(tocado.fechaNacimiento || intentoEnvio) && erroresCampo.fechaNacimiento ? (
            <Text style={estilos.error}>{t(claveErrorCampo(erroresCampo.fechaNacimiento))}</Text>
          ) : null}

          <CampoTelefono
            etiqueta={t("registro.telefonoEtiqueta")}
            valor={telefono}
            onCambiar={setTelefono}
            onBlur={() => marcarTocado("telefono")}
            error={
              // P3 + Ajuste a 13: isPossible() del E.164 (no el regex de validarDatosRegistro.ts,
              // que sigue siendo el filtro previo de la capa 1) -- el país del mensaje sale de
              // separarTelefono() (nunca de parsePhoneNumberFromString(telefono).country, ver el
              // comentario de telefonoPais.ts sobre la ambigüedad +44/Guernsey).
              (tocado.telefono || intentoEnvio) && !telefonoEsValido(telefono)
                ? telefono.trim().length === 0
                  ? t("comun.campoObligatorio")
                  : t("registro.telefonoInvalido", { pais: separarTelefono(telefono).pais })
                : undefined
            }
            precargado={marcas.telefono}
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
            precargado={marcas.correo}
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
            // Ajuste a 6 / criterio 6 (P5): "Confirmar contraseña", sin "nueva" -- clave propia del
            // registro (registro.confirmarContrasenaEtiqueta), no se edita
            // cambiarContrasena.confirmarContrasenaNuevaEtiqueta porque la comparte la pantalla de
            // contraseña nueva de la recuperación, donde "nueva" sí es correcto.
            etiqueta={t("registro.confirmarContrasenaEtiqueta")}
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
  estadoInvitacionNoValida: {
    justifyContent: "center",
    padding: espaciado.lg,
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
  // P4 (criterio 7): "Ya tienes una cuenta con este correo..." no es un error -- no hay nada mal
  // tipeado, es información (el correo YA tiene una cuenta confirmada) con dos salidas válidas.
  // colores.link es el único azul del design system (TextoEnlace.tsx) -- se reusa acá para el
  // mismo matiz "informativo, no alarmante".
  informativo: {
    ...tipografia.cuerpo,
    color: colores.link,
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
