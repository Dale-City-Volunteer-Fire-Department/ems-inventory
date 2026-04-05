import type { Category } from '@shared/types';

export interface PickListItem {
  name: string;
  category: Category;
  target: number;
  actual: number;
  needed: number;
}

interface PickListProps {
  stationName: string;
  items: PickListItem[];
  date?: string;
}

export default function PickList({ stationName, items, date }: PickListProps) {
  // Group by category
  const grouped: Record<string, PickListItem[]> = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  return (
    <div className="bg-white text-black p-6 rounded-lg print:p-0 print:rounded-none">
      <div className="mb-4 border-b border-gray-300 pb-4">
        <h2 className="text-xl font-bold">Resupply Pick List</h2>
        <p className="text-sm text-gray-600">
          {stationName} {date ? `- ${date}` : ''}
        </p>
        <p className="text-sm text-gray-600">{items.length} items needed</p>
      </div>
      {Object.entries(grouped).map(([category, catItems]) => (
        <div key={category} className="mb-4">
          <h3 className="text-sm font-bold uppercase text-gray-500 mb-1">{category}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="py-1 font-medium">Item</th>
                <th className="py-1 font-medium text-right w-16">Need</th>
                <th className="py-1 font-medium text-right w-16">Have</th>
                <th className="py-1 font-medium text-right w-16">Pull</th>
                <th className="py-1 w-8 print:w-12"></th>
              </tr>
            </thead>
            <tbody>
              {catItems.map((item) => (
                <tr key={item.name} className="border-b border-gray-100">
                  <td className="py-1.5">{item.name}</td>
                  <td className="py-1.5 text-right font-mono">{item.target}</td>
                  <td className="py-1.5 text-right font-mono">{item.actual}</td>
                  <td className="py-1.5 text-right font-mono font-bold text-red-600">{item.needed}</td>
                  <td className="py-1.5 text-center">
                    <span className="inline-block h-4 w-4 border border-gray-400 rounded-sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
