/** Registry for meeting type definitions and trigger engine. */

import type { MeetingType, TriggerCondition } from '../models/meeting.js';

export class MeetingRegistry {
  private types = new Map<string, MeetingType>();

  register(meetingType: MeetingType): void {
    if (this.types.has(meetingType.id)) {
      console.warn(`[MeetingRegistry] Overwriting meeting type "${meetingType.id}"`);
    }
    this.types.set(meetingType.id, meetingType);
  }

  getById(id: string): MeetingType | undefined {
    return this.types.get(id);
  }

  getAll(): MeetingType[] {
    return Array.from(this.types.values());
  }

  unregister(id: string): boolean {
    return this.types.delete(id);
  }

  get size(): number {
    return this.types.size;
  }
}

export interface TriggerMatch {
  meetingType: MeetingType;
  triggerCondition: TriggerCondition;
}

/**
 * Evaluates build events against registered meeting types to determine
 * if any meetings should be triggered.
 */
export class MeetingTriggerEngine {
  private registry: MeetingRegistry;

  constructor(registry: MeetingRegistry) {
    this.registry = registry;
  }

  /**
   * Check if any registered meeting types should be triggered by the given event.
   * Returns all matching meeting types (a single event may trigger multiple meetings).
   */
  evaluate(eventType: string, eventData: Record<string, unknown> = {}): TriggerMatch[] {
    const matches: TriggerMatch[] = [];

    for (const meetingType of this.registry.getAll()) {
      for (const condition of meetingType.triggerConditions) {
        if (condition.event !== eventType) continue;

        // If there's a filter function, it must return true
        if (condition.filter && !condition.filter(eventData)) continue;

        matches.push({ meetingType, triggerCondition: condition });
        // One match per meeting type is enough
        break;
      }
    }

    return matches;
  }
}
