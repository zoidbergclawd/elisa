import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { materialize, getMaterializableTypes } from '../services/meetingMaterializer.js';

let tmpDir: string;

function makeTmpDir(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'materializer-test-'));
  return tmpDir;
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('getMaterializableTypes', () => {
  it('includes design-preview', () => {
    expect(getMaterializableTypes()).toContain('design-preview');
  });

  it('does not include blueprint or bug-detective', () => {
    const types = getMaterializableTypes();
    expect(types).not.toContain('blueprint');
    expect(types).not.toContain('bug-detective');
  });
});

describe('materialize design-preview', () => {
  it('writes a JSON file with basic fields', () => {
    const dir = makeTmpDir();
    const result = materialize('design-preview', {
      scene_title: 'Starfield',
      description: 'A scrolling starfield',
      background: '#0a0a2e',
      palette: ['#fff', '#00f'],
      elements: [
        { name: 'Stars', description: 'Twinkling dots' },
      ],
    }, dir);

    expect(result).not.toBeNull();
    expect(result!.primaryFile).toBe('starfield-design.json');
    expect(result!.files).toHaveLength(1);

    const content = JSON.parse(fs.readFileSync(path.join(dir, result!.primaryFile), 'utf-8'));
    expect(content.scene_title).toBe('Starfield');
    expect(content.description).toBe('A scrolling starfield');
    expect(content.background).toBe('#0a0a2e');
    expect(content.palette).toEqual(['#fff', '#00f']);
    expect(content.elements).toHaveLength(1);
    expect(content.elements[0].name).toBe('Stars');
    expect(content.exported_at).toBeTruthy();
  });

  it('persists color field on elements when present', () => {
    const dir = makeTmpDir();
    const result = materialize('design-preview', {
      scene_title: 'Test',
      elements: [
        { name: 'Ship', description: 'A spaceship', color: '#00ff88' },
        { name: 'Rock', description: 'An asteroid' },
      ],
    }, dir);

    const content = JSON.parse(fs.readFileSync(path.join(dir, result!.primaryFile), 'utf-8'));
    expect(content.elements[0].color).toBe('#00ff88');
    expect(content.elements[1].color).toBeUndefined();
  });

  it('persists draw field on elements when present', () => {
    const dir = makeTmpDir();
    const drawCode = "ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);";
    const result = materialize('design-preview', {
      scene_title: 'Test',
      elements: [
        { name: 'BG', description: 'Background', draw: drawCode },
        { name: 'Plain', description: 'No draw code' },
      ],
    }, dir);

    const content = JSON.parse(fs.readFileSync(path.join(dir, result!.primaryFile), 'utf-8'));
    expect(content.elements[0].draw).toBe(drawCode);
    expect(content.elements[1].draw).toBeUndefined();
  });

  it('omits color and draw when empty strings', () => {
    const dir = makeTmpDir();
    const result = materialize('design-preview', {
      scene_title: 'Test',
      elements: [
        { name: 'A', description: 'B', color: '', draw: '' },
      ],
    }, dir);

    const content = JSON.parse(fs.readFileSync(path.join(dir, result!.primaryFile), 'utf-8'));
    expect(content.elements[0].color).toBeUndefined();
    expect(content.elements[0].draw).toBeUndefined();
  });
});

describe('materialize returns null for unsupported types', () => {
  it('returns null for blueprint', () => {
    const dir = makeTmpDir();
    expect(materialize('blueprint', { tasks: [] }, dir)).toBeNull();
  });
});
