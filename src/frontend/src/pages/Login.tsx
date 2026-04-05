export default function Login() {
  const handleEntraId = () => {
    // TODO: redirect to Entra ID SAML/SSO flow
    console.log('Entra ID login');
  };

  const handleMagicLink = () => {
    // TODO: show magic link email form
    console.log('Magic link login');
  };

  const handleStationPin = () => {
    // TODO: show station PIN entry
    console.log('Station PIN login');
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-neutral-900 text-white p-6">
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="mb-2 text-4xl">🚑</div>
        <h1 className="text-2xl font-bold mb-1">EMS Inventory</h1>
        <p className="text-neutral-400 text-sm mb-10">Dale City Volunteer Fire Department</p>

        <div className="w-full space-y-3">
          <button
            type="button"
            onClick={handleEntraId}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-blue-600 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-blue-700 active:bg-blue-800 min-h-[48px]"
          >
            <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
              <rect x="1" y="1" width="9" height="9" fill="#F25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
              <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
            </svg>
            Sign in with Entra ID
          </button>

          <button
            type="button"
            onClick={handleMagicLink}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-neutral-800 px-6 py-3.5 text-base font-semibold text-white border border-neutral-700 transition-colors hover:bg-neutral-750 active:bg-neutral-700 min-h-[48px]"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            Magic Link
          </button>

          <button
            type="button"
            onClick={handleStationPin}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-neutral-800 px-6 py-3.5 text-base font-semibold text-white border border-neutral-700 transition-colors hover:bg-neutral-750 active:bg-neutral-700 min-h-[48px]"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            Station PIN
          </button>
        </div>
      </div>

      <p className="absolute bottom-6 text-xs text-neutral-600 text-center">
        &copy; 2026 Dale City Volunteer Fire Department, Inc.
      </p>
    </div>
  );
}
