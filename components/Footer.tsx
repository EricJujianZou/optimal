export function Footer() {
  return (
    <footer className="border-t border-[var(--line)] py-6">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 sm:px-8">
        <span className="font-serif text-sm font-semibold text-paper/90">
          Megamind
        </span>
        <span className="text-sm text-muted">{new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
