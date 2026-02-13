import { useState } from 'react';
import type { Portal, PortalMechanism } from './types';
import { portalTemplates } from './portalTemplates';

interface Props {
  portals: Portal[];
  onPortalsChange: (portals: Portal[]) => void;
  onClose: () => void;
}

const MECHANISM_LABELS: Record<PortalMechanism, string> = {
  auto: 'Auto-detect',
  mcp: 'MCP Server',
  cli: 'CLI Tool',
  serial: 'Serial / USB',
};

function generateId(): string {
  return crypto.randomUUID();
}

type View = 'list' | 'editor' | 'templates';

export default function PortalsModal({ portals, onPortalsChange, onClose }: Props) {
  const [view, setView] = useState<View>('list');
  const [editingPortal, setEditingPortal] = useState<Portal | null>(null);

  const handleCreate = () => {
    setEditingPortal({
      id: generateId(),
      name: '',
      description: '',
      mechanism: 'auto',
      status: 'unconfigured',
      capabilities: [],
    });
    setView('editor');
  };

  const handleEdit = (portal: Portal) => {
    setEditingPortal(portal);
    setView('editor');
  };

  const handleSave = (portal: Portal) => {
    const existing = portals.findIndex(p => p.id === portal.id);
    if (existing >= 0) {
      const updated = [...portals];
      updated[existing] = portal;
      onPortalsChange(updated);
    } else {
      onPortalsChange([...portals, portal]);
    }
    setEditingPortal(null);
    setView('list');
  };

  const handleDelete = (id: string) => {
    onPortalsChange(portals.filter(p => p.id !== id));
    if (editingPortal?.id === id) {
      setEditingPortal(null);
      setView('list');
    }
  };

  const handleTemplateSelect = (templateIndex: number) => {
    const template = portalTemplates[templateIndex];
    const newPortal: Portal = {
      ...template,
      id: generateId(),
    };
    setEditingPortal(newPortal);
    setView('editor');
  };

  return (
    <div className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="portals-modal-title">
      <div className="glass-elevated rounded-2xl shadow-2xl p-6 max-w-lg mx-4 w-full max-h-[80vh] flex flex-col animate-float-in">
        <div className="flex items-center justify-between mb-4">
          <h2 id="portals-modal-title" className="text-xl font-display font-bold text-atelier-text">Portals</h2>
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
              {portals.map(portal => (
                <div key={portal.id} className="border border-border-subtle rounded-xl p-3 mb-2 flex items-start justify-between bg-atelier-surface/40">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-atelier-text">{portal.name || '(unnamed)'}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent-sky/15 text-accent-sky">
                        {MECHANISM_LABELS[portal.mechanism]}
                      </span>
                    </div>
                    <div className="text-xs text-atelier-text-muted mt-1">
                      {portal.capabilities.length} capability{portal.capabilities.length !== 1 ? 'ies' : 'y'}
                      {portal.description ? ` -- ${portal.description.slice(0, 60)}${portal.description.length > 60 ? '...' : ''}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button onClick={() => handleEdit(portal)} className="text-xs px-2 py-1 bg-atelier-elevated rounded-lg hover:bg-atelier-hover text-atelier-text-secondary transition-colors">Edit</button>
                    <button onClick={() => handleDelete(portal.id)} className="text-xs px-2 py-1 bg-accent-coral/10 text-accent-coral rounded-lg hover:bg-accent-coral/20 transition-colors">Delete</button>
                  </div>
                </div>
              ))}
              {portals.length === 0 && (
                <p className="text-atelier-text-muted text-sm text-center py-4">No portals yet. Add one to connect your nugget to the outside world.</p>
              )}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleCreate}
                  className="flex-1 px-4 py-2 bg-accent-sky text-white rounded-xl hover:bg-accent-sky/80 text-sm font-medium transition-colors"
                >
                  + New Portal
                </button>
                <button
                  onClick={() => setView('templates')}
                  className="flex-1 px-4 py-2 bg-accent-sky/15 text-accent-sky rounded-xl hover:bg-accent-sky/25 text-sm font-medium border border-accent-sky/20 transition-colors"
                >
                  From Template
                </button>
              </div>
            </div>
          )}

          {view === 'editor' && editingPortal && (
            <PortalEditor
              portal={editingPortal}
              onSave={handleSave}
              onDelete={() => handleDelete(editingPortal.id)}
              onCancel={() => { setEditingPortal(null); setView('list'); }}
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
                {portalTemplates.map((template, i) => (
                  <button
                    key={template.templateId}
                    onClick={() => handleTemplateSelect(i)}
                    className="border border-border-subtle rounded-xl p-3 text-left hover:border-accent-sky/40 hover:bg-accent-sky/5 transition-all bg-atelier-surface/40"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-atelier-text">{template.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent-sky/15 text-accent-sky">
                        {MECHANISM_LABELS[template.mechanism]}
                      </span>
                    </div>
                    <div className="text-xs text-atelier-text-muted mt-1">{template.description}</div>
                    <div className="text-xs text-atelier-text-muted/60 mt-1">
                      {template.capabilities.length} capabilities: {template.capabilities.map(c => c.name).join(', ')}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PortalEditor({ portal, onSave, onDelete, onCancel }: {
  portal: Portal;
  onSave: (portal: Portal) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(portal.name);
  const [description, setDescription] = useState(portal.description);
  const [mechanism, setMechanism] = useState<PortalMechanism>(portal.mechanism);

  // Serial config
  const [serialPort, setSerialPort] = useState(portal.serialConfig?.port ?? '');
  const [baudRate, setBaudRate] = useState(portal.serialConfig?.baudRate ?? 115200);

  // MCP config
  const [mcpCommand, setMcpCommand] = useState(portal.mcpConfig?.command ?? '');
  const [mcpArgs, setMcpArgs] = useState(portal.mcpConfig?.args?.join(' ') ?? '');

  // CLI config
  const [cliCommand, setCliCommand] = useState(portal.cliConfig?.command ?? '');

  const buildPortal = (): Portal => {
    const result: Portal = {
      ...portal,
      name,
      description,
      mechanism,
    };
    if (mechanism === 'serial') {
      result.serialConfig = {
        ...(portal.serialConfig ?? {}),
        ...(serialPort ? { port: serialPort } : {}),
        baudRate,
      };
    } else if (mechanism === 'mcp') {
      result.mcpConfig = {
        command: mcpCommand,
        ...(mcpArgs.trim() ? { args: mcpArgs.trim().split(/\s+/) } : {}),
      };
    } else if (mechanism === 'cli') {
      result.cliConfig = { command: cliCommand };
    }
    return result;
  };

  const inputClass = "w-full bg-atelier-surface border border-border-medium rounded-xl px-3 py-2 text-sm text-atelier-text placeholder-atelier-text-muted focus:outline-none focus:ring-2 focus:ring-accent-sky/40";

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-atelier-text-secondary mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. My ESP32 Board"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-atelier-text-secondary mb-1">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What is this portal connected to?"
          rows={2}
          className={`${inputClass} resize-none`}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-atelier-text-secondary mb-1">Mechanism</label>
        <select
          value={mechanism}
          onChange={e => setMechanism(e.target.value as PortalMechanism)}
          className={inputClass}
        >
          {(Object.entries(MECHANISM_LABELS) as [PortalMechanism, string][]).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {mechanism === 'serial' && (
        <div className="space-y-2 border-t border-border-subtle pt-2">
          <div>
            <label className="block text-xs font-medium text-atelier-text-secondary mb-1">Serial Port</label>
            <input
              type="text"
              value={serialPort}
              onChange={e => setSerialPort(e.target.value)}
              placeholder="e.g. COM3 or /dev/ttyUSB0 (auto-detect if empty)"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-atelier-text-secondary mb-1">Baud Rate</label>
            <input
              type="number"
              value={baudRate}
              onChange={e => setBaudRate(Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
      )}

      {mechanism === 'mcp' && (
        <div className="space-y-2 border-t border-border-subtle pt-2">
          <div>
            <label className="block text-xs font-medium text-atelier-text-secondary mb-1">Command</label>
            <input
              type="text"
              value={mcpCommand}
              onChange={e => setMcpCommand(e.target.value)}
              placeholder="e.g. npx"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-atelier-text-secondary mb-1">Arguments</label>
            <input
              type="text"
              value={mcpArgs}
              onChange={e => setMcpArgs(e.target.value)}
              placeholder="e.g. -y @anthropic-ai/mcp-filesystem"
              className={inputClass}
            />
          </div>
        </div>
      )}

      {mechanism === 'cli' && (
        <div className="space-y-2 border-t border-border-subtle pt-2">
          <div>
            <label className="block text-xs font-medium text-atelier-text-secondary mb-1">Command</label>
            <input
              type="text"
              value={cliCommand}
              onChange={e => setCliCommand(e.target.value)}
              placeholder="e.g. python3"
              className={inputClass}
            />
          </div>
        </div>
      )}

      {portal.capabilities.length > 0 && (
        <div className="border-t border-border-subtle pt-2">
          <label className="block text-xs font-medium text-atelier-text-secondary mb-1">Capabilities</label>
          <div className="space-y-1">
            {portal.capabilities.map(cap => (
              <div key={cap.id} className="flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded-full ${
                  cap.kind === 'action' ? 'bg-accent-sky/15 text-accent-sky' :
                  cap.kind === 'event' ? 'bg-accent-gold/15 text-accent-gold' :
                  'bg-accent-mint/15 text-accent-mint'
                }`}>
                  {cap.kind}
                </span>
                <span className="text-atelier-text-secondary">{cap.name}</span>
                <span className="text-atelier-text-muted">{cap.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-between">
        <button onClick={onDelete} className="px-3 py-2 bg-accent-coral/10 text-accent-coral rounded-xl hover:bg-accent-coral/20 text-sm transition-colors">Delete</button>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-2 bg-atelier-surface text-atelier-text-secondary rounded-xl hover:bg-atelier-elevated text-sm transition-colors">Cancel</button>
          <button
            onClick={() => onSave(buildPortal())}
            disabled={!name.trim()}
            className="go-btn px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
