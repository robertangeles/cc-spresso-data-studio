import type { Layer } from './model-studio.schemas.js';

/**
 * Step 6 Direction A — layer-appropriate casing for entity / attribute
 * display names.
 *
 * The same underlying token (`employee_name`) surfaces differently per
 * layer so senior modellers reading the canvas get a visual cue about
 * which layer they're in without needing to check a chrome badge:
 *
 *   - physical   → `employee_name`  (snake_case, lowercase; DB-native)
 *   - logical    → `Employee Name`  (Title Case; domain vocabulary)
 *   - conceptual → `Employee name`  (Sentence case; business-readable)
 *
 * Underscores are treated as word separators at the logical and
 * conceptual layers (replaced with spaces). Physical preserves the
 * underscore because that is the literal column identifier.
 *
 * Returns `''` for null / undefined / empty inputs so UI code can
 * drop straight into `{casingForLayer(name, layer) || fallback}`
 * without guarding against empty strings on every call site.
 */
export function casingForLayer(name: string | null | undefined, layer: Layer): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed === '') return '';

  switch (layer) {
    case 'physical':
      return trimmed.toLowerCase();
    case 'logical':
      return titleCase(trimmed);
    case 'conceptual':
      return sentenceCase(trimmed);
    default:
      return trimmed;
  }
}

/** `employee_name` → `Employee Name`; `ORDER details` → `Order Details`. */
function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** `employee_name` → `Employee name`; `EMPLOYEE` → `Employee`. */
function sentenceCase(value: string): string {
  const spaced = value.replace(/_/g, ' ').trim().replace(/\s+/g, ' ');
  if (spaced === '') return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
