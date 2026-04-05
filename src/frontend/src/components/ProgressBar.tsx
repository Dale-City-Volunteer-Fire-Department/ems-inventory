interface ProgressBarProps {
  entered: number;
  total: number;
}

export default function ProgressBar({ entered, total }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((entered / total) * 100) : 0;

  return (
    <div className="w-full">
      <div className="flex justify-between text-sm text-neutral-400 mb-1">
        <span>
          {entered}/{total} items entered
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-neutral-700 overflow-hidden">
        <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
