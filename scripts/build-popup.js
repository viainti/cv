#!/usr/bin/env node

/**
 * build-popup.js
 * Ensambla los componentes HTML en popup.html final
 * Uso: node scripts/build-popup.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const COMPONENTS_DIR = join(ROOT, 'components');
const OUTPUT_FILE = join(ROOT, 'popup.html');

// Orden de ensamblaje
const COMPONENT_ORDER = [
  'head.html',           // 1-147: DOCTYPE, head, estilos, opening body
  'boot-loader.html',    // 148-153: Boot loader spinner
  'header.html',         // 154-169: Header + main wrapper
  'auth.html',           // 175-327: Login/Register forms
  'intro.html',          // 328-431: Intro carousel
  'cv-step.html',        // 432-523: Paso 1 - Subir CV
  'job-step.html',       // 524-771: Paso 2 - Selección portal
  'job-dashboard.html',  // 772-2002: Paso 3 - Dashboard jobs
  'user-menu.html',      // 2003-2066: Menú usuario
  'profile-view.html',   // 2067-2373: Vista perfil con tabs
  'cvs-view.html',       // 2374-2395: Vista CVs
  'applications-view.html', // 2396-2417: Vista aplicaciones
  'searches-view.html',  // 2418-2438: Vista búsquedas
  'upgrade-view.html',   // 2439-2470: Vista upgrade plan
  'scripts.html'         // 2471-2483: Scripts + cierre tags
];

function readComponent(name) {
  const filePath = join(COMPONENTS_DIR, name);
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.warn(`⚠️  Componente no encontrado: ${name}`);
    return '';
  }
}

function buildPopup() {
  console.log('🔨 Ensamblando popup.html desde componentes...\n');

  const parts = COMPONENT_ORDER.map((name) => {
    const content = readComponent(name);
    if (content.length > 0) {
      console.log(`  ✅ ${name} (${content.length} chars)`);
    } else {
      console.log(`  ⚠️  ${name} (vacío)`);
    }
    return content;
  });

  const output = parts.join('\n');
  writeFileSync(OUTPUT_FILE, output, 'utf-8');

  console.log(`\n✅ popup.html generado en: ${OUTPUT_FILE}`);
  console.log(`📏 Tamaño: ${(output.length / 1024).toFixed(1)} KB`);
}

buildPopup();
