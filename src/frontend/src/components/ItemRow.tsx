import NumericInput from './NumericInput';

interface ItemRowProps {
  name: string;
  targetCount: number;
  value: number | null;
  onChange: (value: number | null) => void;
}

export default function ItemRow({ name, value, onChange }: ItemRowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 min-h-[44px] hover:bg-surface-overlay/50 transition-colors">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white truncate block">{name}</span>
      </div>
      <NumericInput value={value} onChange={onChange} aria-label={`Count for ${name}`} />
    </div>
  );
}
