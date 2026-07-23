export function Nav() {
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <nav
        className="mx-auto flex max-w-5xl items-center justify-end px-6 py-5 sm:px-8"
        aria-label="Primary"
      >
        <a
          href="#waitlist"
          className="min-h-10 inline-flex items-center text-sm text-muted transition-colors hover:text-paper"
        >
          Join
        </a>
      </nav>
    </header>
  );
}
