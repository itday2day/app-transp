# Control de Jornada — App de Check-in/Check-out para Choferes

App móvil + web (Expo / React Native + `react-native-web`) para que los choferes registren el
inicio y cierre de su jornada: matrícula, kilometraje, combustible, fotos de respaldo y
ubicación GPS. Funciona offline y sincroniza automáticamente al recuperar señal.

## 1. Stack técnico

| Capa                 | Elección                                         | Motivo                                                                                                                 |
| -------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| UI                   | React Native + Expo (SDK 51), `react-native-web` | Un solo código para iOS, Android y Web                                                                                 |
| Navegación           | `@react-navigation` (stack + tabs)               | Estándar de facto en Expo                                                                                              |
| Cámara               | `expo-image-picker` (modo cámara)                | Más simple que `expo-camera` para "una foto y listo"; cambia fácil si se necesita cámara embebida                      |
| Compresión           | `expo-image-manipulator`                         | Redimensiona a 1280px y comprime a calidad 0.6 antes de guardar/subir                                                  |
| GPS                  | `expo-location`                                  | Permisos explícitos, mensajes en español en `app.json`                                                                 |
| Persistencia offline | `expo-sqlite`                                    | Datos estructurados y con relaciones (a diferencia de AsyncStorage, ideal para colas de sincronización con reintentos) |
| Token de sesión      | `expo-secure-store`                              | Cifrado en Keychain/Keystore — nunca AsyncStorage para credenciales                                                    |
| Detección de red     | `expo-network`                                   | Dispara sincronización automática al reconectar                                                                        |
| Backend (referencia) | Node/Express + PostgreSQL + bcrypt + JWT         | Ver `server/`                                                                                                          |

## 2. Estructura de carpetas

```
app_transp_project/
├── App.tsx                        # Entry point: providers + navegación
├── app.json                       # Config Expo, permisos con textos en español
├── src/
│   ├── theme/                     # colors.ts, typography.ts, spacing.ts
│   ├── types/                     # Modelos: Usuario, Jornada, NivelCombustible...
│   ├── db/
│   │   ├── database.ts            # Apertura/migración de SQLite
│   │   └── jornadasRepo.ts        # CRUD local de jornadas (check-in/check-out)
│   ├── services/
│   │   ├── api.ts                 # fetch + token (SecureStore)
│   │   ├── authService.ts         # login/logout contra backend
│   │   ├── imageService.ts        # compresión de fotos
│   │   ├── locationService.ts     # permisos + captura de GPS
│   │   └── syncService.ts         # sube jornadas pendientes (multipart)
│   ├── context/
│   │   ├── AuthContext.tsx        # sesión del chofer
│   │   └── NetworkContext.tsx     # online/offline + auto-sync
│   ├── hooks/
│   │   ├── useUbicacion.ts
│   │   └── useJornadasAbiertas.ts # viajes en curso del chofer (puede haber varios)
│   ├── components/                # Botón, Campo, SelectorCombustible, CapturaFoto...
│   ├── navigation/                # RootNavigator (stack + tabs)
│   └── screens/
│       ├── LoginScreen.tsx
│       ├── CheckInScreen.tsx
│       ├── CheckOutScreen.tsx
│       ├── HistorialScreen.tsx
│       └── DetalleJornadaScreen.tsx
└── server/                        # Especificación técnica de backend (referencia)
    └── src/
        ├── db/schema.sql
        └── routes/auth.example.ts
```

**Por qué esta división:** `services/` no sabe nada de React (se puede probar con Jest sin
renderizar nada); `db/` es la única capa que toca SQLite; las pantallas solo orquestan hooks y
componentes. Así, cambiar de SQLite a otra solución offline, o de Expo Camera a otra librería,
se hace en un archivo, no en cinco pantallas.

## 3. Flujo de usuario

```
Login (número de empleado + contraseña)
   │
   ▼
Tab "Check-in" → lista de "Rutas activas" (si hay) + botón "+ Iniciar nueva ruta"
   │              empresa, ruta, matrícula, km inicial, combustible,
   │              foto tablero, foto hoja de ruta, incidencias (opcional) → GPS → Guardar
   │
   └─ Un chofer puede tener varios viajes abiertos en paralelo (rutas concurrentes)

Tab "Check-out" → 0 activos: aviso · 1 activo: se cierra directo · 2+: elegir cuál cerrar
             km final (≥ km inicial), combustible,
             foto tacómetro → GPS automático → Guardar

Tab "Historial" → lista de jornadas (más reciente primero)
   → tocar una tarjeta → Detalle con fotos, km, ubicación y estado de envío
```

