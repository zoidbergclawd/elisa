/** Tests for KnowledgeBackpack: add/remove/list sources, keyword search, context building. */

import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeBackpack } from '../../services/runtime/knowledgeBackpack.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeSource(overrides: Record<string, any> = {}) {
  return {
    title: 'Dinosaur Facts',
    content:
      'Tyrannosaurus Rex was one of the largest land predators. It lived during the late Cretaceous period about 68 million years ago. T-Rex had powerful jaws and tiny arms.',
    source_type: 'manual' as const,
    ...overrides,
  };
}

// ── KnowledgeBackpack ────────────────────────────────────────────────

describe('KnowledgeBackpack', () => {
  let backpack: KnowledgeBackpack;
  const agentA = 'agent-aaa';
  const agentB = 'agent-bbb';

  beforeEach(() => {
    backpack = new KnowledgeBackpack();
  });

  // ── addSource ────────────────────────────────────────────────────

  describe('addSource', () => {
    it('returns a UUID source id', () => {
      const id = backpack.addSource(agentA, makeSource());
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('stores the source with correct fields', () => {
      const id = backpack.addSource(agentA, makeSource({ uri: 'https://example.com' }));
      const sources = backpack.getSources(agentA);

      expect(sources).toHaveLength(1);
      expect(sources[0].id).toBe(id);
      expect(sources[0].title).toBe('Dinosaur Facts');
      expect(sources[0].source_type).toBe('manual');
      expect(sources[0].uri).toBe('https://example.com');
      expect(sources[0].added_at).toBeGreaterThan(0);
    });

    it('allows multiple sources for the same agent', () => {
      backpack.addSource(agentA, makeSource());
      backpack.addSource(agentA, makeSource({ title: 'Planet Facts' }));

      expect(backpack.getSources(agentA)).toHaveLength(2);
    });

    it('increments totalSources', () => {
      expect(backpack.totalSources).toBe(0);
      backpack.addSource(agentA, makeSource());
      expect(backpack.totalSources).toBe(1);
      backpack.addSource(agentB, makeSource());
      expect(backpack.totalSources).toBe(2);
    });
  });

  // ── removeSource ─────────────────────────────────────────────────

  describe('removeSource', () => {
    it('removes an existing source', () => {
      const id = backpack.addSource(agentA, makeSource());
      expect(backpack.removeSource(agentA, id)).toBe(true);
      expect(backpack.getSources(agentA)).toHaveLength(0);
    });

    it('returns false for non-existent source', () => {
      backpack.addSource(agentA, makeSource());
      expect(backpack.removeSource(agentA, 'nonexistent')).toBe(false);
    });

    it('returns false for non-existent agent', () => {
      expect(backpack.removeSource('no-agent', 'no-source')).toBe(false);
    });

    it('cleans up empty agent entries', () => {
      const id = backpack.addSource(agentA, makeSource());
      backpack.removeSource(agentA, id);
      expect(backpack.totalSources).toBe(0);
    });

    it('only removes the targeted source', () => {
      const id1 = backpack.addSource(agentA, makeSource({ title: 'Source 1' }));
      backpack.addSource(agentA, makeSource({ title: 'Source 2' }));

      backpack.removeSource(agentA, id1);
      const remaining = backpack.getSources(agentA);

      expect(remaining).toHaveLength(1);
      expect(remaining[0].title).toBe('Source 2');
    });
  });

  // ── getSources ───────────────────────────────────────────────────

  describe('getSources', () => {
    it('returns empty array for agent with no sources', () => {
      expect(backpack.getSources('unknown-agent')).toEqual([]);
    });

    it('returns all sources for the specified agent', () => {
      backpack.addSource(agentA, makeSource({ title: 'A1' }));
      backpack.addSource(agentA, makeSource({ title: 'A2' }));
      backpack.addSource(agentB, makeSource({ title: 'B1' }));

      const agentASources = backpack.getSources(agentA);
      expect(agentASources).toHaveLength(2);
      expect(agentASources.map((s) => s.title)).toEqual(['A1', 'A2']);
    });
  });

  // ── Multiple agents isolation ────────────────────────────────────

  describe('agent isolation', () => {
    it('keeps sources separate across agents', () => {
      backpack.addSource(agentA, makeSource({ title: 'Dinos' }));
      backpack.addSource(agentB, makeSource({ title: 'Planets' }));

      expect(backpack.getSources(agentA)).toHaveLength(1);
      expect(backpack.getSources(agentA)[0].title).toBe('Dinos');

      expect(backpack.getSources(agentB)).toHaveLength(1);
      expect(backpack.getSources(agentB)[0].title).toBe('Planets');
    });

    it('removing a source from one agent does not affect another', () => {
      const idA = backpack.addSource(agentA, makeSource());
      backpack.addSource(agentB, makeSource());

      backpack.removeSource(agentA, idA);

      expect(backpack.getSources(agentA)).toHaveLength(0);
      expect(backpack.getSources(agentB)).toHaveLength(1);
    });

    it('search only returns results from the queried agent', () => {
      backpack.addSource(agentA, makeSource({ content: 'Dinosaurs roamed the earth' }));
      backpack.addSource(agentB, makeSource({ content: 'Mars is the red planet' }));

      const results = backpack.search(agentA, 'dinosaurs');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Dinosaur Facts');
    });
  });

  // ── search ───────────────────────────────────────────────────────

  describe('search', () => {
    it('returns empty array when agent has no sources', () => {
      expect(backpack.search('empty-agent', 'anything')).toEqual([]);
    });

    it('returns empty array for empty query', () => {
      backpack.addSource(agentA, makeSource());
      expect(backpack.search(agentA, '')).toEqual([]);
    });

    it('returns empty array when no sources match the query', () => {
      backpack.addSource(agentA, makeSource({ content: 'Only about dinosaurs' }));
      expect(backpack.search(agentA, 'quantum physics')).toEqual([]);
    });

    it('finds sources matching a keyword', () => {
      backpack.addSource(agentA, makeSource());
      const results = backpack.search(agentA, 'Tyrannosaurus');

      expect(results).toHaveLength(1);
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].title).toBe('Dinosaur Facts');
    });

    it('returns results sorted by relevance score (highest first)', () => {
      backpack.addSource(agentA, makeSource({
        title: 'T-Rex Deep Dive',
        content: 'Tyrannosaurus Rex Rex Rex was very large. Tyrannosaurus was a predator.',
      }));
      backpack.addSource(agentA, makeSource({
        title: 'Random Dino Note',
        content: 'Some dinosaurs were herbivores. Tyrannosaurus was not one of them.',
      }));

      const results = backpack.search(agentA, 'Tyrannosaurus');

      expect(results.length).toBeGreaterThanOrEqual(1);
      // First result should be the one with higher term frequency
      expect(results[0].title).toBe('T-Rex Deep Dive');
    });

    it('respects the limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        backpack.addSource(agentA, makeSource({
          title: `Source ${i}`,
          content: `This document is about dinosaurs, topic number ${i}`,
        }));
      }

      const results = backpack.search(agentA, 'dinosaurs', 3);
      expect(results).toHaveLength(3);
    });

    it('returns snippet in the search result', () => {
      backpack.addSource(agentA, makeSource());
      const results = backpack.search(agentA, 'Cretaceous');

      expect(results).toHaveLength(1);
      expect(results[0].snippet).toBeTruthy();
      expect(results[0].snippet.toLowerCase()).toContain('cretaceous');
    });

    it('each result includes source_id, title, snippet, and score', () => {
      backpack.addSource(agentA, makeSource());
      const results = backpack.search(agentA, 'predators');

      expect(results).toHaveLength(1);
      const r = results[0];
      expect(r).toHaveProperty('source_id');
      expect(r).toHaveProperty('title');
      expect(r).toHaveProperty('snippet');
      expect(r).toHaveProperty('score');
      expect(typeof r.score).toBe('number');
    });

    it('handles multi-word queries', () => {
      backpack.addSource(agentA, makeSource({
        content: 'The Cretaceous period ended with a mass extinction event.',
      }));
      const results = backpack.search(agentA, 'Cretaceous extinction');

      expect(results).toHaveLength(1);
      expect(results[0].score).toBeGreaterThan(0);
    });
  });

  // ── buildContext ─────────────────────────────────────────────────

  describe('buildContext', () => {
    it('returns empty string when no sources match', () => {
      backpack.addSource(agentA, makeSource({ content: 'Only about dinosaurs' }));
      const ctx = backpack.buildContext(agentA, 'quantum physics');
      expect(ctx).toBe('');
    });

    it('returns empty string for agent with no sources', () => {
      const ctx = backpack.buildContext('empty-agent', 'anything');
      expect(ctx).toBe('');
    });

    it('includes backpack header', () => {
      backpack.addSource(agentA, makeSource());
      const ctx = backpack.buildContext(agentA, 'dinosaur');
      expect(ctx).toContain('Knowledge Backpack');
    });

    it('includes source title in brackets', () => {
      backpack.addSource(agentA, makeSource());
      const ctx = backpack.buildContext(agentA, 'dinosaur');
      expect(ctx).toContain('[Dinosaur Facts]');
    });

    it('includes source content', () => {
      backpack.addSource(agentA, makeSource());
      const ctx = backpack.buildContext(agentA, 'Tyrannosaurus');
      expect(ctx).toContain('Tyrannosaurus Rex');
    });

    it('truncates output to respect maxTokens', () => {
      // Add a large source
      const longContent = 'dinosaur '.repeat(5000);
      backpack.addSource(agentA, makeSource({ content: longContent }));

      const ctx = backpack.buildContext(agentA, 'dinosaur', 100);
      // 100 tokens * 4 chars = 400 chars max
      expect(ctx.length).toBeLessThanOrEqual(500); // small buffer for header/formatting
    });

    it('includes multiple matching sources', () => {
      backpack.addSource(agentA, makeSource({
        title: 'T-Rex Facts',
        content: 'T-Rex was a large dinosaur predator.',
      }));
      backpack.addSource(agentA, makeSource({
        title: 'Velociraptor Facts',
        content: 'Velociraptor was a small dinosaur predator with claws.',
      }));

      const ctx = backpack.buildContext(agentA, 'dinosaur predator');
      expect(ctx).toContain('[T-Rex Facts]');
      expect(ctx).toContain('[Velociraptor Facts]');
    });
  });

  // ── deleteAgent ──────────────────────────────────────────────────

  describe('deleteAgent', () => {
    it('removes all sources for an agent', () => {
      backpack.addSource(agentA, makeSource({ title: 'S1' }));
      backpack.addSource(agentA, makeSource({ title: 'S2' }));

      expect(backpack.deleteAgent(agentA)).toBe(true);
      expect(backpack.getSources(agentA)).toEqual([]);
      expect(backpack.totalSources).toBe(0);
    });

    it('returns false for non-existent agent', () => {
      expect(backpack.deleteAgent('no-such-agent')).toBe(false);
    });

    it('does not affect other agents', () => {
      backpack.addSource(agentA, makeSource());
      backpack.addSource(agentB, makeSource());

      backpack.deleteAgent(agentA);

      expect(backpack.getSources(agentB)).toHaveLength(1);
    });
  });
});
