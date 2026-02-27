/** Launch Pad canvas -- launch page builder with template selection and live preview. */

import { useState, useMemo } from 'react';
import { registerCanvas, type CanvasProps } from './canvasRegistry';

interface LayoutTemplate {
  id: string;
  name: string;
  description: string;
}

const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  { id: 'hero-features', name: 'Hero + Features', description: 'Big headline at top with feature cards below' },
  { id: 'centered-minimal', name: 'Centered Minimal', description: 'Clean centered layout with just the essentials' },
  { id: 'split-image-text', name: 'Split Image + Text', description: 'Image on one side, text on the other' },
  { id: 'full-banner', name: 'Full Banner', description: 'Full-width banner with bold colors and text overlay' },
];

function LaunchPadCanvas({ onCanvasUpdate }: CanvasProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [tagline, setTagline] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#4361ee');
  const [accentColor, setAccentColor] = useState('#ff6b6b');

  const template = useMemo(
    () => LAYOUT_TEMPLATES.find((t) => t.id === selectedTemplate),
    [selectedTemplate],
  );

  const handleFinalize = () => {
    onCanvasUpdate({
      type: 'launch_page_finalized',
      template_id: selectedTemplate,
      project_name: projectName,
      tagline,
      primary_color: primaryColor,
      accent_color: accentColor,
    });
  };

  const canFinalize = selectedTemplate && projectName.trim();

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3">
        <h3 className="text-lg font-display font-bold text-atelier-text">
          Launch Pad
        </h3>
        <p className="text-sm text-atelier-text-secondary mt-1">
          Design a launch page for your project. Pick a layout, customize it, and see a preview!
        </p>
      </div>

      <div className="flex flex-1 min-h-0 gap-4">
        {/* Left: template selection + customization */}
        <div className="w-64 flex flex-col min-h-0 overflow-y-auto space-y-4">
          {/* Template cards */}
          <div>
            <p className="text-xs font-medium text-atelier-text-secondary mb-2">
              Layout Template
            </p>
            <div className="space-y-2">
              {LAYOUT_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTemplate(t.id)}
                  className={`w-full rounded-xl p-3 text-left transition-all cursor-pointer ${
                    selectedTemplate === t.id
                      ? 'ring-2 ring-accent-sky bg-accent-sky/10'
                      : 'bg-atelier-surface hover:bg-atelier-surface/80'
                  }`}
                  aria-pressed={selectedTemplate === t.id}
                  aria-label={`Select ${t.name} template`}
                >
                  <p className="text-sm font-medium text-atelier-text">{t.name}</p>
                  <p className="text-xs text-atelier-text-muted mt-0.5">{t.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Customization inputs */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-atelier-text-secondary">
              Customize
            </p>
            <div>
              <label htmlFor="project-name" className="block text-xs text-atelier-text-muted mb-1">
                Project Name
              </label>
              <input
                id="project-name"
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="My Awesome Project"
                className="w-full rounded-xl px-3 py-2 text-sm bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="tagline" className="block text-xs text-atelier-text-muted mb-1">
                Tagline
              </label>
              <input
                id="tagline"
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="The coolest project ever"
                className="w-full rounded-xl px-3 py-2 text-sm bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label htmlFor="primary-color" className="block text-xs text-atelier-text-muted mb-1">
                  Primary Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="primary-color"
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                    aria-label="Primary color picker"
                  />
                  <span className="text-xs text-atelier-text-muted font-mono">{primaryColor}</span>
                </div>
              </div>
              <div className="flex-1">
                <label htmlFor="accent-color" className="block text-xs text-atelier-text-muted mb-1">
                  Accent Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="accent-color"
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                    aria-label="Accent color picker"
                  />
                  <span className="text-xs text-atelier-text-muted font-mono">{accentColor}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: live preview */}
        <div className="flex-1 flex flex-col min-w-0">
          <p className="text-xs font-medium text-atelier-text-secondary mb-2">
            Preview
          </p>
          <div
            className="flex-1 rounded-xl border border-border-subtle overflow-hidden"
            data-testid="launch-preview"
          >
            {template ? (
              <LaunchPreview
                templateId={template.id}
                projectName={projectName || 'My Project'}
                tagline={tagline || 'Something amazing awaits'}
                primaryColor={primaryColor}
                accentColor={accentColor}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-atelier-text-muted text-sm">
                Select a template to see a preview
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer: finalize */}
      <div className="mt-3 pt-3 border-t border-border-subtle flex items-center justify-end">
        <button
          type="button"
          onClick={handleFinalize}
          disabled={!canFinalize}
          className="go-btn px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Finalize
        </button>
      </div>
    </div>
  );
}

/** Simple HTML/CSS live preview of the selected template with user inputs. */
function LaunchPreview({
  templateId,
  projectName,
  tagline,
  primaryColor,
  accentColor,
}: {
  templateId: string;
  projectName: string;
  tagline: string;
  primaryColor: string;
  accentColor: string;
}) {
  if (templateId === 'hero-features') {
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: primaryColor }}>
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <h2 className="text-2xl font-bold text-white">{projectName}</h2>
          <p className="text-sm text-white/80 mt-1">{tagline}</p>
          <div className="mt-2 px-4 py-1.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: accentColor }}>
            Get Started
          </div>
        </div>
        <div className="flex gap-2 px-4 pb-4">
          {['Feature 1', 'Feature 2', 'Feature 3'].map((f) => (
            <div key={f} className="flex-1 rounded-lg p-2 bg-white/10 text-center">
              <p className="text-xs text-white font-medium">{f}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (templateId === 'centered-minimal') {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 text-center bg-white">
        <h2 className="text-2xl font-bold" style={{ color: primaryColor }}>{projectName}</h2>
        <p className="text-sm text-gray-500 mt-1">{tagline}</p>
        <div className="mt-3 px-4 py-1.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: accentColor }}>
          Launch
        </div>
      </div>
    );
  }

  if (templateId === 'split-image-text') {
    return (
      <div className="h-full flex">
        <div className="w-1/2 flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
          <div className="text-4xl text-white/50">[img]</div>
        </div>
        <div className="w-1/2 flex flex-col items-start justify-center px-4 bg-white">
          <h2 className="text-xl font-bold" style={{ color: primaryColor }}>{projectName}</h2>
          <p className="text-xs text-gray-500 mt-1">{tagline}</p>
          <div className="mt-2 px-3 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: accentColor }}>
            Try It
          </div>
        </div>
      </div>
    );
  }

  if (templateId === 'full-banner') {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 text-center" style={{ backgroundColor: accentColor }}>
        <h2 className="text-3xl font-black text-white">{projectName}</h2>
        <p className="text-sm text-white/80 mt-1">{tagline}</p>
        <div className="mt-3 px-4 py-1.5 rounded-full text-xs font-medium" style={{ backgroundColor: primaryColor, color: 'white' }}>
          Go!
        </div>
      </div>
    );
  }

  return null;
}

// Register in the canvas registry
registerCanvas('launch-pad', LaunchPadCanvas);

export default LaunchPadCanvas;
export { LAYOUT_TEMPLATES };
