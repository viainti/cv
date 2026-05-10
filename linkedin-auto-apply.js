/**
 * linkedin-auto-apply.js
 * Auto-completa y envía formularios de LinkedIn Easy Apply
 * Se integra con content.js para detectar y rellenar automáticamente
 */

/**
 * Detecta si estamos en una página de LinkedIn job
 */
export function isLinkedInJobPage() {
  return window.location.hostname.includes("linkedin.com") && window.location.pathname.includes("/jobs/view/");
}

/**
 * Detecta si hay un modal Easy Apply abierto
 */
export function detectEasyApplyModal() {
  // Buscar modal de LinkedIn
  const modal = document.querySelector(
    '[aria-label*="Apply"], [role="dialog"][aria-label*="application"], .artdeco-modal'
  );
  
  if (!modal) {
    console.log("[v0] Easy Apply modal not detected");
    return null;
  }

  return modal;
}

/**
 * Extrae todos los campos del formulario del modal Easy Apply
 */
export function extractFormFields() {
  const fields = [];
  const fieldsByName = new Map();

  // Buscar inputs
  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"])');
  inputs.forEach((input, idx) => {
    const name = input.name || input.id || `field_${idx}`;
    if (!fieldsByName.has(name)) {
      fields.push({
        id: input.id || `input_${idx}`,
        name: name,
        type: input.type || "text",
        required: input.required,
        label: getFieldLabel(input),
        selector: generateSelector(input),
        value: input.value || "",
      });
      fieldsByName.set(name, true);
    }
  });

  // Buscar selects
  const selects = document.querySelectorAll("select");
  selects.forEach((select, idx) => {
    const name = select.name || select.id || `select_${idx}`;
    if (!fieldsByName.has(name)) {
      fields.push({
        id: select.id || `select_${idx}`,
        name: name,
        type: "select",
        required: select.required,
        label: getFieldLabel(select),
        selector: generateSelector(select),
        value: select.value || "",
        options: Array.from(select.options).map((o) => ({
          value: o.value,
          text: o.text,
        })),
      });
      fieldsByName.set(name, true);
    }
  });

  // Buscar textareas
  const textareas = document.querySelectorAll("textarea");
  textareas.forEach((textarea, idx) => {
    const name = textarea.name || textarea.id || `textarea_${idx}`;
    if (!fieldsByName.has(name)) {
      fields.push({
        id: textarea.id || `textarea_${idx}`,
        name: name,
        type: "textarea",
        required: textarea.required,
        label: getFieldLabel(textarea),
        selector: generateSelector(textarea),
        value: textarea.value || "",
      });
      fieldsByName.set(name, true);
    }
  });

  // Buscar file inputs
  const fileInputs = document.querySelectorAll('input[type="file"]');
  fileInputs.forEach((fileInput, idx) => {
    const name = fileInput.name || fileInput.id || `file_${idx}`;
    if (!fieldsByName.has(name)) {
      fields.push({
        id: fileInput.id || `file_${idx}`,
        name: name,
        type: "file",
        required: fileInput.required,
        label: getFieldLabel(fileInput),
        selector: generateSelector(fileInput),
      });
      fieldsByName.set(name, true);
    }
  });

  return fields;
}

/**
 * Obtiene el label de un campo
 */
function getFieldLabel(element) {
  // Buscar label asociado
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) return label.textContent.trim();
  }

  // Buscar placeholder
  if (element.placeholder) return element.placeholder;

  // Buscar aria-label
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;

  // Buscar en texto anterior
  if (element.previousElementSibling) {
    return element.previousElementSibling.textContent.trim() || "field";
  }

  return element.name || "field";
}

/**
 * Genera un selector CSS para un elemento
 */
function generateSelector(element) {
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  let selector = element.tagName.toLowerCase();
  if (element.name) {
    selector += `[name="${CSS.escape(element.name)}"]`;
  } else if (element.className) {
    selector += `.${Array.from(element.classList).join(".")}`;
  }

  return selector;
}

/**
 * Rellena un campo con un valor
 */
