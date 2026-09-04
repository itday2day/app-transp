import { supabase } from "@/lib/supabase";
import { PingUbicacion } from "@/types";

// Best-effort: un ping de posición es telemetría efímera para el Dashboard en
// tiempo real, no un dato de negocio como una jornada. Si falla (sin red,
// timeout, servidor caído) se descarta y se espera al siguiente punto — no
// tiene cola de reintentos en SQLite a propósito, para no sumar complejidad
// por datos que en segundos ya quedan obsoletos.
export async function enviarPing(ping: PingUbicacion): Promise<void> {
  try {
    const { error } = await supabase.rpc("insertar_ubicacion", {
      p_chofer_id: ping.choferId,
      p_jornada_ids: ping.jornadaIds,
      p_lat: ping.lat,
      p_lng: ping.lng,
      p_velocidad_kmh: ping.velocidadKmh,
      p_timestamp: ping.timestamp,
    });
    if (error) throw error;
  } catch {
    // silenciosamente descartado, ver comentario arriba
  }
}
