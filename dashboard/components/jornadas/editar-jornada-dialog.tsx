"use client";

import { CheckCircle2, ImageOff, Save, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type {
  EditarJornadaRequest,
  EditarJornadaResponse,
  JornadaRow,
  TipoIncidencia,
} from "@/lib/types";

// Leaflet necesita `window`, así que el mapa solo se carga en el cliente —
// mismo patrón que el resto de mapas de este Dashboard (MapaFlota,
// MapaRutaJornada).
const MapaUbicacionPicker = dynamic(() => import("@/components/jornadas/mapa-ubicacion-picker"), {
  ssr: false,
  loading: () => (
    <div className="flex h-56 w-full items-center justify-center rounded-md border border-border text-sm text-muted-foreground">
      Cargando mapa…
    </div>
  ),
});

// Centrado por defecto del selector de ubicación cuando la jornada no tiene
// ningún dato de posición (ni check-in ni check-out) — Barcelona, donde
// operan las jornadas reales del piloto (a diferencia del centro por
// defecto de MapaFlota, Ciudad de México — un valor placeholder de otra
// tanda de trabajo que no se tocó acá, fuera de alcance de esta spec).
const CENTRO_MAPA_DEFECTO: [number, number] = [41.3874, 2.1686];
const ZOOM_CENTRO_DEFECTO = 12;
const ZOOM_CENTRO_CHECKIN = 13;
const ZOOM_CENTRO_EXISTENTE = 16;

/** Centro/zoom iniciales y pin precargado del selector de ubicación, en el
 * orden de prioridad de la spec: lat/lng final ya guardados > lat/lng de
 * check-in (punto de partida razonable, sin pin) > ciudad por defecto. */
function calcularVistaInicialMapa(jornada: JornadaRow): {
  centro: [number, number];
  zoom: number;
  posicionInicial: [number, number] | null;
} {
  if (jornada.lat_final != null && jornada.lng_final != null) {
    const posicion: [number, number] = [jornada.lat_final, jornada.lng_final];
    return { centro: posicion, zoom: ZOOM_CENTRO_EXISTENTE, posicionInicial: posicion };
  }
  if (jornada.lat_inicial != null && jornada.lng_inicial != null) {
    return {
      centro: [jornada.lat_inicial, jornada.lng_inicial],
      zoom: ZOOM_CENTRO_CHECKIN,
      posicionInicial: null,
    };
  }
  return { centro: CENTRO_MAPA_DEFECTO, zoom: ZOOM_CENTRO_DEFECTO, posicionInicial: null };
}

// Formato 24 horas forzado para la hora de check-out, sin importar la
// configuración regional del navegador/SO del admin: un <input
// type="datetime-local"> (o type="time") no lo garantiza — su presentación
// depende del locale y puede mostrarse con AM/PM. En vez de sumar una
// librería de date-picker nueva, se separa en <input type="date"> (el
// VALOR de un input de fecha siempre es "YYYY-MM-DD" sin ambigüedad,
// solo cambia cómo se pinta el calendario) + un input de texto propio para
// la hora con máscara + patrón HH:mm — texto plano, así que el formato es
// exactamente el que se programe acá, no el que decida el navegador.
const HORA_24H_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function formatearHoraMientrasEscribe(valorCrudo: string): string {
  const digitos = valorCrudo.replace(/\D/g, "").slice(0, 4);
  if (digitos.length <= 2) return digitos;
  return `${digitos.slice(0, 2)}:${digitos.slice(2)}`;
}

interface EditarJornadaDialogProps {
  jornada: JornadaRow;
  onClose: () => void;
  onGuardado: (jornadaActualizada: JornadaRow) => void;
}

// Mismas 4 opciones que usa IncidenciasForm.tsx en la app móvil (confirmado
// contra ese archivo antes de escribir esto) — no inventar valores nuevos
// que después no coincidan con lo que ya hay guardado de jornadas cerradas
// desde la app.
const TIPOS_INCIDENCIA: TipoIncidencia[] = [
  "Avería vehículo",
  "Tráfico/Retraso",
  "Cliente ausente",
  "Otro",
];

// Convierte un ISO (UTC, tal como lo guarda Supabase) a la hora LOCAL del
// navegador, separado en fecha ("YYYY-MM-DD", para <input type="date">) y
// hora ("HH:mm", para el input de texto de abajo) — Date ya hace la
// conversión de zona horaria al leer los componentes con los getters
// locales (getFullYear/getHours/...), así que no hace falta ninguna lógica
// de huso horario a mano.
function isoAFechaLocal(iso: string | null): string {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

function isoAHoraLocal(iso: string | null): string {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;
}

function SelectorImagen({
  etiqueta,
  urlExistente,
  archivoNuevo,
  onCambiar,
  soloLectura = false,
  mensajeSoloLectura,
}: {
  etiqueta: string;
  urlExistente: string | null;
  archivoNuevo: File | null;
  onCambiar: (archivo: File | null) => void;
  /** true cuando ya hay una foto y no se permite reemplazarla desde acá
   * (ver "no se puede reemplazar" en el tacómetro final). */
  soloLectura?: boolean;
  mensajeSoloLectura?: string;
}) {
  // El blob URL en sí se calcula durante el render (useMemo, determinístico a
  // partir de `archivoNuevo`) en vez de en un efecto con setState — el efecto
  // de abajo solo se ocupa de liberarlo (revokeObjectURL) cuando cambia o el
  // componente se desmonta, sin volver a disparar un render por su cuenta.
  const previsualizacion = useMemo(
    () => (archivoNuevo ? URL.createObjectURL(archivoNuevo) : null),
    [archivoNuevo]
  );

  useEffect(() => {
    return () => {
      if (previsualizacion) URL.revokeObjectURL(previsualizacion);
    };
  }, [previsualizacion]);

  const urlAMostrar = previsualizacion ?? urlExistente;

  return (
    <div>
      <Label>{etiqueta}</Label>
      <div className="flex items-center gap-3">
        {urlAMostrar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={urlAMostrar}
            alt={etiqueta}
            className="h-16 w-16 rounded-md border border-border object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
            <ImageOff className="h-5 w-5" />
          </div>
        )}
        {soloLectura ? (
          <p className="text-xs text-muted-foreground">
            {mensajeSoloLectura ?? "Ya fue cargada — no se puede reemplazar desde acá."}
          </p>
        ) : (
          <Input
            type="file"
            accept="image/jpeg,image/png"
            className="h-auto py-1.5"
            onChange={(e) => onCambiar(e.target.files?.[0] ?? null)}
          />
        )}
      </div>
    </div>
  );
}

function MiniaturaArchivo({ archivo, onQuitar }: { archivo: File; onQuitar: () => void }) {
  const url = useMemo(() => URL.createObjectURL(archivo), [archivo]);

  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return (
    <div className="relative">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={archivo.name}
          className="h-14 w-14 rounded-md border border-border object-cover"
        />
      )}
      <button
        type="button"
        onClick={onQuitar}
        aria-label="Quitar foto"
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-danger-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function SelectorFotosIncidencia({
  fotosExistentes,
  archivosNuevos,
  onCambiar,
}: {
  fotosExistentes: string[];
  archivosNuevos: File[];
  onCambiar: (archivos: File[]) => void;
}) {
  function agregarArchivos(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    onCambiar([...archivosNuevos, ...Array.from(lista)]);
  }

  function quitarArchivo(indice: number) {
    onCambiar(archivosNuevos.filter((_, i) => i !== indice));
  }

  return (
    <div>
      <Label>Fotos de respaldo</Label>
      {fotosExistentes.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {fotosExistentes.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt="Foto de incidencia ya subida"
              className="h-14 w-14 rounded-md border border-border object-cover"
            />
          ))}
        </div>
      )}
      {archivosNuevos.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {archivosNuevos.map((archivo, indice) => (
            <MiniaturaArchivo
              key={`${archivo.name}-${archivo.lastModified}-${indice}`}
              archivo={archivo}
              onQuitar={() => quitarArchivo(indice)}
            />
          ))}
        </div>
      )}
      <Input
        type="file"
        accept="image/jpeg,image/png"
        multiple
        className="h-auto py-1.5"
        onChange={(e) => {
          agregarArchivos(e.target.files);
          e.target.value = "";
        }}
      />
      <p className="mt-1 text-xs text-muted-foreground">
        Se agregan a las fotos ya subidas — no las reemplazan.
      </p>
    </div>
  );
}

