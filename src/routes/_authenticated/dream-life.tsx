import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/hooks/useProfile";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { generatePlan, applyPlan, type DreamPlan } from "@/lib/dream-life.functions";
import { LockedFeature } from "@/components/LockedFeature";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Sparkles, Plus, Trash2, ImagePlus, StickyNote, Quote,
  Loader2, Wand2, Pause, Play, Check, X, ChevronDown, ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dream-life")({
  component: DreamLifePage,
});

type Dream = {
  id: string;
  user_id: string;
  title: string;
  why: string | null;
  category: string;
  horizon: string;
  status: "active" | "paused" | "achieved";
  color: string | null;
  created_at: string;
};

type BoardItem = {
  id: string;
  user_id: string;
  area_key: string | null;
  kind: "image" | "note" | "quote";
  image_path: string | null;
  text_content: string | null;
  caption: string | null;
  position: number;
};

const CATEGORIES = [
  { key: "health", label: "Health" },
  { key: "work", label: "Work" },
  { key: "money", label: "Money" },
  { key: "relationships", label: "Relationships" },
  { key: "growth", label: "Growth" },
  { key: "play", label: "Play" },
  { key: "other", label: "Other" },
] as const;

const HORIZONS = [
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "6mo", label: "6 months" },
  { key: "1yr", label: "1 year" },
  { key: "3yr", label: "3 years" },
] as const;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function DreamLifePage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-10 md:py-12">
      <header className="mb-6">
        <p className="flex items-center gap-2 text-sm uppercase tracking-widest text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" /> Dream Life · Pro
        </p>
        <h1 className="mt-2 font-display text-3xl md:text-4xl">Your dream life, on the calendar.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add a dream. Axis builds a plan you can edit, then weaves it into your week.
        </p>
      </header>
      <LockedFeature featureKey="dream_life">
        <DreamLifeInner />
      </LockedFeature>
    </div>
  );
}

