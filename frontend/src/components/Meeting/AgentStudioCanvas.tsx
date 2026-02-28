/** AgentStudioCanvas — face designer for Art Agent meetings. Kids mix-and-match face parts to create their AI agent's identity. */

import { useState } from 'react';
import { registerCanvas, type CanvasProps } from './canvasRegistry';
import FacePreview from './FacePreview';
import type { FaceDescriptor } from '../../types';

// -- Color palettes (8 kid-friendly presets each) --

const FACE_COLORS = ['#f0f0f0', '#ffd5b4', '#8d6e63', '#ffeb3b', '#4fc3f7', '#ce93d8', '#a5d6a7', '#ef9a9a'];
const EYE_COLORS = ['#4361ee', '#2e7d32', '#6a1b9a', '#e65100', '#000000', '#00bcd4', '#ff1744', '#ffd600'];
const ACCENT_COLORS = ['#ffb3ba', '#bae1ff', '#baffc9', '#ffffba', '#e8baff', '#ffdbba', '#ff9aa2', '#c7ceea'];

// -- Theme grid (reuse IDs from ThemePickerCanvas for compatibility) --

const THEME_OPTIONS = [
  { id: 'default', name: 'Elisa Blue', color: '#4361ee' },
  { id: 'forest', name: 'Forest', color: '#95d5b2' },
  { id: 'sunset', name: 'Sunset', color: '#ff6b6b' },
  { id: 'pixel', name: 'Pixel', color: '#ff00ff' },
  { id: 'space', name: 'Space', color: '#7b68ee' },
  { id: 'candy', name: 'Candy', color: '#ff69b4' },
  { id: 'tech', name: 'Tech', color: '#00bcd4' },
  { id: 'nature', name: 'Nature', color: '#4caf50' },
];

// -- Option type defs --

type BaseShape = FaceDescriptor['base_shape'];
type EyeStyle = FaceDescriptor['eyes']['style'];
type EyeSize = FaceDescriptor['eyes']['size'];
type MouthStyle = FaceDescriptor['mouth']['style'];
type Expression = FaceDescriptor['expression'];

interface OptionItem<T extends string> {
  value: T;
  label: string;
}

const BASE_SHAPES: OptionItem<BaseShape>[] = [
  { value: 'round', label: 'Round' },
  { value: 'square', label: 'Square' },
  { value: 'oval', label: 'Oval' },
];

const EYE_STYLES: OptionItem<EyeStyle>[] = [
  { value: 'dots', label: 'Dots' },
  { value: 'circles', label: 'Circles' },
  { value: 'anime', label: 'Anime' },
  { value: 'pixels', label: 'Pixels' },
  { value: 'sleepy', label: 'Sleepy' },
];

const EYE_SIZES: OptionItem<EyeSize>[] = [
  { value: 'small', label: 'S' },
  { value: 'medium', label: 'M' },
  { value: 'large', label: 'L' },
];

const MOUTH_STYLES: OptionItem<MouthStyle>[] = [
  { value: 'line', label: 'Line' },
  { value: 'smile', label: 'Smile' },
  { value: 'zigzag', label: 'Zigzag' },
  { value: 'open', label: 'Open' },
  { value: 'cat', label: 'Cat' },
];

const EXPRESSIONS: OptionItem<Expression>[] = [
  { value: 'happy', label: 'Happy' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'excited', label: 'Excited' },
  { value: 'shy', label: 'Shy' },
  { value: 'cool', label: 'Cool' },
];

// -- Default face (matches backend DEFAULT_FACE) --

const DEFAULT_FACE: FaceDescriptor = {
  base_shape: 'round',
  eyes: { style: 'circles', size: 'medium', color: '#4361ee' },
  mouth: { style: 'smile' },
  expression: 'happy',
  colors: { face: '#f0f0f0', accent: '#ffb3ba' },
};

// -- Selector button helper --

function SelectorButton<T extends string>({
  value,
  label,
  selected,
  onSelect,
  ariaLabel,
}: {
  value: T;
  label: string;
  selected: boolean;
  onSelect: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={`px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
        selected
          ? 'bg-accent-sky/20 text-accent-sky ring-2 ring-accent-sky/50'
          : 'bg-atelier-surface/50 text-atelier-text-secondary hover:bg-atelier-surface/80'
      }`}
    >
      {label}
    </button>
  );
}

