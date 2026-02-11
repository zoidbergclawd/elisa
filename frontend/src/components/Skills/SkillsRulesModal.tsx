import { useState } from 'react';
import type { Skill, Rule } from './types';

interface Props {
  skills: Skill[];
  rules: Rule[];
  onSkillsChange: (skills: Skill[]) => void;
  onRulesChange: (rules: Rule[]) => void;
  onClose: () => void;
}

const SKILL_PLACEHOLDERS: Record<Skill['category'], string> = {
  agent: 'Tell this agent how to behave. Example: Always explain your code with comments that a 10-year-old can understand.',
  feature: 'Describe what this feature should do in detail. Example: The game should have a score counter in the top-right corner...',
  style: 'Describe the style you want. Example: Use bright neon colors on a dark background with smooth animations.',
};

const RULE_PLACEHOLDERS: Record<Rule['trigger'], string> = {
  always: 'Write a rule that always applies. Example: Every file must have at least one comment explaining what it does.',
  on_task_complete: 'What should be checked when a task is done? Example: Make sure there are no console.log statements left in the code.',
  on_test_fail: 'What should happen when tests fail? Example: Look at the error message carefully and fix the exact line that broke.',
  before_deploy: 'What must be true before deploying? Example: All buttons must have labels and the app must work on mobile.',
};

const SKILL_CATEGORIES: Array<{ label: string; value: Skill['category'] }> = [
  { label: 'Agent behavior', value: 'agent' },
  { label: 'Feature details', value: 'feature' },
  { label: 'Style details', value: 'style' },
];

const RULE_TRIGGERS: Array<{ label: string; value: Rule['trigger'] }> = [
  { label: 'Always on', value: 'always' },
  { label: 'On task complete', value: 'on_task_complete' },
  { label: 'On test fail', value: 'on_test_fail' },
  { label: 'Before deploy', value: 'before_deploy' },
];

function generateId(): string {
  return crypto.randomUUID();
}

export default function SkillsRulesModal({ skills, rules, onSkillsChange, onRulesChange, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'skills' | 'rules'>('skills');
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);

  const handleCreateSkill = () => {
    setEditingSkill({ id: generateId(), name: '', prompt: '', category: 'agent' });
  };

  const handleCreateRule = () => {
    setEditingRule({ id: generateId(), name: '', prompt: '', trigger: 'always' });
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

  const handleSaveRule = (rule: Rule) => {
    const existing = rules.findIndex(r => r.id === rule.id);
    if (existing >= 0) {
      const updated = [...rules];
      updated[existing] = rule;
      onRulesChange(updated);
    } else {
      onRulesChange([...rules, rule]);
    }
    setEditingRule(null);
  };

  const handleDeleteSkill = (id: string) => {
    onSkillsChange(skills.filter(s => s.id !== id));
    if (editingSkill?.id === id) setEditingSkill(null);
  };

  const handleDeleteRule = (id: string) => {
    onRulesChange(rules.filter(r => r.id !== id));
    if (editingRule?.id === id) setEditingRule(null);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg mx-4 w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Skills & Rules</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg font-bold"
          >
            X
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4">
          <button
            onClick={() => { setActiveTab('skills'); setEditingRule(null); }}
            className={`px-4 py-2 text-sm font-medium rounded-t ${activeTab === 'skills' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}
          >
            Skills ({skills.length})
          </button>
          <button
            onClick={() => { setActiveTab('rules'); setEditingSkill(null); }}
            className={`px-4 py-2 text-sm font-medium rounded-t ${activeTab === 'rules' ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-500'}`}
          >
            Rules ({rules.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'skills' && !editingSkill && (
            <div>
              {skills.map(skill => (
                <div key={skill.id} className="border border-gray-200 rounded-lg p-3 mb-2 flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{skill.name || '(unnamed)'}</div>
                    <div className="text-xs text-gray-500 mt-1">{skill.category} -- {skill.prompt.slice(0, 80)}{skill.prompt.length > 80 ? '...' : ''}</div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button onClick={() => setEditingSkill(skill)} className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">Edit</button>
                    <button onClick={() => handleDeleteSkill(skill.id)} className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100">Delete</button>
                  </div>
                </div>
              ))}
              {skills.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-4">No skills yet. Create one to give your agents detailed instructions.</p>
              )}
              <button
                onClick={handleCreateSkill}
                className="w-full mt-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm font-medium"
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
            />
          )}

          {activeTab === 'rules' && !editingRule && (
            <div>
              {rules.map(rule => (
                <div key={rule.id} className="border border-gray-200 rounded-lg p-3 mb-2 flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{rule.name || '(unnamed)'}</div>
                    <div className="text-xs text-gray-500 mt-1">{rule.trigger} -- {rule.prompt.slice(0, 80)}{rule.prompt.length > 80 ? '...' : ''}</div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button onClick={() => setEditingRule(rule)} className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">Edit</button>
                    <button onClick={() => handleDeleteRule(rule.id)} className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100">Delete</button>
                  </div>
                </div>
              ))}
              {rules.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-4">No rules yet. Create one to set constraints for your agents.</p>
              )}
              <button
                onClick={handleCreateRule}
                className="w-full mt-2 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 text-sm font-medium"
              >
                + New Rule
              </button>
            </div>
          )}

          {activeTab === 'rules' && editingRule && (
            <RuleEditor
              rule={editingRule}
              onSave={handleSaveRule}
              onDelete={() => handleDeleteRule(editingRule.id)}
              onCancel={() => setEditingRule(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SkillEditor({ skill, onSave, onDelete, onCancel }: {
  skill: Skill;
  onSave: (skill: Skill) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(skill.name);
  const [category, setCategory] = useState<Skill['category']>(skill.category);
  const [prompt, setPrompt] = useState(skill.prompt);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Be Extra Creative"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value as Skill['category'])}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
        >
          {SKILL_CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Instructions</label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={SKILL_PLACEHOLDERS[category]}
          rows={6}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
        />
      </div>
      <div className="flex gap-2 justify-between">
        <button onClick={onDelete} className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm">Delete</button>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm">Cancel</button>
          <button
            onClick={() => onSave({ ...skill, name, category, prompt })}
            disabled={!name.trim() || !prompt.trim()}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm font-medium disabled:opacity-50"
          >
            Done
          </button>
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

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Always Add Comments"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">When to apply</label>
        <select
          value={trigger}
          onChange={e => setTrigger(e.target.value as Rule['trigger'])}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
        >
          {RULE_TRIGGERS.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Rule instructions</label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={RULE_PLACEHOLDERS[trigger]}
          rows={6}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
        />
      </div>
      <div className="flex gap-2 justify-between">
        <button onClick={onDelete} className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm">Delete</button>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm">Cancel</button>
          <button
            onClick={() => onSave({ ...rule, name, trigger, prompt })}
            disabled={!name.trim() || !prompt.trim()}
            className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 text-sm font-medium disabled:opacity-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
