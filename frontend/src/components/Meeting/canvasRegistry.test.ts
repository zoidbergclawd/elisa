import { describe, it, expect } from 'vitest';
import { registerCanvas, getCanvas, getRegisteredCanvasTypes } from './canvasRegistry';
import type { ComponentType } from 'react';
import type { CanvasProps } from './canvasRegistry';

// The canvasMap is module-level state. We need to re-import or clear between tests.
// Since it's a Map inside the module, we can work around it by using unique type names per test.

describe('canvasRegistry', () => {
  // Use unique type names to avoid cross-test pollution (module-level Map)
  let counter = 0;
  function uniqueType() {
    return `test-canvas-${counter++}-${Date.now()}`;
  }

  it('getCanvas returns null for unregistered type', () => {
    expect(getCanvas('nonexistent-type-xyz')).toBeNull();
  });

  it('registerCanvas and getCanvas round-trip', () => {
    const type = uniqueType();
    const MockComponent = (() => null) as unknown as ComponentType<CanvasProps>;
    registerCanvas(type, MockComponent);
    expect(getCanvas(type)).toBe(MockComponent);
  });

  it('overwrites registration for same type', () => {
    const type = uniqueType();
    const First = (() => 'first') as unknown as ComponentType<CanvasProps>;
    const Second = (() => 'second') as unknown as ComponentType<CanvasProps>;

    registerCanvas(type, First);
    expect(getCanvas(type)).toBe(First);

    registerCanvas(type, Second);
    expect(getCanvas(type)).toBe(Second);
  });

  it('getRegisteredCanvasTypes returns registered types', () => {
    const type1 = uniqueType();
    const type2 = uniqueType();
    const Mock = (() => null) as unknown as ComponentType<CanvasProps>;

    registerCanvas(type1, Mock);
    registerCanvas(type2, Mock);

    const types = getRegisteredCanvasTypes();
    expect(types).toContain(type1);
    expect(types).toContain(type2);
  });

  it('getRegisteredCanvasTypes returns array of strings', () => {
    const types = getRegisteredCanvasTypes();
    expect(Array.isArray(types)).toBe(true);
    for (const t of types) {
      expect(typeof t).toBe('string');
    }
  });

  it('multiple registrations produce unique entries in types list', () => {
    const type = uniqueType();
    const Mock = (() => null) as unknown as ComponentType<CanvasProps>;

    registerCanvas(type, Mock);
    registerCanvas(type, Mock); // re-register same type

    const types = getRegisteredCanvasTypes();
    const occurrences = types.filter(t => t === type).length;
    expect(occurrences).toBe(1); // Map keys are unique
  });
});
