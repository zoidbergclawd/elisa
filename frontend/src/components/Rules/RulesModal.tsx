import { useState } from 'react';
import type { Rule } from '../Skills/types';
import { RULE_TEMPLATES } from '../../lib/skillTemplates';

interface Props {
  rules: Rule[];
  onRulesChange: (rules: Rule[]) => void;
  onClose: () => void;
}

const RULE_PLACEHOLDERS: Record<Rule['trigger'], string> = {
  always: 'Write a rule that always applies. Example: Every file must have at least one comment explaining what it does.',
  on_task_complete: 'What should be checked when a task is done? Example: Make sure there are no console.log statements left in the code.',
  on_test_fail: 'What should happen when tests fail? Example: Look at the error message carefully and fix the exact line that broke.',
  before_deploy: 'What must be true before deploying? Example: All buttons must have labels and the app must work on mobile.',
};

const RULE_TRIGGERS: Array<{ label: string; value: Rule['trigger'] }> = [
  { label: 'Always on', value: 'always' },
  { label: 'On task complete', value: 'on_task_complete' },
  { label: 'On test fail', value: 'on_test_fail' },
  { label: 'Before deploy', value: 'before_deploy' },
];

const TRIGGER_BADGES: Record<Rule['trigger'], string> = {
  always: 'bg-accent-sky/20 text-accent-sky',
  on_task_complete: 'bg-accent-mint/20 text-accent-mint',
  on_test_fail: 'bg-accent-coral/20 text-accent-coral',
  before_deploy: 'bg-accent-gold/20 text-accent-gold',
};

function generateId(): string {
  return crypto.randomUUID();
}

type View = 'list' | 'editor' | 'templates';

