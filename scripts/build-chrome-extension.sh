#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist/chrome-extension"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/styles"
mkdir -p "$DIST_DIR/node_modules/jszip/dist"
mkdir -p "$DIST_DIR/node_modules/pdfjs-dist/build"

cp "$ROOT_DIR/manifest.json" "$DIST_DIR/"
cp "$ROOT_DIR/popup.html" "$DIST_DIR/"
cp "$ROOT_DIR/popup.js" "$DIST_DIR/"
cp "$ROOT_DIR/options.html" "$DIST_DIR/"
cp "$ROOT_DIR/options.js" "$DIST_DIR/"
cp "$ROOT_DIR/background.js" "$DIST_DIR/"
cp "$ROOT_DIR/content.js" "$DIST_DIR/"
cp "$ROOT_DIR/config.js" "$DIST_DIR/"
cp "$ROOT_DIR/cv-parser.js" "$DIST_DIR/"
cp "$ROOT_DIR/job-fit.js" "$DIST_DIR/"
cp "$ROOT_DIR/profile-search.js" "$DIST_DIR/"
cp "$ROOT_DIR/styles/output.css" "$DIST_DIR/styles/"
cp "$ROOT_DIR/firebase-app.js" "$DIST_DIR/"
cp "$ROOT_DIR/firebase-auth.js" "$DIST_DIR/"
cp "$ROOT_DIR/firebase-firestore.js" "$DIST_DIR/"
cp "$ROOT_DIR/firebase-ready.js" "$DIST_DIR/"

cp "$ROOT_DIR/node_modules/jszip/dist/jszip.min.js" "$DIST_DIR/node_modules/jszip/dist/"
cp "$ROOT_DIR/node_modules/pdfjs-dist/build/pdf.mjs" "$DIST_DIR/node_modules/pdfjs-dist/build/"
cp "$ROOT_DIR/node_modules/pdfjs-dist/build/pdf.worker.mjs" "$DIST_DIR/node_modules/pdfjs-dist/build/"

printf '%s\n' "Chrome extension ready at: $DIST_DIR"
