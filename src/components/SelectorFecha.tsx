import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { SelectorBuscable } from "@/components/SelectorBuscable";
import { SelectorDesplegable } from "@/components/SelectorDesplegable";
import { descomponerFechaIso } from "@/screens/logicaRegistro";
import { colores } from "@/theme/colors";
import { tipografia } from "@/theme/typography";
import { espaciado, radios } from "@/theme/spacing";

interface Props {
  etiqueta: string;
  valor: string | null; // ISO 8601 'YYYY-MM-DD' o null
  onCambiar: (fechaIso: string) => void;
  edadMinima?: number;
  /** Criterio 18 (spec_precarga_con_codigo_8_caracteres.md): fondo colores.advertenciaFondo
   * detrás de la fila día/mes/año y, debajo, la línea "Cargado por Administración" -- sin esta
   * prop (default `undefined`), igual que siempre. Único llamador de SelectorFecha en toda la
   * app: RegistroScreen.tsx (confirmado por grep), así que no hay otra pantalla que revisar. */
  precargado?: boolean;
}

function diasEnMes(mesIndice: number, anio: number): number {
  return new Date(anio, mesIndice + 1, 0).getDate();
}

export function SelectorFecha({ etiqueta, valor, onCambiar, edadMinima = 18, precargado }: Props) {
  const { t } = useTranslation();
  const MESES = t("selectorFecha.meses", { returnObjects: true }) as string[];
  const anioActual = new Date().getFullYear();
  const anioMaximo = anioActual - edadMinima;
  const anioMinimo = anioActual - 100;

  const aniosDisponibles = useMemo(() => {
    const anios: string[] = [];
    for (let anio = anioMaximo; anio >= anioMinimo; anio--) {
      anios.push(String(anio));
    }
    return anios;
  }, [anioMaximo, anioMinimo]);

  // Corrección (Paso 3c): antes, dia/mes/anio arrancaban SIEMPRE en null, sin importar `valor`
  // -- este componente nunca leía la prop al montarse (a diferencia de CampoTelefono.tsx, que sí
  // lo hace, ver el comentario "M2" de RegistroScreen.tsx, ya corregido). Mismo patrón que ahí:
  // UN solo useState lazy con el parseo puro (descomponerFechaIso(), logicaRegistro.ts), y los
  // tres estados derivados de ESE resultado ya calculado -- nunca se vuelve a parsear `valor` si
  // cambia después del montaje (misma limitación aceptada que tiene CampoTelefono).
  const [inicial] = useState(() => descomponerFechaIso(valor));
  const [dia, setDia] = useState<string | null>(inicial?.dia ?? null);
  const [mes, setMes] = useState<string | null>(inicial ? MESES[inicial.mesIndice] : null);
  const [anio, setAnio] = useState<string | null>(inicial?.anio ?? null);

  const mesIndice = mes ? MESES.indexOf(mes) : null;
  const diasDisponibles = useMemo(() => {
    const totalDias = mesIndice !== null && anio ? diasEnMes(mesIndice, Number(anio)) : 31;
    return Array.from({ length: totalDias }, (_, i) => String(i + 1).padStart(2, "0"));
  }, [mesIndice, anio]);

  function manejarSeleccion(nuevoDia: string | null, nuevoMes: string | null, nuevoAnio: string | null) {
    if (!nuevoDia || !nuevoMes || !nuevoAnio) {
      setDia(nuevoDia);
      setMes(nuevoMes);
      setAnio(nuevoAnio);
      return;
    }

    const indiceMes = MESES.indexOf(nuevoMes);
    const numeroAnio = Number(nuevoAnio);
    let numeroDia = Number(nuevoDia);

    // Al cambiar mes/año, un día que ya no existe en el nuevo mes (ej. 31 de
    // febrero) se recorta al último día válido en vez de producir una fecha
    // inválida.
    const maxDia = diasEnMes(indiceMes, numeroAnio);
    if (numeroDia > maxDia) numeroDia = maxDia;

    setDia(String(numeroDia).padStart(2, "0"));
    setMes(nuevoMes);
    setAnio(nuevoAnio);

    // Ajuste a 1 (spec_ajustes_pantalla_registro_limites_campos.md, 2026-10-20): este componente
    // YA NO calcula ni muestra su propio aviso de edad -- antes duplicaba, con la hora LOCAL del
    // dispositivo, el mismo chequeo que validarDatosRegistro() hace con la hora de Madrid (la
    // única fuente de verdad real). Queda un solo mensaje, el de RegistroScreen.tsx
    // (registro.edadMinima). onCambiar() se llama SIEMPRE, sin que ningún aviso de acá decida si
    // se puede enviar el formulario.
    const fechaIso = `${numeroAnio}-${String(indiceMes + 1).padStart(2, "0")}-${String(numeroDia).padStart(2, "0")}`;
    onCambiar(fechaIso);
  }

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <View style={[estilos.fila, precargado && estilos.filaPrecargada]}>
        <View style={[estilos.columnaDia, precargado && estilos.columnaSinMargenInferior]}>
          <SelectorDesplegable
            etiqueta=""
            ocultarEtiquetaVisible
            placeholder={t("selectorFecha.dia")}
            valor={dia}
            opciones={diasDisponibles}
            onSeleccionar={(nuevoDia) => manejarSeleccion(nuevoDia, mes, anio)}
          />
        </View>
        <View style={[estilos.columnaMes, precargado && estilos.columnaSinMargenInferior]}>
          <SelectorDesplegable
            etiqueta=""
            ocultarEtiquetaVisible
            placeholder={t("selectorFecha.mes")}
            valor={mes}
            opciones={MESES}
            onSeleccionar={(nuevoMes) => manejarSeleccion(dia, nuevoMes, anio)}
          />
        </View>
        <View style={[estilos.columnaAnio, precargado && estilos.columnaSinMargenInferior]}>
          {/* Con edadMinima=18 (el caso real, registro de choferes), esto son
              ~82 años (anioActual-100 a anioActual-18) — muy por encima de
              "un puñado", a diferencia de día (31) y mes (12), que quedan
              con SelectorDesplegable por ser listas cortas de interacción
              convencional por scroll (ver spec de SelectorBuscable). */}
          <SelectorBuscable
            etiqueta=""
            ocultarEtiquetaVisible
            placeholder={t("selectorFecha.anio")}
            valor={anio}
            opciones={aniosDisponibles}
            obtenerEtiqueta={(item) => item}
            onSeleccionar={(nuevoAnio) => manejarSeleccion(dia, mes, nuevoAnio)}
          />
        </View>
      </View>

      {/* Criterio 10: la línea visible es la que de verdad hace accesible la marca -- el fondo
          (estilos.filaPrecargada, arriba) nunca es la única señal. */}
      {precargado ? (
        <Text style={estilos.textoPrecargado}>{t("registro.cargadoPorAdministracion")}</Text>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    marginBottom: espaciado.md,
  },
  etiqueta: {
    ...tipografia.cuerpo,
    marginBottom: espaciado.xs,
    fontWeight: "600",
  },
  fila: {
    flexDirection: "row",
    gap: espaciado.sm,
  },
  // Decisión del usuario (2026-10-20): colores.advertenciaFondo, ya existente -- sin colores
  // nuevos. Los tres sub-selectores conservan su propio fondo opaco (colores.superficie) --
  // padding + radio acá para que se vea como una tarjeta resaltada alrededor de los tres, no
  // solo en los huecos del `gap`.
  filaPrecargada: {
    backgroundColor: colores.advertenciaFondo,
    borderRadius: radios.md,
    padding: espaciado.xs,
  },
  columnaDia: {
    flex: 1,
  },
  columnaMes: {
    flex: 1.4,
  },
  columnaAnio: {
    flex: 1.1,
  },
  // Corrección (Paso 3c, criterio 7): SelectorDesplegable/SelectorBuscable traen su propio
  // `contenedor: { marginBottom: espaciado.md }` (16) SIEMPRE, sin condición -- atrapado dentro
  // del `padding: espaciado.xs` (4) de filaPrecargada, de arriba, se veía como un hueco extra
  // abajo. Se cancela EXACTO (no una cifra aproximada) solo cuando `precargado` está activo --
  // sin la marca, columnaDia/Mes/Anio quedan con su único estilo de siempre (`flex`), sin este
  // `marginBottom` agregado.
  columnaSinMargenInferior: {
    marginBottom: -espaciado.md,
  },
  textoPrecargado: {
    ...tipografia.ayuda,
    color: colores.textoSecundario,
    marginTop: espaciado.xs,
  },
});
