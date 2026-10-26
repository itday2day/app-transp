"use client";

import { ArrowRightLeft, Check, Pencil, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectorBuscable } from "@/components/ui/selector-buscable";
import { useEmpresaDetalle } from "@/lib/hooks/use-empresa-detalle";
import { useEmpresas } from "@/lib/hooks/use-empresas";
import type {
  ChoferParaAsignacion,
  EmpresaConPendiente,
  PrevisualizarFusionarEmpresasResponse,
  PrevisualizarRenombrarResponse,
  RutaConChoferes,
} from "@/lib/types";

function mensajeDeError(cuerpo: unknown, fallback: string): string {
  return cuerpo && typeof cuerpo === "object" && "mensaje" in cuerpo
    ? String((cuerpo as { mensaje: unknown }).mensaje)
    : fallback;
}

async function leerJson(respuesta: Response): Promise<unknown> {
  return respuesta.json().catch(() => null);
}

/** Renombrar una empresa o ruta con vista previa obligatoria (decisión D5): muestra el número
 * previsto + la nota de "coincidencia exacta" antes de poder confirmar, y el número REAL después.
 * Comparte la misma forma para empresa y ruta -- los endpoints de previsualizar/renombrar de cada
 * una tienen la misma respuesta (PrevisualizarRenombrarResponse/RenombrarResponse). */
function RenombrarInline({
  nombreActual,
  rutaPrevisualizar,
  rutaRenombrar,
  onRenombrado,
}: {
  nombreActual: string;
  rutaPrevisualizar: string;
  rutaRenombrar: string;
  onRenombrado: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState(nombreActual);
  const [previa, setPrevia] = useState<PrevisualizarRenombrarResponse | null>(null);
  const [resultado, setResultado] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function previsualizar() {
    setError(null);
    setPrevia(null);
    setResultado(null);
    if (!nombreNuevo.trim() || nombreNuevo.trim() === nombreActual) return;
    setCargando(true);
    try {
      const respuesta = await fetch(rutaPrevisualizar, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombreNuevo }),
      });
      const cuerpo = await leerJson(respuesta);
      if (!respuesta.ok) {
        setError(mensajeDeError(cuerpo, "No se pudo previsualizar el cambio."));
        return;
      }
      setPrevia(cuerpo as PrevisualizarRenombrarResponse);
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setCargando(false);
    }
  }

  async function confirmar() {
    setCargando(true);
    setError(null);
    try {
      const respuesta = await fetch(rutaRenombrar, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombreNuevo }),
      });
      const cuerpo = await leerJson(respuesta);
      if (!respuesta.ok) {
        setError(mensajeDeError(cuerpo, "No se pudo renombrar."));
        return;
      }
      setResultado((cuerpo as { jornadasActualizadas: number }).jornadasActualizadas);
      onRenombrado();
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setCargando(false);
    }
  }

  if (!editando) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setEditando(true)}>
        <Pencil className="h-3.5 w-3.5" />
        Renombrar
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={nombreNuevo}
          onChange={(e) => {
            setNombreNuevo(e.target.value);
            setPrevia(null);
            setResultado(null);
          }}
          className="h-9 flex-1 rounded-md border border-border bg-card px-3 text-sm"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={previsualizar}
          loading={cargando}
        >
          Previsualizar
        </Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {previa && resultado === null && (
        <div className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
          <p>
            Se actualizarán <strong>{previa.jornadasAfectadas}</strong> jornada(s).
          </p>
          <p className="text-xs text-muted-foreground">{previa.nota}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={confirmar} loading={cargando}>
              Confirmar
            </Button>
          </div>
        </div>
      )}

      {resultado !== null && (
        <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
          Hecho. Se actualizaron {resultado} jornada(s) reales.
        </p>
      )}
    </div>
  );
}

/** Fusionar una empresa o ruta en otra, con vista previa obligatoria (D5) -- misma idea que
 * RenombrarInline pero elegir el destino con SelectorBuscable y una respuesta de vista previa más
 * rica (rutas combinadas/movidas, choferes vinculados) para empresas; más chica para rutas. */
