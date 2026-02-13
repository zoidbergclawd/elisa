import JSZip from 'jszip';
import type { Skill, Rule } from '../components/Skills/types';
import type { Portal } from '../components/Portals/types';

/** Read a Blob as ArrayBuffer, with FileReader fallback for jsdom. */
function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

export interface NuggetFileData {
  workspace: Record<string, unknown>;
  skills: Skill[];
  rules: Rule[];
  portals: Portal[];
  outputArchive?: Blob;
}

/**
 * Create a .elisa nugget file (zip) from workspace state.
 * Optionally includes a generated-code archive blob from the backend.
 */
export async function saveNuggetFile(
  workspace: Record<string, unknown>,
  skills: Skill[],
  rules: Rule[],
  portals: Portal[],
  outputArchive?: Blob,
): Promise<Blob> {
  const zip = new JSZip();
  zip.file('workspace.json', JSON.stringify(workspace, null, 2));
  zip.file('skills.json', JSON.stringify(skills, null, 2));
  zip.file('rules.json', JSON.stringify(rules, null, 2));
  zip.file('portals.json', JSON.stringify(portals, null, 2));

  if (outputArchive) {
    const archiveData = await readBlobAsArrayBuffer(outputArchive);
    const innerZip = await JSZip.loadAsync(archiveData);
    const outputFolder = zip.folder('output')!;
    for (const [relativePath, file] of Object.entries(innerZip.files)) {
      if (!file.dir) {
        const content = await file.async('uint8array');
        outputFolder.file(relativePath, content);
      }
    }
  }

  return zip.generateAsync({ type: 'blob' });
}

/**
 * Extract a .elisa nugget file and return its contents.
 * Reads both output/ and project/ prefixes for backward compatibility.
 */
export async function loadNuggetFile(file: File): Promise<NuggetFileData> {
  const zip = await JSZip.loadAsync(await readBlobAsArrayBuffer(file));

  const workspaceJson = await zip.file('workspace.json')?.async('string');
  if (!workspaceJson) throw new Error('Invalid .elisa file: missing workspace.json');

  const skillsJson = await zip.file('skills.json')?.async('string');
  const rulesJson = await zip.file('rules.json')?.async('string');
  const portalsJson = await zip.file('portals.json')?.async('string');

  const workspace = JSON.parse(workspaceJson) as Record<string, unknown>;
  if (typeof workspace !== 'object' || workspace === null || Array.isArray(workspace)) {
    throw new Error('Invalid .elisa file: workspace.json must be a JSON object');
  }

  const rawSkills = skillsJson ? JSON.parse(skillsJson) : [];
  const rawRules = rulesJson ? JSON.parse(rulesJson) : [];
  const rawPortals = portalsJson ? JSON.parse(portalsJson) : [];

  if (!Array.isArray(rawSkills)) throw new Error('Invalid .elisa file: skills.json must be an array');
  if (!Array.isArray(rawRules)) throw new Error('Invalid .elisa file: rules.json must be an array');
  if (!Array.isArray(rawPortals)) throw new Error('Invalid .elisa file: portals.json must be an array');

  const skills: Skill[] = rawSkills.filter(
    (s: unknown): s is Skill => {
      if (typeof s !== 'object' || s === null) return false;
      const o = s as Record<string, unknown>;
      return typeof o.id === 'string' && typeof o.name === 'string' && typeof o.prompt === 'string';
    },
  );
  const rules: Rule[] = rawRules.filter(
    (r: unknown): r is Rule => {
      if (typeof r !== 'object' || r === null) return false;
      const o = r as Record<string, unknown>;
      return typeof o.id === 'string' && typeof o.name === 'string' && typeof o.prompt === 'string';
    },
  );
  const portals: Portal[] = rawPortals.filter(
    (p: unknown): p is Portal => {
      if (typeof p !== 'object' || p === null) return false;
      const o = p as Record<string, unknown>;
      return typeof o.id === 'string' && typeof o.name === 'string' && typeof o.mechanism === 'string';
    },
  );

  // Extract output/ or project/ folder back into a zip blob if present (backward compat)
  let outputArchive: Blob | undefined;
  const outputFiles = Object.entries(zip.files).filter(
    ([path]) => (path.startsWith('output/') || path.startsWith('project/')) && !zip.files[path].dir,
  );
  if (outputFiles.length > 0) {
    const innerZip = new JSZip();
    for (const [path, file] of outputFiles) {
      const relativePath = path.replace(/^(output|project)\//, '');
      const content = await file.async('uint8array');
      innerZip.file(relativePath, content);
    }
    outputArchive = await innerZip.generateAsync({ type: 'blob' });
  }

  return { workspace, skills, rules, portals, outputArchive };
}

/**
 * Trigger a browser download of a Blob as a named file.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