// El padre (JornadasPage) renderiza este componente con `key={jornada.id}`,
// forzando un remount cada vez que se abre para editar una jornada distinta
// — así los campos siempre arrancan con los valores de ESA jornada, en vez
// de arrastrar lo que quedó de una edición anterior (mismo criterio que
// ExportarReporteDialog con el correo/error/resultado).
export function EditarJornadaDialog({ jornada, onClose, onGuardado }: EditarJornadaDialogProps) {
  const [empresa, setEmpresa] = useState(jornada.empresa);
  const [matricula, setMatricula] = useState(jornada.matricula);
  const [ruta, setRuta] = useState(jornada.ruta);
  const [kmInicial, setKmInicial] = useState(String(jornada.km_inicial));
  const [kmFinal, setKmFinal] = useState(jornada.km_final != null ? String(jornada.km_final) : "");
  const [combustibleInicial, setCombustibleInicial] = useState(String(jornada.combustible_inicial));
  const [combustibleFinal, setCombustibleFinal] = useState(
    jornada.combustible_final != null ? String(jornada.combustible_final) : ""
  );

  // "Datos de cierre" — nuevo (2026-09-15): completar la hora de check-out
  // cierra la jornada si estaba abierta (ver POST /api/jornadas/editar).
  // Todo opcional, precargado con lo que ya tenga la jornada.
  //
  // `fechaCheckOutFechaInicial`/`fechaCheckOutHoraInicial` (no son estado,
  // se derivan directo de `jornada` — estables durante toda la vida de este
  // componente, que se remonta entero vía `key={jornada.id}` en el padre)
  // son necesarias para no reenviar `fecha_check_out` sin que el admin la
  // haya tocado: a diferencia de kmFinal/combustibleFinal, que van y vuelven
  // sin pérdida por un input de texto/número, estos dos inputs (fecha +
  // hora HH:mm) solo tienen precisión de MINUTO — si se reenviaran siempre
  // que hay un valor (mismo criterio que kmFinal), cualquier corrección de
  // cualquier otro campo en una jornada ya cerrada le truncaría en silencio
  // los segundos/milisegundos a fecha_check_out. Comparando contra el valor
  // inicial, solo se manda si hubo un cambio real.
  const fechaCheckOutFechaInicial = isoAFechaLocal(jornada.fecha_check_out);
  const fechaCheckOutHoraInicial = isoAHoraLocal(jornada.fecha_check_out);
  const [fechaCheckOutFecha, setFechaCheckOutFecha] = useState(fechaCheckOutFechaInicial);
  const [fechaCheckOutHora, setFechaCheckOutHora] = useState(fechaCheckOutHoraInicial);

  // lat/lng final: a diferencia de la fecha de arriba, un número guardado en
  // estado va y vuelve sin pérdida de precisión — sí se puede reenviar
  // siempre que haya un valor sin riesgo de pisar algo con menos precisión
  // (sigue siendo exactamente el mismo valor si el admin no tocó el mapa).
  const [ubicacionFinal, setUbicacionFinal] = useState<{ lat: number; lng: number } | null>(
    jornada.lat_final != null && jornada.lng_final != null
      ? { lat: jornada.lat_final, lng: jornada.lng_final }
      : null
  );
  const vistaInicialMapa = useMemo(() => calcularVistaInicialMapa(jornada), [jornada]);

  const fotoTacometroFinalYaExiste = jornada.foto_tacometro_final_url != null;
  const [fotoTacometroFinal, setFotoTacometroFinal] = useState<File | null>(null);
  const [tuvoIncidencia, setTuvoIncidencia] = useState(jornada.tuvo_incidencia ?? false);
  const [tipoIncidencia, setTipoIncidencia] = useState<TipoIncidencia | "">(
    jornada.tipo_incidencia ?? ""
  );
  const [detalleIncidencia, setDetalleIncidencia] = useState(jornada.detalle_incidencia ?? "");
  const [fotosIncidenciaNuevas, setFotosIncidenciaNuevas] = useState<File[]>([]);

  const [motivoEdicion, setMotivoEdicion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  const detalleIncidenciaFaltante =
    tuvoIncidencia && tipoIncidencia === "Otro" && detalleIncidencia.trim().length === 0;

  async function onSubmit() {
    setError(null);

    if (!motivoEdicion.trim()) {
      setError("El motivo de la corrección es obligatorio.");
      return;
    }
    if (detalleIncidenciaFaltante) {
      setError('El detalle es obligatorio cuando el tipo de incidencia es "Otro".');
      return;
    }
    const fechaCheckOutCambio =
      fechaCheckOutFecha !== fechaCheckOutFechaInicial ||
      fechaCheckOutHora !== fechaCheckOutHoraInicial;
    if (fechaCheckOutCambio) {
      const fechaCompleta = fechaCheckOutFecha.trim() !== "";
      const horaCompleta = fechaCheckOutHora.trim() !== "";
      if (fechaCompleta !== horaCompleta) {
        setError("Completá la fecha y la hora de check-out (o dejá las dos vacías).");
        return;
      }
      if (horaCompleta && !HORA_24H_REGEX.test(fechaCheckOutHora)) {
        setError("La hora de check-out debe tener el formato HH:mm (24 horas).");
        return;
      }
    }

    const campos: EditarJornadaRequest = {
      id: jornada.id,
      motivoEdicion: motivoEdicion.trim(),
      empresa: empresa.trim(),
      matricula: matricula.trim(),
      ruta: ruta.trim(),
      kmInicial: Number(kmInicial),
      combustibleInicial: Number(combustibleInicial),
      tuvoIncidencia,
      tipoIncidencia: tuvoIncidencia ? tipoIncidencia || null : null,
      detalleIncidencia: tuvoIncidencia ? detalleIncidencia.trim() : "",
    };
    if (kmFinal.trim()) campos.kmFinal = Number(kmFinal);
    if (combustibleFinal.trim()) campos.combustibleFinal = Number(combustibleFinal);
    if (fechaCheckOutCambio && fechaCheckOutFecha && fechaCheckOutHora) {
      campos.fechaCheckOut = new Date(`${fechaCheckOutFecha}T${fechaCheckOutHora}`).toISOString();
    }
    if (ubicacionFinal) {
      campos.latFinal = ubicacionFinal.lat;
      campos.lngFinal = ubicacionFinal.lng;
    }

    const formulario = new FormData();
    for (const [clave, valor] of Object.entries(campos)) {
      if (valor === undefined || valor === null) continue;
      formulario.set(clave, String(valor));
    }
    if (fotoTacometroFinal) formulario.set("fotoTacometroFinal", fotoTacometroFinal);
    for (const archivo of fotosIncidenciaNuevas) {
      formulario.append("fotosIncidencia", archivo);
    }

    setEnviando(true);
    try {
      const respuesta = await fetch("/api/jornadas/editar", {
        method: "POST",
        body: formulario,
      });

      const cuerpo = (await respuesta.json().catch(() => null)) as EditarJornadaResponse | null;

      if (!respuesta.ok || !cuerpo) {
        setError(cuerpo?.mensaje ?? "No se pudo guardar la corrección.");
        return;
      }

      setGuardado(true);
      onGuardado(cuerpo.jornada);
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Corregir jornada" className="max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="edit-empresa">Empresa</Label>
            <Input id="edit-empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-matricula">Matrícula</Label>
            <Input
              id="edit-matricula"
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="edit-ruta">Ruta</Label>
          <Input id="edit-ruta" value={ruta} onChange={(e) => setRuta(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="edit-km-inicial">Km inicial</Label>
            <Input
              id="edit-km-inicial"
              type="number"
              value={kmInicial}
              onChange={(e) => setKmInicial(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-km-final">Km final</Label>
            <Input
              id="edit-km-final"
              type="number"
              placeholder="—"
              value={kmFinal}
              onChange={(e) => setKmFinal(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="edit-combustible-inicial">Combustible inicial (%)</Label>
            <Input
              id="edit-combustible-inicial"
              type="number"
              min={0}
              max={100}
              value={combustibleInicial}
              onChange={(e) => setCombustibleInicial(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-combustible-final">Combustible final (%)</Label>
            <Input
              id="edit-combustible-final"
              type="number"
              min={0}
              max={100}
              placeholder="—"
              value={combustibleFinal}
              onChange={(e) => setCombustibleFinal(e.target.value)}
            />
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Datos de cierre {jornada.estado === "abierta" ? "(opcional)" : ""}
          </p>

          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="edit-checkout-fecha">Hora de check-out</Label>
              <div className="flex gap-2">
                <Input
                  id="edit-checkout-fecha"
                  type="date"
                  className="flex-1"
                  value={fechaCheckOutFecha}
                  onChange={(e) => setFechaCheckOutFecha(e.target.value)}
                />
                <Input
                  id="edit-checkout-hora"
                  type="text"
                  inputMode="numeric"
                  placeholder="HH:mm"
                  className="w-24"
                  value={fechaCheckOutHora}
                  onChange={(e) =>
                    setFechaCheckOutHora(formatearHoraMientrasEscribe(e.target.value))
                  }
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Formato 24 horas (ej. 14:30).
                {jornada.estado === "abierta" && " Completar este campo cierra la jornada."}
              </p>
            </div>

            <div>
              <Label>Ubicación final</Label>
              <MapaUbicacionPicker
                centroInicial={vistaInicialMapa.centro}
                zoomInicial={vistaInicialMapa.zoom}
                posicionInicial={vistaInicialMapa.posicionInicial}
                onCambiar={(lat, lng) => setUbicacionFinal({ lat, lng })}
              />
            </div>

            <SelectorImagen
              etiqueta="Foto de tacómetro final"
              urlExistente={jornada.foto_tacometro_final_url}
              archivoNuevo={fotoTacometroFinal}
              onCambiar={setFotoTacometroFinal}
              soloLectura={fotoTacometroFinalYaExiste}
            />

            <div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={tuvoIncidencia}
                  onChange={(e) => setTuvoIncidencia(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Hubo incidencia
              </label>
            </div>

            {tuvoIncidencia && (
              <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                <div>
                  <Label htmlFor="edit-tipo-incidencia">Tipo de incidencia</Label>
                  <Select
                    id="edit-tipo-incidencia"
                    value={tipoIncidencia}
                    onChange={(e) => setTipoIncidencia(e.target.value as TipoIncidencia | "")}
                  >
                    <option value="">Sin especificar</option>
                    {TIPOS_INCIDENCIA.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {tipo}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label htmlFor="edit-detalle-incidencia">
                    Detalle {tipoIncidencia === "Otro" ? "" : "(opcional)"}
                  </Label>
                  <textarea
                    id="edit-detalle-incidencia"
                    rows={3}
                    value={detalleIncidencia}
                    onChange={(e) => setDetalleIncidencia(e.target.value)}
                    className="flex w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {detalleIncidenciaFaltante && (
                    <p className="mt-1 text-xs text-danger">
                      El detalle es obligatorio cuando el tipo es &quot;Otro&quot;.
                    </p>
                  )}
                </div>

                <SelectorFotosIncidencia
                  fotosExistentes={jornada.fotos_incidencia ?? []}
                  archivosNuevos={fotosIncidenciaNuevas}
                  onCambiar={setFotosIncidenciaNuevas}
                />
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <Label htmlFor="edit-motivo">Motivo de la corrección</Label>
          <textarea
            id="edit-motivo"
            rows={3}
            placeholder="Ej: el chofer cargó mal el kilometraje final por error de tipeo."
            value={motivoEdicion}
            onChange={(e) => setMotivoEdicion(e.target.value)}
            className="flex w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {guardado && (
          <p className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            Jornada corregida correctamente.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {guardado ? "Cerrar" : "Cancelar"}
          </Button>
          {!guardado && (
            <Button type="button" onClick={onSubmit} loading={enviando}>
              <Save className="h-4 w-4" />
              Guardar corrección
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
