/** Materializes meeting canvas data into real files in the nugget workspace. */

import fs from 'node:fs';
import path from 'node:path';

export interface MaterializeResult {
  files: string[];
  primaryFile: string;
}

// -- Per-canvas materializer functions --

function materializeExplainIt(data: Record<string, unknown>): { files: Array<{ path: string; content: string }>; primaryFile: string } {
  const title = typeof data.title === 'string' ? data.title.trim() : 'README';
  const content = typeof data.content === 'string' ? data.content : '';
  const filename = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.md';
  const header = `# ${title}\n\n`;
  return {
    files: [{ path: filename, content: header + content }],
    primaryFile: filename,
  };
}

function materializeLaunchPad(data: Record<string, unknown>): { files: Array<{ path: string; content: string }>; primaryFile: string } {
  const template = typeof data.template === 'string' ? data.template : 'hero-features';
  const headline = typeof data.headline === 'string' ? data.headline : 'My Project';
  const description = typeof data.description === 'string' ? data.description : '';
  const primaryColor = typeof data.primary_color === 'string' ? data.primary_color : '#4361ee';
  const accentColor = typeof data.accent_color === 'string' ? data.accent_color : '#ff6b6b';

  const layoutHtml = getLaunchPageLayout(template, headline, description, primaryColor, accentColor);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(headline)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-height: 100vh; }
    .btn { display: inline-block; padding: 12px 24px; border-radius: 24px; font-weight: 600; text-decoration: none; color: white; }
    .features { display: flex; gap: 16px; padding: 24px; }
    .feature-card { flex: 1; background: rgba(255,255,255,0.1); border-radius: 12px; padding: 16px; text-align: center; color: white; }
  </style>
</head>
<body>
${layoutHtml}
</body>
</html>`;

  return {
    files: [{ path: 'launch-page.html', content: html }],
    primaryFile: 'launch-page.html',
  };
}

function getLaunchPageLayout(template: string, headline: string, description: string, primary: string, accent: string): string {
  const h = escapeHtml(headline);
  const d = escapeHtml(description);

  switch (template) {
    case 'centered-minimal':
      return `<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;background:#fff;">
  <h1 style="font-size:2.5rem;color:${primary};">${h}</h1>
  <p style="font-size:1.1rem;color:#666;margin-top:8px;">${d}</p>
  <a class="btn" style="background:${accent};margin-top:24px;" href="#">Launch</a>
</div>`;
    case 'split-image-text':
      return `<div style="min-height:100vh;display:flex;">
  <div style="width:50%;display:flex;align-items:center;justify-content:center;background:${primary};color:rgba(255,255,255,0.5);font-size:3rem;">[img]</div>
  <div style="width:50%;display:flex;flex-direction:column;justify-content:center;padding:40px;background:#fff;">
    <h1 style="font-size:2rem;color:${primary};">${h}</h1>
    <p style="color:#666;margin-top:8px;">${d}</p>
    <a class="btn" style="background:${accent};margin-top:24px;width:fit-content;" href="#">Try It</a>
  </div>
</div>`;
    case 'full-banner':
      return `<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;background:${accent};text-align:center;">
  <h1 style="font-size:3rem;font-weight:900;color:white;">${h}</h1>
  <p style="font-size:1.1rem;color:rgba(255,255,255,0.8);margin-top:8px;">${d}</p>
  <a class="btn" style="background:${primary};margin-top:24px;" href="#">Go!</a>
</div>`;
    default: // hero-features
      return `<div style="min-height:100vh;display:flex;flex-direction:column;background:${primary};">
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;text-align:center;">
    <h1 style="font-size:2.5rem;font-weight:bold;color:white;">${h}</h1>
    <p style="font-size:1.1rem;color:rgba(255,255,255,0.8);margin-top:8px;">${d}</p>
    <a class="btn" style="background:${accent};margin-top:24px;" href="#">Get Started</a>
  </div>
  <div class="features">
    <div class="feature-card"><p>Feature 1</p></div>
    <div class="feature-card"><p>Feature 2</p></div>
    <div class="feature-card"><p>Feature 3</p></div>
  </div>
