# Componentes HTML del Popup

Este directorio contiene los fragmentos HTML que se ensamblan en `popup.html`.

## Estructura

```
components/
├── head.html              # DOCTYPE, <head>, estilos, apertura <body>
├── boot-loader.html       # Spinner de carga inicial
├── header.html            # Header de la app + apertura <main>
├── auth.html              # Formularios Login/Register
├── intro.html             # Carousel de bienvenida
├── cv-step.html           # Paso 1: Subir CV
├── job-step.html          # Paso 2: Selección de portal
├── job-dashboard.html     # Paso 3: Dashboard de jobs + recomendaciones
├── user-menu.html         # Menú de usuario (panel lateral)
├── profile-view.html      # Vista de perfil con tabs (Resumen/Editar/Actividad)
├── cvs-view.html          # Vista de CVs subidos
├── applications-view.html # Vista de historial de aplicaciones
├── searches-view.html     # Vista de historial de búsquedas
├── upgrade-view.html      # Vista de upgrade de plan
└── scripts.html           # Scripts + cierre de tags
```

## Orden de ensamblaje

Los componentes se ensamblan en el orden definido en `scripts/build-popup.js`:

1. `head.html` → `boot-loader.html` → `header.html`
2. `auth.html` → `intro.html`
3. `cv-step.html` → `job-step.html` → `job-dashboard.html`
4. `user-menu.html` → `profile-view.html`
5. `cvs-view.html` → `applications-view.html` → `searches-view.html`
6. `upgrade-view.html` → `scripts.html`

## Comandos

```bash
# Reensamblar popup.html desde componentes
npm run build:popup

# O directamente
node scripts/build-popup.js
```

## Cómo editar

1. Edita el componente correspondiente en `components/`
2. Ejecuta `npm run build:popup`
3. El `popup.html` se regenera automáticamente

## Notas

- Cada componente debe ser un fragmento HTML válido (no necesita DOCTYPE ni tags de cierre)
- `head.html` contiene el DOCTYPE y apertura de tags
- `scripts.html` contiene el cierre de `</main></body></html>`
- Todos los componentes tienen `hidden` por defecto excepto el que se muestra según el flujo
