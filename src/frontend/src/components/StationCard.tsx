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
      className="w-full rounded-xl bg-neutral-800 p-4 text-left transition-colors hover:bg-neutral-750 active:bg-neutral-700 border border-neutral-700"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{name}</h3>
          {nickname && <p className="text-sm text-neutral-400">{nickname}</p>}
        </div>
        {shortageCount > 0 && (
          <span className="rounded-full bg-red-900/80 px-2.5 py-0.5 text-xs font-medium text-red-300">
            {shortageCount} short
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        {lastSubmission ? `Last count: ${lastSubmission}` : 'No submissions yet'}
      </p>
    </button>
  );
}
