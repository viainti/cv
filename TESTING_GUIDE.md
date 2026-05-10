# Testing Guide - TRCVASTIAN Extension

## Verificación del Build

### 1. Compilar la extensión
```bash
cd /vercel/share/v0-project
node scripts/build-popup.js
```

Resultado esperado:
```
✅ head.html                 (4.7 KB)
✅ boot-loader.html          (0.5 KB)
...
🔍 Validando HTML...
✅ HTML validado correctamente
📊 Estadísticas del build:
  📁 Componentes: 15
  📏 Tamaño total: ~140 KB
  ✅ Build completado exitosamente
```

---

## Testing en Chrome

### 2. Instalar extensión localmente

1. Abrir Chrome → `chrome://extensions/`
2. Activar "Modo de desarrollador" (arriba a la derecha)
3. Click en "Cargar extensión sin empaquetar"
4. Seleccionar carpeta `/vercel/share/v0-project`
5. Ver que la extensión aparece como "CV Apply Autofill"

### 3. Testing del Popup

Hacer click en el ícono de la extensión:
- ✅ Debe aparecer el popup con 400x600px
- ✅ Gradiente de fondo azul claro
- ✅ Tabs visibles: Resumen, Editar, Actividad
- ✅ Botón "Cargar CV" funcional

### 4. Testing de CV Upload y Detección de Ubicación

1. En popup, ir a "Paso 1 - Subir CV"
2. Cargar archivo PDF o DOCX con CV
3. Esperar a que se procese
4. Ir a "Mi Perfil" → "Resumen"
5. Verificar:
   - ✅ Sección "Ubicación Detectada" visible
   - ✅ Badge con % de confianza (ej: "85% confianza")
   - ✅ Ciudad y país mostrados correctamente
   - ✅ Color del badge corresponde a confianza:
     - Verde: > 80%
     - Amarillo: 60-80%
     - Naranja: < 60%

### 5. Testing de Ubicación en Tab Editar

1. Ir a "Mi Perfil" → "Editar"
2. Verificar que campos están pre-rellenados:
   - ✅ Ciudad: Pre-rellena desde detección
   - ✅ Provincia: Pre-rellena si disponible
   - ✅ País: Pre-rellena desde detección