Un chofer puede tener varias jornadas con `estado = 'abierta'` al mismo tiempo (ver
`useJornadasAbiertas`) — a propósito no hay un índice único que lo impida en `schema.sql`.

## 4. Pautas de diseño para un flujo natural en español

- **Trato de "tú" consistente**, nunca mezclar con "usted": _"Toca para tomar la foto"_, no
  _"Presione para capturar imagen"_.
- **Verbos de acción al frente en los botones**: "Registrar check-in", no "Enviar" o "Confirmar"
  a secas — el chofer debe saber qué está confirmando sin leer el resto de la pantalla.
- **Mensajes de error explican qué hacer, no solo qué falló**: _"El kilometraje final no puede
  ser menor al inicial (152 340 km)"_, en vez de "Valor inválido".
- **Terminología del gremio, no términos genéricos de formulario**: "matrícula",
  "tacómetro", "combustible" — son las palabras que un chofer mexicano/latinoamericano usa a
  diario, evitar anglicismos tipo "vehicle ID" o "fuel level".
- **Permisos explicados antes de pedirse**: los textos de `NSLocationWhenInUseUsageDescription`
  y el mensaje de `expo-image-picker` dicen _para qué_ se necesita el permiso, no solo que se
  necesita — reduce el rechazo de permisos en campo.
- **Nunca bloquear silenciosamente**: si falta GPS o cámara, el botón de guardar se deshabilita
  con una razón visible, no un error después de que el chofer ya llenó todo el formulario.
- **El estado offline es visible pero no alarmante**: el banner usa un tono ámbar informativo
  ("tus registros se guardan y se enviarán al recuperar señal"), no rojo de error — perder
  señal en carretera es la normalidad, no una falla.
- **Fechas y horas en formato local `es-MX`** (`day/mon/año · hh:mm`), nunca ISO crudo en
  pantalla.

## 5. Offline-first y sincronización

1. Check-in y check-out **siempre se guardan primero en SQLite local** (`jornadasRepo.ts`) —
   nunca se espera respuesta del servidor para confirmar al chofer.
2. Cada jornada nace con `sincronizacion = 'pendiente'` y un `id` UUID generado en el
   dispositivo, que viaja al servidor como `id_cliente` para que reintentar un envío nunca
   duplique el registro (idempotencia).
3. `NetworkContext` revisa la conexión cada 15s y al volver del segundo plano; si hay señal,
   dispara `sincronizarPendientes()`.
4. `syncService` sube cada jornada pendiente por separado (multipart, con las fotos ya
   comprimidas) y marca `sincronizado` / `error` según el resultado; los errores reintentan
   hasta 5 veces antes de requerir intervención manual.
5. El chofer puede forzar una sincronización deslizando para refrescar en "Historial".

## 6. Seguridad de autenticación

- El cliente **nunca** guarda ni compara contraseñas: las envía una vez, por HTTPS, al hacer
  login.
- El servidor guarda solo `bcrypt.hash(contrasena, 12)` (ver `server/src/routes/auth.example.ts`)
  — jamás texto plano, ni siquiera en el MVP.
- El servidor responde con un JWT de vida corta (12h); el cliente lo guarda en
  `expo-secure-store` (Keychain/Keystore cifrado), no en AsyncStorage.
- El mensaje de error de login es idéntico si el usuario no existe o si la contraseña es
  incorrecta, para no revelar qué números de empleado son válidos.

## 7. Puesta en marcha

```bash
npm install
cp .env.example .env    # ajusta EXPO_PUBLIC_API_URL
npm run start           # abre Expo Dev Tools; presiona "w" para probar en web
```

El backend en `server/` es una **especificación de referencia**, no un servidor completo:
incluye el esquema SQL y un router de ejemplo para copiar el patrón de autenticación segura
en el framework que uses (Express, NestJS, Django, etc.).

## 8. Próximos pasos sugeridos

- Endpoint `POST /jornadas/sincronizar` completo en el backend real (el cliente ya lo asume).
- Subida de fotos a almacenamiento de objetos (S3/GCS) en vez de servirlas desde el propio API.
- Pantalla de administrador/flotilla (fuera de alcance de este MVP centrado en el chofer).
- Tests con Jest + Testing Library para `services/` y `db/` (son las capas sin dependencia de UI).
