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
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg mx-4 w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Portals</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg font-bold"
          >
            X
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {view === 'list' && (
            <div>
              {portals.map(portal => (
                <div key={portal.id} className="border border-gray-200 rounded-lg p-3 mb-2 flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{portal.name || '(unnamed)'}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">
                        {MECHANISM_LABELS[portal.mechanism]}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {portal.capabilities.length} capability{portal.capabilities.length !== 1 ? 'ies' : 'y'}
                      {portal.description ? ` -- ${portal.description.slice(0, 60)}${portal.description.length > 60 ? '...' : ''}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button onClick={() => handleEdit(portal)} className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">Edit</button>
                    <button onClick={() => handleDelete(portal.id)} className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100">Delete</button>
                  </div>
                </div>
              ))}
              {portals.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-4">No portals yet. Add one to connect your nugget to the outside world.</p>
              )}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleCreate}
                  className="flex-1 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 text-sm font-medium"
                >
                  + New Portal
                </button>
                <button
                  onClick={() => setView('templates')}
                  className="flex-1 px-4 py-2 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 text-sm font-medium border border-teal-200"
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
                className="text-sm text-gray-500 hover:text-gray-700 mb-3"
              >
                &larr; Back to list
              </button>
              <div className="grid grid-cols-1 gap-2">
                {portalTemplates.map((template, i) => (
                  <button
                    key={template.templateId}
                    onClick={() => handleTemplateSelect(i)}
                    className="border border-gray-200 rounded-lg p-3 text-left hover:border-teal-300 hover:bg-teal-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{template.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">
                        {MECHANISM_LABELS[template.mechanism]}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{template.description}</div>
                    <div className="text-xs text-gray-400 mt-1">
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

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. My ESP32 Board"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What is this portal connected to?"
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Mechanism</label>
        <select
          value={mechanism}
          onChange={e => setMechanism(e.target.value as PortalMechanism)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
        >
          {(Object.entries(MECHANISM_LABELS) as [PortalMechanism, string][]).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {mechanism === 'serial' && (
        <div className="space-y-2 border-t border-gray-100 pt-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Serial Port</label>
            <input
              type="text"
              value={serialPort}
              onChange={e => setSerialPort(e.target.value)}
              placeholder="e.g. COM3 or /dev/ttyUSB0 (auto-detect if empty)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Baud Rate</label>
            <input
              type="number"
              value={baudRate}
              onChange={e => setBaudRate(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
          </div>
        </div>
      )}

      {mechanism === 'mcp' && (
        <div className="space-y-2 border-t border-gray-100 pt-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Command</label>
            <input
              type="text"
              value={mcpCommand}
              onChange={e => setMcpCommand(e.target.value)}
              placeholder="e.g. npx"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Arguments</label>
            <input
              type="text"
              value={mcpArgs}
              onChange={e => setMcpArgs(e.target.value)}
              placeholder="e.g. -y @anthropic-ai/mcp-filesystem"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
          </div>
        </div>
      )}

      {mechanism === 'cli' && (
        <div className="space-y-2 border-t border-gray-100 pt-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Command</label>
            <input
              type="text"
              value={cliCommand}
              onChange={e => setCliCommand(e.target.value)}
              placeholder="e.g. python3"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
          </div>
        </div>
      )}

      {portal.capabilities.length > 0 && (
        <div className="border-t border-gray-100 pt-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">Capabilities</label>
          <div className="space-y-1">
            {portal.capabilities.map(cap => (
              <div key={cap.id} className="flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded ${
                  cap.kind === 'action' ? 'bg-blue-100 text-blue-700' :
                  cap.kind === 'event' ? 'bg-amber-100 text-amber-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {cap.kind}
                </span>
                <span className="text-gray-700">{cap.name}</span>
                <span className="text-gray-400">{cap.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-between">
        <button onClick={onDelete} className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm">Delete</button>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm">Cancel</button>
          <button
            onClick={() => onSave(buildPortal())}
            disabled={!name.trim()}
            className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 text-sm font-medium disabled:opacity-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
