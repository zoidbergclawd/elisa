import { describe, it, expect } from 'vitest';
import { MeetingRegistry, MeetingTriggerEngine } from './meetingRegistry.js';
import { ARCHITECTURE_AGENT_MEETING } from './architectureAgentMeeting.js';
import { ART_AGENT_MEETING } from './artAgentMeeting.js';
import { MEDIA_AGENT_MEETING } from './mediaAgentMeeting.js';
import { DOC_AGENT_MEETING } from './docAgentMeeting.js';
import { WEB_DESIGN_AGENT_MEETING } from './webDesignAgentMeeting.js';

describe('Meeting Trigger Changes', () => {
  let registry: MeetingRegistry;
  let engine: MeetingTriggerEngine;

  function setup() {
    registry = new MeetingRegistry();
    registry.register(ARCHITECTURE_AGENT_MEETING);
    registry.register(ART_AGENT_MEETING);
    registry.register(MEDIA_AGENT_MEETING);
    registry.register(DOC_AGENT_MEETING);
    registry.register(WEB_DESIGN_AGENT_MEETING);
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
    it('does NOT trigger on plan_ready (removed)', () => {
      setup();
      const matches = engine.evaluate('plan_ready', {
        device_types: ['box-3'],
      });
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).not.toContain('art-agent');
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

  describe('Media Agent (mid-build)', () => {
    it('triggers on task_completed at 25% progress', () => {
      setup();
      const matches = engine.evaluate('task_completed', { tasks_done: 1, tasks_total: 4 });
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).toContain('media-agent');
    });

    it('does NOT trigger on plan_ready (moved to task_completed)', () => {
      setup();
      const matches = engine.evaluate('plan_ready', {});
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).not.toContain('media-agent');
    });

    it('does NOT trigger on session_complete', () => {
      setup();
      const matches = engine.evaluate('session_complete', {});
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).not.toContain('media-agent');
    });
  });

  describe('Doc Agent (mid-build)', () => {
    it('triggers on task_completed at 50% progress', () => {
      setup();
      const matches = engine.evaluate('task_completed', { tasks_done: 2, tasks_total: 4 });
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).toContain('doc-agent');
    });

    it('does NOT trigger on deploy_started (moved to task_completed)', () => {
      setup();
      const matches = engine.evaluate('deploy_started', {});
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).not.toContain('doc-agent');
    });
  });

  describe('Web Design Agent (mid-build)', () => {
    it('triggers on task_completed at 60% with web target', () => {
      setup();
      const matches = engine.evaluate('task_completed', {
        tasks_done: 3, tasks_total: 5, deploy_target: 'web',
      });
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).toContain('web-design-agent');
    });

    it('does NOT trigger on deploy_started (moved to task_completed)', () => {
      setup();
      const matches = engine.evaluate('deploy_started', { target: 'web' });
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).not.toContain('web-design-agent');
    });
  });

  describe('no meetings fire at plan_ready', () => {
    it('plan_ready triggers no meetings at all', () => {
      setup();
      const matches = engine.evaluate('plan_ready', { task_count: 5, device_types: ['box-3'] });
      expect(matches).toHaveLength(0);
    });
  });

  describe('staggered mid-build meetings', () => {
    it('at 25% progress: only media fires', () => {
      setup();
      const matches = engine.evaluate('task_completed', {
        tasks_done: 1, tasks_total: 4, deploy_target: 'web',
      });
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).toContain('media-agent');
      expect(ids).not.toContain('doc-agent');
      expect(ids).not.toContain('web-design-agent');
    });

    it('at 50% progress: media and doc fire', () => {
      setup();
      const matches = engine.evaluate('task_completed', {
        tasks_done: 2, tasks_total: 4, deploy_target: 'web',
      });
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).toContain('media-agent');
      expect(ids).toContain('doc-agent');
      expect(ids).not.toContain('web-design-agent');
    });

    it('at 75% progress: media, doc, and web design fire (for web target)', () => {
      setup();
      const matches = engine.evaluate('task_completed', {
        tasks_done: 3, tasks_total: 4, deploy_target: 'web',
      });
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).toContain('media-agent');
      expect(ids).toContain('doc-agent');
      expect(ids).toContain('web-design-agent');
    });

    it('architecture fires on session_complete', () => {
      setup();
      const matches = engine.evaluate('session_complete', { tasks_done: 3 });
      const ids = matches.map(m => m.meetingType.id);
      expect(ids).toContain('architecture-agent');
    });
  });
});