export function fillField(selector, value) {
  const element = document.querySelector(selector);
  
  if (!element) {
    console.warn(`[v0] Field not found: ${selector}`);
    return false;
  }

  try {
    if (element instanceof HTMLInputElement) {
      if (element.type === "checkbox" || element.type === "radio") {
        element.checked = !!value;
      } else {
        element.value = String(value || "");
      }
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (element instanceof HTMLSelectElement) {
      element.value = String(value || "");
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (element instanceof HTMLTextAreaElement) {
      element.value = String(value || "");
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    return false;
  } catch (error) {
    console.error(`[v0] Error filling field ${selector}:`, error);
    return false;
  }
}

/**
 * Intenta rellenar múltiples campos basado en mapping inteligente
 */
export function autoFillForm(fields, profileData) {
  const results = {
    filled: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const field of fields) {
    // No rellenar ciertos tipos de campos
    if (field.type === "file" || field.type === "hidden" || field.type === "button" || field.type === "submit") {
      results.skipped++;
      continue;
    }

    let value = null;

    // Buscar valor en profileData por nombre exacto
    if (field.name in profileData) {
      value = profileData[field.name];
    }
    // Buscar por coincidencia del label
    else {
      const lowerLabel = field.label.toLowerCase();

      if (lowerLabel.includes("email")) {
        value = profileData.email || profileData.userEmail;
      } else if (lowerLabel.includes("nombre") || lowerLabel.includes("name") || lowerLabel.includes("first")) {
        value = profileData.name || profileData.firstName || profileData.fullName;
      } else if (lowerLabel.includes("apellido") || lowerLabel.includes("last")) {
        value = profileData.lastName;
      } else if (lowerLabel.includes("teléfono") || lowerLabel.includes("phone")) {
        value = profileData.phone || profileData.userPhone;
      } else if (lowerLabel.includes("ciudad") || lowerLabel.includes("city")) {
        value = profileData.city;
      } else if (lowerLabel.includes("país") || lowerLabel.includes("country")) {
        value = profileData.country || profileData.detectedCountry;
      } else if (lowerLabel.includes("provincia") || lowerLabel.includes("state") || lowerLabel.includes("región")) {
        value = profileData.state || profileData.detectedState;
      } else if (lowerLabel.includes("dirección") || lowerLabel.includes("address")) {
        value = profileData.address || profileData.location;
      } else if (lowerLabel.includes("linkedin")) {
        value = profileData.linkedin || "";
      } else if (lowerLabel.includes("sitio web") || lowerLabel.includes("website")) {
        value = profileData.website || profileData.portfolio;
      }
    }

    if (value !== null && value !== undefined && value !== "") {
      const success = fillField(field.selector, value);
      if (success) {
        results.filled++;
      } else {
        results.failed++;
        results.errors.push(`Failed to fill: ${field.label}`);
      }
    } else {
      results.skipped++;
    }
  }

  return results;
}

/**
 * Busca el botón de submit del formulario
 */
export function findSubmitButton() {
  // Buscar por atributo type
  let button = document.querySelector('button[type="submit"]');
  if (button) return button;

  // Buscar por aria-label
  button = document.querySelector('button[aria-label*="Apply"]');
  if (button) return button;

  button = document.querySelector('button[aria-label*="Enviar"]');
  if (button) return button;

  // Buscar por texto
  const allButtons = document.querySelectorAll("button");
  for (const btn of allButtons) {
    const text = btn.textContent.toLowerCase();
    if (text.includes("apply") || text.includes("enviar") || text.includes("submit")) {
      return btn;
    }
  }

  return null;
}

/**
 * Envía el formulario
 */
export function submitForm() {
  const submitButton = findSubmitButton();

  if (!submitButton) {
    console.warn("[v0] Submit button not found");
    return false;
  }

  try {
    // Scroll a la vista del botón
    submitButton.scrollIntoView({ behavior: "smooth", block: "center" });

    // Esperar un poco para que el scroll termine
    setTimeout(() => {
      submitButton.click();
      console.log("[v0] Form submitted");
    }, 300);

    return true;
  } catch (error) {
    console.error("[v0] Error submitting form:", error);
    return false;
  }
}

/**
 * Valida que todos los campos requeridos estén rellenados
 */
export function validateForm(fields) {
  const missing = [];

  for (const field of fields) {
    if (field.required && field.type !== "file") {
      const element = document.querySelector(field.selector);
      if (!element || !element.value || element.value.trim() === "") {
        missing.push(field.label);
      }
    }
  }

  return {
    valid: missing.length === 0,
    missingFields: missing,
  };
}

/**
 * Ejecuta el flujo completo de auto-apply
 */
export async function executeAutoApply(profileData) {
  console.log("[v0] Starting LinkedIn Easy Apply auto-fill...");

  // Detectar modal
  const modal = detectEasyApplyModal();
  if (!modal) {
    console.error("[v0] Easy Apply modal not found");
    return { success: false, error: "Modal no detectado" };
  }

  // Extraer campos
  const fields = extractFormFields();
  if (fields.length === 0) {
    console.warn("[v0] No fields found in form");
    return { success: false, error: "No se encontraron campos en el formulario" };
  }

  console.log(`[v0] Found ${fields.length} form fields`);

  // Rellenar campos
  const fillResults = autoFillForm(fields, profileData);
  console.log(`[v0] Fill results:`, fillResults);

  // Validar campos requeridos
  const validation = validateForm(fields);
  if (!validation.valid) {
    console.warn("[v0] Missing required fields:", validation.missingFields);
    return {
      success: false,
      error: `Campos requeridos faltantes: ${validation.missingFields.join(", ")}`,
      filledFields: fillResults.filled,
    };
  }

  // Enviar formulario
  const submitted = submitForm();
  if (!submitted) {
    console.error("[v0] Failed to submit form");
    return { success: false, error: "No se pudo enviar el formulario" };
  }

  console.log("[v0] LinkedIn Easy Apply completed successfully");
  return {
    success: true,
    filledFields: fillResults.filled,
    skippedFields: fillResults.skipped,
  };
}

/**
 * Monitorea cambios en el DOM para detectar Easy Apply modales
 */
export function setupAutoApplyListener(profileData) {
  // Crear observer para detectar nuevos modales
  const observer = new MutationObserver((mutations) => {
    // Si se abre un modal Easy Apply, ejecutar auto-apply
    const modal = detectEasyApplyModal();
    if (modal) {
      console.log("[v0] Easy Apply modal detected, attempting auto-fill...");

      // Esperar a que el DOM se estabilice
      setTimeout(() => {
        executeAutoApply(profileData).catch((err) => {
          console.error("[v0] Auto-apply error:", err);
        });
      }, 500);

      // Desconectar observer después de ejecutarse
      observer.disconnect();
    }
  });

  // Iniciar observación
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
  });

  console.log("[v0] Auto-Apply listener activated");
  return observer;
}
