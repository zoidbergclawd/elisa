import JSZip from 'jszip';
import type { Skill, Rule } from '../components/Skills/types';

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

export interface ProjectFileData {
  workspace: Record<string, unknown>;
  skills: Skill[];
  rules: Rule[];
  projectArchive?: Blob;
}

/**
 * Create a .elisa project file (zip) from workspace state.
 * Optionally includes a generated-code archive blob from the backend.
 */
export async function saveProjectFile(
  workspace: Record<string, unknown>,
  skills: Skill[],
  rules: Rule[],
  projectArchive?: Blob,
): Promise<Blob> {
  const zip = new JSZip();
  zip.file('workspace.json', JSON.stringify(workspace, null, 2));
  zip.file('skills.json', JSON.stringify(skills, null, 2));
  zip.file('rules.json', JSON.stringify(rules, null, 2));

  if (projectArchive) {
    const archiveData = await readBlobAsArrayBuffer(projectArchive);
    const innerZip = await JSZip.loadAsync(archiveData);
    const projectFolder = zip.folder('project')!;
    for (const [relativePath, file] of Object.entries(innerZip.files)) {
      if (!file.dir) {
        const content = await file.async('uint8array');
        projectFolder.file(relativePath, content);
      }
    }
  }

  return zip.generateAsync({ type: 'blob' });
}

/**
 * Extract a .elisa project file and return its contents.
 */
export async function loadProjectFile(file: File): Promise<ProjectFileData> {
  const zip = await JSZip.loadAsync(await readBlobAsArrayBuffer(file));

  const workspaceJson = await zip.file('workspace.json')?.async('string');
  if (!workspaceJson) throw new Error('Invalid .elisa file: missing workspace.json');

  const skillsJson = await zip.file('skills.json')?.async('string');
  const rulesJson = await zip.file('rules.json')?.async('string');

  const workspace = JSON.parse(workspaceJson) as Record<string, unknown>;
  const skills: Skill[] = skillsJson ? JSON.parse(skillsJson) : [];
  const rules: Rule[] = rulesJson ? JSON.parse(rulesJson) : [];

  // Extract project/ folder back into a zip blob if present
  let projectArchive: Blob | undefined;
  const projectFiles = Object.entries(zip.files).filter(
    ([path]) => path.startsWith('project/') && !zip.files[path].dir,
  );
  if (projectFiles.length > 0) {
    const innerZip = new JSZip();
    for (const [path, file] of projectFiles) {
      const relativePath = path.replace(/^project\//, '');
      const content = await file.async('uint8array');
      innerZip.file(relativePath, content);
    }
    projectArchive = await innerZip.generateAsync({ type: 'blob' });
  }

  return { workspace, skills, rules, projectArchive };
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
