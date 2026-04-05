import type { Station } from '@shared/types';
import { useStations, STATION_NICKNAMES } from '../hooks/useStations';

interface StationSelectProps {
  onSelect: (station: Station) => void;
}

export default function StationSelect({ onSelect }: StationSelectProps) {
  const { stations } = useStations();

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-neutral-900 text-white p-6">
      <h1 className="text-xl font-bold mb-2">Select Your Station</h1>
      <p className="text-neutral-400 text-sm mb-8">This will be remembered for next time</p>

      <div className="w-full max-w-sm grid grid-cols-2 gap-4">
        {stations.map((station) => (
          <button
            key={station.id}
            type="button"
            onClick={() => onSelect(station)}
            className="flex flex-col items-center justify-center rounded-xl bg-neutral-800 border-2 border-neutral-700 p-6 min-h-[120px] transition-all hover:border-blue-500 hover:bg-neutral-750 active:bg-neutral-700 active:scale-95"
          >
            <span className="text-3xl font-bold">{station.id}</span>
            <span className="text-sm text-neutral-400 mt-1">{STATION_NICKNAMES[station.id] ?? station.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
