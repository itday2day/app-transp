/** spec_identidad_visual_day2day.md: valores exactos de tokens.json (tema claro) del Day2Day
 * Design System — el modo oscuro queda fuera de alcance de esta spec (la app no tiene toggle de
 * tema, siempre corrió en claro). `primario` pasa a ser alias de `ink` (la paleta Day2Day no
 * define un color "primario" aparte — ver tokens.json, los botones primarios usan ink directo). */
export const colores = {
  primario: "#000000",
  primarioOscuro: "#000000",
  exito: "#146b46",
  advertencia: "#8f5a00",
  advertenciaFondo: "#f8edda",
  peligro: "#c7362c",
  fondo: "#f7f7f7",
  superficie: "#ffffff",
  textoPrincipal: "#000000",
  textoSecundario: "#4b4b49",
  borde: "#e3e2e0",
  deshabilitado: "#c9c8c5",
  offline: "#8f5a00",
  // spec_mejoras_carga_jornada_fotos_enlaces.md (Pedido 4): antes los enlaces usaban `primario`
  // (negro, pensado para botones/texto, no para señalar "esto se puede tocar"). Azul distinto del
  // #2563eb que ya usa el trazado de ruta en el mapa del Dashboard, para no confundir los dos.
  // Contraste medido: 5.66:1 sobre #ffffff y 5.28:1 sobre #f7f7f7 -- ambos por encima del 4.5:1 de
  // WCAG AA.
  link: "#2F6AA3",
};
