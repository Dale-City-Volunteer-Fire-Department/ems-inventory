import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useCallback } from 'react';
import type { Station } from '@shared/types';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useStations } from './hooks/useStations';
import Login from './pages/Login';
import StationSelect from './pages/StationSelect';
import InventoryForm from './pages/InventoryForm';
import Dashboard from './pages/Dashboard';
import Inventories from './pages/Inventories';
import Orders from './pages/Orders';
import ParManagement from './pages/ParManagement';
import AdminPanel from './pages/AdminPanel';
import Layout from './components/Layout';
import './index.css';

const ROLE_RANK = { crew: 0, logistics: 1, admin: 2 } as const;

function LoadingScreen() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface text-white">
      <div className="text-center">
        <img src="/dcvfd-badge.svg" alt="DCVFD" className="h-16 w-auto mx-auto mb-4 animate-pulse" />
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    </div>
  );
}

function AppShell() {
  const { selectedStation, selectStation, clearStation } = useStations();
  const { user } = useAuth();
  const [station, setStation] = useState<Station | null>(selectedStation);

  const role = user!.role;
  const userRank = ROLE_RANK[role];

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

  return (
    <Layout role={role} userName={user!.name}>
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
        {userRank >= ROLE_RANK.logistics && <Route path="/dashboard" element={<Dashboard />} />}
        {userRank >= ROLE_RANK.logistics && <Route path="/inventories" element={<Inventories />} />}
        {userRank >= ROLE_RANK.logistics && <Route path="/orders" element={<Orders />} />}
        {userRank >= ROLE_RANK.logistics && <Route path="/par" element={<ParManagement />} />}
        {userRank >= ROLE_RANK.admin && <Route path="/admin" element={<AdminPanel />} />}
        <Route path="/login" element={<Navigate to="/inventory" replace />} />
        <Route path="*" element={<Navigate to="/inventory" replace />} />
      </Routes>
    </Layout>
  );
}

function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return <AppShell />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </BrowserRouter>
  );
}
