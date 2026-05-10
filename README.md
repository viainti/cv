# CV Apply

Interfaz en Next.js + extensión de Chrome para subir un CV, extraer su texto y autoaplicar en formularios de empleo usando OpenRouter.

## Características

- UI simple en blanco con TailwindCSS.
- Carga de CV desde `PDF`, `DOCX`, `TXT` o `MD`.
- Extracción del texto del CV para reutilizarlo en cualquier vacante.
- Extensión que autorrellena formularios de empleo con OpenRouter.
- Clave y modelo por defecto listos para la instalación actual.
- Lote secuencial para `Easy Apply` en LinkedIn desde el popup.
- Base visual optimizada para lectura rápida, mejor espaciado y foco en conversión.

## Modelo de negocio recomendado

La forma más simple de monetizar este producto es cobrar por automatización útil, no por almacenamiento.

- `Freemium`: hasta `10` postulaciones. `USD 0`
- `Plan basico`: hasta `100` postulaciones. `USD 9.9`
- `Plan Mejorado`: hasta `250` postulaciones. `USD 14.9`
- `Plan avanzado`: hasta `500` postulaciones. `USD 19.9`
- `Plan Estrella`: correos directos de decisores para hasta `10` empresas y hasta `5` contactos por empresa. `USD 49.9`
- `Plan Diamond`: correos para hasta `100` empresas y hasta `5` contactos por empresa. `USD 99.9`
- `Plan Ultra`: correos para hasta `1000` empresas y hasta `5` contactos por empresa. `USD 499.9`

### Por qué este modelo

- El freemium convierte mejor que un demo vacío porque entrega valor en la primera sesión.
- El límite por número de postulaciones es fácil de explicar y de medir.
- `Plan basico`, `Plan Mejorado` y `Plan avanzado` crean una escalera clara de upgrade.
- `Estrella`, `Diamond` y `Ultra` abren una línea premium basada en datos de decisores.

### Qué cuenta como uso

- Cada ejecución exitosa de auto-postulación consume `1` postulación del plan.
- Las postulaciones manuales pueden quedar fuera del límite si quieres incentivar el uso híbrido.
- El lote secuencial de LinkedIn consume una unidad por cada vacante procesada y registrada como aplicada.

## Costos operativos estimados

Estos números son una estimación de negocio, no una factura exacta. Están pensados para ayudarte a decidir precios, márgenes y límites de uso.

### Stack actual que impacta costo

- LLM: `openai/gpt-4o-mini` vía OpenRouter.
- Persistencia y auth: Firebase / Firestore / Authentication.
- Extensión y UI: costo fijo de desarrollo, pero casi cero costo variable por ejecución.

### Precio actual del modelo

Tomando como referencia el precio público actual de `gpt-4o-mini` en OpenRouter:

- Input: `USD 0.15 / 1M tokens`
- Output: `USD 0.60 / 1M tokens`

### Supuesto razonable por postulación

Para una postulación automática típica en este proyecto, un escenario razonable es:

- 1 llamada para analizar la vacante
- 1 llamada para preparar el autofill
- entre `12K` tokens de entrada y `2K` tokens de salida en total

Costo estimado por postulación:

- Input: `12,000 / 1,000,000 x 0.15 = USD 0.0018`
- Output: `2,000 / 1,000,000 x 0.60 = USD 0.0012`
- Total estimado: `USD 0.0030` por postulación

En otras palabras:

- `10` postulaciones de Freemium: `USD 0.03`
- `100` postulaciones de Plan basico: `USD 0.30`
- `250` postulaciones de Plan Mejorado: `USD 0.75`
- `500` postulaciones de Plan avanzado: `USD 1.50`

### Escenario conservador

Si algunas vacantes requieren reintentos, más contexto o respuestas adicionales, puedes presupuestar una banda más segura:

- costo normal por postulación: `USD 0.003`
- costo conservador por postulación: `USD 0.008`
- costo pesado por postulación: `USD 0.015`

Esto te protege si luego agregas más llamadas, más texto o más personalización.

