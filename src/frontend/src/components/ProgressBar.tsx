interface ProgressBarProps {
  entered: number;
  total: number;
}

export default function ProgressBar({ entered, total }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((entered / total) * 100) : 0;
  const isComplete = entered === total && total > 0;

  return (
    <div className="w-full">
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-zinc-400">
          <span className="font-mono font-medium text-white">{entered}</span>
          <span className="text-zinc-600">/</span>
          <span className="font-mono">{total}</span>
          <span className="ml-1.5">entered</span>
        </span>
        <span className={`font-mono font-medium ${isComplete ? 'text-ems-green' : 'text-zinc-400'}`}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${isComplete ? 'bg-ems-green' : 'bg-dcvfd-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
