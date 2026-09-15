import { createFileRoute, Link } from "@tanstack/react-router";
import { Calendar, CheckCircle2, Coffee, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-full border-2 border-foreground">
            <div className="h-2 w-2 rounded-full bg-foreground" />
          </div>
          <span className="text-xl font-display">axis</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Sign in</Link>
          <Link to="/auth" className="rounded-full bg-foreground px-4 py-2 text-sm text-background hover:opacity-90">Get started</Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-6 pb-16 pt-12 text-center md:pt-24">
          <p className="mb-4 text-sm uppercase tracking-[0.2em] text-muted-foreground">calm productivity · dream life</p>
          <h1 className="font-display text-5xl leading-[1.05] md:text-7xl">
            When life spins,<br />
            <span className="italic text-primary">axis</span> keeps you together.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            A planner for ADHD brains, freelancers juggling everything, and parents with a
            million tabs open — with room to <span className="italic">manifest and build the life
            you actually want</span>. Small steps toward your dream, right on today's calendar.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/auth" className="rounded-full bg-foreground px-6 py-3 text-sm text-background hover:opacity-90">
              Start free
            </Link>
            <a href="#features" className="rounded-full border border-border px-6 py-3 text-sm hover:bg-secondary">
              See how it works
            </a>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-6 pb-24">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Feature icon={<CheckCircle2 />} title="Only 5 today" body="A hard cap on your must-do list. Break each one into subtasks — small wins add up." tint="var(--bucket-today)" />
            <Feature icon={<Calendar />} title="Every zoom level" body="Day, week, month, quarter, and year. See tomorrow and next October in one place." tint="var(--bucket-later)" />
            <Feature icon={<Sparkles />} title="Manifest your dream life" body="Drop in a dream — Axis turns it into milestones, habits, and daily steps on your calendar." tint="var(--bucket-habits)" />
            <Feature icon={<Coffee />} title="Rest, not doomscroll" body="Timed nudges suggest a 5-minute walk or a Duolingo lesson — never another feed." tint="var(--primary)" />
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-4xl px-6 py-24 text-center">
            <h2 className="font-display text-4xl md:text-5xl">Build your dream life, one day at a time.</h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Tell Axis where you are and where you want to go. It weaves the steps into your
              week — a habit here, a focused block there — so manifesting stops being a mood
              board and starts being your Tuesday.
            </p>
            <Link to="/auth" className="mt-8 inline-block rounded-full bg-foreground px-6 py-3 text-sm text-background hover:opacity-90">
              Start manifesting
            </Link>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-4xl px-6 py-24 text-center">
            <h2 className="font-display text-4xl md:text-5xl">Made for the day you actually have.</h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Pick your own colors. Customize your nudge cadence. Your quiet hours are respected.
              Axis adapts to your brain — not the other way around.
            </p>
            <Link to="/auth" className="mt-8 inline-block rounded-full bg-foreground px-6 py-3 text-sm text-background hover:opacity-90">
              Create your account
            </Link>
          </div>
        </section>

      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Axis</span>
          <span className="font-display italic">stay centered.</span>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, body, tint }: { icon: React.ReactNode; title: string; body: string; tint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 grid h-10 w-10 place-items-center rounded-full text-background" style={{ backgroundColor: tint }}>
        {icon}
      </div>
      <h3 className="font-display text-xl">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
