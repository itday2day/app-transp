-- Migración incremental: correr DESPUÉS de schema.sql + v2 a v10, en el SQL Editor. Resuelve el
-- Hallazgo #29 (spec_sincronizacion_reintentable.md): una jornada creada sin señal, cuya subida se
-- corta después de que una foto ya llegó a Storage pero antes de que el teléfono se entere, queda
-- trabada para siempre — el reintento sube a la MISMA ruta con upsert:true, que Supabase resuelve
-- como un UPDATE de storage.objects, y el bucket `evidencias` solo tenía policies de INSERT/SELECT.
--
-- Se permite el UPDATE con EXACTAMENTE la misma condición de carpeta que ya tiene el INSERT
-- (verificada contra la base real, no asumida: `schema_v2_tracking_auth.sql` reemplazó la policy
-- original de INSERT por una restringida a `(storage.foldername(name))[1] = auth.uid()::text`, pero
-- ese cambio nunca se plegó de vuelta a schema.sql — el mismo problema que ya encontró el #23. Este
-- archivo lo corrige de paso).
--
-- Nada de DELETE: no hace falta para el reintento, y una evidencia que se puede borrar es un
-- problema distinto y peor. El reintento PISA su propio archivo (upsert), nunca lo elimina.
--
-- La exposición real es acotada: un chofer puede sobrescribir fotos de SUS PROPIAS jornadas
-- (misma carpeta que ya podía escribir por INSERT). La app no ofrece ninguna acción para hacerlo a
-- propósito — el permiso existe para que el reintento automático funcione, no como función visible.
--
-- Esto NO debilita el Hallazgo #7 (foto de tacómetro final de escritura única): esa garantía vive
-- en el Route Handler del Dashboard, que usa service_role e ignora RLS por completo. Estas policies
-- nunca fueron las que la sostenían.

drop policy if exists "chofer sobrescribe sus propias evidencias" on storage.objects;
create policy "chofer sobrescribe sus propias evidencias"
  on storage.objects for update
  using (bucket_id = 'evidencias' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'evidencias' and (storage.foldername(name))[1] = auth.uid()::text);
