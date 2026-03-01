import { describe, it, expect } from 'vitest';
import { MeetingRegistry, MeetingTriggerEngine } from './meetingRegistry.js';
import { ARCHITECTURE_AGENT_MEETING } from './architectureAgentMeeting.js';
import { ART_AGENT_MEETING } from './artAgentMeeting.js';
import { MEDIA_AGENT_MEETING } from './mediaAgentMeeting.js';

describe('Meeting Trigger Changes', () => {
  let registry: MeetingRegistry;
  let engine: MeetingTriggerEngine;

  function setup() {
    registry = new MeetingRegistry();
    registry.register(ARCHITECTURE_AGENT_MEETING);
    registry.register(ART_AGENT_MEETING);
    registry.register(MEDIA_AGENT_MEETING);
    engine = new MeetingTriggerEngine(registry);
  }

  describe('Architecture Agent', () => {
    it('triggers on session_complete', () => {
      setup();
      const matches = engine.evaluate('session_complete', { tasks_done: 3 });
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).toContain('architecture-agent');
    });

    it('does NOT trigger on plan_ready', () => {
      setup();
      const matches = engine.evaluate('plan_ready', { task_count: 3 });
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).not.toContain('architecture-agent');
    });
  });

  describe('Art Agent', () => {
    it('triggers on plan_ready when BOX-3 is in device_types', () => {
      setup();
      const matches = engine.evaluate('plan_ready', {
        device_types: ['box-3'],
      });
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).toContain('art-agent');
    });

    it('does NOT trigger on plan_ready without BOX-3', () => {
      setup();
      const matches = engine.evaluate('plan_ready', {
        device_types: ['esp32-s3'],
      });
      const artMatch = matches.find(m => m.meetingType.id === 'art-agent');
      expect(artMatch).toBeUndefined();
    });

    it('still triggers on deploy_started with BOX-3 devices', () => {
      setup();
      const matches = engine.evaluate('deploy_started', {
        devices: [{ type: 'box-3' }],
      });
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).toContain('art-agent');
    });
  });

  describe('Media Agent', () => {
    it('triggers on plan_ready', () => {
      setup();
      const matches = engine.evaluate('plan_ready', {});
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).toContain('media-agent');
    });

    it('does NOT trigger on session_complete', () => {
      setup();
      const matches = engine.evaluate('session_complete', {});
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).not.toContain('media-agent');
    });
  });

  describe('plan_ready triggers multiple meetings', () => {
    it('media fires on plan_ready (architecture no longer does)', () => {
      setup();
      const matches = engine.evaluate('plan_ready', { task_count: 5 });
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).not.toContain('architecture-agent');
      expect(ids).toContain('media-agent');
    });

    it('media + art fire on plan_ready with BOX-3 (architecture does not)', () => {
      setup();
      const matches = engine.evaluate('plan_ready', {
        device_types: ['box-3'],
      });
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).not.toContain('architecture-agent');
      expect(ids).toContain('media-agent');
      expect(ids).toContain('art-agent');
    });

    it('architecture fires on session_complete', () => {
      setup();
      const matches = engine.evaluate('session_complete', { tasks_done: 3 });
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).toContain('architecture-agent');
    });
  });
});
