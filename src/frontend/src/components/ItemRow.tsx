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
      deltaColor = 'text-green-400';
    } else {
      deltaLabel = String(delta);
      deltaColor = 'text-red-400';
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 min-h-[48px]">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white truncate block">{name}</span>
      </div>
      <span className="shrink-0 rounded bg-neutral-700 px-2 py-0.5 text-xs font-mono text-neutral-400">
        {targetCount}
      </span>
      {deltaLabel && <span className={`shrink-0 w-8 text-xs font-mono text-right ${deltaColor}`}>{deltaLabel}</span>}
      <NumericInput value={value} onChange={onChange} target={targetCount} aria-label={`Count for ${name}`} />
    </div>
  );
}
