export interface Item {
  id: number;
  name: string;
  category: Category;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Station {
  id: number;
  name: string; // "Station 10", "Station 13", etc.
  code: string; // "FS10", "FS13", etc.
  is_active: boolean;
}

export interface StockTarget {
  id: number;
  item_id: number;
  station_id: number;
  target_count: number;
  updated_at: string;
}

export interface InventoryCount {
  id: number;
  item_id: number;
  station_id: number;
  target_count: number;
  actual_count: number | null;
  delta: number | null;
  status: CountStatus;
  session_id: string | null;
}

export interface InventoryHistory {
  id: number;
  item_name: string; // Plain text snapshot
  category: string; // Plain text snapshot
  station_name: string; // Plain text snapshot
  target_count: number;
  actual_count: number;
  delta: number;
  status: string;
  submitted_at: string;
  submitted_by: string | null;
  session_id: string;
}

export interface Order {
  id: number;
  station_id: number;
  session_id: string;
  items_short: number;
  pick_list: string;
  status: OrderStatus;
  submitted_at: string;
  filled_at: string | null;
  filled_by: string | null;
}

export type Category = 'Airway' | 'Breathing' | 'Circulation' | 'Medications' | 'Splinting' | 'Burn' | 'OB/Peds' | 'Misc';
export type CountStatus = 'not_entered' | 'good' | 'over' | 'short';
export type OrderStatus = 'pending' | 'in_progress' | 'filled';
export type UserRole = 'crew' | 'logistics' | 'admin';
