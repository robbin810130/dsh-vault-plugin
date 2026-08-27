export function ProtectedLockIcon({ className }: { readonly className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16" fill="none" focusable="false">
      <path d="M5 7V5.75a3 3 0 0 1 6 0V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="3.25" y="6.25" width="9.5" height="7.5" rx="2" fill="currentColor" />
      <path d="M8 8.75v2" stroke="var(--dsw-alias-bg-layer-2, #2b2b2b)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
