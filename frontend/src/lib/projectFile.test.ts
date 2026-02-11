import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { saveProjectFile, loadProjectFile } from './projectFile';
import type { Skill, Rule } from '../components/Skills/types';

const workspace: Record<string, unknown> = {
  blocks: { languageVersion: 0, blocks: [{ type: 'project_goal', fields: { GOAL: 'test' } }] },
};

const skills: Skill[] = [
  { id: 's1', name: 'Debug Helper', prompt: 'Help debug', category: 'agent' },
];

const rules: Rule[] = [
  { id: 'r1', name: 'Lint', prompt: 'Run lint', trigger: 'always' },
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

describe('saveProjectFile', () => {
  it('produces a zip with workspace.json, skills.json, and rules.json', async () => {
    const blob = await saveProjectFile(workspace, skills, rules);
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));

    expect(zip.file('workspace.json')).not.toBeNull();
    expect(zip.file('skills.json')).not.toBeNull();
    expect(zip.file('rules.json')).not.toBeNull();

    const ws = JSON.parse(await zip.file('workspace.json')!.async('string'));
    expect(ws.blocks.blocks[0].type).toBe('project_goal');

    const sk = JSON.parse(await zip.file('skills.json')!.async('string'));
    expect(sk).toHaveLength(1);
    expect(sk[0].name).toBe('Debug Helper');

    const ru = JSON.parse(await zip.file('rules.json')!.async('string'));
    expect(ru).toHaveLength(1);
    expect(ru[0].name).toBe('Lint');
  });

  it('includes project archive files under project/ when provided', async () => {
    const innerZip = new JSZip();
    innerZip.file('src/main.py', 'print("hello")');
    innerZip.file('tests/test_main.py', 'assert True');
    const archiveBlob = await innerZip.generateAsync({ type: 'blob' });

    const blob = await saveProjectFile(workspace, skills, rules, archiveBlob);
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));

    expect(zip.file('project/src/main.py')).not.toBeNull();
    expect(zip.file('project/tests/test_main.py')).not.toBeNull();

    const content = await zip.file('project/src/main.py')!.async('string');
    expect(content).toBe('print("hello")');
  });

  it('works with empty skills and rules arrays', async () => {
    const blob = await saveProjectFile(workspace, [], []);
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));

    const sk = JSON.parse(await zip.file('skills.json')!.async('string'));
    expect(sk).toEqual([]);

    const ru = JSON.parse(await zip.file('rules.json')!.async('string'));
    expect(ru).toEqual([]);
  });
});

describe('loadProjectFile', () => {
  it('round-trips workspace, skills, and rules', async () => {
    const blob = await saveProjectFile(workspace, skills, rules);
    const file = blobToFile(blob, 'test.elisa');

    const result = await loadProjectFile(file);

    expect(result.workspace).toEqual(workspace);
    expect(result.skills).toEqual(skills);
    expect(result.rules).toEqual(rules);
    expect(result.projectArchive).toBeUndefined();
  });

  it('round-trips project archive', async () => {
    const innerZip = new JSZip();
    innerZip.file('src/index.ts', 'console.log("hi")');
    const archiveBlob = await innerZip.generateAsync({ type: 'blob' });

    const blob = await saveProjectFile(workspace, skills, rules, archiveBlob);
    const file = blobToFile(blob, 'test.elisa');

    const result = await loadProjectFile(file);
    expect(result.projectArchive).toBeDefined();

    const restored = await JSZip.loadAsync(await blobToArrayBuffer(result.projectArchive!));
    const content = await restored.file('src/index.ts')!.async('string');
    expect(content).toBe('console.log("hi")');
  });

  it('throws on invalid zip (missing workspace.json)', async () => {
    const zip = new JSZip();
    zip.file('random.txt', 'not a project');
    const blob = await zip.generateAsync({ type: 'blob' });
    const file = blobToFile(blob, 'bad.elisa');

    await expect(loadProjectFile(file)).rejects.toThrow('Invalid .elisa file: missing workspace.json');
  });

  it('defaults to empty arrays when skills.json and rules.json are missing', async () => {
    const zip = new JSZip();
    zip.file('workspace.json', JSON.stringify(workspace));
    const blob = await zip.generateAsync({ type: 'blob' });
    const file = blobToFile(blob, 'minimal.elisa');

    const result = await loadProjectFile(file);
    expect(result.workspace).toEqual(workspace);
    expect(result.skills).toEqual([]);
    expect(result.rules).toEqual([]);
  });
});
