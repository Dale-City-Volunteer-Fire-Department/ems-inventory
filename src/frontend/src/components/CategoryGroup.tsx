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
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="sticky top-0 z-10 flex w-full items-center justify-between bg-surface-raised px-4 py-3 text-left font-semibold text-white rounded-xl border border-border-subtle hover:border-zinc-600 transition-all"
      >
        <span className="flex items-center gap-2.5">
          <svg
            className={`h-4 w-4 text-zinc-500 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm">{name}</span>
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
            allEntered
              ? 'bg-ems-green/15 text-ems-green border border-ems-green/20'
              : 'bg-zinc-800 text-zinc-400 border border-transparent'
          }`}
        >
          {enteredCount}/{itemCount}
        </span>
      </button>
      {open && (
        <div className="mt-0.5 bg-surface-raised rounded-xl border border-border-subtle divide-y divide-border-subtle overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
}
