/** Interface Designer canvas — interface contract builder for nugget composition. */

import { useState, useEffect } from 'react';
import { registerCanvas, type CanvasProps } from './canvasRegistry';

type InterfaceType = 'data' | 'event' | 'function' | 'stream';

interface InterfaceEntry {
  id: string;
  name: string;
  type: InterfaceType;
}

const INTERFACE_TYPES: InterfaceType[] = ['data', 'event', 'function', 'stream'];

let nextId = 1;
function generateId(): string {
  return `iface-${nextId++}`;
}

function InterfaceDesignerCanvas({ canvasState, onCanvasUpdate, onMaterialize }: CanvasProps) {
  const [provides, setProvides] = useState<InterfaceEntry[]>([]);
  const [requires, setRequires] = useState<InterfaceEntry[]>([]);
  const [newProvideName, setNewProvideName] = useState('');
  const [newProvideType, setNewProvideType] = useState<InterfaceType>('data');
  const [newRequireName, setNewRequireName] = useState('');
  const [newRequireType, setNewRequireType] = useState<InterfaceType>('data');

  const [materializeMsg, setMaterializeMsg] = useState('');

  // Sync from canvasState.data (agent-driven updates)
  useEffect(() => {
    const d = canvasState.data;
    if (Array.isArray(d.provides)) {
      const incoming: InterfaceEntry[] = d.provides
        .filter((p): p is { name: string; type: string } =>
          typeof p === 'object' && p !== null && typeof (p as Record<string, unknown>).name === 'string' && typeof (p as Record<string, unknown>).type === 'string',
        )
        .map((p) => ({ id: generateId(), name: p.name, type: p.type as InterfaceType }));
      if (incoming.length > 0) setProvides(incoming);
    }
    if (Array.isArray(d.requires)) {
      const incoming: InterfaceEntry[] = d.requires
        .filter((r): r is { name: string; type: string } =>
          typeof r === 'object' && r !== null && typeof (r as Record<string, unknown>).name === 'string' && typeof (r as Record<string, unknown>).type === 'string',
        )
        .map((r) => ({ id: generateId(), name: r.name, type: r.type as InterfaceType }));
      if (incoming.length > 0) setRequires(incoming);
    }
  }, [canvasState.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const addProvide = () => {
    const trimmed = newProvideName.trim();
    if (!trimmed) return;
    setProvides([...provides, { id: generateId(), name: trimmed, type: newProvideType }]);
    setNewProvideName('');
    setNewProvideType('data');
  };

  const addRequire = () => {
    const trimmed = newRequireName.trim();
    if (!trimmed) return;
    setRequires([...requires, { id: generateId(), name: trimmed, type: newRequireType }]);
    setNewRequireName('');
    setNewRequireType('data');
  };

  const removeProvide = (id: string) => {
    setProvides(provides.filter((p) => p.id !== id));
  };

  const removeRequire = (id: string) => {
    setRequires(requires.filter((r) => r.id !== id));
  };

  // Find matched connections: provides name matches a requires name (and same type)
  const connections = provides.filter((p) =>
    requires.some((r) => r.name === p.name && r.type === p.type),
  );

  const handleSave = async () => {
    const data = {
      type: 'contracts_saved',
      provides: provides.map(({ name, type }) => ({ name, type })),
      requires: requires.map(({ name, type }) => ({ name, type })),
      connections: connections.map((c) => ({ name: c.name, type: c.type })),
    };
    onCanvasUpdate(data);

    if (onMaterialize) {
      const result = await onMaterialize(data);
      if (result) {
        setMaterializeMsg(`Saved to ${result.primaryFile}!`);
        setTimeout(() => setMaterializeMsg(''), 4000);
      }
    }
  };

  const typeColor = (t: InterfaceType) => {
    switch (t) {
      case 'data':
        return 'bg-blue-500/20 text-blue-400';
      case 'event':
        return 'bg-amber-500/20 text-amber-400';
      case 'function':
        return 'bg-purple-500/20 text-purple-400';
      case 'stream':
        return 'bg-green-500/20 text-green-400';
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h3 className="text-lg font-display font-bold text-atelier-text">
          Connect Your Nuggets Together
        </h3>
        <p className="text-sm text-atelier-text-secondary mt-1">
          Define what your nugget offers and what it needs from others. Matching names light up green!
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 min-h-0">
          {/* Provides column */}
          <div>
            <h4 className="text-sm font-semibold text-atelier-text mb-2">Provides</h4>
            <p className="text-xs text-atelier-text-muted mb-3">What this nugget offers</p>

            <div className="space-y-2 mb-3">
              {provides.map((entry) => {
                const matched = connections.some((c) => c.id === entry.id);
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                      matched
                        ? 'bg-green-500/10 border border-green-500/30'
                        : 'bg-atelier-surface/30 border border-border-subtle'
                    }`}
                    data-testid={`provide-${entry.name}`}
                  >
                    <span className="flex-1 text-sm text-atelier-text">{entry.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${typeColor(entry.type)}`}>
                      {entry.type}
                    </span>
                    {matched && (
                      <span className="text-green-400 text-xs" aria-label="Connected">--</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeProvide(entry.id)}
                      className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
                      aria-label={`Remove provide ${entry.name}`}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Add provide form */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newProvideName}
                onChange={(e) => setNewProvideName(e.target.value)}
                placeholder="Interface name"
                className="flex-1 rounded-lg px-2 py-1.5 text-sm bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none"
                aria-label="New provide name"
              />
              <select
                value={newProvideType}
                onChange={(e) => setNewProvideType(e.target.value as InterfaceType)}
                className="rounded-lg px-2 py-1.5 text-sm bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none"
                aria-label="New provide type"
              >
                {INTERFACE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addProvide}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-accent-sky/20 text-accent-sky hover:bg-accent-sky/30 cursor-pointer"
                aria-label="Add provide interface"
              >
                Add
              </button>
            </div>
          </div>

          {/* Center connections column */}
          <div className="flex flex-col items-center justify-center min-w-[80px]">
            <h4 className="text-sm font-semibold text-atelier-text mb-2">Connections</h4>
            {connections.length === 0 ? (
              <p className="text-xs text-atelier-text-muted text-center">
                No matches yet
              </p>
            ) : (
              <div className="space-y-2">
                {connections.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-1 text-green-400 text-xs"
                    data-testid={`connection-${c.name}`}
                  >
                    <span>--</span>
                    <span className="font-medium">{c.name}</span>
                    <span>--</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Requires column */}
          <div>
            <h4 className="text-sm font-semibold text-atelier-text mb-2">Requires</h4>
            <p className="text-xs text-atelier-text-muted mb-3">What this nugget needs</p>

            <div className="space-y-2 mb-3">
              {requires.map((entry) => {
                const matched = connections.some(
                  (c) => c.name === entry.name && c.type === entry.type,
                );
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                      matched
                        ? 'bg-green-500/10 border border-green-500/30'
                        : 'bg-atelier-surface/30 border border-border-subtle'
                    }`}
                    data-testid={`require-${entry.name}`}
                  >
                    {matched && (
                      <span className="text-green-400 text-xs" aria-label="Connected">--</span>
                    )}
                    <span className="flex-1 text-sm text-atelier-text">{entry.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${typeColor(entry.type)}`}>
                      {entry.type}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeRequire(entry.id)}
                      className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
                      aria-label={`Remove require ${entry.name}`}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Add require form */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newRequireName}
                onChange={(e) => setNewRequireName(e.target.value)}
                placeholder="Interface name"
                className="flex-1 rounded-lg px-2 py-1.5 text-sm bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none"
                aria-label="New require name"
              />
              <select
                value={newRequireType}
                onChange={(e) => setNewRequireType(e.target.value as InterfaceType)}
                className="rounded-lg px-2 py-1.5 text-sm bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none"
                aria-label="New require type"
              >
                {INTERFACE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addRequire}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-accent-sky/20 text-accent-sky hover:bg-accent-sky/30 cursor-pointer"
                aria-label="Add require interface"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="mt-4 pt-4 border-t border-border-subtle flex items-center justify-between">
        <p className="text-xs text-atelier-text-muted">
          {connections.length > 0
            ? `${connections.length} connection${connections.length === 1 ? '' : 's'} matched`
            : 'Add interfaces to both sides to see connections'}
        </p>
        <div className="flex items-center gap-3">
          {materializeMsg && (
            <p className="text-xs text-green-400">{materializeMsg}</p>
          )}
          <button
            type="button"
            onClick={handleSave}
            className="go-btn px-4 py-2 rounded-xl text-sm font-medium"
          >
            Save Contracts
          </button>
        </div>
      </div>
    </div>
  );
}

registerCanvas('interface-designer', InterfaceDesignerCanvas);

export default InterfaceDesignerCanvas;
