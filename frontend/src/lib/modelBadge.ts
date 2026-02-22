/** Shorten model IDs to human-friendly labels. */
export function formatModelName(modelId: string | undefined): string | null {
  if (!modelId) return null;
  if (modelId.startsWith('claude-opus')) return 'Opus';
  if (modelId.startsWith('claude-sonnet')) return 'Sonnet';
  if (modelId.startsWith('claude-haiku')) return 'Haiku';
  return modelId;
}

/** Tailwind classes for a colored model pill badge. */
export function modelPillClasses(label: string): string {
  const base = 'text-[10px] font-mono px-1.5 py-0.5 rounded-full';
  switch (label) {
    case 'Opus': return `${base} bg-violet-500/15 text-violet-300 border border-violet-500/20`;
    case 'Sonnet': return `${base} bg-sky-500/15 text-sky-300 border border-sky-500/20`;
    case 'Haiku': return `${base} bg-emerald-500/15 text-emerald-300 border border-emerald-500/20`;
    default: return `${base} bg-amber-500/15 text-amber-300 border border-amber-500/20`;
  }
}
