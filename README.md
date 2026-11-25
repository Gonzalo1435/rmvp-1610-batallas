# ⚔️ Centro de batallas · RMVP 1610 (Last War)

Web para organizar **SvS**, **Tormenta del Desierto** y **Cañón de Tormenta**:

- **Inscripción**: cada jugador elige su nombre y marca *Sí / Quizás / No* y su preferencia (equipo u horario, o Barro/Guarnición en SvS).
- **Equipos**: titulares y suplentes por equipo (A/B), con cupos editables y botón **Armar automático** (por preferencia y poder).
- **Mapa**: objetivos de cada batalla (cañones y castillo, edificios del desierto, estructuras del cañón). Tocas un objetivo y asignas jugadores. Los R4 pueden **arrastrar** los objetivos para que calcen con el mapa real.
- **Roles SvS**: rol sugerido según poder, rol confirmado, qué R4 contacta a quién y si ya fue contactado.
- **Miembros**: lista de la alianza con poder y nivel. Se puede editar, agregar o importar desde un CSV.
- En **español e inglés** (botón ES/EN).

Es una página estática (HTML + JavaScript, sin compilar) que se publica gratis con **GitHub Pages**. Los datos se guardan en vivo en **Firebase Firestore**, que también es gratis para este uso.

> Sin Firebase configurado, la web abre en **modo demo**: funciona igual, pero los datos quedan solo en tu navegador.

---

## 1. Configurar Firebase (una vez, ~10 min)

1. Entra a <https://console.firebase.google.com> → **Agregar proyecto** (puedes desactivar Analytics).
2. **Compilación → Firestore Database → Crear base de datos** → modo **producción** → elige una región (por ejemplo `southamerica-east1`).
3. **Compilación → Authentication → Comenzar** → en *Método de acceso* activa **Anónimo** y **Google**.
4. **Authentication → Configuración → Dominios autorizados** → agrega `TU-USUARIO.github.io`.
5. **⚙️ Configuración del proyecto → Tus apps → ícono web `</>`** → registra la app → copia el bloque `firebaseConfig`.
6. Pega esos valores en [`js/config.js`](js/config.js). No son secretos: la seguridad la dan las reglas.
7. **Firestore Database → Reglas** → reemplaza todo por el contenido de [`firestore.rules`](firestore.rules) → **Publicar**.

## 2. Primer uso

1. Abre la web y toca **Entrar como R4** (con tu cuenta de Google).
2. Toca **Soy el primer R4: tomar control**. Solo funciona una vez: la primera cuenta queda como administradora.
3. En **Miembros**, toca **Cargar datos de la alianza**. Se cargan los 95 miembros y el evento *SvS vs 1579* con los votos.
4. En **Miembros → R4 con permiso de edición**, agrega los correos de Google de los demás R4 (uno por línea).
5. Comparte el link en el chat de la alianza. Los jugadores **no necesitan cuenta**: entran, eligen su nombre y se inscriben.

## 3. Publicar en GitHub Pages

1. Sube estos archivos a un repositorio **público**.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch** → rama `main`, carpeta `/ (root)` → **Save**.
3. En 1–2 minutos queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

## Quién puede hacer qué

| Acción | Jugadores (link) | R4 (Google en la lista) |
|---|---|---|
| Ver eventos, equipos, mapa y roles | ✅ | ✅ |
| Guardar su inscripción | ✅ | ✅ |
| Crear o editar eventos, equipos, mapa y roles | ❌ | ✅ |
| Editar miembros y la lista de R4 | ❌ | ✅ |

## Archivos

```
index.html          página
css/styles.css      estilos
js/config.js        nombre de la alianza + datos de Firebase  ← editar
js/app.js           la aplicación
js/store.js         conexión con Firebase / modo demo
js/eventTypes.js    plantillas de SvS, Tormenta del Desierto y Cañón de Tormenta
js/i18n.js          textos ES / EN
js/seed.js          lista inicial de miembros (25-nov-2026)
firestore.rules     reglas de seguridad de Firestore
```

## Notas

- Los nombres de edificios, los cupos (20 titulares + 10 suplentes por equipo) y las posiciones del mapa son **valores iniciales**. Cada evento se ajusta en **Ajustes** y en el **Mapa**.
- El rol SvS sugerido es: **Barro** con 250M o más y nivel 35; **Guarnición** con menos de 220M o nivel 33 o menos; **Flexible** en los demás casos. Se cambia en `js/eventTypes.js`.
- Herramienta hecha por fans. No está afiliada a Last War ni a su desarrollador.
