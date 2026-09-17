"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

/**
 * Leaflet calcula su tamaño una sola vez al montarse — si el contenedor
 * cambia de tamaño después (rotar el teléfono con el mapa ya abierto, cruzar
 * un breakpoint, el recálculo de `dvh` al mostrarse/ocultarse la barra de
 * direcciones del navegador móvil, o el modal de "Corregir" pasando a
 * pantalla completa), los tiles quedan mal recortados hasta que algo le
 * avisa que recalcule. Un `ResizeObserver` sobre el propio contenedor cubre
 * los tres casos con un solo mecanismo, en vez de escuchar eventos
 * distintos (resize, orientationchange, etc.) o usar un `setTimeout` con un
 * número inventado. Va como hijo de <MapContainer /> porque useMap() solo
 * funciona dentro de su contexto — mismo patrón que ControladorVista/
 * ClickParaMover/Recentrador en este Dashboard.
 */
export function InvalidarAlRedimensionar() {
  const map = useMap();

  useEffect(() => {
    const contenedor = map.getContainer();
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(contenedor);
    return () => observer.disconnect();
  }, [map]);

  return null;
}
