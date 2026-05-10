# Scripts de Build y Deploy

## Comandos disponibles

### `npm run build:css`
Compila el CSS con Tailwind CSS.

```bash
npm run build:css
```

### `npm run build:popup`
Ensambla `popup.html` desde los componentes en `components/`.

```bash
npm run build:popup
```

### `npm run build:extension`
Copia los archivos de la extensión a `dist/chrome-extension/`.

```bash
npm run build:extension
```

### `npm run build:all`
Compila CSS + ensambla popup + copia a dist (todo en uno).

```bash
npm run build:all
```

### `npm run build:deploy` ⭐
**Comando principal** - Hace todo y genera ZIP listo para Chrome Web Store:
1. Compila CSS
2. Ensambla popup.html desde componentes
3. Copia todo a dist/
4. Genera ZIP en `output/`

```bash
npm run build:deploy
```

## Flujo de trabajo recomendado

```bash
# 1. Desarrollo - edita componentes en components/
# 2. Build completo + ZIP
npm run build:deploy

# 3. El ZIP estará en output/trcvastian-chrome-extension-YYYYMMDD_HHMMSS.zip
# 4. Sube el ZIP a Chrome Web Store
```

## Subir a Chrome Web Store

1. Ejuta `npm run build:deploy`
2. Ve a https://chrome.google.com/webstore/devconsole
3. Selecciona tu extensión
4. Click en "Upload new package"
5. Selecciona el ZIP generado en `output/`
