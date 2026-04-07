import NumericInput from './NumericInput';

interface ItemRowProps {
  name: string;
  targetCount: number;
  value: number | null;
  onChange: (value: number | null) => void;
}

export default function ItemRow({ name, targetCount, value, onChange }: ItemRowProps) {
  // Compute delta for display
  let deltaLabel: string | null = null;
  let deltaColor = '';
  if (value !== null && value !== undefined) {
    const delta = value - targetCount;
    if (delta >= 0) {
      deltaLabel = delta === 0 ? 'OK' : `+${delta}`;
      deltaColor = 'text-ems-green';
    } else {
      deltaLabel = String(delta);
      deltaColor = 'text-ems-red';
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 min-h-[48px] hover:bg-surface-overlay/50 transition-colors">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white truncate block">{name}</span>
      </div>
      <span className="shrink-0 rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-mono text-zinc-500 border border-border-subtle">
        {targetCount}
      </span>
      {deltaLabel && (
        <span className={`shrink-0 w-8 text-xs font-mono text-right font-medium ${deltaColor}`}>{deltaLabel}</span>
      )}
      <NumericInput value={value} onChange={onChange} target={targetCount} aria-label={`Count for ${name}`} />
    </div>
  );
}
