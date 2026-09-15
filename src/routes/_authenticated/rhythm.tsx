import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRhythm, saveRhythm } from "@/lib/rhythm.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/rhythm")({
  validateSearch: (s: Record<string, unknown>) => ({
    from: typeof s.from === "string" ? s.from : undefined,
  }),
  component: RhythmPage,
});

function RhythmPage() {
  const getFn = useServerFn(getRhythm);
  const saveFn = useServerFn(saveRhythm);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { from } = Route.useSearch();

  const { data } = useQuery({ queryKey: ["rhythm"], queryFn: () => getFn() });

  const [form, setForm] = useState({
    wake_time: "",
    winddown_time: "",
    focus_start: "",
    focus_end: "",
    movement_time: "",
    journaling_time: "",
    chore_anchors: "",
    prefers_times: true,
    notes: "",
  });

  useEffect(() => {
    if (data) {
      const r = data as Record<string, unknown>;
      setForm({
        wake_time: (r.wake_time as string) ?? "",
        winddown_time: (r.winddown_time as string) ?? "",
        focus_start: (r.focus_start as string) ?? "",
        focus_end: (r.focus_end as string) ?? "",
        movement_time: (r.movement_time as string) ?? "",
        journaling_time: (r.journaling_time as string) ?? "",
        chore_anchors: (r.chore_anchors as string) ?? "",
        prefers_times: (r.prefers_times as boolean) ?? true,
        notes: (r.notes as string) ?? "",
      });
    }
  }, [data]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveFn({ data: form });
      toast.success("Rhythm saved.");
      qc.invalidateQueries({ queryKey: ["rhythm"] });
      if (from === "onboarding") navigate({ to: "/today" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const skip = () => {
    if (from === "onboarding") navigate({ to: "/today" });
    else toast("No worries — every question is optional.");
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 md:px-10 md:py-14">
      <header className="mb-6">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">Your rhythm</p>
        <h1 className="mt-1 font-display text-3xl md:text-4xl">
          Help Axis learn how you work.
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Every question is optional. Skip anything you don't feel like answering — nothing here is required for the app to work.
        </p>
        {from === "onboarding" && (
          <p className="mt-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            This shines on <strong>Plus</strong> and <strong>Pro</strong> plans, where "Plan my day" uses these answers to suggest times for your must-do tasks. On Free you can still fill it out, but you may prefer to skip for now.
          </p>
        )}
      </header>

      <form onSubmit={save} className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-4 font-display text-lg">Your day</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <TimeField label="When do you usually wake up?" value={form.wake_time} onChange={(v) => setForm({ ...form, wake_time: v })} />
            <TimeField label="When do you wind down?" value={form.winddown_time} onChange={(v) => setForm({ ...form, winddown_time: v })} />
            <TimeField label="Deep-focus starts around" value={form.focus_start} onChange={(v) => setForm({ ...form, focus_start: v })} />
            <TimeField label="Deep-focus ends around" value={form.focus_end} onChange={(v) => setForm({ ...form, focus_end: v })} />
            <TimeField label="Movement / gym" value={form.movement_time} onChange={(v) => setForm({ ...form, movement_time: v })} />
            <TimeField label="Journaling / reflection" value={form.journaling_time} onChange={(v) => setForm({ ...form, journaling_time: v })} />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-2 font-display text-lg">Chore anchors</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            "Laundry on Sundays, errands Wednesday nights" — anything like that.
          </p>
          <Input
            value={form.chore_anchors}
            onChange={(e) => setForm({ ...form, chore_anchors: e.target.value })}
            placeholder="Optional"
          />
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.prefers_times}
              onChange={(e) => setForm({ ...form, prefers_times: e.target.checked })}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">I like times on my tasks</span>
              <span className="block text-sm text-muted-foreground">
                Off = Axis leans toward checklists for you. Dream-life items always stay as a check-off strip.
              </span>
            </span>
          </label>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <Label>Anything else Axis should know?</Label>
          <Textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Optional — free form"
            className="mt-1"
          />
        </section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={skip}>
            {from === "onboarding" ? "Skip for now" : "Reset"}
          </Button>
          <Button type="submit">Save rhythm</Button>
        </div>
      </form>
    </div>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="time" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1" />
    </div>
  );
}
