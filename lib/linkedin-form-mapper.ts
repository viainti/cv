/**
 * linkedin-form-mapper.ts
 * Mapea y detecta campos de formularios en LinkedIn Easy Apply
 * Auto-rellenar y enviar formularios automáticamente
 */

export interface LinkedInField {
  id: string;
  name: string;
  type: "text" | "email" | "tel" | "textarea" | "select" | "checkbox" | "radio" | "file" | "date" | "unknown";
  required: boolean;
  label: string;
  placeholder?: string;
  options?: string[];
  currentValue?: string;
}

export interface LinkedInForm {
  id: string;
  fields: LinkedInField[];
  submitButtonSelector?: string;
  isEasyApply: boolean;
}

/**
 * Detecta si estamos en una página de aplicación LinkedIn Easy Apply
 */
export function isLinkedInEasyApply(): boolean {
  // Detectar modal Easy Apply de LinkedIn
  const easyApplyModal = document.querySelector(
    '[aria-label*="Apply"], [role="dialog"][aria-label*="Apply"], .artdeco-modal[aria-label*="application"]'
  );

  // Detectar por estructura de formulario
  const linkedInForm = document.querySelector('[data-test-id="easy-apply-modal"]');

  // Detectar por URL
  const isJobPage = window.location.href.includes("/jobs/view/");

  return !!(easyApplyModal || linkedInForm || isJobPage);
}

/**
 * Obtiene todos los campos de un formulario Easy Apply
 */
export function extractFormFields(formElement?: HTMLElement): LinkedInForm {
  const form = formElement || document.querySelector("form") || document;
  const fields: LinkedInField[] = [];

  // Buscar inputs
  const inputs = form.querySelectorAll<HTMLInputElement>("input");
  inputs.forEach((input, idx) => {
    if (!input.type || input.type === "hidden") return;

    const field: LinkedInField = {
      id: input.id || `input_${idx}`,
      name: input.name || `field_${idx}`,
      type: mapInputType(input.type),
      required: input.required,
      label: getFieldLabel(input),
      placeholder: input.placeholder,
      currentValue: input.value,
    };
    fields.push(field);
  });

  // Buscar selects
  const selects = form.querySelectorAll<HTMLSelectElement>("select");
  selects.forEach((select, idx) => {
    const field: LinkedInField = {
      id: select.id || `select_${idx}`,
      name: select.name || `field_${idx}`,
      type: "select",
      required: select.required,
      label: getFieldLabel(select),
      options: Array.from(select.options).map(o => o.value),
      currentValue: select.value,
    };
    fields.push(field);
  });

  // Buscar textareas
  const textareas = form.querySelectorAll<HTMLTextAreaElement>("textarea");
  textareas.forEach((textarea, idx) => {
    const field: LinkedInField = {
      id: textarea.id || `textarea_${idx}`,
      name: textarea.name || `field_${idx}`,
      type: "textarea",
      required: textarea.required,
      label: getFieldLabel(textarea),
      placeholder: textarea.placeholder,
      currentValue: textarea.value,
    };
    fields.push(field);
  });

  // Buscar checkboxes
  const checkboxes = form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  checkboxes.forEach((checkbox, idx) => {
    const field: LinkedInField = {
      id: checkbox.id || `checkbox_${idx}`,
      name: checkbox.name || `field_${idx}`,
      type: "checkbox",
      required: false,
      label: getFieldLabel(checkbox),
      currentValue: checkbox.checked ? "on" : "off",
    };
    fields.push(field);
  });

  // Buscar radios
  const radios = form.querySelectorAll<HTMLInputElement>('input[type="radio"]');
  radios.forEach((radio, idx) => {
    const field: LinkedInField = {
      id: radio.id || `radio_${idx}`,
      name: radio.name || `field_${idx}`,
      type: "radio",
      required: false,
      label: getFieldLabel(radio),
      currentValue: radio.checked ? radio.value : "",
    };
    fields.push(field);
  });

  // Buscar file inputs
  const fileInputs = form.querySelectorAll<HTMLInputElement>('input[type="file"]');
  fileInputs.forEach((fileInput, idx) => {
    const field: LinkedInField = {
      id: fileInput.id || `file_${idx}`,
      name: fileInput.name || `field_${idx}`,
      type: "file",
      required: fileInput.required,
      label: getFieldLabel(fileInput),
    };
    fields.push(field);
  });

  // Encontrar botón submit
  const submitButton = form.querySelector<HTMLButtonElement>(
    'button[type="submit"], [role="button"][aria-label*="Apply"], [role="button"][aria-label*="Enviar"]'
  );

  return {
    id: form.id || `form_${Date.now()}`,
    fields,
    submitButtonSelector: submitButton ? generateSelector(submitButton) : undefined,
    isEasyApply: isLinkedInEasyApply(),
  };
}

/**
 * Mapea un tipo de input HTML a tipo normalizado
 */
