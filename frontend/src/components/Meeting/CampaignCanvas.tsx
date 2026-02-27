/** Campaign canvas — creative asset builder for marketing materials. */

import { useState } from 'react';
import { registerCanvas, type CanvasProps } from './canvasRegistry';

type Tab = 'poster' | 'social' | 'storyboard';

const COLOR_PALETTES = [
  { id: 'bright', name: 'Bright & Bold', colors: ['#FF6B6B', '#4ECDC4', '#FFE66D'] },
  { id: 'cool', name: 'Cool Blues', colors: ['#2196F3', '#00BCD4', '#E3F2FD'] },
  { id: 'nature', name: 'Nature Vibes', colors: ['#4CAF50', '#8BC34A', '#FFF9C4'] },
  { id: 'sunset', name: 'Sunset Glow', colors: ['#FF9800', '#F44336', '#FCE4EC'] },
];

interface PosterState {
  title: string;
  subtitle: string;
  palette: string;
}

interface SocialCardState {
  headline: string;
  description: string;
  cta: string;
}

interface StoryboardPanel {
  scene: string;
}

function CampaignCanvas({ onCanvasUpdate }: CanvasProps) {
  const [activeTab, setActiveTab] = useState<Tab>('poster');

  const [poster, setPoster] = useState<PosterState>({
    title: '',
    subtitle: '',
    palette: '',
  });

  const [socialCard, setSocialCard] = useState<SocialCardState>({
    headline: '',
    description: '',
    cta: '',
  });

  const [storyboard, setStoryboard] = useState<StoryboardPanel[]>([
    { scene: '' },
    { scene: '' },
    { scene: '' },
    { scene: '' },
  ]);

  const handleSave = () => {
    onCanvasUpdate({
      type: 'assets_saved',
      poster,
      socialCard,
      storyboard,
    });
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'poster', label: 'Poster' },
    { key: 'social', label: 'Social Card' },
    { key: 'storyboard', label: 'Storyboard' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h3 className="text-lg font-display font-bold text-atelier-text">
          What makes your project exciting?
        </h3>
        <p className="text-sm text-atelier-text-secondary mt-1">
          Create posters, social cards, and storyboards to share your project with the world!
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              activeTab === tab.key
                ? 'bg-accent-sky/20 text-accent-sky'
                : 'text-atelier-text-secondary hover:bg-atelier-surface/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'poster' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-atelier-text mb-1">
                Poster Title
              </label>
              <input
                type="text"
                value={poster.title}
                onChange={(e) => setPoster({ ...poster, title: e.target.value })}
                placeholder="Give your project a catchy title!"
                className="w-full rounded-xl px-3 py-2 text-sm bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none"
                aria-label="Poster title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-atelier-text mb-1">
                Subtitle
              </label>
              <input
                type="text"
                value={poster.subtitle}
                onChange={(e) => setPoster({ ...poster, subtitle: e.target.value })}
                placeholder="A short tagline that says what it does"
                className="w-full rounded-xl px-3 py-2 text-sm bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none"
                aria-label="Poster subtitle"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-atelier-text mb-2">
                Color Scheme
              </label>
              <div className="grid grid-cols-2 gap-3">
                {COLOR_PALETTES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPoster({ ...poster, palette: p.id })}
                    className={`rounded-xl p-3 transition-all cursor-pointer text-left ${
                      poster.palette === p.id
                        ? 'ring-2 ring-accent-sky bg-accent-sky/10'
                        : 'hover:bg-atelier-surface/50 bg-atelier-surface/30'
                    }`}
                    aria-pressed={poster.palette === p.id}
                    aria-label={`Select ${p.name} palette`}
                  >
                    <div className="flex gap-1 mb-2">
                      {p.colors.map((c) => (
                        <div
                          key={c}
                          className="w-6 h-6 rounded-full"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <p className="text-xs font-medium text-atelier-text">{p.name}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Layout preview */}
            {poster.title && (
              <div className="rounded-xl border border-border-subtle p-4 bg-atelier-surface/30">
                <p className="text-xs text-atelier-text-muted mb-2">Preview</p>
                <div
                  className="rounded-lg p-4 text-center"
                  style={{
                    backgroundColor:
                      COLOR_PALETTES.find((p) => p.id === poster.palette)?.colors[0] ?? '#333',
                  }}
                >
                  <p className="text-white font-bold text-lg">{poster.title}</p>
                  {poster.subtitle && (
                    <p className="text-white/80 text-sm mt-1">{poster.subtitle}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'social' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-atelier-text mb-1">
                Headline
              </label>
              <input
                type="text"
                value={socialCard.headline}
                onChange={(e) => setSocialCard({ ...socialCard, headline: e.target.value })}
                placeholder="What grabs people's attention?"
                className="w-full rounded-xl px-3 py-2 text-sm bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none"
                aria-label="Social card headline"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-atelier-text mb-1">
                Description
              </label>
              <textarea
                value={socialCard.description}
                onChange={(e) => setSocialCard({ ...socialCard, description: e.target.value })}
                placeholder="Tell people why they should check out your project!"
                rows={3}
                className="w-full rounded-xl px-3 py-2 text-sm bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none resize-none"
                aria-label="Social card description"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-atelier-text mb-1">
                Button Text
              </label>
              <input
                type="text"
                value={socialCard.cta}
                onChange={(e) => setSocialCard({ ...socialCard, cta: e.target.value })}
                placeholder="e.g. Try It Now!"
                className="w-full rounded-xl px-3 py-2 text-sm bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none"
                aria-label="Call-to-action text"
              />
            </div>

            {/* Social card preview */}
            {socialCard.headline && (
              <div className="rounded-xl border border-border-subtle p-4 bg-atelier-surface/30">
                <p className="text-xs text-atelier-text-muted mb-2">Preview</p>
                <div className="rounded-lg bg-atelier-surface p-4">
                  <p className="font-bold text-atelier-text">{socialCard.headline}</p>
                  {socialCard.description && (
                    <p className="text-sm text-atelier-text-secondary mt-1">
                      {socialCard.description}
                    </p>
                  )}
                  {socialCard.cta && (
                    <div className="mt-3">
                      <span className="inline-block px-3 py-1 rounded-lg bg-accent-sky/20 text-accent-sky text-sm font-medium">
                        {socialCard.cta}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'storyboard' && (
          <div className="space-y-4">
            <p className="text-sm text-atelier-text-secondary">
              Sketch out your project story in 4 panels. What happens from start to finish?
            </p>
            <div className="grid grid-cols-2 gap-3">
              {storyboard.map((panel, i) => (
                <div key={i} className="rounded-xl border border-border-subtle p-3 bg-atelier-surface/30">
                  <p className="text-xs font-medium text-atelier-text-muted mb-2">
                    Panel {i + 1}
                  </p>
                  <textarea
                    value={panel.scene}
                    onChange={(e) => {
                      const updated = [...storyboard];
                      updated[i] = { scene: e.target.value };
                      setStoryboard(updated);
                    }}
                    placeholder={`What happens in scene ${i + 1}?`}
                    rows={3}
                    className="w-full rounded-lg px-2 py-1.5 text-sm bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none resize-none"
                    aria-label={`Storyboard panel ${i + 1}`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="mt-4 pt-4 border-t border-border-subtle flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          className="go-btn px-4 py-2 rounded-xl text-sm font-medium"
        >
          Save Assets
        </button>
      </div>
    </div>
  );
}

registerCanvas('campaign', CampaignCanvas);

export default CampaignCanvas;
export { COLOR_PALETTES };
