/**
 * Sanitizes values before injecting them into MicroPython template files.
 * Prevents code injection via __PLACEHOLDER__ template replacements.
 */

/** Control characters (C0 range except tab) that must not appear in values. */
const CONTROL_CHAR_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

/**
 * Sanitize a value for safe injection into a MicroPython template.
 *
 * Template files use two patterns:
 *   - Bare:   `LORA_CHANNEL = __LORA_CHANNEL__`   (numeric)
 *   - Quoted: `WIFI_SSID = "__WIFI_SSID__"`        (string, already in quotes)
 *
 * For numeric placeholders the value is validated as a finite number and
 * returned as-is.  For string placeholders the value is escaped so it is
 * safe inside a Python string literal.  Booleans are converted to Python
 * True/False.
 *
 * Throws on values containing control characters.
 */
export function sanitizePythonValue(
  raw: unknown,
  opts?: { type?: 'string' | 'number' | 'boolean' | 'auto' },
): string {
  const type = opts?.type ?? 'auto';

  if (raw === null || raw === undefined) {
    return '';
  }

  // Boolean handling
  if (type === 'boolean' || (type === 'auto' && typeof raw === 'boolean')) {
    return raw ? 'True' : 'False';
  }

  const str = String(raw);

  // Reject control characters
  if (CONTROL_CHAR_RE.test(str)) {
    throw new Error(`Template value contains forbidden control characters`);
  }

  // Number handling
  if (type === 'number' || (type === 'auto' && typeof raw === 'number')) {
    const num = typeof raw === 'number' ? raw : Number(str);
    if (!Number.isFinite(num)) {
      throw new Error(`Template value is not a finite number: ${str}`);
    }
    return String(num);
  }

  // String handling: escape backslashes, quotes, and newlines
  if (type === 'string' || type === 'auto') {
    return escapePythonString(str);
  }

  return escapePythonString(str);
}

/**
 * Escape a string so it is safe inside a Python string literal.
 * Handles backslashes, single/double quotes, and newline characters.
 * The result does NOT include surrounding quotes -- templates already
 * provide them where needed.
 */
export function escapePythonString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Determines the appropriate type for a template placeholder based on
 * the context in the template.  If the placeholder appears inside quotes
 * (e.g., `"__KEY__"`), the value should be treated as a string.
 * If it appears bare (e.g., `= __KEY__`), infer from the raw value type.
 */
export function inferPlaceholderType(
  templateContent: string,
  key: string,
): 'string' | 'number' | 'auto' {
  const pattern = `__${key.toUpperCase()}__`;
  const idx = templateContent.indexOf(pattern);
  if (idx < 0) return 'auto';

  // Check if the placeholder is wrapped in quotes
  const before = idx > 0 ? templateContent[idx - 1] : '';
  const after = idx + pattern.length < templateContent.length
    ? templateContent[idx + pattern.length]
    : '';

  if ((before === '"' && after === '"') || (before === "'" && after === "'")) {
    return 'string';
  }

  return 'auto';
}

/**
 * Sanitize all replacement values for a template, inferring types from
 * the template content.  Returns a new record with sanitized string values.
 */
export function sanitizeReplacements(
  templateContent: string,
  replacements: Record<string, unknown>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(replacements)) {
    const type = inferPlaceholderType(templateContent, key);
    result[key] = sanitizePythonValue(raw, { type });
  }
  return result;
}