function FusionarInline<T extends { id: string; nombre: string }>({
  item,
  opciones,
  rutaPrevisualizar,
  rutaFusionar,
  renderPrevia,
  onFusionado,
}: {
  item: T;
  opciones: T[];
  rutaPrevisualizar: string;
  rutaFusionar: string;
  renderPrevia: (
    previa:
      | PrevisualizarFusionarEmpresasResponse
      | { choferesVinculados: number; jornadasAfectadas: number; nota: string }
  ) => React.ReactNode;
  onFusionado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [destinoId, setDestinoId] = useState<string | null>(null);
  const [previa, setPrevia] = useState<
    | PrevisualizarFusionarEmpresasResponse
    | { choferesVinculados: number; jornadasAfectadas: number; nota: string }
    | null
  >(null);
  const [resultado, setResultado] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidatos = opciones.filter((o) => o.id !== item.id);

  async function previsualizar(id: string) {
    setDestinoId(id);
    setError(null);
    setPrevia(null);
    setResultado(null);
    setCargando(true);
    try {
      const respuesta = await fetch(rutaPrevisualizar, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origenId: item.id, destinoId: id }),
      });
      const cuerpo = await leerJson(respuesta);
      if (!respuesta.ok) {
        setError(mensajeDeError(cuerpo, "No se pudo previsualizar la fusión."));
        return;
      }
      setPrevia(cuerpo as PrevisualizarFusionarEmpresasResponse);
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setCargando(false);
    }
  }

  async function confirmar() {
    if (!destinoId) return;
    setCargando(true);
    setError(null);
    try {
      const respuesta = await fetch(rutaFusionar, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origenId: item.id, destinoId }),
      });
      const cuerpo = await leerJson(respuesta);
      if (!respuesta.ok) {
        setError(mensajeDeError(cuerpo, "No se pudo fusionar."));
        return;
      }
      setResultado((cuerpo as { jornadasActualizadas: number }).jornadasActualizadas);
      onFusionado();
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setCargando(false);
    }
  }

  if (!abierto) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setAbierto(true)}>
        <ArrowRightLeft className="h-3.5 w-3.5" />
        Fusionar
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Elegí con cuál se queda &quot;{item.nombre}&quot; (la otra se desactiva):
      </p>
      <SelectorBuscable
        idPrefix="fusion-destino"
        items={candidatos}
        valorId={destinoId}
        getId={(o) => o.id}
        getPrimario={(o) => o.nombre}
        getSecundario={() => null}
        filtrar={(items, texto) =>
          items.filter((o) => o.nombre.toLowerCase().includes(texto.toLowerCase()))
        }
        onSeleccionar={(o) => previsualizar(o.id)}
        placeholder="Elegir destino…"
        textoSinOpciones="No hay otra opción para fusionar."
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      {previa && resultado === null && (
        <div className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
          {renderPrevia(previa)}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={confirmar} loading={cargando}>
              Confirmar fusión
            </Button>
          </div>
        </div>
      )}

      {resultado !== null && (
        <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
          Hecho. Se actualizaron {resultado} jornada(s) reales.
        </p>
      )}
    </div>
  );
}

/** Casillas agrupadas de choferes para una empresa o una ruta -- usa POST /api/choferes/vinculos
 * con un diff de un solo elemento por click (D2: nunca "el conjunto completo"). */
