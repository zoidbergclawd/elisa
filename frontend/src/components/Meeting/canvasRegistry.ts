/** Registry for meeting canvas components. */

import type { ComponentType } from 'react';

export interface CanvasProps {
  meetingId: string;
  canvasState: { type: string; data: Record<string, unknown> };
  onCanvasUpdate: (data: Record<string, unknown>) => void;
  onMaterialize?: (data: Record<string, unknown>) => Promise<{ files: string[]; primaryFile: string } | null>;
}

const canvasMap = new Map<string, ComponentType<CanvasProps>>();

/**
 * Register a canvas component for a given canvas type.
 * Downstream meeting implementations call this to add their specialized canvases.
 */
export function registerCanvas(type: string, component: ComponentType<CanvasProps>): void {
  canvasMap.set(type, component);
}

/**
 * Get the canvas component for a given type, or null if not registered.
 */
export function getCanvas(type: string): ComponentType<CanvasProps> | null {
  return canvasMap.get(type) ?? null;
}

/**
 * Get all registered canvas types.
 */
export function getRegisteredCanvasTypes(): string[] {
  return Array.from(canvasMap.keys());
}
