import { LinkedInFormField, UserProfile } from '../types';

/**
 * LinkedIn Form Mapper Service
 * Detects form fields and maps user data to them
 */
export const linkedinFormMapper = {
  /**
   * Extract form fields from LinkedIn Easy Apply modal
   */
  extractFormFields(modalElement: HTMLElement): LinkedInFormField[] {
    const fields: LinkedInFormField[] = [];
    const formElements = modalElement.querySelectorAll('input, select, textarea');

    formElements.forEach((element, index) => {
      const field = this.parseFormElement(element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement);
      if (field) {
        field.id = `field_${index}`;
        fields.push(field);
      }
    });

    return fields;
  },

  /**
   * Parse a single form element
   */
  parseFormElement(
    element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  ): Partial<LinkedInFormField> | null {
    const type = element.getAttribute('type') || element.tagName.toLowerCase();
    const name = element.getAttribute('name') || element.id || element.placeholder || '';
    const label = this.extractLabel(element);
    const required = element.hasAttribute('required') || element.getAttribute('aria-required') === 'true';

    if (!name) return null;

    return {
      name,
      type: this.normalizeFieldType(type),
      label: label || name,
      required,
      placeholder: element.getAttribute('placeholder') || undefined,
    };
  },

  /**
   * Extract label text for form field
   */
  extractLabel(element: HTMLElement): string | null {
    // Try label element
    const id = element.id;
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) return label.textContent;
    }

    // Try aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // Try closest label
    const closestLabel = element.closest('label');
    if (closestLabel) return closestLabel.textContent;

    // Try placeholder
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) return placeholder;

    return null;
  },

  /**
   * Normalize form field type
   */
  normalizeFieldType(type: string): LinkedInFormField['type'] {
    const normalized = type.toLowerCase();
    if (normalized.includes('email')) return 'email';
    if (normalized.includes('tel') || normalized.includes('phone')) return 'phone';
    if (normalized.includes('file')) return 'file';
    if (normalized.includes('select')) return 'select';
    if (normalized.includes('textarea')) return 'textarea';
    if (normalized.includes('checkbox')) return 'checkbox';
    return 'text';
  },

  /**
   * Map user profile data to form fields
   */
  mapFieldValue(field: LinkedInFormField, profile: UserProfile): string | null {
    const fieldName = field.name.toLowerCase();
    const fieldLabel = (field.label || '').toLowerCase();

    // Email
    if (fieldName.includes('email') || fieldLabel.includes('email')) {
      return profile.email;
    }

    // Phone
    if (
      fieldName.includes('phone') ||
      fieldLabel.includes('phone') ||
      fieldName.includes('tel')
    ) {
      return profile.phone || '';
    }

    // Name
    if (fieldName.includes('name') || fieldLabel.includes('name')) {
      if (fieldName.includes('full') || fieldLabel.includes('full')) {
        return profile.name;
      }
    }

    // Location
    if (
      fieldName.includes('location') ||
      fieldLabel.includes('location') ||
      fieldName.includes('city')
    ) {
      return profile.location?.full || profile.location?.city || '';
    }

    // Country
    if (fieldName.includes('country') || fieldLabel.includes('country')) {
      return profile.location?.country || '';
    }

    // City
    if (fieldName.includes('city') || fieldLabel.includes('city')) {
      return profile.location?.city || '';
    }

    // State/Province
    if (
      fieldName.includes('state') ||
      fieldLabel.includes('state') ||
      fieldName.includes('province')
    ) {
      return profile.location?.state || '';
    }

    // Skills
    if (fieldName.includes('skill') || fieldLabel.includes('skill')) {
      return profile.skills.join(', ');
    }

    // Role/Position
    if (
      fieldName.includes('role') ||
      fieldLabel.includes('role') ||
      fieldName.includes('position')
    ) {
      return profile.role || '';
    }

    // Seniority
    if (
      fieldName.includes('level') ||
      fieldLabel.includes('level') ||
      fieldName.includes('seniority')
    ) {
      return profile.seniority || '';
    }

    return null;
  },

  /**
   * Fill form with mapped values
   */
  async fillFormWithProfile(
    modalElement: HTMLElement,
    profile: UserProfile
  ): Promise<number> {
    const fields = this.extractFormFields(modalElement);
    let filledCount = 0;

    for (const field of fields) {
      const value = this.mapFieldValue(field, profile);
      if (value) {
        const element = modalElement.querySelector(`[name="${field.name}"]`) as
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement
          | null;

        if (element) {
          element.value = value;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          element.dispatchEvent(new Event('input', { bubbles: true }));
          filledCount++;
        }
      }
    }

    return filledCount;
  },

  /**
   * Detect if a modal is LinkedIn Easy Apply
   */
  isLinkedInEasyApply(modalElement: HTMLElement): boolean {
    const text = modalElement.textContent || '';
    return (
      text.includes('Easy Apply') ||
      text.includes('application') ||
      modalElement.querySelector('form') !== null
    );
  },

  /**
   * Submit LinkedIn form
   */
  async submitForm(modalElement: HTMLElement): Promise<boolean> {
    const submitButton = modalElement.querySelector(
      'button[type="submit"], button[aria-label*="Submit"], button[aria-label*="Apply"]'
    ) as HTMLButtonElement | null;

    if (submitButton) {
      submitButton.click();
      return true;
    }

    // Fallback: find form and submit
    const form = modalElement.querySelector('form');
    if (form) {
      (form as HTMLFormElement).submit();
      return true;
    }

    return false;
  },
};
