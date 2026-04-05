import { Category } from './types';

export const CATEGORIES: Category[] = [
  'Airway',
  'Breathing',
  'Circulation',
  'Medications',
  'Splinting',
  'Burn',
  'OB/Peds',
  'Misc',
];

export const CATEGORY_SORT: Record<Category, number> = {
  'Airway': 1,
  'Breathing': 2,
  'Circulation': 3,
  'Medications': 4,
  'Splinting': 5,
  'Burn': 6,
  'OB/Peds': 7,
  'Misc': 8,
};
