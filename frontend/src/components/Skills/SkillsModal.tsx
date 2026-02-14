import { useState } from 'react';
import type { Skill } from './types';
import SkillFlowEditor from './SkillFlowEditor';
import { SKILL_TEMPLATES } from '../../lib/skillTemplates';

interface Props {
  skills: Skill[];
  onSkillsChange: (skills: Skill[]) => void;
  onClose: () => void;
}

const SKILL_PLACEHOLDERS: Record<Skill['category'], string> = {
  agent: 'Tell this agent how to behave. Example: Always explain your code with comments that a 10-year-old can understand.',
  feature: 'Describe what this feature should do in detail. Example: The game should have a score counter in the top-right corner...',
  style: 'Describe the style you want. Example: Use bright neon colors on a dark background with smooth animations.',
  composite: 'Composite skills are built visually using the Flow Editor.',
};

const SKILL_CATEGORIES: Array<{ label: string; value: Skill['category'] }> = [
  { label: 'Agent behavior', value: 'agent' },
  { label: 'Feature details', value: 'feature' },
  { label: 'Style details', value: 'style' },
  { label: 'Composite flow', value: 'composite' },
];

const CATEGORY_HELP: Record<Skill['category'], string> = {
  agent: 'Controls how the AI agent behaves and communicates.',
  feature: 'Describes a specific feature or functionality to build.',
  style: 'Sets the visual style, colors, and aesthetics.',
  composite: 'Combines multiple skills into a visual flow.',
};

const CATEGORY_BADGES: Record<Skill['category'], string> = {
  agent: 'bg-accent-sky/20 text-accent-sky',
  feature: 'bg-accent-lavender/20 text-accent-lavender',
  style: 'bg-accent-gold/20 text-accent-gold',
  composite: 'bg-accent-mint/20 text-accent-mint',
};

function generateId(): string {
  return crypto.randomUUID();
}

