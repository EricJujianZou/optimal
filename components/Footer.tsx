export function Footer() {
  return (
    <footer className="border-t border-paper/[0.08] py-6">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 sm:px-8">
        <span className="font-display text-sm font-bold text-paper/90">
          Megamind
        </span>
        <span className="text-sm text-muted">{new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
