# InstaMoney — Prospección automática en Instagram

Extensión de Chrome (Manifest V3, React + TypeScript + Vite) para captar, contactar y dar seguimiento a prospectos
de Instagram: campañas automáticas, mensajes con IA, engagement, notas de voz, CRM interno y webhooks.

## Instalación (modo desarrollador)

```bash
npm install
npm run build
```

1. Abre `chrome://extensions`, activa "Modo de desarrollador" y pulsa "Cargar descomprimida" → carpeta `dist/`.
2. Fija la extensión: al pulsar el ícono se abre el panel lateral.
3. Inicia sesión en Instagram en Chrome.

## Cómo funciona el motor

- Arriba del panel está el **Motor** (encender / apagar). Al encenderlo se abre una **ventana de trabajo** con Instagram,
  donde se ejecutan las acciones. Déjala abierta y **sin minimizar** (minimizada, Chrome frena la página).
- Cada 30 s el motor revisa si toca actuar. Hace **una acción visible por turno** y espera un tiempo aleatorio entre la
  pausa mínima y máxima. Respeta el horario activo, los límites diarios por acción y descansa cada N acciones.
- Si Instagram limita la cuenta (429, `feedback_required`, checkpoint…), el motor **se pausa solo** las horas
  configuradas y avisa con una notificación.
- Pestaña **Actividad**: registro de todo lo que hace el motor.

## Funciones

**Prospección (pestaña Campañas).** Fuente de prospectos:
- Seguidores o seguidos de una cuenta (competencia).
- Quienes dieron like o comentaron una publicación/reel (propia o de terceros).
- Hashtag o ubicación.
- Tus propios seguidores (campañas de reactivación) o leads ya guardados.
- "Dejar de seguir a quien no me siguió de vuelta" tras N días (solo cuentas que siguió la extensión).

**Filtros de segmentación:** palabras clave en la bio (incluir/excluir), mín./máx. de seguidores y seguidos, número de
publicaciones, actividad reciente (publicó en los últimos N días), idioma (es/en/pt), privadas, verificadas, solo
profesionales y "ya conectados".

**Acciones por prospecto (en este orden):** ver historias (y reaccionar ❤️), like a sus últimas 1-3 publicaciones,
comentario (IA según la publicación o lista con spintax), seguir, DM (plantillas rotadas o **IA personalizada** con su
bio y publicaciones), nota de voz y añadir a Mejores Amigos.

**Seguimientos:** pasos con "horas sin respuesta", texto por plantilla o IA y nota de voz opcional. Antes de cada envío
se revisa el chat: si respondió, la secuencia se corta.

**Automatizaciones (pestaña Auto):**
- Bienvenida por DM a cada nuevo seguidor (opcional: nota de voz y Mejores Amigos).
- DM automático cuando alguien comenta una palabra clave en tus reels/publicaciones (+ respuesta pública opcional).
- Detección de respuestas en la bandeja.

**CRM (pestaña CRM):** chats de Instagram con etapas del embudo (frío, tibio, caliente, cerrado, perdido), filtro de
no leídos y etiquetas. Las etapas también se cambian desde cada lead.

**Integraciones:** webhooks (POST JSON) para Make, Zapier, n8n, CRMs, email marketing o WhatsApp. Eventos: lead
capturado, contactado, respondió, cambio de etapa, seguimiento enviado y nuevo seguidor.

**Plantillas:** variables `{nombre}`, `{primer_nombre}`, `{username}` y spintax `{Hola|Buenas|Qué tal}`.
**Notas de voz:** se suben (MP3/M4A/OGG/WAV/WEBM) o se graban en el panel; máx. 60 s.

El modo manual de antes sigue disponible: botones flotantes para capturar lo visible y la cola de envío guiado.

## Riesgos (léelo)

Automatizar acciones va contra los Términos de Instagram ("Automated Behavior Policy"): la cuenta puede sufrir bloqueos
temporales de acciones o perderse. Recomendaciones:
- Cuentas nuevas: empieza con 10-20 DM/día y pausas de 2-5 min; sube poco a poco.
- Personaliza (IA o spintax). El mismo texto a decenas de personas dispara los filtros de spam.
- Escribir en masa a desconocidos puede considerarse spam según la ley de protección de datos/consumo de cada país.

## Notas técnicas

```
src/
  background/   motor (engine.ts), cliente de la API web de Instagram (ig.ts), ventana de trabajo (worker.ts)
  content/      UI flotante + executor.ts (peticiones con la sesión y acciones de interfaz: DM, voz, historias)
  sidepanel/    panel React (leads, campañas, CRM, automatizaciones, actividad, plantillas, ajustes)
  lib/          tipos, storage, IA (Groq), filtros, spintax, webhooks
```

- Lecturas y acciones simples (perfiles, seguidores, likes, comentarios, seguir, Mejores Amigos, bandeja) usan la API
  web interna de Instagram desde la pestaña de trabajo, con la sesión del usuario. Son endpoints **no documentados**:
  si Instagram los cambia, revisa `src/background/ig.ts`.
- DM, notas de voz e historias se hacen por la interfaz (`src/content/executor.ts`), buscando botones por `aria-label`
  y texto (español/inglés). Si Instagram cambia su HTML, ese es el archivo a revisar.
- La nota de voz sustituye `getUserMedia` en la página para que Instagram "grabe" el audio pregrabado. Es experimental.
- Todo se guarda en `chrome.storage.local` (con `unlimitedStorage` por los audios). La API key de Groq no sale del
  navegador salvo hacia `api.groq.com`.

## Licencias (Panel Maestro de Alcanzia)

- Al abrir el panel se pide licencia. Sin ella: **prueba gratis de 3 días** con correo + WhatsApp
  (`POST https://api.alcanzia.co/api/licenses/register`, una prueba por correo, WhatsApp y equipo).
- Activación con clave: `GET /api/verify` con el `deviceId` del equipo. La respuesta va firmada (ECDSA) y se
  verifica con la clave pública de `src/lib/licenseToken.ts`; sin internet vale el token firmado (máx. 72 h).
- Producto en el panel: **`instagram-money`** («InstaMoney»), el mismo que la app de escritorio.
- Sin licencia activa el motor se apaga solo. Aviso de renovación cuando faltan 3 días o menos.
