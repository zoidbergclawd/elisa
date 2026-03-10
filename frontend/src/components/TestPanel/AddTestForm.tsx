import { useState } from 'react';

interface Props {
  onAddTest: (when: string, then: string) => void;
}

export default function AddTestForm({ onAddTest }: Props) {
  const [when, setWhen] = useState('');
  const [then, setThen] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedWhen = when.trim();
    const trimmedThen = then.trim();
    if (!trimmedWhen || !trimmedThen) return;
    onAddTest(trimmedWhen, trimmedThen);
    setWhen('');
    setThen('');
  };

  return (
    <form onSubmit={handleSubmit} className="px-4 pb-4 space-y-2">
      <p className="text-xs font-medium text-atelier-text-secondary">Add a test</p>
      <input
        type="text"
        placeholder="When [trigger] happens..."
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        className="w-full px-3 py-1.5 text-xs rounded-lg bg-atelier-surface/60 border border-border-subtle text-atelier-text placeholder:text-atelier-text-muted/50 focus:outline-none focus:border-accent-sky/50"
      />
      <input
        type="text"
        placeholder="[action] should happen..."
        value={then}
        onChange={(e) => setThen(e.target.value)}
        className="w-full px-3 py-1.5 text-xs rounded-lg bg-atelier-surface/60 border border-border-subtle text-atelier-text placeholder:text-atelier-text-muted/50 focus:outline-none focus:border-accent-sky/50"
      />
      <button
        type="submit"
        className="px-4 py-1.5 text-xs rounded-lg font-medium bg-accent-sky/20 text-accent-sky hover:bg-accent-sky/30 transition-colors cursor-pointer"
      >
        Add Test
      </button>
    </form>
  );
}
