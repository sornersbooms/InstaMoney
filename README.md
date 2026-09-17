# InstaMONEY — Captura y organización de leads de Instagram

Extensión de Chrome (Manifest V3, React + TypeScript + Vite) para capturar leads de Instagram de forma
**manual-asistida**: tú navegas Instagram normalmente, la extensión lee lo que ya está visible en pantalla
para guardarlo como lead, lo organiza en un mini-CRM, lo puntúa con IA (Groq) según tus palabras clave, y te
ayuda a redactar mensajes con plantillas — pero el envío de cada DM siempre lo haces tú, manualmente, dentro
de Instagram.

**Por diseño, esta extensión NO hace scraping masivo automático (sin scroll/paginación programática) ni envía
mensajes en automático.** Ver la sección "Por qué" más abajo.

## Instalación (modo desarrollador)

1. Instala dependencias y compila:
   ```bash
   npm install
   npm run build
   ```
2. Abre `chrome://extensions` en Chrome.
3. Activa "Modo de desarrollador" (arriba a la derecha).
4. Click en "Cargar descomprimida" y selecciona la carpeta `dist/` generada.
5. Fija la extensión en la barra de Chrome. Al hacer click en el ícono se abrirá el panel lateral (side panel).

Para desarrollo con recarga en caliente: `npm run dev` (deja Vite corriendo y recarga la extensión desde
`chrome://extensions` cuando cambie el código).

## Configuración

1. Abre el side panel → pestaña **Ajustes**.
2. Pega tu API key de Groq (consíguela gratis en [console.groq.com](https://console.groq.com)).
3. Define tus palabras clave / perfil de cliente ideal (ej. "dueños de gimnasios, coaches fitness").
4. Ajusta el límite diario de contactos (es informativo, no bloquea nada — es para que tú mismo mantengas un ritmo prudente).

## Uso

1. **Capturar seguidores**: en Instagram, abre el perfil de una cuenta relevante para tu nicho → click en
   "Seguidores" → aparece un botón flotante "📥 Capturar seguidores visibles". Haz scroll dentro del modal para
   cargar más y vuelve a pulsar el botón para capturar los nuevos.
2. **Capturar comentaristas**: abre un post y pulsa "💬 Capturar comentaristas visibles" para guardar a quienes
   comentaron (el texto del comentario se usa como señal para el scoring).
3. En el side panel (pestaña **Leads**) verás todos los leads capturados. Pulsa **"🤖 Analizar con IA (Groq)"**
   para puntuarlos del 0 al 100 según tus palabras clave.
4. Crea plantillas de mensaje en la pestaña **Plantillas**.
5. Abre un chat de Instagram Direct con un lead → botón flotante "✉️ Insertar plantilla" → se rellena el
   cuadro de mensaje. **Revisa el texto y pulsa tú mismo el botón "Enviar" de Instagram.**
6. Marca el lead como "Contactado" en el side panel para llevar el conteo diario.
7. Exporta a CSV cuando quieras desde la pestaña Leads.

## Por qué es manual-asistida y no 100% automática

Instagram/Meta prohíbe explícitamente en sus Términos de Servicio la extracción automatizada masiva de datos
(scraping con scroll/paginación programática) y la automatización de acciones como enviar mensajes en bloque
o seguir/dejar de seguir cuentas ("Automated Behavior Policy"). Además de exponer la cuenta a un baneo, el
envío masivo de mensajes no solicitados a desconocidos puede considerarse spam bajo distintas leyes de
protección de datos/consumidor según el país de los destinatarios. Por eso el diseño mantiene siempre a la
persona en control de qué se captura (solo lo visible en pantalla en ese momento) y de cuándo se envía cada
mensaje (un clic manual sobre el botón de Instagram).

## Estructura del proyecto

```
src/
  background/     service worker: mensajería y almacenamiento
  content/         content script inyectado en instagram.com (botón flotante, captura, inserción de plantillas)
  sidepanel/       UI del CRM (React)
  lib/             storage, tipos, scoring con Groq, exportación CSV, mensajería tipada
```

## Notas técnicas

- Los "selectores" de Instagram (`src/content/selectors.ts`) se basan en estructura y atributos de
  accesibilidad (enlaces `/username/`, `alt`, `role`) en lugar de clases CSS, porque Instagram regenera sus
  clases en cada build y rompería la extensión constantemente. Si Instagram cambia su HTML de forma más
  profunda, este es el archivo a revisar.
- La API key de Groq se guarda únicamente en `chrome.storage.local` de tu navegador.
