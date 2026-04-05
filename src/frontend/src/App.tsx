import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useCallback } from 'react';
import type { Station, UserRole } from '@shared/types';
import { useStations } from './hooks/useStations';
import Login from './pages/Login';
import StationSelect from './pages/StationSelect';
import InventoryForm from './pages/InventoryForm';
import LogisticsDashboard from './pages/LogisticsDashboard';
import AdminPanel from './pages/AdminPanel';
import NavBar from './components/NavBar';
import './index.css';

function AppShell() {
  const { selectedStation, selectStation, clearStation } = useStations();
  const [station, setStation] = useState<Station | null>(selectedStation);

  // TODO: replace with real auth once built
  const [role] = useState<UserRole>('admin');
  const [isAuthenticated] = useState(true);

  const handleSelectStation = useCallback(
    (s: Station) => {
      selectStation(s);
      setStation(s);
    },
    [selectStation],
  );

  const handleChangeStation = useCallback(() => {
    clearStation();
    setStation(null);
  }, [clearStation]);

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="min-h-dvh bg-neutral-900">
      <Routes>
        <Route
          path="/inventory"
          element={
            station ? (
              <InventoryForm station={station} onChangeStation={handleChangeStation} />
            ) : (
              <StationSelect onSelect={handleSelectStation} />
            )
          }
        />
        <Route path="/dashboard" element={<LogisticsDashboard />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/inventory" replace />} />
      </Routes>
      <NavBar role={role} />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