export default function SkillsModal({ skills, onSkillsChange, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'skills' | 'templates'>('skills');
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [flowEditorSkill, setFlowEditorSkill] = useState<Skill | null>(null);

  const handleCreateSkill = () => {
    setEditingSkill({ id: generateId(), name: '', prompt: '', category: 'agent' });
  };

  const handleSaveSkill = (skill: Skill) => {
    const existing = skills.findIndex(s => s.id === skill.id);
    if (existing >= 0) {
      const updated = [...skills];
      updated[existing] = skill;
      onSkillsChange(updated);
    } else {
      onSkillsChange([...skills, skill]);
    }
    setEditingSkill(null);
  };

  const handleDeleteSkill = (id: string) => {
    onSkillsChange(skills.filter(s => s.id !== id));
    if (editingSkill?.id === id) setEditingSkill(null);
  };

  const handleFlowEditorSave = (workspace: Record<string, unknown>) => {
    if (!flowEditorSkill) return;
    const updated: Skill = { ...flowEditorSkill, workspace };
    handleSaveSkill(updated);
    setFlowEditorSkill(null);
  };

  // Show the flow editor overlay if a composite skill is being edited visually
  if (flowEditorSkill) {
    return (
      <SkillFlowEditor
        skill={flowEditorSkill}
        allSkills={skills}
        onSave={handleFlowEditorSave}
        onClose={() => setFlowEditorSkill(null)}
      />
    );
  }

  return (
    <div className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="skills-modal-title">
      <div className="glass-elevated rounded-2xl shadow-2xl p-6 max-w-lg mx-4 w-full max-h-[80vh] flex flex-col animate-float-in">
        <div className="flex items-center justify-between mb-4">
          <h2 id="skills-modal-title" className="text-xl font-display font-bold text-atelier-text">Skills</h2>
          <button
            onClick={onClose}
            className="text-atelier-text-muted hover:text-atelier-text text-lg font-bold transition-colors"
            aria-label="Close"
          >
            X
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4">
          <button
            onClick={() => { setActiveTab('skills'); }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'skills' ? 'bg-accent-lavender/20 text-accent-lavender' : 'bg-atelier-surface/60 text-atelier-text-muted hover:text-atelier-text-secondary'}`}
          >
            Skills ({skills.length})
          </button>
          <button
            onClick={() => { setActiveTab('templates'); setEditingSkill(null); }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'templates' ? 'bg-accent-gold/20 text-accent-gold' : 'bg-atelier-surface/60 text-atelier-text-muted hover:text-atelier-text-secondary'}`}
          >
            Templates
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'skills' && !editingSkill && (
            <div>
              {skills.map(skill => (
                <div key={skill.id} className="border border-border-subtle rounded-xl p-3 mb-2 flex items-start justify-between bg-atelier-surface/40">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-atelier-text">{skill.name || '(unnamed)'}</div>
                    <div className="text-xs text-atelier-text-muted mt-1">
                      {skill.category}
                      {skill.category === 'composite'
                        ? ' -- visual flow'
                        : ` -- ${skill.prompt.slice(0, 80)}${skill.prompt.length > 80 ? '...' : ''}`
                      }
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button onClick={() => setEditingSkill(skill)} className="text-xs px-2 py-1 bg-atelier-elevated rounded-lg hover:bg-atelier-hover text-atelier-text-secondary transition-colors">Edit</button>
                    <button onClick={() => handleDeleteSkill(skill.id)} className="text-xs px-2 py-1 bg-accent-coral/10 text-accent-coral rounded-lg hover:bg-accent-coral/20 transition-colors">Delete</button>
                  </div>
                </div>
              ))}
              {skills.length === 0 && (
                <p className="text-atelier-text-muted text-sm text-center py-4">No skills yet. Create one to give your agents detailed instructions.</p>
              )}
              <button
                onClick={handleCreateSkill}
                className="w-full mt-2 px-4 py-2 bg-accent-lavender text-white rounded-xl hover:bg-accent-lavender/80 text-sm font-medium transition-colors"
              >
                + New Skill
              </button>
            </div>
          )}

          {activeTab === 'skills' && editingSkill && (
            <SkillEditor
              skill={editingSkill}
              onSave={handleSaveSkill}
              onDelete={() => handleDeleteSkill(editingSkill.id)}
              onCancel={() => setEditingSkill(null)}
              onOpenFlowEditor={(skill) => {
                // Save current state first, then open flow editor
                handleSaveSkill(skill);
                setFlowEditorSkill(skill);
              }}
            />
          )}

          {activeTab === 'templates' && (
            <TemplatesTab
              skills={skills}
              onAddSkill={(skill) => onSkillsChange([...skills, skill])}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SkillEditor({ skill, onSave, onDelete, onCancel, onOpenFlowEditor }: {
  skill: Skill;
  onSave: (skill: Skill) => void;
  onDelete: () => void;
  onCancel: () => void;
  onOpenFlowEditor: (skill: Skill) => void;
}) {
  const [name, setName] = useState(skill.name);
  const [category, setCategory] = useState<Skill['category']>(skill.category);
  const [prompt, setPrompt] = useState(skill.prompt);

  const isComposite = category === 'composite';

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-atelier-text-secondary mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Be Extra Creative"
          className="w-full bg-atelier-surface border border-border-medium rounded-xl px-3 py-2 text-sm text-atelier-text placeholder-atelier-text-muted focus:outline-none focus:ring-2 focus:ring-accent-lavender/40"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-atelier-text-secondary mb-1">Category</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value as Skill['category'])}
          className="w-full bg-atelier-surface border border-border-medium rounded-xl px-3 py-2 text-sm text-atelier-text focus:outline-none focus:ring-2 focus:ring-accent-lavender/40"
        >
          {SKILL_CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <p className="text-xs text-atelier-text-muted mt-1">{CATEGORY_HELP[category]}</p>
      </div>
      {isComposite ? (
        <div>
          <label className="block text-xs font-medium text-atelier-text-secondary mb-1">Description (optional)</label>
          <input
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Brief description of what this composite skill does"
            className="w-full bg-atelier-surface border border-border-medium rounded-xl px-3 py-2 text-sm text-atelier-text placeholder-atelier-text-muted focus:outline-none focus:ring-2 focus:ring-accent-lavender/40"
          />
          <button
            onClick={() => onOpenFlowEditor({ ...skill, name, category, prompt, workspace: skill.workspace })}
            disabled={!name.trim()}
            className="w-full mt-2 px-4 py-2 bg-accent-lavender text-white rounded-xl hover:bg-accent-lavender/80 text-sm font-medium disabled:opacity-50 transition-colors"
          >
            Open Flow Editor
          </button>
          {skill.workspace && (
            <p className="text-xs text-accent-mint mt-1">Flow has been configured.</p>
          )}
        </div>
      ) : (
        <div>
          <label className="block text-xs font-medium text-atelier-text-secondary mb-1">Instructions</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={SKILL_PLACEHOLDERS[category]}
            rows={6}
            className="w-full bg-atelier-surface border border-border-medium rounded-xl px-3 py-2 text-sm text-atelier-text placeholder-atelier-text-muted focus:outline-none focus:ring-2 focus:ring-accent-lavender/40 resize-none"
          />
        </div>
      )}
      <div className="flex gap-2 justify-between">
        <button onClick={onDelete} className="px-3 py-2 bg-accent-coral/10 text-accent-coral rounded-xl hover:bg-accent-coral/20 text-sm transition-colors">Delete</button>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-2 bg-atelier-surface text-atelier-text-secondary rounded-xl hover:bg-atelier-elevated text-sm transition-colors">Cancel</button>
          <button
            onClick={() => onSave({ ...skill, name, category, prompt })}
            disabled={!name.trim() || (!isComposite && !prompt.trim())}
            className="go-btn px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplatesTab({ skills, onAddSkill }: {
  skills: Skill[];
  onAddSkill: (skill: Skill) => void;
}) {
  const skillNameSet = new Set(skills.map(s => s.name));

  return (
    <div className="space-y-4">
      <p className="text-xs text-atelier-text-muted">
        After adding, drag a Use Skill block from the Skills category onto your canvas to activate it.
      </p>

      <div>
        <h3 className="text-sm font-semibold text-atelier-text mb-2">Skill Templates</h3>
        <div className="grid grid-cols-1 gap-2">
          {SKILL_TEMPLATES.map(tmpl => {
            const added = skillNameSet.has(tmpl.name);
            return (
              <div key={tmpl.id} className="border border-border-subtle rounded-xl p-3 bg-atelier-surface/40 flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-atelier-text">{tmpl.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_BADGES[tmpl.category]}`}>{tmpl.category}</span>
                  </div>
                  <p className="text-xs text-atelier-text-muted mt-0.5">{tmpl.description}</p>
                </div>
                <button
                  onClick={() => onAddSkill({ id: crypto.randomUUID(), name: tmpl.name, prompt: tmpl.prompt, category: tmpl.category })}
                  disabled={added}
                  className={`ml-2 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${added ? 'bg-accent-mint/10 text-accent-mint' : 'bg-accent-lavender text-white hover:bg-accent-lavender/80 cursor-pointer'}`}
                >
                  {added ? '(added)' : 'Add'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
