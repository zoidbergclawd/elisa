/**
 * In-memory Knowledge Backpack for the Elisa Agent Runtime.
 *
 * Provides per-agent document storage, keyword search, and context
 * building for injection into agent prompts. Follows the same in-memory
 * Map pattern as agentStore.ts.
 *
 * V1: simple TF-IDF keyword search — no vector DB, no embeddings.
 */

import { randomUUID } from 'node:crypto';
import type { BackpackSource, SearchResult } from '../../models/runtime.js';

// ── TF-IDF Helpers ───────────────────────────────────────────────────

/** Tokenize text into lowercase words, stripping punctuation. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/**
 * Compute term frequency for each token in a document.
 * TF = (count of term) / (total terms in doc)
 */
function termFrequency(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const tf = new Map<string, number>();
  for (const [term, count] of counts) {
    tf.set(term, count / tokens.length);
  }
  return tf;
}

/**
 * Score a document against query terms using TF-IDF-like weighting.
 * IDF component: terms that appear in fewer documents get higher weight.
 */
function scoreTfIdf(
  queryTokens: string[],
  docTf: Map<string, number>,
  idf: Map<string, number>,
): number {
  let score = 0;
  for (const qt of queryTokens) {
    const tf = docTf.get(qt) ?? 0;
    const idfVal = idf.get(qt) ?? 0;
    score += tf * idfVal;
  }
  return score;
}

/**
 * Extract a snippet around the best-matching query term in the content.
 * Returns up to `maxLen` characters centered on the first match.
 */
function extractSnippet(
  content: string,
  queryTokens: string[],
  maxLen = 200,
): string {
  const lower = content.toLowerCase();
  let bestIdx = -1;

  for (const qt of queryTokens) {
    const idx = lower.indexOf(qt);
    if (idx !== -1) {
      bestIdx = idx;
      break;
    }
  }

  if (bestIdx === -1) {
    return content.slice(0, maxLen);
  }

  const half = Math.floor(maxLen / 2);
  const start = Math.max(0, bestIdx - half);
  const end = Math.min(content.length, start + maxLen);
  let snippet = content.slice(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';

  return snippet;
}

// ── Knowledge Backpack ───────────────────────────────────────────────

export class KnowledgeBackpack {
  private sources = new Map<string, BackpackSource[]>();

  /**
   * Add a knowledge source to an agent's backpack.
   * Returns the generated source ID.
   */
  addSource(
    agentId: string,
    source: Omit<BackpackSource, 'id' | 'added_at'>,
  ): string {
    const id = randomUUID();
    const entry: BackpackSource = {
      ...source,
      id,
      added_at: Date.now(),
    };

    const existing = this.sources.get(agentId) ?? [];
    existing.push(entry);
    this.sources.set(agentId, existing);

    return id;
  }

  /**
   * Remove a source from an agent's backpack.
   * Returns true if the source was found and removed.
   */
  removeSource(agentId: string, sourceId: string): boolean {
    const existing = this.sources.get(agentId);
    if (!existing) return false;

    const idx = existing.findIndex((s) => s.id === sourceId);
    if (idx === -1) return false;

    existing.splice(idx, 1);

    if (existing.length === 0) {
      this.sources.delete(agentId);
    }

    return true;
  }

  /**
   * Get all sources for an agent.
   */
  getSources(agentId: string): BackpackSource[] {
    return this.sources.get(agentId) ?? [];
  }

  /**
   * Search an agent's backpack sources by keyword using TF-IDF scoring.
   * Returns the top `limit` results sorted by relevance score.
   */
  search(agentId: string, query: string, limit = 5): SearchResult[] {
    const agentSources = this.sources.get(agentId);
    if (!agentSources || agentSources.length === 0) return [];

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    // Pre-tokenize all docs
    const docTokens = agentSources.map((s) =>
      tokenize(s.title + ' ' + s.content),
    );

    // Compute IDF: log(1 + N / (1 + count of docs containing term))
    // The +1 inside the log ensures single-document collections still score > 0
    const numDocs = agentSources.length;
    const idf = new Map<string, number>();
    for (const qt of queryTokens) {
      let docCount = 0;
      for (const tokens of docTokens) {
        if (tokens.includes(qt)) docCount++;
      }
      idf.set(qt, Math.log(1 + numDocs / (1 + docCount)));
    }

    // Score each source
    const scored: SearchResult[] = [];
    for (let i = 0; i < agentSources.length; i++) {
      const tf = termFrequency(docTokens[i]);
      const score = scoreTfIdf(queryTokens, tf, idf);

      if (score > 0) {
        scored.push({
          source_id: agentSources[i].id,
          title: agentSources[i].title,
          snippet: extractSnippet(agentSources[i].content, queryTokens),
          score,
        });
      }
    }

    // Sort by score descending, take top N
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /**
   * Build a context string from the top search results for an agent,
   * suitable for injection into an agent's prompt.
   *
   * Truncates to fit within `maxTokens` (estimated at 4 chars/token).
   */
  buildContext(agentId: string, query: string, maxTokens = 2000): string {
    const results = this.search(agentId, query, 5);
    if (results.length === 0) return '';

    const charsPerToken = 4;
    const maxChars = maxTokens * charsPerToken;

    const parts: string[] = ['--- Knowledge Backpack ---'];
    let totalChars = parts[0].length;

    for (const result of results) {
      // Find the full source content
      const agentSources = this.sources.get(agentId) ?? [];
      const source = agentSources.find((s) => s.id === result.source_id);
      if (!source) continue;

      const header = `\n[${source.title}]`;
      const content = source.content;
      const entry = header + '\n' + content;

      if (totalChars + entry.length > maxChars) {
        // Truncate this entry to fit
        const remaining = maxChars - totalChars - header.length - 1;
        if (remaining > 50) {
          parts.push(header + '\n' + content.slice(0, remaining) + '...');
        }
        break;
      }

      parts.push(entry);
      totalChars += entry.length;
    }

    return parts.join('\n');
  }

  /**
   * Delete all sources for an agent.
   */
  deleteAgent(agentId: string): boolean {
    return this.sources.delete(agentId);
  }

  /**
   * Get the total number of sources across all agents.
   */
  get totalSources(): number {
    let count = 0;
    for (const sources of this.sources.values()) {
      count += sources.length;
    }
    return count;
  }
}
