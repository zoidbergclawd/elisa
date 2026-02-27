import { describe, it, expect } from 'vitest';
import {
  sanitizePythonValue,
  escapePythonString,
  inferPlaceholderType,
  sanitizeReplacements,
} from './sanitizePythonValue.js';

describe('sanitizePythonValue', () => {
  // --- Number values ---

  describe('number values', () => {
    it('passes through integers', () => {
      expect(sanitizePythonValue(42)).toBe('42');
    });

    it('passes through floats', () => {
      expect(sanitizePythonValue(3.14)).toBe('3.14');
    });

    it('passes through zero', () => {
      expect(sanitizePythonValue(0)).toBe('0');
    });

    it('passes through negative numbers', () => {
      expect(sanitizePythonValue(-7)).toBe('-7');
    });

    it('rejects NaN with explicit number type', () => {
      expect(() => sanitizePythonValue(NaN, { type: 'number' }))
        .toThrow('not a finite number');
    });

    it('rejects Infinity with explicit number type', () => {
      expect(() => sanitizePythonValue(Infinity, { type: 'number' }))
        .toThrow('not a finite number');
    });

    it('rejects -Infinity with explicit number type', () => {
      expect(() => sanitizePythonValue(-Infinity, { type: 'number' }))
        .toThrow('not a finite number');
    });

    it('coerces numeric string when type is number', () => {
      expect(sanitizePythonValue('42', { type: 'number' })).toBe('42');
    });

    it('rejects non-numeric string when type is number', () => {
      expect(() => sanitizePythonValue('abc', { type: 'number' }))
        .toThrow('not a finite number');
    });
  });

  // --- Boolean values ---

  describe('boolean values', () => {
    it('converts true to Python True', () => {
      expect(sanitizePythonValue(true)).toBe('True');
    });

    it('converts false to Python False', () => {
      expect(sanitizePythonValue(false)).toBe('False');
    });

    it('converts truthy string with boolean type', () => {
      expect(sanitizePythonValue('yes', { type: 'boolean' })).toBe('True');
    });

    it('converts empty string with boolean type', () => {
      expect(sanitizePythonValue('', { type: 'boolean' })).toBe('False');
    });
  });

  // --- String values ---

  describe('string values', () => {
    it('passes through simple strings', () => {
      expect(sanitizePythonValue('hello', { type: 'string' })).toBe('hello');
    });

    it('escapes double quotes', () => {
      expect(sanitizePythonValue('say "hi"', { type: 'string' })).toBe('say \\"hi\\"');
    });

    it('escapes single quotes', () => {
      expect(sanitizePythonValue("it's", { type: 'string' })).toBe("it\\'s");
    });

    it('escapes backslashes', () => {
      expect(sanitizePythonValue('path\\to\\file', { type: 'string' })).toBe('path\\\\to\\\\file');
    });

    it('escapes newlines', () => {
      expect(sanitizePythonValue('line1\nline2', { type: 'string' })).toBe('line1\\nline2');
    });

    it('escapes carriage returns', () => {
      expect(sanitizePythonValue('line1\rline2', { type: 'string' })).toBe('line1\\rline2');
    });

    it('escapes tabs', () => {
      expect(sanitizePythonValue('col1\tcol2', { type: 'string' })).toBe('col1\\tcol2');
    });

    it('handles combined escapes', () => {
      expect(sanitizePythonValue('a"b\\c\nd', { type: 'string' })).toBe('a\\"b\\\\c\\nd');
    });
  });

  // --- Control character rejection ---

  describe('control characters', () => {
    it('rejects null byte', () => {
      expect(() => sanitizePythonValue('abc\x00def'))
        .toThrow('forbidden control characters');
    });

    it('rejects bell character', () => {
      expect(() => sanitizePythonValue('abc\x07def'))
        .toThrow('forbidden control characters');
    });

    it('rejects backspace', () => {
      expect(() => sanitizePythonValue('abc\x08def'))
        .toThrow('forbidden control characters');
    });

    it('rejects DEL character', () => {
      expect(() => sanitizePythonValue('abc\x7fdef'))
        .toThrow('forbidden control characters');
    });

    it('allows regular tab (0x09)', () => {
      // Tab is explicitly allowed (not in CONTROL_CHAR_RE), and gets escaped
      expect(sanitizePythonValue('a\tb', { type: 'string' })).toBe('a\\tb');
    });

    it('allows newline (0x0a)', () => {
      // Newline is explicitly allowed (not in CONTROL_CHAR_RE), and gets escaped
      expect(sanitizePythonValue('a\nb', { type: 'string' })).toBe('a\\nb');
    });

    it('allows carriage return (0x0d)', () => {
      // CR is explicitly allowed (not in CONTROL_CHAR_RE), and gets escaped
      expect(sanitizePythonValue('a\rb', { type: 'string' })).toBe('a\\rb');
    });
  });

  // --- Injection attempts ---

  describe('injection prevention', () => {
    it('escapes Python code injection via string concatenation', () => {
      const malicious = '"+__import__("os").system("rm -rf /")+"';
      const result = sanitizePythonValue(malicious, { type: 'string' });
      expect(result).toBe('\\"+__import__(\\"os\\").system(\\"rm -rf /\\")+\\"');
      // When placed inside quotes: "\"+ ... +\"" -- still a single string literal
    });

    it('escapes quote escaping attack', () => {
      const malicious = '\\"; import os; os.system("bad"); x="';
      const result = sanitizePythonValue(malicious, { type: 'string' });
      // Backslash is doubled, then quotes are escaped
      expect(result).toContain('\\\\');
      expect(result).toContain('\\"');
    });

    it('escapes newline injection', () => {
      const malicious = 'good\nimport os\nos.system("bad")';
      const result = sanitizePythonValue(malicious, { type: 'string' });
      expect(result).not.toContain('\n');
      expect(result).toContain('\\n');
    });

    it('handles triple-quote breakout attempt', () => {
      const malicious = '"""\nimport os\nos.system("bad")\n"""';
      const result = sanitizePythonValue(malicious, { type: 'string' });
      expect(result).not.toContain('\n');
      expect(result).toContain('\\"');
    });
  });

  // --- Null/undefined ---

  describe('null and undefined', () => {
    it('returns empty string for null', () => {
      expect(sanitizePythonValue(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(sanitizePythonValue(undefined)).toBe('');
    });
  });

  // --- Auto type inference ---

  describe('auto type inference', () => {
    it('treats JS number as numeric', () => {
      expect(sanitizePythonValue(7, { type: 'auto' })).toBe('7');
    });

    it('treats JS boolean as boolean', () => {
      expect(sanitizePythonValue(true, { type: 'auto' })).toBe('True');
    });

    it('treats JS string as string', () => {
      expect(sanitizePythonValue('hello', { type: 'auto' })).toBe('hello');
    });

    it('treats string containing only digits as string (auto)', () => {
      // When typeof is string and type is auto, it is treated as string, not coerced
      expect(sanitizePythonValue('42')).toBe('42');
    });
  });

  // --- Unicode ---

  describe('unicode', () => {
    it('passes through unicode characters', () => {
      expect(sanitizePythonValue('cafe\u0301', { type: 'string' })).toBe('cafe\u0301');
    });

    it('passes through CJK characters', () => {
      expect(sanitizePythonValue('\u4f60\u597d', { type: 'string' })).toBe('\u4f60\u597d');
    });

    it('passes through emoji', () => {
      expect(sanitizePythonValue('\ud83d\ude00', { type: 'string' })).toBe('\ud83d\ude00');
    });
  });
});

describe('escapePythonString', () => {
  it('escapes all dangerous characters', () => {
    expect(escapePythonString('a"b\'c\\d\ne\rf\tg'))
      .toBe('a\\"b\\\'c\\\\d\\ne\\rf\\tg');
  });

  it('returns empty string unchanged', () => {
    expect(escapePythonString('')).toBe('');
  });
});

describe('inferPlaceholderType', () => {
  it('returns string when placeholder is in double quotes', () => {
    expect(inferPlaceholderType('WIFI_SSID = "__WIFI_SSID__"', 'WIFI_SSID')).toBe('string');
  });

  it('returns string when placeholder is in single quotes', () => {
    expect(inferPlaceholderType("WIFI_PASS = '__WIFI_PASS__'", 'WIFI_PASS')).toBe('string');
  });

  it('returns auto when placeholder is bare', () => {
    expect(inferPlaceholderType('LORA_CHANNEL = __LORA_CHANNEL__', 'LORA_CHANNEL')).toBe('auto');
  });

  it('returns auto when placeholder is not found', () => {
    expect(inferPlaceholderType('nothing here', 'MISSING')).toBe('auto');
  });

  it('returns auto when only one side has a quote', () => {
    expect(inferPlaceholderType('x = "__PARTIAL__', 'PARTIAL')).toBe('auto');
  });
});

describe('sanitizeReplacements', () => {
  it('sanitizes a mix of quoted and bare placeholders', () => {
    const template = [
      'LORA_CHANNEL = __LORA_CHANNEL__',
      'WIFI_SSID = "__WIFI_SSID__"',
      'WIFI_PASS = "__WIFI_PASS__"',
    ].join('\n');

    const result = sanitizeReplacements(template, {
      LORA_CHANNEL: 7,
      WIFI_SSID: 'MyNetwork',
      WIFI_PASS: 'p@ss"word',
    });

    expect(result.LORA_CHANNEL).toBe('7');
    expect(result.WIFI_SSID).toBe('MyNetwork');
    expect(result.WIFI_PASS).toBe('p@ss\\"word');
  });

  it('sanitizes injection attempt in WiFi password', () => {
    const template = 'WIFI_PASS = "__WIFI_PASS__"';
    const result = sanitizeReplacements(template, {
      WIFI_PASS: '"+__import__("os").system("rm -rf /")+\"',
    });
    // The value should be safely escaped
    expect(result.WIFI_PASS).not.toContain('\n');
    expect(result.WIFI_PASS).toContain('\\"');
  });

  it('handles boolean values', () => {
    const template = 'ENABLED = __ENABLED__';
    const result = sanitizeReplacements(template, { ENABLED: true });
    expect(result.ENABLED).toBe('True');
  });

  it('handles null/undefined values', () => {
    const template = 'VAL = "__VAL__"';
    const result = sanitizeReplacements(template, { VAL: null });
    expect(result.VAL).toBe('');
  });
});
