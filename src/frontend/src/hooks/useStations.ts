import { useState, useEffect, useCallback } from 'react';
import type { Station } from '@shared/types';

const STORAGE_KEY = 'ems-selected-station';

// Hardcoded stations for offline/fast startup. API can override.
const DEFAULT_STATIONS: Station[] = [
  { id: 10, name: 'Station 10', code: 'FS10', is_active: true },
  { id: 13, name: 'Station 13', code: 'FS13', is_active: true },
  { id: 18, name: 'Station 18', code: 'FS18', is_active: true },
  { id: 20, name: 'Station 20', code: 'FS20', is_active: true },
];

export function useStations() {
  const [stations] = useState<Station[]>(DEFAULT_STATIONS);
  const [selectedStation, setSelectedStation] = useState<Station | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved) as Station;
    } catch {
      // ignore
    }
    return null;
  });

  const selectStation = useCallback((station: Station) => {
    setSelectedStation(station);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(station));
  }, []);

  const clearStation = useCallback(() => {
    setSelectedStation(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { stations, selectedStation, selectStation, clearStation };
}

/** Station nicknames for display */
export const STATION_NICKNAMES: Record<number, string> = {
  10: 'The Dime',
  13: 'Midtown',
  18: 'Station 18',
  20: 'Parkway Express',
};

/** Hook to load stations from API (for future use) */
export function useStationsApi() {
  const [stations, setStations] = useState<Station[]>(DEFAULT_STATIONS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/stations')
      .then((r) => r.json() as Promise<Station[]>)
      .then((data) => {
        if (!cancelled) setStations(data);
      })
      .catch(() => {
        // Fall back to defaults
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { stations, loading };
}
