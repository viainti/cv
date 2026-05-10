/**
 * profile-location-handler.js
 * Maneja la detección de ubicación con IA y la integración con el perfil
 */

import { getOrExtractLocation, detectCountryFromList } from './lib/cv-ai-parser.ts';

export async function handleCVLocationDetection(cvText, cvFileName, profileElement) {
  try {
    console.log('[v0] Detectando ubicación del CV...');

    // Extraer ubicación del CV
    const location = await getOrExtractLocation(cvText, cvFileName, true);

    if (!location) {
      console.error('[v0] Failed to extract location');
      return null;
    }

    console.log('[v0] Location detected:', location);

    // Actualizar el UI con la ubicación detectada
    updateLocationUI(location, profileElement);

    // Guardar en profile data
    const profileData = await chrome.storage.local.get(['userProfile']);
    const profile = profileData.userProfile || {};

    profile.detectedCountry = location.country;
    profile.detectedCity = location.city;
    profile.detectedState = location.state;
    profile.locationConfidence = location.confidence;
    profile.locationExtractedAt = location.extractedAt;
    profile.locationMethod = location.method;

    // Guardar actualizado
    await chrome.storage.local.set({ userProfile: profile });
    console.log('[v0] Profile updated with location:', profile);

    return location;
  } catch (error) {
    console.error('[v0] Error detecting location:', error);
    return null;
  }
}

function updateLocationUI(location, profileElement) {
  const detectedLocationEl = profileElement.querySelector('#detectedLocation');
  const confidenceBadgeEl = profileElement.querySelector('#aiConfidenceBadge');

  if (!detectedLocationEl) return;

  // Determinar color del badge basado en confianza
  let badgeClass = 'bg-[#c8e6c9] text-[#1b5e20]'; // Verde
  if (location.confidence < 0.6) {
    badgeClass = 'bg-[#ffe0b2] text-[#e65100]'; // Naranja
  } else if (location.confidence < 0.8) {
    badgeClass = 'bg-[#fff9c4] text-[#f57f17]'; // Amarillo
  }

  const confidencePercent = Math.round(location.confidence * 100);

  // Actualizar badge
  if (confidenceBadgeEl) {
    confidenceBadgeEl.className = `inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold ${badgeClass}`;
    confidenceBadgeEl.innerHTML = `
      <span class="inline-block w-1.5 h-1.5 rounded-full" style="background-color: currentColor;"></span>
      ${confidencePercent}% confianza
    `;
  }

  // Mostrar ubicación
  detectedLocationEl.innerHTML = `
    <div class="bg-white rounded-lg p-3 space-y-2">
      ${location.country ? `<div><p class="text-[10px] text-[#4d6570] font-semibold">País</p><p class="text-[11px] text-[#071e27] font-medium">${location.country}</p></div>` : ''}
      ${location.city ? `<div><p class="text-[10px] text-[#4d6570] font-semibold">Ciudad</p><p class="text-[11px] text-[#071e27] font-medium">${location.city}</p></div>` : ''}
      ${location.state ? `<div><p class="text-[10px] text-[#4d6570] font-semibold">Provincia</p><p class="text-[11px] text-[#071e27] font-medium">${location.state}</p></div>` : ''}
      <div class="pt-2 border-t border-[#e5e7eb]">
        <p class="text-[9px] text-[#999] italic">Detectado por IA - ${location.method === 'ai' ? 'Análisis' : 'Patrón'}</p>
      </div>
    </div>
  `;
}

export async function syncDetectedLocationToForm(profileElement) {
  try {
    const profileData = await chrome.storage.local.get(['userProfile']);
    const profile = profileData.userProfile || {};

    if (!profile.detectedCountry && !profile.detectedCity) {
      return;
    }

    // Actualizar campos del formulario
    const cityInput = profileElement.querySelector('#profileCity');
    const stateInput = profileElement.querySelector('#profileState');
    const countryInput = profileElement.querySelector('#profileCountry');

    if (cityInput && profile.detectedCity) {
      cityInput.value = profile.detectedCity;
      cityInput.classList.add('border-[#0f5d86]', 'bg-[#f0f5f8]');
    }

    if (stateInput && profile.detectedState) {
      stateInput.value = profile.detectedState;
      stateInput.classList.add('border-[#0f5d86]', 'bg-[#f0f5f8]');
    }

    if (countryInput && profile.detectedCountry) {
      countryInput.value = profile.detectedCountry;
      countryInput.classList.add('border-[#0f5d86]', 'bg-[#f0f5f8]');
    }

    console.log('[v0] Location fields synced to form');
  } catch (error) {
    console.error('[v0] Error syncing location:', error);
  }
}

export function displayCVExtractionResults(cvData, profileElement) {
  const cvDetailsEl = profileElement.querySelector('#profileCvDetails');
  if (!cvDetailsEl) return;

  const fields = cvData.extractedFields || [];
  
  if (fields.length === 0) {
    cvDetailsEl.innerHTML = '<p class="text-[11px] text-[#4d6570] text-center py-3 bg-[#f8f9fa] rounded-lg">No se extrajeron campos del CV.</p>';
    return;
  }

  const fieldsHTML = fields
    .map((field) => `
      <div class="flex items-start justify-between gap-2 p-2 bg-[#f8f9fa] rounded-lg border border-[#e5e7eb]">
        <div class="flex-1">
          <p class="text-[10px] text-[#4d6570] font-semibold">${field.name}</p>
          <p class="text-[11px] text-[#071e27] truncate">${field.value}</p>
        </div>
        <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold text-white" 
              style="background-color: ${field.confidence > 0.8 ? '#4caf50' : field.confidence > 0.5 ? '#ff9800' : '#f44336'}">
          ${Math.round(field.confidence * 100)}%
        </span>
      </div>
    `)
    .join('');

  cvDetailsEl.innerHTML = `
    <div class="space-y-2">
      ${fieldsHTML}
    </div>
  `;
}

export async function getProfileWithLocation() {
  const profileData = await chrome.storage.local.get(['userProfile']);
  const profile = profileData.userProfile || {};

  return {
    ...profile,
    // Proporcionar ubicación detectada para auto-fill de LinkedIn
    detectedCountry: profile.detectedCountry || profile.country,
    detectedCity: profile.detectedCity || profile.city,
    detectedState: profile.detectedState || profile.state,
  };
}