export default function RulesModal({ rules, onRulesChange, onClose }: Props) {
  const [view, setView] = useState<View>('list');
  const [editingRule, setEditingRule] = useState<Rule | null>(null);

  const handleCreate = () => {
    setEditingRule({ id: generateId(), name: '', prompt: '', trigger: 'always' });
    setView('editor');
  };

  const handleEdit = (rule: Rule) => {
    setEditingRule(rule);
    setView('editor');
  };

  const handleSave = (rule: Rule) => {
    const existing = rules.findIndex(r => r.id === rule.id);
    if (existing >= 0) {
      const updated = [...rules];
      updated[existing] = rule;
      onRulesChange(updated);
    } else {
      onRulesChange([...rules, rule]);
    }
    setEditingRule(null);
    setView('list');
  };

  const handleDelete = (id: string) => {
    onRulesChange(rules.filter(r => r.id !== id));
    if (editingRule?.id === id) {
      setEditingRule(null);
      setView('list');
    }
  };

  const handleTemplateSelect = (templateIndex: number) => {
    const tmpl = RULE_TEMPLATES[templateIndex];
    const alreadyAdded = rules.some(r => r.name === tmpl.name);
    if (alreadyAdded) return;
    const newRule: Rule = {
      id: generateId(),
      name: tmpl.name,
      prompt: tmpl.prompt,
      trigger: tmpl.trigger,
    };
    onRulesChange([...rules, newRule]);
  };

  return (
    <div className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="rules-modal-title">
      <div className="glass-elevated rounded-2xl shadow-2xl p-6 max-w-lg mx-4 w-full max-h-[80vh] flex flex-col animate-float-in">
        <div className="flex items-center justify-between mb-4">
          <h2 id="rules-modal-title" className="text-xl font-display font-bold text-atelier-text">Rules</h2>
          <button
            onClick={onClose}
            className="text-atelier-text-muted hover:text-atelier-text text-lg font-bold transition-colors"
            aria-label="Close"
          >
            X
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {view === 'list' && (
            <div>
              {rules.map(rule => (
                <div key={rule.id} className="border border-border-subtle rounded-xl p-3 mb-2 flex items-start justify-between bg-atelier-surface/40">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-atelier-text">{rule.name || '(unnamed)'}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TRIGGER_BADGES[rule.trigger]}`}>
                        {rule.trigger}
                      </span>
                    </div>
                    <div className="text-xs text-atelier-text-muted mt-1">
                      {rule.prompt.slice(0, 80)}{rule.prompt.length > 80 ? '...' : ''}
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button onClick={() => handleEdit(rule)} className="text-xs px-2 py-1 bg-atelier-elevated rounded-lg hover:bg-atelier-hover text-atelier-text-secondary transition-colors">Edit</button>
                    <button onClick={() => handleDelete(rule.id)} className="text-xs px-2 py-1 bg-accent-coral/10 text-accent-coral rounded-lg hover:bg-accent-coral/20 transition-colors">Delete</button>
                  </div>
                </div>
              ))}
              {rules.length === 0 && (
                <p className="text-atelier-text-muted text-sm text-center py-4">No rules yet. Create one to set constraints for your agents.</p>
              )}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleCreate}
                  className="flex-1 px-4 py-2 bg-accent-coral text-white rounded-xl hover:bg-accent-coral/80 text-sm font-medium transition-colors"
                >
                  + New Rule
                </button>
                <button
                  onClick={() => setView('templates')}
                  className="flex-1 px-4 py-2 bg-accent-coral/15 text-accent-coral rounded-xl hover:bg-accent-coral/25 text-sm font-medium border border-accent-coral/20 transition-colors"
                >
                  From Template
                </button>
              </div>
            </div>
          )}

          {view === 'editor' && editingRule && (
            <RuleEditor
              rule={editingRule}
              onSave={handleSave}
              onDelete={() => handleDelete(editingRule.id)}
              onCancel={() => { setEditingRule(null); setView('list'); }}
            />
          )}

          {view === 'templates' && (
            <div>
              <button
                onClick={() => setView('list')}
                className="text-sm text-atelier-text-muted hover:text-atelier-text-secondary mb-3 transition-colors"
              >
                &larr; Back to list
              </button>
              <div className="grid grid-cols-1 gap-2">
                {RULE_TEMPLATES.map((tmpl, i) => {
                  const added = rules.some(r => r.name === tmpl.name);
                  return (
                    <div
                      key={tmpl.id}
                      className="border border-border-subtle rounded-xl p-3 bg-atelier-surface/40 flex items-start justify-between"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-atelier-text">{tmpl.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TRIGGER_BADGES[tmpl.trigger]}`}>
                            {tmpl.trigger}
                          </span>
                        </div>
                        <p className="text-xs text-atelier-text-muted mt-0.5">{tmpl.description}</p>
                      </div>
                      <button
                        onClick={() => handleTemplateSelect(i)}
                        disabled={added}
                        className={`ml-2 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${added ? 'bg-accent-mint/10 text-accent-mint' : 'bg-accent-coral text-white hover:bg-accent-coral/80 cursor-pointer'}`}
                      >
                        {added ? '(added)' : 'Add'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleEditor({ rule, onSave, onDelete, onCancel }: {
  rule: Rule;
  onSave: (rule: Rule) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(rule.name);
  const [trigger, setTrigger] = useState<Rule['trigger']>(rule.trigger);
  const [prompt, setPrompt] = useState(rule.prompt);

  const inputClass = "w-full bg-atelier-surface border border-border-medium rounded-xl px-3 py-2 text-sm text-atelier-text placeholder-atelier-text-muted focus:outline-none focus:ring-2 focus:ring-accent-coral/40";

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-atelier-text-secondary mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Always Add Comments"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-atelier-text-secondary mb-1">When to apply</label>
        <select
          value={trigger}
          onChange={e => setTrigger(e.target.value as Rule['trigger'])}
          className={inputClass}
        >
          {RULE_TRIGGERS.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-atelier-text-secondary mb-1">Rule instructions</label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={RULE_PLACEHOLDERS[trigger]}
          rows={6}
          className={`${inputClass} resize-none`}
        />
      </div>
      <div className="flex gap-2 justify-between">
        <button onClick={onDelete} className="px-3 py-2 bg-accent-coral/10 text-accent-coral rounded-xl hover:bg-accent-coral/20 text-sm transition-colors">Delete</button>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-2 bg-atelier-surface text-atelier-text-secondary rounded-xl hover:bg-atelier-elevated text-sm transition-colors">Cancel</button>
          <button
            onClick={() => onSave({ ...rule, name, trigger, prompt })}
            disabled={!name.trim() || !prompt.trim()}
            className="go-btn px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