function DreamLifeInner() {
  const [tab, setTab] = useState<"dreams" | "board">("dreams");
  return (
    <>
      <div className="mb-6 inline-flex rounded-full border border-border bg-card p-1 text-sm">
        <TabBtn active={tab === "dreams"} onClick={() => setTab("dreams")}>Dreams</TabBtn>
        <TabBtn active={tab === "board"} onClick={() => setTab("board")}>Vision Board</TabBtn>
      </div>
      {tab === "dreams" ? <DreamsTab /> : <VisionBoard />}
    </>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full px-4 py-1.5 transition ${active ? "bg-foreground text-background" : "text-muted-foreground"}`}>
      {children}
    </button>
  );
}

// ---------- Dreams ----------

function DreamsTab() {
  const { user } = useSessionUser();
  const qc = useQueryClient();
  const { data: dreams = [] } = useQuery({
    queryKey: ["dreams", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Dream[]> => {
      if (!user) return [];
      const { data } = await supabase.from("dreams").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      return (data as unknown as Dream[]) ?? [];
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["dreams", user?.id] });

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [category, setCategory] = useState<string>("growth");
  const [horizon, setHorizon] = useState<string>("90d");

  const create = async () => {
    if (!user || !title.trim()) return;
    const { error } = await supabase.from("dreams").insert({
      user_id: user.id, title: title.trim(), why: why.trim() || null, category, horizon, status: "active",
    } as never);
    if (error) { toast.error(error.message); return; }
    setTitle(""); setWhy(""); setCategory("growth"); setHorizon("90d"); setCreating(false);
    invalidate();
    toast.success("Dream added.");
  };

  const active = dreams.filter((d) => d.status !== "achieved");
  const achieved = dreams.filter((d) => d.status === "achieved");

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5">
        {!creating ? (
          <button onClick={() => setCreating(true)} className="flex w-full items-center gap-2 text-left text-muted-foreground hover:text-foreground">
            <Plus className="h-4 w-4" /> Add a dream…
          </button>
        ) : (
          <div className="space-y-3">
            <Input autoFocus placeholder="What's the dream? (e.g. Run a half marathon)" value={title} onChange={(e) => setTitle(e.target.value)} className="font-display text-lg" />
            <Textarea placeholder="Why does it matter to you? (optional)" value={why} onChange={(e) => setWhy(e.target.value)} rows={2} />
            <div className="flex flex-wrap gap-3">
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-widest text-muted-foreground">Category</p>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((c) => (
                    <button key={c.key} onClick={() => setCategory(c.key)}
                      className={`rounded-full border px-3 py-1 text-xs ${category === c.key ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-widest text-muted-foreground">Horizon</p>
                <div className="flex flex-wrap gap-1.5">
                  {HORIZONS.map((h) => (
                    <button key={h.key} onClick={() => setHorizon(h.key)}
                      className={`rounded-full border px-3 py-1 text-xs ${horizon === h.key ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"}`}>
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={create} disabled={!title.trim()}>Add dream</Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>

      {active.length === 0 && !creating && (
        <p className="text-sm text-muted-foreground">No dreams yet. Add one and Axis will build the plan.</p>
      )}

      <div className="space-y-4">
        {active.map((d) => <DreamCard key={d.id} dream={d} onChange={invalidate} />)}
      </div>

      {achieved.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Achieved</p>
          {achieved.map((d) => <DreamCard key={d.id} dream={d} onChange={invalidate} />)}
        </div>
      )}
    </div>
  );
}

function DreamCard({ dream, onChange }: { dream: Dream; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(dream.title);
  const [why, setWhy] = useState(dream.why ?? "");
  const [category, setCategory] = useState(dream.category);
  const [horizon, setHorizon] = useState(dream.horizon);
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<DreamPlan | null>(null);
  const [notes, setNotes] = useState("");
  const generateFn = useServerFn(generatePlan);

  const save = async () => {
    const { error } = await supabase.from("dreams").update({
      title, why: why || null, category, horizon,
    } as never).eq("id", dream.id);
    if (error) { toast.error(error.message); return; }
    setEditing(false);
    onChange();
  };

  const updateStatus = async (status: Dream["status"]) => {
    await supabase.from("dreams").update({ status } as never).eq("id", dream.id);
    onChange();
  };

  const remove = async () => {
    if (!confirm("Delete this dream? Plan items already on your calendar stay put.")) return;
    await supabase.from("dreams").delete().eq("id", dream.id);
    onChange();
  };

  const build = async () => {
    setPlanning(true);
    try {
      const out = await generateFn({ data: { dream_id: dream.id, notes: notes || undefined } });
      setPlan(out);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build the plan.");
    } finally {
      setPlanning(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="font-display text-lg" />
              <Textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={2} placeholder="Why it matters" />
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button key={c.key} onClick={() => setCategory(c.key)}
                    className={`rounded-full border px-3 py-1 text-xs ${category === c.key ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`}>
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {HORIZONS.map((h) => (
                  <button key={h.key} onClick={() => setHorizon(h.key)}
                    className={`rounded-full border px-3 py-1 text-xs ${horizon === h.key ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`}>
                    {h.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={save}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setTitle(dream.title); setWhy(dream.why ?? ""); setCategory(dream.category); setHorizon(dream.horizon); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <h3 className="font-display text-xl">{dream.title}</h3>
              {dream.why && <p className="mt-1 text-sm text-muted-foreground">{dream.why}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                <span className="rounded-full border border-border px-2 py-0.5">{CATEGORIES.find((c) => c.key === dream.category)?.label ?? dream.category}</span>
                <span className="rounded-full border border-border px-2 py-0.5">{HORIZONS.find((h) => h.key === dream.horizon)?.label ?? dream.horizon}</span>
                {dream.status === "paused" && <span className="rounded-full border border-border px-2 py-0.5">Paused</span>}
                {dream.status === "achieved" && <span className="rounded-full border border-border bg-foreground px-2 py-0.5 text-background">Achieved</span>}
              </div>
            </>
          )}
        </div>
        {!editing && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} title="Edit">Edit</Button>
            {dream.status === "active" && <Button size="sm" variant="ghost" onClick={() => updateStatus("paused")} title="Pause"><Pause className="h-4 w-4" /></Button>}
            {dream.status === "paused" && <Button size="sm" variant="ghost" onClick={() => updateStatus("active")} title="Resume"><Play className="h-4 w-4" /></Button>}
            {dream.status !== "achieved" && <Button size="sm" variant="ghost" onClick={() => updateStatus("achieved")} title="Mark achieved"><Check className="h-4 w-4" /></Button>}
            <Button size="sm" variant="ghost" onClick={remove} title="Delete"><Trash2 className="h-4 w-4" /></Button>
          </div>
        )}
      </div>

      {dream.status !== "achieved" && !editing && (
        <div className="mt-4 space-y-3">
          {!plan && (
            <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Any adjustments? (e.g. 'mornings only', 'gentle pace', 'no weekends') — optional"
              />
              <Button size="sm" onClick={build} disabled={planning}>
                {planning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Building…</> : <><Wand2 className="mr-2 h-4 w-4" /> Build my plan</>}
              </Button>
            </div>
          )}
          {plan && <PlanEditor dream={dream} plan={plan} onCancel={() => setPlan(null)} onApplied={() => { setPlan(null); onChange(); }} onRegenerate={build} />}
        </div>
      )}
    </div>
  );
}

// ---------- Editable plan preview ----------

function PlanEditor({
  dream, plan: initial, onCancel, onApplied, onRegenerate,
}: {
  dream: Dream;
  plan: DreamPlan;
  onCancel: () => void;
  onApplied: () => void;
  onRegenerate: () => void;
}) {
  const [plan, setPlan] = useState<DreamPlan>(initial);
  const [include, setInclude] = useState({
    milestones: true, weekly_rhythm: true, daily_micro: true, starter_tasks: true,
  });
  const [applying, setApplying] = useState(false);
  const applyFn = useServerFn(applyPlan);

  const apply = async () => {
    setApplying(true);
    try {
      await applyFn({ data: { dream_id: dream.id, plan, include } });
      toast.success("Added to your calendar and lists. Edit anything anytime.");
      onApplied();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't apply the plan.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-background/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">AI draft — edit anything</p>
          <Textarea value={plan.summary} onChange={(e) => setPlan({ ...plan, summary: e.target.value })} rows={2} className="mt-1 font-display" />
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}><X className="h-4 w-4" /></Button>
      </div>

      {/* Milestones */}
      <Section label="Milestones" checked={include.milestones} onToggle={(v) => setInclude({ ...include, milestones: v })}>
        {plan.milestones.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input value={m.title} onChange={(e) => {
              const next = [...plan.milestones]; next[i] = { ...m, title: e.target.value }; setPlan({ ...plan, milestones: next });
            }} className="flex-1" />
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>in</span>
              <Input type="number" min={1} value={m.target_offset_days} onChange={(e) => {
                const next = [...plan.milestones]; next[i] = { ...m, target_offset_days: Number(e.target.value) || 1 }; setPlan({ ...plan, milestones: next });
              }} className="w-20" />
              <span>days</span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setPlan({ ...plan, milestones: plan.milestones.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setPlan({ ...plan, milestones: [...plan.milestones, { title: "", target_offset_days: 30 }] })}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add milestone
        </Button>
      </Section>

      {/* Weekly rhythm */}
      <Section label="Weekly rhythm (recurring events)" checked={include.weekly_rhythm} onToggle={(v) => setInclude({ ...include, weekly_rhythm: v })}>
        {plan.weekly_rhythm.map((w, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input value={w.title} onChange={(e) => {
              const next = [...plan.weekly_rhythm]; next[i] = { ...w, title: e.target.value }; setPlan({ ...plan, weekly_rhythm: next });
            }} className="min-w-[180px] flex-1" />
            <select value={w.weekday} onChange={(e) => {
              const next = [...plan.weekly_rhythm]; next[i] = { ...w, weekday: Number(e.target.value) }; setPlan({ ...plan, weekly_rhythm: next });
            }} className="rounded-md border border-border bg-background px-2 py-1 text-sm">
              {WEEKDAYS.map((d, di) => <option key={di} value={di}>{d}</option>)}
            </select>
            <Input type="time" value={w.time} onChange={(e) => {
              const next = [...plan.weekly_rhythm]; next[i] = { ...w, time: e.target.value }; setPlan({ ...plan, weekly_rhythm: next });
            }} className="w-28" />
            <Input type="number" min={5} step={5} value={w.duration_min} onChange={(e) => {
              const next = [...plan.weekly_rhythm]; next[i] = { ...w, duration_min: Number(e.target.value) || 30 }; setPlan({ ...plan, weekly_rhythm: next });
            }} className="w-20" />
            <span className="text-xs text-muted-foreground">min</span>
            <Button size="sm" variant="ghost" onClick={() => setPlan({ ...plan, weekly_rhythm: plan.weekly_rhythm.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setPlan({ ...plan, weekly_rhythm: [...plan.weekly_rhythm, { title: "", weekday: 0, time: "08:00", duration_min: 30 }] })}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add block
        </Button>
      </Section>

      {/* Daily micro */}
      <Section label="Daily micro-habit" checked={include.daily_micro} onToggle={(v) => setInclude({ ...include, daily_micro: v })}>
        {plan.daily_micro ? (
          <div className="flex items-center gap-2">
            <Input value={plan.daily_micro.title} onChange={(e) => setPlan({ ...plan, daily_micro: { ...plan.daily_micro!, title: e.target.value } })} className="flex-1" />
            <Input type="time" value={plan.daily_micro.time ?? ""} onChange={(e) => setPlan({ ...plan, daily_micro: { ...plan.daily_micro!, time: e.target.value || undefined } })} className="w-28" />
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setPlan({ ...plan, daily_micro: { title: "", time: undefined } })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add daily habit
          </Button>
        )}
      </Section>

      {/* Starter tasks */}
      <Section label="Starter tasks (this week)" checked={include.starter_tasks} onToggle={(v) => setInclude({ ...include, starter_tasks: v })}>
        {plan.starter_tasks.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input value={t.title} onChange={(e) => {
              const next = [...plan.starter_tasks]; next[i] = { ...t, title: e.target.value }; setPlan({ ...plan, starter_tasks: next });
            }} className="flex-1" />
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <Checkbox checked={t.must_do} onCheckedChange={(v) => {
                const next = [...plan.starter_tasks]; next[i] = { ...t, must_do: !!v }; setPlan({ ...plan, starter_tasks: next });
              }} />
              Must-do
            </label>
            <Button size="sm" variant="ghost" onClick={() => setPlan({ ...plan, starter_tasks: plan.starter_tasks.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setPlan({ ...plan, starter_tasks: [...plan.starter_tasks, { title: "", must_do: false }] })}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add task
        </Button>
      </Section>

      <div className="flex flex-wrap gap-2 pt-2">
        <Button onClick={apply} disabled={applying}>
          {applying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding…</> : "Add to my life"}
        </Button>
        <Button variant="outline" onClick={onRegenerate}><Wand2 className="mr-1.5 h-4 w-4" /> Regenerate</Button>
        <Button variant="ghost" onClick={onCancel}>Discard</Button>
      </div>
    </div>
  );
}

function Section({ label, checked, onToggle, children }: { label: string; checked: boolean; onToggle: (v: boolean) => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-border bg-card/60">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Checkbox checked={checked} onCheckedChange={(v) => onToggle(!!v)} />
        <button className="flex flex-1 items-center gap-1 text-left text-sm font-medium" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {label}
        </button>
      </div>
      {open && <div className="space-y-2 p-3">{children}</div>}
    </div>
  );
}

// ---------- Vision Board (unchanged behavior) ----------

function VisionBoard() {
  const { user } = useSessionUser();
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: ["vision_board_items", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<BoardItem[]> => {
      if (!user) return [];
      const { data } = await supabase.from("vision_board_items").select("*").eq("user_id", user.id).order("position", { ascending: true });
      return (data as unknown as BoardItem[]) ?? [];
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["vision_board_items", user?.id] });
  const [adding, setAdding] = useState<"image" | "note" | "quote" | null>(null);
  const [text, setText] = useState("");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nextPos = (items[items.length - 1]?.position ?? 0) + 1;

  const addText = async () => {
    if (!user || !text.trim()) return;
    await supabase.from("vision_board_items").insert({
      user_id: user.id, kind: adding, text_content: text, caption: caption || null, position: nextPos,
    } as never);
    setText(""); setCaption(""); setAdding(null); invalidate();
  };

  const onUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("vision-board").upload(path, file);
      if (upErr) throw upErr;
      await supabase.from("vision_board_items").insert({
        user_id: user.id, kind: "image", image_path: path, caption: caption || null, position: nextPos,
      } as never);
      setCaption(""); setAdding(null); invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally { setUploading(false); }
  };

  const remove = async (item: BoardItem) => {
    if (item.kind === "image" && item.image_path) {
      await supabase.storage.from("vision-board").remove([item.image_path]);
    }
    await supabase.from("vision_board_items").delete().eq("id", item.id);
    invalidate();
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => { setAdding("image"); fileRef.current?.click(); }}>
          <ImagePlus className="mr-1.5 h-4 w-4" /> Image
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAdding(adding === "note" ? null : "note")}>
          <StickyNote className="mr-1.5 h-4 w-4" /> Note
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAdding(adding === "quote" ? null : "quote")}>
          <Quote className="mr-1.5 h-4 w-4" /> Quote
        </Button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
      </div>

      {(adding === "note" || adding === "quote") && (
        <div className="mb-4 rounded-2xl border border-border bg-card p-4">
          <Textarea value={text} onChange={(e) => setText(e.target.value)}
            placeholder={adding === "quote" ? "A line that anchors you…" : "A thought, a scene, an intention…"} rows={3} />
          <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" className="mt-2" />
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={addText}>Pin it</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {uploading && <p className="mb-3 text-xs text-muted-foreground">Uploading…</p>}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Your board is empty. Pin an image, note, or quote that reminds you of the dream.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {items.map((it) => <BoardTile key={it.id} item={it} onRemove={() => remove(it)} />)}
        </div>
      )}
    </div>
  );
}

function BoardTile({ item, onRemove }: { item: BoardItem; onRemove: () => void }) {
  const [signed, setSigned] = useState<string | null>(null);
  if (item.kind === "image" && item.image_path && !signed) {
    supabase.storage.from("vision-board").createSignedUrl(item.image_path, 3600).then(({ data }) => {
      if (data?.signedUrl) setSigned(data.signedUrl);
    });
  }
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card">
      {item.kind === "image" ? (
        signed ? <img src={signed} alt={item.caption ?? ""} className="h-40 w-full object-cover" /> : <div className="h-40 w-full animate-pulse bg-muted" />
      ) : (
        <div className={`flex h-40 flex-col justify-center p-4 ${item.kind === "quote" ? "font-display italic" : ""}`}>
          <p className="text-sm">{item.text_content}</p>
        </div>
      )}
      {item.caption && <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">{item.caption}</p>}
      <button onClick={onRemove} className="absolute right-1.5 top-1.5 rounded-full bg-background/80 p-1 opacity-0 transition group-hover:opacity-100">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