// -- Color swatch button --

function ColorSwatch({
  color,
  selected,
  onSelect,
  label,
}: {
  color: string;
  selected: boolean;
  onSelect: (c: string) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(color)}
      aria-pressed={selected}
      aria-label={label}
      className={`w-8 h-8 rounded-full transition-all cursor-pointer ${
        selected ? 'ring-2 ring-accent-sky ring-offset-2 ring-offset-atelier-bg scale-110' : 'hover:scale-110'
      }`}
      style={{ backgroundColor: color }}
    />
  );
}

// -- Main component --

function AgentStudioCanvas({ onCanvasUpdate }: CanvasProps) {
  const [face, setFace] = useState<FaceDescriptor>(DEFAULT_FACE);
  const [agentName, setAgentName] = useState('');
  const [selectedTheme, setSelectedTheme] = useState('default');

  const updateFace = (partial: Partial<FaceDescriptor>) => {
    setFace((prev) => ({ ...prev, ...partial }));
  };

  const handleSave = () => {
    onCanvasUpdate({
      type: 'agent_studio_saved',
      face,
      theme: selectedTheme,
      agent_name: agentName,
    });
  };

  return (
    <div className="flex flex-col h-full" data-testid="agent-studio-canvas">
      <div className="mb-3">
        <h3 className="text-lg font-display font-bold text-atelier-text">
          Design Your Agent's Face!
        </h3>
        <p className="text-sm text-atelier-text-secondary mt-1">
          Mix and match parts to create a unique look. Changes show up instantly!
        </p>
      </div>

      {/* 3-column layout */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-y-auto">
        {/* Left column: Face Parts */}
        <div className="space-y-4 overflow-y-auto pr-1">
          <p className="text-xs font-semibold text-atelier-text-secondary uppercase tracking-wide">
            Face Parts
          </p>

          {/* Shape */}
          <div>
            <p className="text-xs text-atelier-text-muted mb-2">Shape</p>
            <div className="flex flex-wrap gap-2">
              {BASE_SHAPES.map((opt) => (
                <SelectorButton
                  key={opt.value}
                  value={opt.value}
                  label={opt.label}
                  selected={face.base_shape === opt.value}
                  onSelect={(v) => updateFace({ base_shape: v })}
                  ariaLabel={`Select ${opt.label} shape`}
                />
              ))}
            </div>
          </div>

          {/* Eyes */}
          <div>
            <p className="text-xs text-atelier-text-muted mb-2">Eyes</p>
            <div className="flex flex-wrap gap-2">
              {EYE_STYLES.map((opt) => (
                <SelectorButton
                  key={opt.value}
                  value={opt.value}
                  label={opt.label}
                  selected={face.eyes.style === opt.value}
                  onSelect={(v) => updateFace({ eyes: { ...face.eyes, style: v } })}
                  ariaLabel={`Select ${opt.label} eyes`}
                />
              ))}
            </div>
          </div>

          {/* Eye Size */}
          <div>
            <p className="text-xs text-atelier-text-muted mb-2">Eye Size</p>
            <div className="flex flex-wrap gap-2">
              {EYE_SIZES.map((opt) => (
                <SelectorButton
                  key={opt.value}
                  value={opt.value}
                  label={opt.label}
                  selected={face.eyes.size === opt.value}
                  onSelect={(v) => updateFace({ eyes: { ...face.eyes, size: v } })}
                  ariaLabel={`Select ${opt.label} eye size`}
                />
              ))}
            </div>
          </div>

          {/* Mouth */}
          <div>
            <p className="text-xs text-atelier-text-muted mb-2">Mouth</p>
            <div className="flex flex-wrap gap-2">
              {MOUTH_STYLES.map((opt) => (
                <SelectorButton
                  key={opt.value}
                  value={opt.value}
                  label={opt.label}
                  selected={face.mouth.style === opt.value}
                  onSelect={(v) => updateFace({ mouth: { style: v } })}
                  ariaLabel={`Select ${opt.label} mouth`}
                />
              ))}
            </div>
          </div>

          {/* Expression */}
          <div>
            <p className="text-xs text-atelier-text-muted mb-2">Mood</p>
            <div className="flex flex-wrap gap-2">
              {EXPRESSIONS.map((opt) => (
                <SelectorButton
                  key={opt.value}
                  value={opt.value}
                  label={opt.label}
                  selected={face.expression === opt.value}
                  onSelect={(v) => updateFace({ expression: v })}
                  ariaLabel={`Select ${opt.label} expression`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Center column: Live Preview + Agent Name */}
        <div className="flex flex-col items-center justify-center gap-4">
          <p className="text-xs font-semibold text-atelier-text-secondary uppercase tracking-wide">
            Live Preview
          </p>

          <div className="rounded-2xl bg-atelier-surface/30 border border-border-subtle p-6 flex items-center justify-center">
            <FacePreview face={face} size={180} state="idle" />
          </div>

          <div className="w-full max-w-[220px]">
            <label className="block text-xs text-atelier-text-muted mb-1 text-center">
              Agent Name
            </label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Name your agent!"
              maxLength={30}
              className="w-full rounded-xl px-3 py-2 text-sm text-center bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none"
              aria-label="Agent name"
            />
          </div>
        </div>

        {/* Right column: Colors + Theme */}
        <div className="space-y-4 overflow-y-auto pl-1">
          <p className="text-xs font-semibold text-atelier-text-secondary uppercase tracking-wide">
            Colors
          </p>

          {/* Face color */}
          <div>
            <p className="text-xs text-atelier-text-muted mb-2">Face Color</p>
            <div className="flex flex-wrap gap-2">
              {FACE_COLORS.map((c) => (
                <ColorSwatch
                  key={c}
                  color={c}
                  selected={face.colors.face === c}
                  onSelect={(v) => updateFace({ colors: { ...face.colors, face: v } })}
                  label={`Face color ${c}`}
                />
              ))}
            </div>
          </div>

          {/* Eye color */}
          <div>
            <p className="text-xs text-atelier-text-muted mb-2">Eye Color</p>
            <div className="flex flex-wrap gap-2">
              {EYE_COLORS.map((c) => (
                <ColorSwatch
                  key={c}
                  color={c}
                  selected={face.eyes.color === c}
                  onSelect={(v) => updateFace({ eyes: { ...face.eyes, color: v } })}
                  label={`Eye color ${c}`}
                />
              ))}
            </div>
          </div>

          {/* Accent color */}
          <div>
            <p className="text-xs text-atelier-text-muted mb-2">Accent Color</p>
            <div className="flex flex-wrap gap-2">
              {ACCENT_COLORS.map((c) => (
                <ColorSwatch
                  key={c}
                  color={c}
                  selected={face.colors.accent === c}
                  onSelect={(v) => updateFace({ colors: { ...face.colors, accent: v } })}
                  label={`Accent color ${c}`}
                />
              ))}
            </div>
          </div>

          {/* Theme selector */}
          <div className="pt-2 border-t border-border-subtle">
            <p className="text-xs text-atelier-text-muted mb-2">Display Theme</p>
            <div className="grid grid-cols-2 gap-2">
              {THEME_OPTIONS.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setSelectedTheme(theme.id)}
                  aria-pressed={selectedTheme === theme.id}
                  aria-label={`Select ${theme.name} theme`}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all cursor-pointer ${
                    selectedTheme === theme.id
                      ? 'bg-accent-sky/20 text-accent-sky ring-1 ring-accent-sky/50'
                      : 'bg-atelier-surface/50 text-atelier-text-secondary hover:bg-atelier-surface/80'
                  }`}
                >
                  <span
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: theme.color }}
                  />
                  <span className="truncate">{theme.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer: Save button */}
      <div className="mt-4 pt-4 border-t border-border-subtle flex items-center justify-between">
        <p className="text-xs text-atelier-text-muted">
          {agentName ? `Creating ${agentName}...` : 'Give your agent a name to get started!'}
        </p>
        <button
          type="button"
          onClick={handleSave}
          className="go-btn px-4 py-2 rounded-xl text-sm font-medium"
        >
          Save Agent Look
        </button>
      </div>
    </div>
  );
}

// Register in the canvas registry
registerCanvas('agent-studio', AgentStudioCanvas);

export default AgentStudioCanvas;
export { DEFAULT_FACE, FACE_COLORS, EYE_COLORS, ACCENT_COLORS, THEME_OPTIONS };
