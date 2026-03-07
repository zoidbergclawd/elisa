/** Registry for meeting type definitions and trigger engine. */

import type { MeetingType, TriggerCondition } from '../models/meeting.js';

/** Default trigger assignments for custom agents based on canvas type. */
const CANVAS_TYPE_TRIGGERS: Record<string, TriggerCondition[]> = {
  'explain-it': [{
    event: 'task_completed',
    filter: (data) => {
      const done = (data.tasks_done as number) ?? 0;
      const total = (data.tasks_total as number) ?? 1;
      return done >= Math.ceil(total * 0.4);
    },
  }],
  'blueprint': [{ event: 'session_complete' }],
  'campaign': [{
    event: 'task_completed',
    filter: (data) => {
      const done = (data.tasks_done as number) ?? 0;
      const total = (data.tasks_total as number) ?? 1;
      return done >= Math.ceil(total * 0.3);
    },
  }],
  'design-preview': [{
    event: 'task_starting',
    filter: (data) => {
      const text = `${(data.task_title as string) ?? ''} ${(data.task_description as string) ?? ''}`.toLowerCase();
      return /sprite|art|icon|theme|color|visual|image|background|animation|character|logo|avatar|portrait/.test(text);
    },
  }],
};

const DEFAULT_TRIGGER: TriggerCondition[] = [{
  event: 'task_completed',
  filter: (data) => {
    const done = (data.tasks_done as number) ?? 0;
    const total = (data.tasks_total as number) ?? 1;
    return done >= Math.ceil(total * 0.5);
  },
}];

export interface CustomMeetingSpec {
  name: string;
  persona: string;
  canvasType: string;
}

export class MeetingRegistry {
  private types = new Map<string, MeetingType>();
  /** Tracks dynamic type IDs per session for cleanup. */
  private dynamicTypes = new Map<string, string[]>();

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

  /**
   * Register custom (kid-defined) meeting types for a session.
   * Each gets a generated ID and trigger based on canvas type.
   * Returns the generated meeting type IDs.
   */
  registerDynamic(sessionId: string, specs: CustomMeetingSpec[]): string[] {
    const ids: string[] = [];
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const id = `custom-${sessionId}-${i}`;
      const triggers = CANVAS_TYPE_TRIGGERS[spec.canvasType] ?? DEFAULT_TRIGGER;

      this.register({
        id,
        name: spec.name,
        agentName: spec.name,
        canvasType: spec.canvasType,
        triggerConditions: triggers,
        persona: spec.persona,
      });
      ids.push(id);
    }

    this.dynamicTypes.set(sessionId, ids);
    return ids;
  }

  /**
   * Unregister all dynamic meeting types for a session.
   */
  unregisterDynamic(sessionId: string): void {
    const ids = this.dynamicTypes.get(sessionId);
    if (ids) {
      for (const id of ids) {
        this.unregister(id);
      }
      this.dynamicTypes.delete(sessionId);
    }
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
