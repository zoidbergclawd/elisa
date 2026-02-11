import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { saveNuggetFile, loadNuggetFile } from './nuggetFile';
import type { Skill, Rule } from '../components/Skills/types';
import type { Portal } from '../components/Portals/types';

const workspace: Record<string, unknown> = {
  blocks: { languageVersion: 0, blocks: [{ type: 'nugget_goal', fields: { GOAL: 'test' } }] },
};

const skills: Skill[] = [
  { id: 's1', name: 'Debug Helper', prompt: 'Help debug', category: 'agent' },
];

const rules: Rule[] = [
  { id: 'r1', name: 'Lint', prompt: 'Run lint', trigger: 'always' },
];

const portals: Portal[] = [
  {
    id: 'p1',
    name: 'My ESP32',
    description: 'An ESP32 board',
    mechanism: 'serial',
    status: 'unconfigured',
    capabilities: [
      { id: 'led-on', name: 'LED on', kind: 'action', description: 'Turn LED on' },
    ],
    serialConfig: { baudRate: 115200, boardType: 'esp32' },
  },
];

// Helper: convert Blob to ArrayBuffer in jsdom (where Blob.arrayBuffer is unavailable)
function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

// Helper: create a File from a Blob that works in jsdom
function blobToFile(blob: Blob, name: string): File {
  return new File([blob], name);
}

describe('saveNuggetFile', () => {
  it('produces a zip with workspace.json, skills.json, rules.json, and portals.json', async () => {
    const blob = await saveNuggetFile(workspace, skills, rules, portals);
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));

    expect(zip.file('workspace.json')).not.toBeNull();
    expect(zip.file('skills.json')).not.toBeNull();
    expect(zip.file('rules.json')).not.toBeNull();
    expect(zip.file('portals.json')).not.toBeNull();

    const ws = JSON.parse(await zip.file('workspace.json')!.async('string'));
    expect(ws.blocks.blocks[0].type).toBe('nugget_goal');

    const sk = JSON.parse(await zip.file('skills.json')!.async('string'));
    expect(sk).toHaveLength(1);
    expect(sk[0].name).toBe('Debug Helper');

    const ru = JSON.parse(await zip.file('rules.json')!.async('string'));
    expect(ru).toHaveLength(1);
    expect(ru[0].name).toBe('Lint');

    const po = JSON.parse(await zip.file('portals.json')!.async('string'));
    expect(po).toHaveLength(1);
    expect(po[0].name).toBe('My ESP32');
  });

  it('includes output archive files under output/ when provided', async () => {
    const innerZip = new JSZip();
    innerZip.file('src/main.py', 'print("hello")');
    innerZip.file('tests/test_main.py', 'assert True');
    const archiveBlob = await innerZip.generateAsync({ type: 'blob' });

    const blob = await saveNuggetFile(workspace, skills, rules, portals, archiveBlob);
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));

    expect(zip.file('output/src/main.py')).not.toBeNull();
    expect(zip.file('output/tests/test_main.py')).not.toBeNull();

    const content = await zip.file('output/src/main.py')!.async('string');
    expect(content).toBe('print("hello")');
  });

  it('works with empty skills, rules, and portals arrays', async () => {
    const blob = await saveNuggetFile(workspace, [], [], []);
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));

    const sk = JSON.parse(await zip.file('skills.json')!.async('string'));
    expect(sk).toEqual([]);

    const ru = JSON.parse(await zip.file('rules.json')!.async('string'));
    expect(ru).toEqual([]);
  });
});

describe('loadNuggetFile', () => {
  it('round-trips workspace, skills, rules, and portals', async () => {
    const blob = await saveNuggetFile(workspace, skills, rules, portals);
    const file = blobToFile(blob, 'test.elisa');

    const result = await loadNuggetFile(file);

    expect(result.workspace).toEqual(workspace);
    expect(result.skills).toEqual(skills);
    expect(result.rules).toEqual(rules);
    expect(result.portals).toEqual(portals);
    expect(result.outputArchive).toBeUndefined();
  });

  it('round-trips output archive', async () => {
    const innerZip = new JSZip();
    innerZip.file('src/index.ts', 'console.log("hi")');
    const archiveBlob = await innerZip.generateAsync({ type: 'blob' });

    const blob = await saveNuggetFile(workspace, skills, rules, portals, archiveBlob);
    const file = blobToFile(blob, 'test.elisa');

    const result = await loadNuggetFile(file);
    expect(result.outputArchive).toBeDefined();

    const restored = await JSZip.loadAsync(await blobToArrayBuffer(result.outputArchive!));
    const content = await restored.file('src/index.ts')!.async('string');
    expect(content).toBe('console.log("hi")');
  });

  it('loads legacy .elisa files with project/ folder', async () => {
    const zip = new JSZip();
    zip.file('workspace.json', JSON.stringify(workspace));
    zip.file('skills.json', JSON.stringify(skills));
    zip.file('rules.json', JSON.stringify(rules));
    zip.file('portals.json', JSON.stringify(portals));
    zip.folder('project')!.file('src/main.py', 'print("legacy")');
    const blob = await zip.generateAsync({ type: 'blob' });
    const file = blobToFile(blob, 'legacy.elisa');

    const result = await loadNuggetFile(file);
    expect(result.outputArchive).toBeDefined();

    const restored = await JSZip.loadAsync(await blobToArrayBuffer(result.outputArchive!));
    const content = await restored.file('src/main.py')!.async('string');
    expect(content).toBe('print("legacy")');
  });

  it('throws on invalid zip (missing workspace.json)', async () => {
    const zip = new JSZip();
    zip.file('random.txt', 'not a nugget');
    const blob = await zip.generateAsync({ type: 'blob' });
    const file = blobToFile(blob, 'bad.elisa');

    await expect(loadNuggetFile(file)).rejects.toThrow('Invalid .elisa file: missing workspace.json');
  });

  it('defaults to empty arrays when skills.json, rules.json, and portals.json are missing', async () => {
    const zip = new JSZip();
    zip.file('workspace.json', JSON.stringify(workspace));
    const blob = await zip.generateAsync({ type: 'blob' });
    const file = blobToFile(blob, 'minimal.elisa');

    const result = await loadNuggetFile(file);
    expect(result.workspace).toEqual(workspace);
    expect(result.skills).toEqual([]);
    expect(result.rules).toEqual([]);
    expect(result.portals).toEqual([]);
  });
});
