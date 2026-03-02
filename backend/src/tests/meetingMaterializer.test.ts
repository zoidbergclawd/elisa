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
    expect(result!.primaryFile).toBe('design/starfield-design.json');
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

describe('materialize subdirectory organization', () => {
  it('explain-it writes to docs/ subdirectory', () => {
    const dir = makeTmpDir();
    const result = materialize('explain-it', { title: 'My Guide', content: 'Hello world' }, dir);
    expect(result).not.toBeNull();
    expect(result!.primaryFile).toBe('docs/my-guide.md');
    expect(fs.existsSync(path.join(dir, 'docs', 'my-guide.md'))).toBe(true);
  });

  it('launch-pad writes to web/ subdirectory', () => {
    const dir = makeTmpDir();
    const result = materialize('launch-pad', { headline: 'Test', description: 'A test' }, dir);
    expect(result).not.toBeNull();
    expect(result!.primaryFile).toBe('web/launch-page.html');
    expect(fs.existsSync(path.join(dir, 'web', 'launch-page.html'))).toBe(true);
  });

  it('campaign writes to marketing/ subdirectory', () => {
    const dir = makeTmpDir();
    const result = materialize('campaign', { poster_title: 'Big Launch', headline: 'Wow', tagline: 'Cool' }, dir);
    expect(result).not.toBeNull();
    expect(result!.files).toContain('marketing/poster.html');
    expect(result!.files).toContain('marketing/social-card.html');
    expect(fs.existsSync(path.join(dir, 'marketing', 'poster.html'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'marketing', 'social-card.html'))).toBe(true);
  });

  it('design-preview writes to design/ subdirectory', () => {
    const dir = makeTmpDir();
    const result = materialize('design-preview', { scene_title: 'Ship', elements: [] }, dir);
    expect(result).not.toBeNull();
    expect(result!.primaryFile).toBe('design/ship-design.json');
    expect(fs.existsSync(path.join(dir, 'design', 'ship-design.json'))).toBe(true);
  });

  it('theme-picker writes to design/ subdirectory', () => {
    const dir = makeTmpDir();
    const result = materialize('theme-picker', { currentTheme: 'forest' }, dir);
    expect(result).not.toBeNull();
    expect(result!.primaryFile).toBe('design/theme-config.json');
    expect(fs.existsSync(path.join(dir, 'design', 'theme-config.json'))).toBe(true);
  });

  it('interface-designer writes to design/ subdirectory', () => {
    const dir = makeTmpDir();
    const result = materialize('interface-designer', { provides: [], requires: [] }, dir);
    expect(result).not.toBeNull();
    expect(result!.primaryFile).toBe('design/interfaces.json');
    expect(fs.existsSync(path.join(dir, 'design', 'interfaces.json'))).toBe(true);
  });
});

describe('materialize returns null for unsupported types', () => {
  it('returns null for blueprint', () => {
    const dir = makeTmpDir();
    expect(materialize('blueprint', { tasks: [] }, dir)).toBeNull();
  });
});
