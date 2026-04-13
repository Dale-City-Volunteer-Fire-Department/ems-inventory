import type { Station } from '@shared/types';
import { useStations, STATION_NICKNAMES } from '../hooks/useStations';

interface StationSelectProps {
  onSelect: (station: Station) => void;
}

export default function StationSelect({ onSelect }: StationSelectProps) {
  const { stations } = useStations();

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-surface text-white p-6 pb-20 md:pb-6">
      <div className="text-center mb-8">
        <h1 className="text-xl font-bold mb-1">Select Your Station</h1>
        <p className="text-zinc-500 text-sm">Choose the station you're counting for today</p>
      </div>

      <div className="w-full max-w-sm md:max-w-3xl grid grid-cols-2 md:grid-cols-4 gap-4">
        {stations.map((station) => (
          <button
            key={station.id}
            type="button"
            onClick={() => onSelect(station)}
            className="group relative flex flex-col items-center justify-center rounded-2xl bg-surface-raised border border-border-subtle p-6 min-h-[130px] transition-all hover:border-dcvfd-accent/50 hover:bg-surface-overlay hover:shadow-lg hover:shadow-dcvfd/10 active:scale-[0.97]"
          >
            <div className="absolute top-3 right-3 h-2 w-2 rounded-full bg-zinc-700 group-hover:bg-dcvfd-accent transition-colors" />
            <span className="text-4xl font-bold text-white group-hover:text-dcvfd-accent transition-colors">
              {station.id}
            </span>
            <span className="text-sm text-zinc-400 mt-1.5 group-hover:text-zinc-300 transition-colors">
              {STATION_NICKNAMES[station.id] ?? station.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
