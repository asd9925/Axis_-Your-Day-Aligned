import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Plus, Repeat, Target, Trash2, Check } from "lucide-react";
import {
  listObjectives,
  addObjective,
  toggleObjective,
  updateObjective,
  deleteObjective,
  type Objective,
} from "@/lib/objectives.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { WeeklyObjectivesToday } from "@/components/WeeklyObjectivesToday";

type Scope = "week" | "day";

export function ObjectivesStrip({ scope, scopeDate }: { scope: Scope; scopeDate: Date }) {
  const dateStr = format(scopeDate, "yyyy-MM-dd");
  const qc = useQueryClient();
  const list = useServerFn(listObjectives);
  const add = useServerFn(addObjective);
  const toggle = useServerFn(toggleObjective);
  const update = useServerFn(updateObjective);
  const remove = useServerFn(deleteObjective);

  const queryKey = ["objectives", scope, dateStr] as const;
  const { data: items = [] } = useQuery({
    queryKey,
    queryFn: () => list({ data: { scope, scopeDate: dateStr } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const addMut = useMutation({
    mutationFn: (v: { title: string; description?: string }) =>
      add({ data: { scope, scopeDate: dateStr, title: v.title, description: v.description || null } }),
    onSuccess: invalidate,
  });
  const toggleMut = useMutation({
    mutationFn: (v: { id: string; completed: boolean }) => toggle({ data: v }),
    onSuccess: invalidate,
  });
  const updateMut = useMutation({
    mutationFn: (v: {
      id: string;
      title?: string;
      description?: string | null;
      repeat_daily?: boolean;
    }) => update({ data: v }),
    onSuccess: invalidate,
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: invalidate,
  });

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const heading = scope === "week" ? "This week's objectives" : "Today's objectives";
  const subtitle =
    scope === "week"
      ? "3–5 things that would make this week feel like a win."
      : "What would make today count?";

  const atLimit = items.length >= 5;

  const submitAdd = () => {
    const title = newTitle.trim();
    if (!title) return;
    addMut.mutate(
      { title, description: newDesc.trim() || undefined },
      {
        onSuccess: () => {
          setNewTitle("");
          setNewDesc("");
          setShowAdd(false);
        },
      },
    );
  };

  return (
    <div className="space-y-2">
      {scope === "day" && (
        <WeeklyObjectivesToday date={scopeDate} variant="inline" hideWhenEmpty />
      )}
      <div className="rounded-xl border border-border bg-card/60 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-foreground/70" />
          <h3 className="text-xs uppercase tracking-widest text-muted-foreground">{heading}</h3>
          <span className="ml-auto text-xs text-muted-foreground">{subtitle}</span>
        </div>

      {items.length === 0 && !showAdd && (
        <p className="py-2 text-center text-sm text-muted-foreground">
          Nothing set yet. Pick one thing that matters.
        </p>
      )}

      <ul className="space-y-1.5">
        {items.map((o) => (
          <ObjectiveRow
            key={o.id}
            objective={o}
            scope={scope}
            onToggle={(completed) => toggleMut.mutate({ id: o.id, completed })}
            onSave={(title, description) =>
              updateMut.mutate({ id: o.id, title, description: description || null })
            }
            onToggleRepeat={(v) => updateMut.mutate({ id: o.id, repeat_daily: v })}
            onDelete={() => removeMut.mutate(o.id)}
          />
        ))}
      </ul>

      {showAdd ? (
        <div className="mt-2 space-y-2 rounded-lg border border-border/70 bg-background/60 p-2">
          <Input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitAdd();
              }
              if (e.key === "Escape") {
                setShowAdd(false);
                setNewTitle("");
                setNewDesc("");
              }
            }}
            placeholder="Objective title (e.g. Clean Room / Declutter)"
            maxLength={120}
            className="h-8"
          />
          <Textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Optional: how you'll approach it (e.g. spend 30 mins/day on one part of the room)"
            maxLength={500}
            rows={2}
            className="text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAdd(false);
                setNewTitle("");
                setNewDesc("");
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={submitAdd} disabled={!newTitle.trim() || addMut.isPending}>
              Add
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={atLimit}
          onClick={() => setShowAdd(true)}
          className={cn(
            "mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary/40",
            atLimit && "cursor-not-allowed opacity-60 hover:bg-transparent",
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          {atLimit ? "Up to 5 objectives" : "Add objective"}
        </button>
      )}
      </div>
    </div>
  );
}

function ObjectiveRow({
  objective,
  scope,
  onToggle,
  onSave,
  onToggleRepeat,
  onDelete,
}: {
  objective: Objective;
  scope: Scope;
  onToggle: (completed: boolean) => void;
  onSave: (title: string, description: string) => void;
  onToggleRepeat: (v: boolean) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(objective.title);
  const [desc, setDesc] = useState(objective.description ?? "");
  const done = !!objective.completed_at;
  const hasDesc = !!(objective.description && objective.description.trim());

  const save = () => {
    const t = title.trim();
    if (!t) return;
    onSave(t, desc.trim());
    setEditing(false);
  };

  return (
    <li className="group rounded-lg border border-border/60 bg-background/40 px-2 py-1.5">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onToggle(!done)}
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
            done ? "border-primary bg-primary text-primary-foreground" : "border-border",
          )}
          aria-label={done ? "Mark incomplete" : "Mark complete"}
        >
          {done && <Check className="h-3 w-3" />}
        </button>

        {editing ? (
          <div className="flex-1 space-y-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              className="h-8"
              autoFocus
            />
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Optional description"
              maxLength={500}
              rows={2}
              className="text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setTitle(objective.title);
                  setDesc(objective.description ?? "");
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={!title.trim()}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => hasDesc && setExpanded((v) => !v)}
              className="flex w-full items-center gap-1 text-left"
            >
              {hasDesc &&
                (expanded ? (
                  <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                ))}
              <span
                className={cn(
                  "truncate text-sm font-medium",
                  done && "text-muted-foreground line-through",
                )}
              >
                {objective.title}
              </span>
            </button>
            {hasDesc && expanded && (
              <p
                className={cn(
                  "mt-1 whitespace-pre-wrap pl-4 text-xs text-muted-foreground",
                  done && "line-through",
                )}
              >
                {objective.description}
              </p>
            )}
          </div>
        )}

        {!editing && (
          <div className="flex items-center gap-1">
            {scope === "week" && !done && (
              <button
                type="button"
                onClick={() => onToggleRepeat(!objective.repeat_daily)}
                title={objective.repeat_daily ? "Repeats daily this week" : "Repeat daily this week"}
                className={cn(
                  "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors",
                  objective.repeat_daily
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground",
                )}
              >
                <Repeat className="h-3 w-3" />
                {objective.repeat_daily ? "Daily" : "Repeat"}
              </button>
            )}
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded px-1 text-xs text-muted-foreground hover:text-foreground"
                aria-label="Edit"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="rounded p-1 text-muted-foreground hover:text-destructive"
                aria-label="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
