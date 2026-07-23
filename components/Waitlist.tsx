import { WaitlistForm } from "./WaitlistForm";

export function Waitlist() {
  return (
    <section
      id="waitlist"
      className="scroll-mt-10 border-t border-paper/[0.08] bg-ink py-[clamp(5.5rem,15vw,9.5rem)]"
    >
      <div className="mx-auto max-w-5xl px-6 sm:px-8">
        <h2 className="max-w-[11ch] font-display text-[clamp(1.9rem,4.2vw,3.1rem)] font-semibold leading-[1.06] tracking-[-0.035em] text-paper">
          Join the waitlist.
        </h2>
        <p className="mt-5 max-w-[26ch] text-[15px] leading-relaxed text-muted sm:text-base">
          Early access when Megamind opens.
        </p>
        <div className="mt-10 sm:mt-12">
          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}
