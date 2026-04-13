interface StationCardProps {
  name: string;
  nickname?: string;
  lastSubmission?: string;
  shortageCount: number;
  onClick?: () => void;
}

export default function StationCard({ name, nickname, lastSubmission, shortageCount, onClick }: StationCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl bg-surface-raised p-5 text-left transition-all border border-border-subtle hover:border-dcvfd-accent/40 hover:shadow-lg hover:shadow-dcvfd/5 active:scale-[0.98]"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{name}</h3>
          {nickname && <p className="text-sm text-zinc-400">{nickname}</p>}
        </div>
        {shortageCount > 0 ? (
          <span className="rounded-full bg-ems-red/15 border border-ems-red/20 px-2.5 py-0.5 text-xs font-medium text-ems-red">
            {shortageCount} short
          </span>
        ) : (
          <span className="rounded-full bg-ems-green/15 border border-ems-green/20 px-2.5 py-0.5 text-xs font-medium text-ems-green">
            Stocked
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        {lastSubmission ? `Last count: ${new Date(lastSubmission).toLocaleDateString()}` : 'No submissions yet'}
      </div>
    </button>
  );
}