## Costos Firebase

### Authentication

- Email/social login: gratis hasta `50,000 MAUs`
- Después de eso, el costo empieza a escalar por usuario activo mensual

Para una etapa inicial o incluso una SaaS pequeña, el costo de auth suele ser casi cero.

### Firestore

Free tier actual útil para arrancar:

- `50,000` lecturas por día
- `20,000` escrituras por día
- `20,000` deletes por día
- `1 GiB` de almacenamiento
- `10 GiB` de salida por mes

Precios públicos base fuera del free tier en la edición estándar:

- lecturas: `USD 0.03 / 100,000`
- escrituras: `USD 0.09 / 100,000`
- deletes: `USD 0.01 / 100,000`

### Riesgo de costo en la arquitectura actual

Ahora mismo el proyecto sincroniza campos como `cvText` y también `cvFileDataUrl` al backend. Eso significa que el archivo del CV puede terminar guardado dentro de Firestore como texto/base64, lo cual no es ideal.

Recomendación fuerte:

- guardar el binario del CV en Cloud Storage
- guardar en Firestore solo metadata, texto parseado y referencias

Si dejas archivos o base64 grandes dentro de Firestore:

- sube el almacenamiento más rápido
- aumenta el tamaño de lectura/escritura
- pagas más por un sistema que debería ser barato

## Margen estimado por usuario

### Freemium

- `10` postulaciones automáticas
- costo LLM estimado: `USD 0.03`
- costo Firebase incremental temprano: casi `USD 0`
- costo total variable esperado: entre `USD 0.03` y `USD 0.10`

Conclusión:

- el trial es muy barato
- sirve muy bien como motor de conversión

### Plan basico

Plan recomendado:

- precio: `USD 9.9`
- límite: `100` postulaciones

Costo variable estimado:

- normal: `100 x 0.003 = USD 0.30`
- conservador: `100 x 0.008 = USD 0.80`

Margen bruto estimado antes de pasarela de pago, soporte y adquisición:

- normal: `USD 9.60`
- conservador: `USD 9.10`

### Plan Mejorado

Plan recomendado:

- precio: `USD 14.9`
- límite: `250` postulaciones

Costo variable estimado:

- normal: `250 x 0.003 = USD 0.75`
- conservador: `250 x 0.008 = USD 2.00`

Margen bruto estimado antes de pasarela de pago, soporte y adquisición:

- normal: `USD 14.15`
- conservador: `USD 12.90`

### Plan avanzado

- precio: `USD 19.9`
- límite: `500` postulaciones
- costo variable normal: `500 x 0.003 = USD 1.50`
- costo variable conservador: `500 x 0.008 = USD 4.00`
- margen bruto normal: `USD 18.40`
- margen bruto conservador: `USD 15.90`

## Recomendación comercial

El modelo comercial de referencia para este producto sería:

- `Freemium`: `10` postulaciones gratis
- `Plan basico`: `USD 9.9`
- `Plan Mejorado`: `USD 14.9`
- `Plan avanzado`: `USD 19.9`
- `Plan Estrella`: `USD 49.9`
- `Plan Diamond`: `USD 99.9`
- `Plan Ultra`: `USD 499.9`

Y añadir después:

- límite mensual duro por plan
- contador visible de uso
- upgrade wall al terminar el trial
- opción de compra anual con descuento

### Recomendación extra

Si quieres mantener márgenes altos desde el día uno:

- cuenta las postulaciones automáticas exitosas
- no cobres por búsquedas o análisis locales
- reserva las funciones de lote, cron y mayor volumen para planes pagos

## Nota financiera

La mayor parte del costo variable real viene del LLM. Firebase, bien configurado, debería seguir siendo una fracción pequeña del costo total en etapa temprana.

El mayor riesgo operativo no es el precio de OpenRouter, sino:

- guardar demasiado payload en Firestore
- disparar demasiadas llamadas por campo
- automatizar formularios complejos sin límites de uso

## Tabla de precios, costos y ganancias

