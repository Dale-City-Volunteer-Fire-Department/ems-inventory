import { useState, type ReactNode } from 'react';

interface CategoryGroupProps {
  name: string;
  itemCount: number;
  enteredCount: number;
  children: ReactNode;
  defaultOpen?: boolean;
}

export default function CategoryGroup({
  name,
  itemCount,
  enteredCount,
  children,
  defaultOpen = true,
}: CategoryGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const allEntered = enteredCount === itemCount;

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="sticky top-0 z-10 flex w-full items-center justify-between bg-neutral-800 px-4 py-3 text-left font-semibold text-white rounded-t-lg border-b border-neutral-700"
      >
        <span className="flex items-center gap-2">
          <svg
            className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {name}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            allEntered ? 'bg-green-900 text-green-300' : 'bg-neutral-700 text-neutral-300'
          }`}
        >
          {enteredCount}/{itemCount}
        </span>
      </button>
      {open && <div className="bg-neutral-900 rounded-b-lg divide-y divide-neutral-800">{children}</div>}
    </div>
  );
}
