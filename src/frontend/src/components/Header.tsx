/**
 * Mobile-only header with DCVFD branding.
 * Hidden on desktop (sidebar takes over).
 */
export default function Header() {
  return (
    <header className="md:hidden sticky top-0 z-20 bg-dcvfd">
      <div className="flex items-center justify-center gap-3 px-4 py-3">
        <img src="/dcvfd-logo.svg" alt="DCVFD" className="h-8 w-auto" />
        <h1 className="text-base font-bold text-white tracking-tight">DCVFD EMS Inventory</h1>
      </div>
      <div className="h-0.5 bg-dcvfd-accent" />
    </header>
  );
}