La siguiente simulación usa precios públicos actuales y un supuesto operativo razonable para el producto tal como está hoy.

### Supuestos de la simulación

- modelo: `openai/gpt-4o-mini`
- precio OpenRouter:
  - input: `USD 0.15 / 1M tokens`
  - output: `USD 0.60 / 1M tokens`
- consumo promedio por postulación:
  - `12K` tokens de entrada
  - `2K` tokens de salida
- costo IA por postulación:
  - `USD 0.003`
- plan de referencia para esta simulación:
  - `Plan basico`
  - `USD 9.9`
  - hasta `100` postulaciones

### Unidad económica por usuario

| Plan | Precio | Uso mensual | Costo IA | Firebase/Auth | Ganancia bruta aprox. |
|---|---:|---:|---:|---:|---:|
| Freemium | $0 | 10 postulaciones | $0.03 | ~$0.00 | -$0.03 |
| Plan basico | $9.9 | 100 postulaciones | $0.30 | ~$0.00 a $0.01 | ~$9.59+ |
| Plan Mejorado | $14.9 | 250 postulaciones | $0.75 | ~$0.01 | ~$14.14+ |
| Plan avanzado | $19.9 | 500 postulaciones | $1.50 | ~$0.01 | ~$18.39+ |

### Simulación con usuarios pagos en Plan basico

Esta tabla asume que todos los usuarios están en `Plan basico` y consumen el límite completo.

| Usuarios pagos | Ingresos | Postulaciones/mes | Costo OpenRouter | Costo Firebase/Auth | Ganancia bruta |
|---|---:|---:|---:|---:|---:|
| 100 | $990.00 | 10,000 | $30.00 | ~$0.00 | ~$960.00 |
| 1,000 | $9,900.00 | 100,000 | $300.00 | ~$1.18 | ~$9,598.82 |
| 10,000 | $99,000.00 | 1,000,000 | $3,000.00 | ~$19.22 | ~$95,980.78 |

### Cómo se estima Firebase en esta simulación

Supuesto aproximado por usuario al mes:

- `4,100` lecturas
- `1,300` escrituras
- `100` deletes

Precios públicos usados fuera del free tier:

- lecturas: `USD 0.03 / 100,000`
- escrituras: `USD 0.09 / 100,000`
- deletes: `USD 0.01 / 100,000`

Observaciones:

- con `100` usuarios todavía puedes quedar casi cubierto por free tier en varios proyectos pequeños
- con `1,000` usuarios Firestore empieza a cobrar, pero sigue siendo muy barato
- con `10,000` usuarios el costo de Firebase sigue siendo menor que el costo del LLM

### Conclusión de negocio

- el costo variable dominante es `OpenRouter`
- `Firebase` es un costo secundario si almacenas bien los datos
- el freemium de 10 postulaciones es barato y muy útil para conversión
- los planes de postulaciones tienen muy buen margen bruto
- los planes premium de correos directos tienen potencial de margen aún mayor

## Configuración rápida

1. Instala dependencias:

```bash
npm install
```

2. Compila estilos:

```bash
npm run build:css
```

3. Ejecuta la UI web:

```bash
npm run dev
```

4. Carga la extensión en Chrome:
   - Abre `chrome://extensions`
   - Activa **Developer mode**
   - Click en **Load unpacked**
   - Selecciona `dist/chrome-extension` si corriste `npm run build:chrome`
   - O selecciona esta carpeta raíz si prefieres probar directo en desarrollo

5. En la web o en el popup:
   - Sube tu CV
   - Revisa el texto extraído
   - Guarda el perfil

6. En el popup de la extensión:
   - Abre una vacante
   - Ajusta la URL si quieres forzar una oferta concreta
   - Click en **Autoaplicar en esta web**

## Build para Chrome

```bash
npm run build:chrome
```

Esto genera una carpeta lista para cargar en Chrome:

```bash
dist/chrome-extension
```

## Nota

La precisión depende de cómo esté construido cada formulario, la calidad del CV y el contexto disponible en la página actual.