</div>`;
  }
}

function materializeCampaign(data: Record<string, unknown>): { files: Array<{ path: string; content: string }>; primaryFile: string } {
  const files: Array<{ path: string; content: string }> = [];

  const posterTitle = typeof data.poster_title === 'string' ? data.poster_title : '';
  const tagline = typeof data.tagline === 'string' ? data.tagline : '';

  if (posterTitle) {
    const posterHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(posterTitle)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .poster { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #333; color: white; text-align: center; padding: 40px; }
    .poster h1 { font-size: 3rem; font-weight: bold; }
    .poster p { font-size: 1.2rem; opacity: 0.8; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="poster">
    <h1>${escapeHtml(posterTitle)}</h1>
    ${tagline ? `<p>${escapeHtml(tagline)}</p>` : ''}
  </div>
</body>
</html>`;
    files.push({ path: 'poster.html', content: posterHtml });
  }

  const headline = typeof data.headline === 'string' ? data.headline : '';
  if (headline) {
    const socialHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(headline)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .card { max-width: 600px; margin: 40px auto; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .card-body { padding: 24px; }
    .card h1 { font-size: 1.5rem; }
    .card p { color: #666; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="card-body">
      <h1>${escapeHtml(headline)}</h1>
      ${tagline ? `<p>${escapeHtml(tagline)}</p>` : ''}
    </div>
  </div>
</body>
</html>`;
    files.push({ path: 'social-card.html', content: socialHtml });
  }

  if (files.length === 0) {
    files.push({ path: 'poster.html', content: '<html><body><h1>Campaign</h1></body></html>' });
  }

  return { files, primaryFile: files[0].path };
}

function materializeInterfaceDesigner(data: Record<string, unknown>): { files: Array<{ path: string; content: string }>; primaryFile: string } {
  const provides = Array.isArray(data.provides) ? data.provides : [];
  const requires = Array.isArray(data.requires) ? data.requires : [];
  const connections = Array.isArray(data.connections) ? data.connections : [];

  const contract = JSON.stringify({ provides, requires, connections }, null, 2);
  return {
    files: [{ path: 'interfaces.json', content: contract }],
    primaryFile: 'interfaces.json',
  };
}

function materializeThemePicker(data: Record<string, unknown>): { files: Array<{ path: string; content: string }>; primaryFile: string } {
  const themeId = typeof data.theme_id === 'string' ? data.theme_id : typeof data.currentTheme === 'string' ? data.currentTheme : 'default';
  const config = JSON.stringify({ theme_id: themeId, selected_at: new Date().toISOString() }, null, 2);
  return {
    files: [{ path: 'theme-config.json', content: config }],
    primaryFile: 'theme-config.json',
  };
}

// -- Dispatcher --

const materializers: Record<string, (data: Record<string, unknown>) => { files: Array<{ path: string; content: string }>; primaryFile: string }> = {
  'explain-it': materializeExplainIt,
  'launch-pad': materializeLaunchPad,
  campaign: materializeCampaign,
  'interface-designer': materializeInterfaceDesigner,
  'theme-picker': materializeThemePicker,
};

/**
 * Materialize canvas data into real files in the nugget directory.
 * Returns null for canvas types that don't produce file artifacts (blueprint, bug-detective).
 */
export function materialize(
  canvasType: string,
  data: Record<string, unknown>,
  nuggetDir: string,
): MaterializeResult | null {
  const fn = materializers[canvasType];
  if (!fn) return null;

  const result = fn(data);

  // Write files to disk
  for (const file of result.files) {
    const fullPath = path.join(nuggetDir, file.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content, 'utf-8');
  }

  return {
    files: result.files.map((f) => f.path),
    primaryFile: result.primaryFile,
  };
}

/** List of canvas types that support materialization. */
export function getMaterializableTypes(): string[] {
  return Object.keys(materializers);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