3. Campos deben estar con borde azul (#0f5d86) indicando que vinieron de IA

### 6. Testing de Auto-Apply en LinkedIn

#### Setup:
1. Ir a linkedin.com/jobs
2. Buscar un job e ir a la página de detalle
3. Tener la extensión instalada y popup abierto en otra ventana

#### Test:
1. Hacer click en "Apply" (abre Easy Apply modal)
2. El modal debe poblarse automáticamente con:
   - ✅ Email del usuario
   - ✅ Nombre completo
   - ✅ Ciudad (desde CV detectada)
   - ✅ País (desde CV detectada)
   - ✅ Teléfono si está disponible en profile

3. Verificar que no hay errores en consola del popup
4. El modal debe rellenarse en < 2 segundos

#### Advanced Testing:
1. Formularios con campos condicionales:
   - ✅ Sistema debe detectar y saltar campos opcionales
   - ✅ Debe validar campos requeridos

2. Diferentes tipos de portales de empleo:
   - ✅ LinkedIn Easy Apply
   - ✅ Formularios embed en LinkedIn
   - ✅ Job portales

---

## Testing de Componentes

### CV Parser con IA (`lib/cv-ai-parser.ts`)

```javascript
import { extractLocationWithAI, fallbackLocationExtraction } from './lib/cv-ai-parser.ts';

// Test 1: IA Parser
const cvText = "I'm a software engineer from Zurich, Switzerland...";
const location = await extractLocationWithAI(cvText);
console.assert(location.country === "Switzerland", "Country detection failed");
console.assert(location.confidence > 0.7, "Confidence too low");

// Test 2: Regex Fallback
const fallback = fallbackLocationExtraction(cvText);
console.assert(fallback.country === "Switzerland", "Fallback failed");
console.assert(fallback.method === "regex", "Wrong method");

// Test 3: Cacheado
const cached = await getLocationFromStorage("test.pdf");
console.assert(cached !== null, "Cache failed");
```

### LinkedIn Form Mapper (`lib/linkedin-form-mapper.ts`)

```javascript
import { extractFormFields, autoFillForm, validateForm } from './lib/linkedin-form-mapper.ts';

// Test 1: Extract Fields
const fields = extractFormFields();
console.assert(fields.length > 0, "No fields found");

// Test 2: Auto Fill
const profileData = {
  email: "test@example.com",
  name: "John Doe",
  city: "Zurich",
  country: "Switzerland"
};
const results = autoFillForm(fields, profileData);
console.assert(results.filled > 0, "No fields filled");

// Test 3: Validation
const validation = validateForm(fields);
console.assert(validation.valid === true, "Validation failed");
```

### LinkedIn Auto-Apply (`linkedin-auto-apply.js`)

```javascript
import { executeAutoApply, isLinkedInJobPage } from './linkedin-auto-apply.js';

// Test 1: Job Page Detection
if (window.location.href.includes("linkedin.com/jobs/view/")) {
  console.assert(isLinkedInJobPage(), "Job page not detected");
}

// Test 2: Modal Detection
const modal = detectEasyApplyModal();
console.assert(modal !== null, "Modal not found");

// Test 3: Full Auto-Apply Flow
const result = await executeAutoApply(profileData);
console.assert(result.success === true, "Auto-apply failed");
console.assert(result.filledFields > 0, "No fields filled");
```

---

## Console Logging

### Debugging
Abrir Console del Popup (F12):

```javascript
// Ver ubicación detectada en storage
chrome.storage.local.get(['userProfile'], (result) => {
  console.log('Profile:', result.userProfile);
});

// Ver ubicaciones cacheadas
chrome.storage.local.get(null, (result) => {
  const locations = Object.entries(result)
    .filter(([k]) => k.startsWith('cv_location_'))
    .map(([k, v]) => ({ key: k, location: v }));
  console.log('Cached locations:', locations);
});

// Ver historial de aplicaciones
chrome.storage.local.get(['applicationHistory'], (result) => {
  console.log('Applications:', result.applicationHistory);
});
```

---

## Criterios de Aceptación

### ✅ CV Location Detection
- [ ] Sistema detecta país del CV
- [ ] Sistema detecta ciudad del CV
- [ ] Confidence score mostrado correctamente
- [ ] UI actualiza en menos de 2 segundos
- [ ] Ubicación se guarda en profile
- [ ] Cache funciona por 30 días

### ✅ LinkedIn Auto-Apply
- [ ] Modal Easy Apply detectado automáticamente
- [ ] Campos extraídos correctamente
- [ ] Datos de profile rellenados en campos
- [ ] Ubicación detectada usada en auto-fill
- [ ] Validación de campos requeridos
- [ ] Formulario enviado automáticamente
- [ ] Aplicación registrada en historial

### ✅ UI/UX
- [ ] Profile view se ve bien en todos los tamaños
- [ ] Badges de confianza mostrados correctamente
- [ ] Transiciones suaves entre tabs
- [ ] Campos de ubicación pre-rellenados
- [ ] Errores manejados gracefully

### ✅ Performance
- [ ] Popup carga en < 1 segundo
- [ ] Auto-apply ejecuta en < 2 segundos
- [ ] Caché reduce tiempo de detección siguiente
- [ ] No hay memory leaks

### ✅ Security
- [ ] CV completo no se guarda
- [ ] Solo campos procesados se almacenan
- [ ] API keys no expuestos en cliente
- [ ] Datos sincronizados con Firestore

---

## Troubleshooting

### Problema: Auto-apply no funciona en LinkedIn
**Solución:**
1. Verificar que extensión está activada
2. Verificar que popup tiene datos de profile
3. Abrir DevTools (F12) → Console
4. Buscar mensajes "[v0]" para debug
5. Verificar que "Ubicación Detectada" está poblada

### Problema: Ubicación no se detecta del CV
**Solución:**
1. Verificar que CV tiene ubicación clara (ej: "Zurich, Switzerland")
2. Verificar OpenRouter API key en `config.js`
3. Revisar Console para errores de API
4. Sistema debe caer a regex fallback automáticamente

### Problema: Campos no se rellenan en LinkedIn
**Solución:**
1. LinkedIn puede cambiar estructura del formulario
2. Verificar que selectores CSS aún son válidos
3. Abrir DevTools → Inspector
4. Buscar campo manualmente e inspeccionar HTML
5. Actualizar selector en `linkedin-auto-apply.js` si es necesario

---

## Performance Benchmarks

| Operación | Tiempo Esperado | Máximo Aceptable |
|-----------|-----------------|------------------|
| Popup load | 500ms | 1s |
| CV detection | 1500ms | 2.5s |
| LinkedIn form extraction | 300ms | 500ms |
| Auto-fill | 200ms | 500ms |
| Form submit | 100ms | 200ms |
| **Total auto-apply** | **~2100ms** | **~3000ms** |

---

## Checklist Final

- [ ] Build script valida sin errores
- [ ] Popup carga sin errores
- [ ] CV upload funciona
- [ ] Ubicación se detecta correctamente
- [ ] Profile view se ve bien
- [ ] Campos se pre-rellenan
- [ ] LinkedIn auto-apply funciona
- [ ] No hay console errors
- [ ] Performance dentro de benchmarks
- [ ] Datos se guardan correctamente
