#!/usr/bin/env node

/**
 * build-popup.js
 * Ensambla los componentes HTML en popup.html final con validación
 * Uso: node scripts/build-popup.js
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const COMPONENTS_DIR = join(ROOT, 'components');
const OUTPUT_FILE = join(ROOT, 'popup.html');

// Orden de ensamblaje
const COMPONENT_ORDER = [
  'head.html',           // DOCTYPE, head, estilos, opening body
  'boot-loader.html',    // Boot loader spinner
  'header.html',         // Header + main wrapper
  'auth.html',           // Login/Register forms
  'intro.html',          // Intro carousel
  'cv-step.html',        // Paso 1 - Subir CV
  'job-step.html',       // Paso 2 - Selección portal
  'job-dashboard.html',  // Paso 3 - Dashboard jobs
  'user-menu.html',      // Menú usuario
  'profile-view.html',   // Vista perfil con tabs
  'cvs-view.html',       // Vista CVs
  'applications-view.html', // Vista aplicaciones
  'searches-view.html',  // Vista búsquedas
  'upgrade-view.html',   // Vista upgrade plan
  'scripts.html'         // Scripts + cierre tags
];

function readComponent(name) {
  const filePath = join(COMPONENTS_DIR, name);
  if (!existsSync(filePath)) {
    console.error(`❌ Componente no encontrado: ${name}`);
    process.exit(1);
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    if (content.trim().length === 0) {
      console.error(`❌ Componente vacío: ${name}`);
      process.exit(1);
    }
    return content;
  } catch (err) {
    console.error(`❌ Error leyendo ${name}:`, err.message);
    process.exit(1);
  }
}

function validateHTML(html) {
  // Validar que los tags se cierren correctamente
  const openTags = (html.match(/<(div|main|section|article|header|footer|form|ul|ol|table|body)/g) || []).length;
  const closeTags = (html.match(/<\/(div|main|section|article|header|footer|form|ul|ol|table|body)>/g) || []).length;

  if (openTags !== closeTags) {
    console.warn(`⚠️  Posible desequilibrio de tags: ${openTags} aperturas vs ${closeTags} cierres`);
  }

  // Validar doctype y html tags
  if (!html.toLowerCase().includes('<!doctype html')) {
    console.error('❌ Falta <!DOCTYPE html>');
    return false;
  }

  if (!html.includes('</html>')) {
    console.error('❌ Falta tag </html> de cierre');
    return false;
  }

  // Validar que tiene body
  if (!html.includes('</body>')) {
    console.error('❌ Falta tag </body> de cierre');
    return false;
  }

  return true;
}

function buildPopup() {
  console.log('🔨 Ensamblando popup.html desde componentes...\n');

  const parts = [];
  let totalChars = 0;

  for (const name of COMPONENT_ORDER) {
    const content = readComponent(name);
    parts.push(content);
    totalChars += content.length;
    console.log(`  ✅ ${name.padEnd(25)} (${(content.length / 1024).toFixed(1)} KB)`);
  }

  const output = parts.join('\n');

  // Validar HTML
  console.log('\n🔍 Validando HTML...');
  if (!validateHTML(output)) {
    console.error('❌ Validación HTML falló');
    process.exit(1);
  }

  // Escribir archivo
  try {
    writeFileSync(OUTPUT_FILE, output, 'utf-8');
    console.log('✅ HTML validado correctamente');
  } catch (err) {
    console.error(`❌ Error escribiendo ${OUTPUT_FILE}:`, err.message);
    process.exit(1);
  }

  // Estadísticas finales
  console.log('\n📊 Estadísticas del build:');
  console.log(`  📁 Componentes: ${COMPONENT_ORDER.length}`);
  console.log(`  📏 Tamaño total: ${(totalChars / 1024).toFixed(2)} KB`);
  console.log(`  📄 Salida: ${OUTPUT_FILE}`);
  console.log(`  ✅ Build completado exitosamente\n`);
}

try {
  buildPopup();
} catch (err) {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
}
