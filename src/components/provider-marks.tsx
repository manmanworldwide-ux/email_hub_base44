export function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.5 13.3l7.8 6C12.2 13.6 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17z" />
      <path fill="#FBBC05" d="M10.3 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.5 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.4 0-11.8-4.1-13.7-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function OutlookMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect x="4" y="10" width="24" height="28" rx="3" fill="#0F6CBD" />
      <ellipse cx="16" cy="24" rx="7" ry="8" fill="#fff" />
      <ellipse cx="16" cy="24" rx="3.5" ry="4.5" fill="#0F6CBD" />
      <path d="M28 16h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H28V16z" fill="#28A8EA" />
      <path d="M28 16h16l-8 6-8-6z" fill="#50D9FF" />
    </svg>
  );
}

export function ProviderMark({ provider, className }: { provider: string; className?: string }) {
  return provider === "google" ? <GoogleMark className={className} /> : <OutlookMark className={className} />;
}
