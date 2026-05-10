#!/usr/bin/env bash

###############################################################################
# build-and-deploy.sh
# Compila CSS, ensambla popup.html, copia todo a dist y genera .zip listo
# Uso: ./scripts/build-and-deploy.sh
###############################################################################

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist/chrome-extension"
OUTPUT_DIR="$ROOT_DIR/output"

# Colores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   TRCVASTIAN - Build & Deploy Script   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

# ─── Paso 1: Compilar CSS ──────────────────────────────────────────────────
echo -e "${YELLOW}[1/4] Compilando CSS con Tailwind...${NC}"
cd "$ROOT_DIR"
npm run build:css
echo -e "${GREEN}✅ CSS compilado${NC}"
echo ""

# ─── Paso 2: Ensamblar popup.html ──────────────────────────────────────────
echo -e "${YELLOW}[2/4] Ensamblando popup.html desde componentes...${NC}"
node scripts/build-popup.js
echo -e "${GREEN}✅ popup.html ensamblado${NC}"
echo ""

# ─── Paso 3: Copiar a dist ─────────────────────────────────────────────────
echo -e "${YELLOW}[3/4] Copiando archivos a dist/chrome-extension...${NC}"

# Archivos principales
cp "$ROOT_DIR/manifest.json" "$DIST_DIR/manifest.json"
cp "$ROOT_DIR/background.js" "$DIST_DIR/background.js"
cp "$ROOT_DIR/content.js" "$DIST_DIR/content.js"
cp "$ROOT_DIR/popup.html" "$DIST_DIR/popup.html"
cp "$ROOT_DIR/popup.js" "$DIST_DIR/popup.js"
cp "$ROOT_DIR/options.html" "$DIST_DIR/options.html"
cp "$ROOT_DIR/options.js" "$DIST_DIR/options.js"
cp "$ROOT_DIR/config.js" "$DIST_DIR/config.js"
cp "$ROOT_DIR/cv-parser.js" "$DIST_DIR/cv-parser.js"
cp "$ROOT_DIR/profile-search.js" "$DIST_DIR/profile-search.js"
cp "$ROOT_DIR/job-fit.js" "$DIST_DIR/job-fit.js"
cp "$ROOT_DIR/firebase-app.js" "$DIST_DIR/firebase-app.js"
cp "$ROOT_DIR/firebase-auth.js" "$DIST_DIR/firebase-auth.js"
cp "$ROOT_DIR/firebase-firestore.js" "$DIST_DIR/firebase-firestore.js"
cp "$ROOT_DIR/firebase-ready.js" "$DIST_DIR/firebase-ready.js"
cp "$ROOT_DIR/styles/output.css" "$DIST_DIR/styles/output.css"

# Node modules needed by extension
mkdir -p "$DIST_DIR/node_modules/pdfjs-dist/build"
cp "$ROOT_DIR/node_modules/pdfjs-dist/build/pdf.mjs" "$DIST_DIR/node_modules/pdfjs-dist/build/pdf.mjs"
cp "$ROOT_DIR/node_modules/pdfjs-dist/build/pdf.worker.mjs" "$DIST_DIR/node_modules/pdfjs-dist/build/pdf.worker.mjs"

echo -e "${GREEN}✅ Archivos copiados a dist/${NC}"
echo ""

# ─── Paso 4: Generar ZIP ───────────────────────────────────────────────────
echo -e "${YELLOW}[4/4] Generando ZIP para Chrome Web Store...${NC}"

mkdir -p "$OUTPUT_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ZIP_NAME="trcvastian-chrome-extension-${TIMESTAMP}.zip"

cd "$DIST_DIR"
zip -r "$OUTPUT_DIR/$ZIP_NAME" . -x "*.DS_Store" "._*" "__MACOSX/*"

echo -e "${GREEN}✅ ZIP generado: $OUTPUT_DIR/$ZIP_NAME${NC}"
echo ""

# ─── Resumen ────────────────────────────────────────────────────────────────
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Build Completado ✅            ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "📦 ZIP listo: ${GREEN}$OUTPUT_DIR/$ZIP_NAME${NC}"
echo -e "📁 Dist: ${GREEN}$DIST_DIR/${NC}"
echo ""
echo -e "${YELLOW}Para subir a Chrome Web Store:${NC}"
echo -e "  1. Ve a https://chrome.google.com/webstore/devconsole"
echo -e "  2. Sube el archivo ZIP generado"
echo ""
