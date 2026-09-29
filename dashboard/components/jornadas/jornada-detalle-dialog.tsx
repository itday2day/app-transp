"use client";

import { AlertTriangle, ImageOff, MapPin, Pencil, Route, X, ZoomIn } from "lucide-react";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { RutaJornadaDialog } from "@/components/mapa/ruta-jornada-dialog";
import { useDireccion } from "@/lib/hooks/use-direccion";
import { formatFechaHora } from "@/lib/utils";
import type { JornadaRow } from "@/lib/types";

interface JornadaDetalleDialogProps {
  jornada: JornadaRow | null;
  onClose: () => void;
  onEditar: (jornada: JornadaRow) => void;
}

function Dato({ label, valor }: { label: string; valor: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{valor ?? "—"}</dd>
    </div>
  );
}

// Mismo formato de URL que ya usa server/mock/reportes.js para el Excel
// (Google Maps URLs API, no el legado ?q=) — consistencia entre los dos
// lugares del sistema que enlazan a un punto puntual.
function urlGoogleMaps(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function Ubicacion({
  etiqueta,
  lat,
  lng,
}: {
  etiqueta: string;
  lat: number | null;
  lng: number | null;
}) {
  const { data: direccion, isLoading } = useDireccion(lat, lng);

  return (
    <div className="col-span-2">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      {lat != null && lng != null ? (
        <dd className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <a
            href={urlGoogleMaps(lat, lng)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary underline"
          >
            <MapPin className="h-3.5 w-3.5" />
            Ver en mapa
          </a>
          <span className="text-muted-foreground">
            {isLoading ? "Buscando dirección…" : (direccion ?? "Dirección no disponible")}
          </span>
        </dd>
      ) : (
        <dd className="text-sm text-muted-foreground">No registrada</dd>
      )}
    </div>
  );
}

function Foto({
  titulo,
  url,
  onAmpliar,
}: {
  titulo: string;
  url: string | null;
  onAmpliar: (foto: { url: string; titulo: string }) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{titulo}</p>
      {url ? (
        // spec_lightbox_detalle_jornada.md: click en la miniatura amplía la foto sobre el resto
        // de la pantalla (Lightbox más abajo) — el ícono queda SIEMPRE visible, no solo al pasar
        // el mouse, porque en el navegador de un teléfono (Hallazgos #11-#16) no existe "hover"
        // y un cursor:pointer solo no se ve nunca ahí.
        <button
          type="button"
          onClick={() => onAmpliar({ url, titulo })}
          className="group relative block h-40 w-full overflow-hidden rounded-md border border-border"
        >
          {/* Los buckets de Storage son de lectura pública: la URL sirve directo en <img>. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={titulo}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white">
            <ZoomIn className="h-3.5 w-3.5" />
          </span>
        </button>
      ) : (
        <div className="flex h-40 w-full items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
          <ImageOff className="h-6 w-6" />
        </div>
      )}
    </div>
  );
}

interface FotoAmpliada {
  url: string;
  titulo: string;
}

/**
 * Visor ampliado de una foto (spec_lightbox_detalle_jornada.md) — overlay propio, NO el `Dialog`
 * del proyecto: anidar dos `Dialog` duplicaba el cierre por Escape (cada uno registra su propio
 * listener global sin coordinarse) y el cleanup de uno pisaba el `overflow: hidden` que el otro
 * seguía necesitando (ver Fase 1 de la spec). z-[60], por encima del z-50 del Dialog, para
 * garantizar que quede siempre arriba sin depender del orden de montaje de los portales.
 */
function LightboxFoto({ foto, onClose }: { foto: FotoAmpliada; onClose: () => void }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute right-4 top-4 rounded-md p-3.5 text-white hover:bg-white/10 lg:p-2"
      >
        <X className="h-6 w-6" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={foto.url}
        alt={foto.titulo}
        className="max-h-full max-w-full rounded-md object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}

export function JornadaDetalleDialog({ jornada, onClose, onEditar }: JornadaDetalleDialogProps) {
  const [verRutaAbierto, setVerRutaAbierto] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState<FotoAmpliada | null>(null);
  const [jornadaIdAnterior, setJornadaIdAnterior] = useState<string | null>(null);

  // Si cambia la jornada (se cierra el detalle, o se selecciona otra
  // directamente sin cerrar) el modal de ruta no debe quedar abierto
  // mostrando la jornada anterior — este componente no se remonta entre una
  // jornada y otra, solo cambia la prop. Ajuste de estado durante el render
  // (no en un efecto): patrón recomendado por React para resetear estado
  // cuando cambia una prop, ver https://react.dev/learn/you-might-not-need-an-effect.
  const jornadaIdActual = jornada?.id ?? null;
  if (jornadaIdActual !== jornadaIdAnterior) {
    setJornadaIdAnterior(jornadaIdActual);
    setVerRutaAbierto(false);
    setFotoAmpliada(null);
  }

  // spec_lightbox_detalle_jornada.md, Fase 1 punto 2: el Dialog exterior escucha Escape/
  // click-afuera y llama a este `onClose` sin saber si el lightbox está abierto encima. En vez
  // de sumar un segundo listener de Escape (que dispararía junto con este y cerraría los dos a
  // la vez), se intercepta acá: con el lightbox abierto, el primer Escape/click-afuera lo cierra
  // a él solo; recién el segundo (ya sin lightbox) llega a cerrar el detalle de jornada.
  const manejarCierreDialog = useCallback(() => {
    if (fotoAmpliada) {
      setFotoAmpliada(null);
      return;
    }
    onClose();
  }, [fotoAmpliada, onClose]);

  return (
    <Dialog open={jornada != null} onClose={manejarCierreDialog} title="Detalle de jornada">
      {jornada && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            {jornada.fue_editado ? (
              <Badge variant="warning">
                <Pencil className="h-3 w-3" />
                Editado por {jornada.editado_por} el {formatFechaHora(jornada.editado_en)}
              </Badge>
            ) : (
              <span />
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onEditar(jornada)}
              className="shrink-0"
            >
              <Pencil className="h-4 w-4" />
              Corregir
            </Button>
          </div>

          {jornada.fue_editado && jornada.motivo_edicion && (
            <p className="-mt-4 text-xs text-muted-foreground">Motivo: {jornada.motivo_edicion}</p>
          )}

          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Dato label="Chofer" valor={jornada.chofer_nombre} />
            <Dato label="Empresa" valor={jornada.empresa} />
            <Dato label="Matrícula" valor={jornada.matricula} />
            <Dato label="Ruta" valor={jornada.ruta} />
            <Dato label="Estado" valor={jornada.estado === "abierta" ? "Abierta" : "Cerrada"} />
            <Dato label="Check-in" valor={formatFechaHora(jornada.fecha_check_in)} />
            <Dato label="Check-out" valor={formatFechaHora(jornada.fecha_check_out)} />
            <Dato label="Km inicial" valor={jornada.km_inicial} />
            <Dato label="Km final" valor={jornada.km_final} />
            <Dato
              label="Combustible inicial"
              valor={jornada.combustible_inicial != null ? `${jornada.combustible_inicial}%` : null}
            />
            <Dato
              label="Combustible final"
              valor={jornada.combustible_final != null ? `${jornada.combustible_final}%` : null}
            />
            <Ubicacion
              etiqueta="Ubicación Check-In"
              lat={jornada.lat_inicial}
              lng={jornada.lng_inicial}
            />
            <Ubicacion
              etiqueta="Ubicación Check-Out"
              lat={jornada.lat_final}
              lng={jornada.lng_final}
            />
          </dl>

          <div>
            <Button type="button" variant="outline" onClick={() => setVerRutaAbierto(true)}>
              <Route className="h-4 w-4" />
              Ver ruta
            </Button>
          </div>

          {/* spec_incidencia_en_checkin.md: incidencia estructurada del check-in, mismo patrón que
              la de check-out más abajo. `jornada.incidencias` (texto libre) es el histórico de
              jornadas creadas antes de este spec — se muestra tal cual solo cuando la jornada no
              tiene datos estructurados de check-in, para no perder ningún dato viejo. */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Incidencia de check-in</p>
              {jornada.tuvo_incidencia_checkin && (
                <Badge variant="danger">
                  <AlertTriangle className="h-3 w-3" />
                  {jornada.tipo_incidencia_checkin ?? "Sí"}
                </Badge>
              )}
            </div>
            {jornada.tuvo_incidencia_checkin ? (
              <p className="text-sm">
                {jornada.detalle_incidencia_checkin || "Sin detalle adicional."}
              </p>
            ) : jornada.incidencias ? (
              <p className="text-sm">{jornada.incidencias}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Sin incidencia reportada.</p>
            )}
          </div>

          {jornada.fotos_incidencia_checkin && jornada.fotos_incidencia_checkin.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                Fotos de respaldo de la incidencia de check-in
              </p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {jornada.fotos_incidencia_checkin.map((url, indice) => (
                  <Foto
                    key={url}
                    titulo={`Foto ${indice + 1}`}
                    url={url}
                    onAmpliar={setFotoAmpliada}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Incidencia de check-out</p>
              {jornada.tuvo_incidencia && (
                <Badge variant="danger">
                  <AlertTriangle className="h-3 w-3" />
                  {jornada.tipo_incidencia ?? "Sí"}
                </Badge>
              )}
            </div>
            {jornada.tuvo_incidencia ? (
              <p className="text-sm">{jornada.detalle_incidencia || "Sin detalle adicional."}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Sin incidencia reportada.</p>
            )}
          </div>

          {jornada.fotos_incidencia && jornada.fotos_incidencia.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                Fotos de respaldo de la incidencia de check-out
              </p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {jornada.fotos_incidencia.map((url, indice) => (
                  <Foto
                    key={url}
                    titulo={`Foto ${indice + 1}`}
                    url={url}
                    onAmpliar={setFotoAmpliada}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Foto
              titulo="Tacómetro inicial"
              url={jornada.foto_tacometro_inicial_url}
              onAmpliar={setFotoAmpliada}
            />
            <Foto titulo="Hoja de ruta" url={jornada.foto_ruta_url} onAmpliar={setFotoAmpliada} />
            <Foto
              titulo="Tacómetro final"
              url={jornada.foto_tacometro_final_url}
              onAmpliar={setFotoAmpliada}
            />
          </div>

          <RutaJornadaDialog
            jornadaId={verRutaAbierto ? jornada.id : null}
            titulo={`Ruta de la jornada — ${jornada.chofer_nombre} (${jornada.matricula})`}
            onClose={() => setVerRutaAbierto(false)}
          />

          {fotoAmpliada && (
            <LightboxFoto foto={fotoAmpliada} onClose={() => setFotoAmpliada(null)} />
          )}
        </div>
      )}
    </Dialog>
  );
}