function CasillasChoferes({
  titulo,
  todosLosChoferes,
  vinculados,
  campoAgregar,
  campoQuitar,
  idObjetivo,
  onCambiado,
}: {
  titulo: string;
  todosLosChoferes: ChoferParaAsignacion[];
  vinculados: string[];
  campoAgregar: "empresasAgregar" | "rutasAgregar";
  campoQuitar: "empresasQuitar" | "rutasQuitar";
  idObjetivo: string;
  onCambiado: () => void;
}) {
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const vinculadosSet = new Set(vinculados);

  async function alternar(choferId: string, marcar: boolean) {
    setEnviando(choferId);
    setError(null);
    try {
      const respuesta = await fetch("/api/choferes/vinculos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          choferId,
          [marcar ? campoAgregar : campoQuitar]: [idObjetivo],
        }),
      });
      const cuerpo = await leerJson(respuesta);
      if (!respuesta.ok) {
        setError(mensajeDeError(cuerpo, "No se pudo guardar."));
        return;
      }
      onCambiado();
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
        {todosLosChoferes.map((chofer) => {
          const marcado = vinculadosSet.has(chofer.id);
          // Corrección C4: un chofer de baja se muestra atenuado y no se puede marcar de nuevo --
          // salvo que ya estuviera vinculado, para poder desvincularlo igual.
          const bloqueadoPorBaja = !chofer.activo && !marcado;
          return (
            <label
              key={chofer.id}
              className={cnClase(
                "flex min-h-10 items-center gap-2 rounded-sm px-1 text-sm hover:bg-muted/40",
                bloqueadoPorBaja && "opacity-60"
              )}
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={marcado}
                disabled={enviando === chofer.id || bloqueadoPorBaja}
                onChange={(e) => alternar(chofer.id, e.target.checked)}
              />
              <span className="truncate">
                {chofer.nombre} {chofer.apellidos}
                {!chofer.activo && " (de baja)"}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function FilaRuta({
  ruta,
  empresaActiva,
  rutasDeLaEmpresa,
  todosLosChoferes,
  onCambiado,
}: {
  ruta: RutaConChoferes;
  empresaActiva: boolean;
  rutasDeLaEmpresa: RutaConChoferes[];
  todosLosChoferes: ChoferParaAsignacion[];
  onCambiado: () => void;
}) {
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alternarActivo() {
    setCambiandoEstado(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/rutas/activar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ruta.id, activo: !ruta.activo }),
      });
      const cuerpo = await leerJson(respuesta);
      if (!respuesta.ok) {
        setError(mensajeDeError(cuerpo, "No se pudo cambiar el estado."));
        return;
      }
      onCambiado();
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setCambiandoEstado(false);
    }
  }

  async function marcarRevisada() {
    setError(null);
    try {
      const respuesta = await fetch("/api/rutas/revisar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ruta.id }),
      });
      if (!respuesta.ok) {
        const cuerpo = await leerJson(respuesta);
        setError(mensajeDeError(cuerpo, "No se pudo marcar como revisada."));
        return;
      }
      onCambiado();
    } catch {
      setError("No se pudo contactar al servidor.");
    }
  }

  return (
    <div
      className={cnClase(
        "flex flex-col gap-2 rounded-md border border-border p-3",
        !ruta.activo && "opacity-60"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{ruta.nombre}</span>
          {ruta.pendiente_revision && <Badge variant="warning">Pendiente de revisión</Badge>}
          <Badge variant={ruta.activo ? "primary" : "default"}>
            {ruta.activo ? "Activa" : "De baja"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {ruta.pendiente_revision && (
            <Button type="button" size="sm" variant="outline" onClick={marcarRevisada}>
              <Check className="h-3.5 w-3.5" />
              Marcar revisada
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={alternarActivo}
            loading={cambiandoEstado}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {ruta.activo ? "Dar de baja" : "Reactivar"}
          </Button>
          <RenombrarInline
            nombreActual={ruta.nombre}
            rutaPrevisualizar="/api/rutas/renombrar/previsualizar"
            rutaRenombrar="/api/rutas/renombrar"
            onRenombrado={onCambiado}
          />
          {ruta.activo && rutasDeLaEmpresa.length > 1 && (
            <FusionarInline
              item={ruta}
              opciones={rutasDeLaEmpresa.filter((r) => r.activo)}
              rutaPrevisualizar="/api/rutas/fusionar/previsualizar"
              rutaFusionar="/api/rutas/fusionar"
              renderPrevia={(previa) => (
                <p>
                  Se moverán <strong>{previa.choferesVinculados}</strong> chofer(es) y se
                  actualizarán <strong>{previa.jornadasAfectadas}</strong> jornada(s).{" "}
                  <span className="text-xs text-muted-foreground">{previa.nota}</span>
                </p>
              )}
              onFusionado={onCambiado}
            />
          )}
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {empresaActiva && (
        <CasillasChoferes
          titulo="Choferes con esta ruta"
          todosLosChoferes={todosLosChoferes}
          vinculados={ruta.choferesVinculados}
          campoAgregar="rutasAgregar"
          campoQuitar="rutasQuitar"
          idObjetivo={ruta.id}
          onCambiado={onCambiado}
        />
      )}
    </div>
  );
}

function cnClase(...clases: Array<string | false | undefined>): string {
  return clases.filter(Boolean).join(" ");
}

interface EmpresaDetalleDialogProps {
  empresaId: string;
  onClose: () => void;
}

export function EmpresaDetalleDialog({ empresaId, onClose }: EmpresaDetalleDialogProps) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useEmpresaDetalle(empresaId);
  const { data: empresasResp } = useEmpresas();
  const [nuevaRuta, setNuevaRuta] = useState("");
  const [errorNuevaRuta, setErrorNuevaRuta] = useState<string | null>(null);
  const [creandoRuta, setCreandoRuta] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onCambiado() {
    queryClient.invalidateQueries({ queryKey: ["empresas"] });
    queryClient.invalidateQueries({ queryKey: ["empresa-detalle", empresaId] });
    queryClient.invalidateQueries({ queryKey: ["rutas"] });
  }

  async function alternarActivo(empresa: EmpresaConPendiente) {
    setCambiandoEstado(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/empresas/activar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: empresa.id, activo: !empresa.activo }),
      });
      const cuerpo = await leerJson(respuesta);
      if (!respuesta.ok) {
        setError(mensajeDeError(cuerpo, "No se pudo cambiar el estado."));
        return;
      }
      onCambiado();
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setCambiandoEstado(false);
    }
  }

  async function marcarRevisada() {
    setError(null);
    try {
      const respuesta = await fetch("/api/empresas/revisar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: empresaId }),
      });
      if (!respuesta.ok) {
        const cuerpo = await leerJson(respuesta);
        setError(mensajeDeError(cuerpo, "No se pudo marcar como revisada."));
        return;
      }
      onCambiado();
    } catch {
      setError("No se pudo contactar al servidor.");
    }
  }

  async function crearRuta() {
    setErrorNuevaRuta(null);
    if (!nuevaRuta.trim()) return;
    setCreandoRuta(true);
    try {
      const respuesta = await fetch("/api/rutas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId, nombre: nuevaRuta }),
      });
      const cuerpo = await leerJson(respuesta);
      if (!respuesta.ok) {
        setErrorNuevaRuta(mensajeDeError(cuerpo, "No se pudo crear la ruta."));
        return;
      }
      setNuevaRuta("");
      onCambiado();
    } catch {
      setErrorNuevaRuta("No se pudo contactar al servidor.");
    } finally {
      setCreandoRuta(false);
    }
  }

  if (isLoading || !data) {
    return (
      <Dialog open onClose={onClose} title="Empresa" className="max-w-2xl">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </Dialog>
    );
  }

  const { empresa, rutas, choferesVinculados, todosLosChoferes } = data;
  const otrasEmpresas = (empresasResp?.data ?? []).filter((e) => e.activo);

  return (
    <Dialog open onClose={onClose} title={empresa.nombre} className="max-w-2xl">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={empresa.activo ? "primary" : "default"}>
              {empresa.activo ? "Activa" : "De baja"}
            </Badge>
            {empresa.tienePendiente && <Badge variant="warning">Pendiente de revisión</Badge>}
          </div>
          <div className="flex flex-wrap gap-2">
            {empresa.pendiente_revision && (
              <Button type="button" size="sm" variant="outline" onClick={marcarRevisada}>
                <Check className="h-3.5 w-3.5" />
                Marcar revisada
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => alternarActivo(empresa)}
              loading={cambiandoEstado}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {empresa.activo ? "Dar de baja" : "Reactivar"}
            </Button>
            <RenombrarInline
              nombreActual={empresa.nombre}
              rutaPrevisualizar="/api/empresas/renombrar/previsualizar"
              rutaRenombrar="/api/empresas/renombrar"
              onRenombrado={onCambiado}
            />
            {empresa.activo && otrasEmpresas.length > 1 && (
              <FusionarInline
                item={empresa}
                opciones={otrasEmpresas}
                rutaPrevisualizar="/api/empresas/fusionar/previsualizar"
                rutaFusionar="/api/empresas/fusionar"
                renderPrevia={(previa) => {
                  const p = previa as PrevisualizarFusionarEmpresasResponse;
                  return (
                    <p>
                      {p.rutasMovidas} ruta(s) se moverán, {p.rutasCombinadas} se combinarán,{" "}
                      {p.choferesVinculados} chofer(es) se reasignarán y se actualizarán{" "}
                      <strong>{p.jornadasAfectadas}</strong> jornada(s).{" "}
                      <span className="text-xs text-muted-foreground">{p.nota}</span>
                    </p>
                  );
                }}
                onFusionado={() => {
                  onCambiado();
                  onClose();
                }}
              />
            )}
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {empresa.activo && (
          <CasillasChoferes
            titulo="Choferes con esta empresa"
            todosLosChoferes={todosLosChoferes}
            vinculados={choferesVinculados}
            campoAgregar="empresasAgregar"
            campoQuitar="empresasQuitar"
            idObjetivo={empresa.id}
            onCambiado={onCambiado}
          />
        )}

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Rutas</p>
          {rutas.length === 0 && (
            <p className="text-sm text-muted-foreground">Todavía no hay rutas en esta empresa.</p>
          )}
          {rutas.map((ruta) => (
            <FilaRuta
              key={ruta.id}
              ruta={ruta}
              empresaActiva={empresa.activo}
              rutasDeLaEmpresa={rutas}
              todosLosChoferes={todosLosChoferes}
              onCambiado={onCambiado}
            />
          ))}

          {empresa.activo && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={nuevaRuta}
                onChange={(e) => setNuevaRuta(e.target.value)}
                placeholder="Nombre de la ruta nueva"
                className="h-9 flex-1 rounded-md border border-border bg-card px-3 text-sm"
              />
              <Button type="button" size="sm" onClick={crearRuta} loading={creandoRuta}>
                Agregar ruta
              </Button>
            </div>
          )}
          {errorNuevaRuta && <p className="text-sm text-danger">{errorNuevaRuta}</p>}
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
