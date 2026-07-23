import { FilmHero } from "@/components/FilmHero";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { Waitlist } from "@/components/Waitlist";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <FilmHero />
        <Waitlist />
      </main>
      <Footer />
    </>
  );
}