function mapInputType(htmlType: string): LinkedInField["type"] {
  const typeMap: Record<string, LinkedInField["type"]> = {
    "text": "text",
    "email": "email",
    "tel": "tel",
    "number": "text",
    "date": "date",
    "datetime-local": "date",
    "checkbox": "checkbox",
    "radio": "radio",
    "file": "file",
    "textarea": "textarea",
  };
  return typeMap[htmlType] || "unknown";
}

/**
 * Obtiene el label de un campo
 */
function getFieldLabel(element: HTMLElement): string {
  // Buscar label asociado
  const label = element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
    ? document.querySelector(`label[for="${element.id}"]`)
    : null;

  if (label) {
    return label.textContent?.trim() || "";
  }

  // Buscar placeholder
  if ("placeholder" in element && element.placeholder) {
    return element.placeholder;
  }

  // Buscar title
  if (element.title) {
    return element.title;
  }

  // Buscar aria-label
  if (element.getAttribute("aria-label")) {
    return element.getAttribute("aria-label") || "";
  }

  // Buscar en texto anterior
  let text = element.previousElementSibling?.textContent?.trim() || "";
  if (!text && element.parentElement) {
    text = element.parentElement.textContent?.trim() || "";
  }

  return text || element.name || "field";
}

/**
 * Genera un selector CSS para un elemento
 */
function generateSelector(element: HTMLElement): string {
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  let selector = element.tagName.toLowerCase();
  const classes = Array.from(element.classList).join(".");
  if (classes) {
    selector += `.${classes}`;
  }

  if (element.name) {
    selector += `[name="${CSS.escape(element.name)}"]`;
  }

  return selector;
}

/**
 * Rellena un campo con un valor
 */
export function fillField(field: LinkedInField, value: any): boolean {
  try {
    const element = document.getElementById(field.id) ||
      document.querySelector(`[name="${CSS.escape(field.name)}"]`);

    if (!element) {
      console.warn(`[v0] Field not found: ${field.id}`);
      return false;
    }

    if (element instanceof HTMLInputElement) {
      if (element.type === "checkbox") {
        element.checked = !!value;
      } else if (element.type === "radio") {
        element.checked = element.value === value;
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
    console.error(`[v0] Error filling field ${field.id}:`, error);
    return false;
  }
}

/**
 * Intenta rellenar múltiples campos basado en mapping de datos
 */
export function fillMultipleFields(
  form: LinkedInForm,
  data: Record<string, any>
): { success: number; failed: number; errors: string[] } {
  const result = { success: 0, failed: 0, errors: [] };

  for (const field of form.fields) {
    // Buscar coincidencias en data
    let value: any = null;

    // Coincidencia exacta
    if (field.name in data) {
      value = data[field.name];
    }
    // Coincidencia por label
    else if (field.label.toLowerCase().includes("email")) {
      value = data.email || data.userEmail;
    }
    else if (field.label.toLowerCase().includes("phone") || field.label.toLowerCase().includes("teléfono")) {
      value = data.phone || data.userPhone;
    }
    else if (field.label.toLowerCase().includes("name") || field.label.toLowerCase().includes("nombre")) {
      value = data.name || data.fullName || data.firstName;
    }
    else if (field.label.toLowerCase().includes("city") || field.label.toLowerCase().includes("ciudad")) {
      value = data.city;
    }
    else if (field.label.toLowerCase().includes("country") || field.label.toLowerCase().includes("país")) {
      value = data.country;
    }

    if (value !== null && value !== undefined) {
      const success = fillField(field, value);
      if (success) {
        result.success++;
      } else {
        result.failed++;
        result.errors.push(`Failed to fill: ${field.label}`);
      }
    }
  }

  return result;
}

/**
 * Simula un click en el botón submit
 */
export function submitForm(form: LinkedInForm): boolean {
  try {
    const submitButton = form.submitButtonSelector
      ? document.querySelector<HTMLButtonElement>(form.submitButtonSelector)
      : document.querySelector<HTMLButtonElement>('button[type="submit"]');

    if (submitButton) {
      submitButton.click();
      return true;
    }

    console.warn("[v0] Submit button not found");
    return false;
  } catch (error) {
    console.error("[v0] Error submitting form:", error);
    return false;
  }
}

/**
 * Valida que todos los campos requeridos estén rellenados
 */
export function validateForm(form: LinkedInForm): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];

  for (const field of form.fields) {
    if (field.required) {
      const element = document.getElementById(field.id) ||
        document.querySelector(`[name="${CSS.escape(field.name)}"]`);

      if (!element) {
        missingFields.push(field.label);
        continue;
      }

      let isEmpty = false;

      if (element instanceof HTMLInputElement) {
        isEmpty = !element.value;
      } else if (element instanceof HTMLSelectElement) {
        isEmpty = !element.value;
      } else if (element instanceof HTMLTextAreaElement) {
        isEmpty = !element.value;
      }

      if (isEmpty) {
        missingFields.push(field.label);
      }
    }
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Detecta qué campos son opcionales vs requeridos
 */
export function categorizeFields(form: LinkedInForm): {
  required: LinkedInField[];
  optional: LinkedInField[];
} {
  return {
    required: form.fields.filter(f => f.required),
    optional: form.fields.filter(f => !f.required),
  };
}
