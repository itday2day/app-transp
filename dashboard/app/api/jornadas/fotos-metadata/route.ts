import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import { MAX_RUTAS_METADATA_FOTOS, rutaEvidenciaEsValida } from "@/lib/validar-ruta-evidencia";

const BUCKET_EVIDENCIAS = "evidencias";

export interface MetadatoFotoStorage {
  origen: "camara" | "galeria";
  fechaOriginal: string | null;
}

interface CuerpoPeticion {
  rutas?: string[];
}

// POST /api/jornadas/fotos-metadata
// Body: { rutas: string[] } -- rutas DENTRO del bucket `evidencias` (no URLs públicas completas;
// el cliente las extrae, ver dashboard/lib/hooks/use-fotos-metadata.ts), hasta ~10 por jornada.
//
// spec_adjuntar_foto_galeria.md: `info()` es el ÚNICO método de storage-js que devuelve el
// `user_metadata` real de un objeto (confirmado en la prueba de humo real de Fase 1b de la spec,
// ya hecha y limpiada, no repetida acá) -- `list()`/`download()` no lo traen. Se llama UNA vez por
// ruta, en paralelo (Promise.all): no existe una variante de `info()` que acepte varias rutas a
// la vez.
//
// Un fallo en una ruta puntual (objeto borrado, sin metadata, red) nunca tira toda la respuesta --
// esa entrada queda `null` y la foto se sigue mostrando en el Dashboard, solo sin la etiqueta
// "Galería · ...". Misma autenticación de administrador que el resto de los Route Handlers (ver
// jornadas/editar/route.ts).
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }

  let cuerpo: CuerpoPeticion;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  if (Array.isArray(cuerpo.rutas) && cuerpo.rutas.length > MAX_RUTAS_METADATA_FOTOS) {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const rutas = Array.isArray(cuerpo.rutas)
    ? Array.from(
        new Set(cuerpo.rutas.filter((r): r is string => typeof r === "string" && r.length > 0))
      )
    : [];

  if (rutas.some((ruta) => !rutaEvidenciaEsValida(ruta))) {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  if (rutas.length === 0) {
    return NextResponse.json({ metadatos: {} });
  }

  const supabase = crearClienteSupabaseAdmin();
  const metadatos: Record<string, MetadatoFotoStorage | null> = {};

  await Promise.all(
    rutas.map(async (ruta) => {
      try {
        const { data, error } = await supabase.storage.from(BUCKET_EVIDENCIAS).info(ruta);
        if (error || !data) {
          metadatos[ruta] = null;
          return;
        }
        const meta = data.metadata as Record<string, unknown> | undefined;
        const origen = meta?.origen;
        if (origen === "camara" || origen === "galeria") {
          const fechaOriginal = typeof meta?.fechaOriginal === "string" ? meta.fechaOriginal : null;
          metadatos[ruta] = { origen, fechaOriginal };
        } else {
          metadatos[ruta] = null;
        }
      } catch {
        metadatos[ruta] = null;
      }
    })
  );

  return NextResponse.json({ metadatos });
}
