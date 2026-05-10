#!/usr/bin/env bash

###############################################################################
# build-local.sh
# Build rápido para desarrollo local. Compila CSS, ensambla popup y copia a dist/
# Uso: ./scripts/build-local.sh
###############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist/chrome-extension"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🔨 TRCVASTIAN - Build Local${NC}"
echo ""

# 1. CSS
echo -e "${YELLOW}[1/3] CSS...${NC}"
cd "$ROOT_DIR" && npm run build:css 2>/dev/null
echo -e "${GREEN}  ✅ CSS${NC}"

# 2. Popup
echo -e "${YELLOW}[2/3] Popup...${NC}"
node scripts/build-popup.js 2>/dev/null | tail -1
echo -e "${GREEN}  ✅ Popup${NC}"

# 3. Copy to dist
echo -e "${YELLOW}[3/3] Copying to dist...${NC}"
cp manifest.json "$DIST_DIR/"
cp background.js "$DIST_DIR/"
cp content.js "$DIST_DIR/"
cp popup.html "$DIST_DIR/"
cp popup.js "$DIST_DIR/"
cp options.html "$DIST_DIR/"
cp options.js "$DIST_DIR/"
cp config.js "$DIST_DIR/"
cp cv-parser.js "$DIST_DIR/"
cp profile-search.js "$DIST_DIR/"
cp job-fit.js "$DIST_DIR/"
cp firebase-*.js "$DIST_DIR/"
cp styles/output.css "$DIST_DIR/styles/"
cp -R node_modules/pdfjs-dist/build "$DIST_DIR/node_modules/pdfjs-dist/"
cp node_modules/jszip/dist/jszip.min.js "$DIST_DIR/node_modules/jszip/dist/"
echo -e "${GREEN}  ✅ Dist${NC}"

echo ""
echo -e "${BLUE}✅ Build local listo${NC}"
echo ""
echo -e "${YELLOW}Para probar en Chrome:${NC}"
echo -e "  1. Abre chrome://extensions"
echo -e "  2. Activa 'Modo desarrollador' ↗"
echo -e "  3. Click en 'Cargar descomprimida'"
echo -e "  4. Selecciona: ${GREEN}$DIST_DIR${NC}"
echo ""
