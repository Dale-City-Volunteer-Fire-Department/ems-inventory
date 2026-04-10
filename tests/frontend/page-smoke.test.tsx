// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';

// ── Mocks ──────────────────────────────────────────────────────────

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/par' }),
  useNavigate: () => vi.fn(),
  BrowserRouter: ({ children }: { children: React.ReactNode }) => children,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    createElement('a', { href: to }, children),
}));

// Mock useAuth
vi.mock('../../src/frontend/src/hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: {
      role: 'admin' as const,
      name: 'Test User',
      email: 'test@dcvfd.org',
      stationId: 10,
      photoUrl: null,
    },
    login: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock useApi / apiFetch
vi.mock('../../src/frontend/src/hooks/useApi', () => ({
  apiFetch: vi.fn().mockResolvedValue({ items: [], count: 0 }),
  useApi: () => ({
    get: vi.fn().mockResolvedValue({ items: [], count: 0 }),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
  }),
}));

// Mock useStations
vi.mock('../../src/frontend/src/hooks/useStations', () => ({
  useStations: () => ({
    stations: [
      { id: 10, name: 'Station 10', code: 'FS10', is_active: true },
      { id: 13, name: 'Station 13', code: 'FS13', is_active: true },
      { id: 18, name: 'Station 18', code: 'FS18', is_active: true },
      { id: 20, name: 'Station 20', code: 'FS20', is_active: true },
    ],
    selectedStation: null,
    selectStation: vi.fn(),
    clearStation: vi.fn(),
  }),
  useStationsApi: () => ({
    stations: [
      { id: 10, name: 'Station 10', code: 'FS10', is_active: true },
    ],
    loading: false,
  }),
  STATION_NICKNAMES: {
    10: 'The Dime',
    13: 'Midtown',
    18: 'Station 18',
    20: 'Parkway Express',
  },
}));

// Mock useInventory
vi.mock('../../src/frontend/src/hooks/useInventory', () => ({
  useInventory: () => ({
    items: [],
    counts: {},
    loading: false,
    submitting: false,
    submitResult: null,
    error: null,
    progress: { total: 0, entered: 0, remaining: 0 },
    shortages: [],
    itemsByCategory: {},
    canSubmit: false,
    loadInventory: vi.fn(),
    setCount: vi.fn(),
    submit: vi.fn(),
  }),
}));

// Mock fetch globally for components that call fetch directly
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
      status: 200,
    }),
  );
});

// ── Page Imports ────────────────────────────────────────────────────

import Login from '../../src/frontend/src/pages/Login';
import StationSelect from '../../src/frontend/src/pages/StationSelect';
import InventoryForm from '../../src/frontend/src/pages/InventoryForm';
import Dashboard from '../../src/frontend/src/pages/Dashboard';
import Inventories from '../../src/frontend/src/pages/Inventories';
import Orders from '../../src/frontend/src/pages/Orders';
import ParManagement from '../../src/frontend/src/pages/ParManagement';
import AdminPanel from '../../src/frontend/src/pages/AdminPanel';

// ── Smoke Tests ────────────────────────────────────────────────────

describe('Page smoke tests', () => {
  it('Login renders without crash', () => {
    expect(() => render(createElement(Login))).not.toThrow();
  });

  it('StationSelect renders with mock stations', () => {
    expect(() =>
      render(createElement(StationSelect, { onSelect: vi.fn() })),
    ).not.toThrow();
  });

  it('InventoryForm renders with mock station prop', () => {
    expect(() =>
      render(
        createElement(InventoryForm, {
          station: { id: 10, name: 'Station 10', code: 'FS10', is_active: true },
          onChangeStation: vi.fn(),
        }),
      ),
    ).not.toThrow();
  });

  it('Dashboard renders without crash', () => {
    expect(() => render(createElement(Dashboard))).not.toThrow();
  });

  it('Inventories renders without crash', () => {
    expect(() => render(createElement(Inventories))).not.toThrow();
  });

  it('Orders renders without crash', () => {
    expect(() => render(createElement(Orders))).not.toThrow();
  });

  it('ParManagement renders without crash', () => {
    expect(() => render(createElement(ParManagement))).not.toThrow();
  });

  it('AdminPanel renders without crash', () => {
    expect(() => render(createElement(AdminPanel))).not.toThrow();
  });
});
