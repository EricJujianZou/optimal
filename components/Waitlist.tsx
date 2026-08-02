import { WaitlistForm } from "./WaitlistForm";

export function Waitlist() {
  return (
    <section
      id="waitlist"
      className="scroll-mt-10 border-t border-[var(--line)] bg-ink py-[clamp(5.5rem,15vw,9.5rem)]"
    >
      <div className="mx-auto max-w-5xl px-6 sm:px-8">
        <h2 className="max-w-[12ch] font-serif text-[clamp(1.9rem,4.2vw,3.1rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-paper text-balance">
          Join the waitlist.
        </h2>
        <p className="mt-5 max-w-[32ch] text-[15px] leading-relaxed text-muted sm:text-base">
          Early access when Megamind opens — calm counsel for the calls that
          matter.
        </p>
        <p className="mt-4">
          <a
            href="/decide"
            className="text-sm font-medium text-brass underline decoration-brass/35 underline-offset-4 transition-colors hover:decoration-brass"
          >
            Or try the decision demo now →
          </a>
        </p>
        <div className="mt-10 sm:mt-12">
          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}
