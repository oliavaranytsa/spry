"use client";

import { useRef, useState } from "react";
import {
  ClipboardPaste,
  ListChecks,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";

import {
  AgendaError,
  MAX_TEXT_CHARS,
  parseAgenda,
  parserConfigured,
  saveAgenda,
  type Agenda,
  type AiSuggestion,
  type ParseResult,
} from "@/lib/agenda";

// One row of the form. Values are the strings in the inputs; `suggested`
// holds the fields the model filled and the user has not touched yet.
interface Row<F extends string> {
  id: number;
  values: Record<F, string>;
  suggested: F[];
}
type ItemField = "topic" | "owner" | "minutes";
type ActionField = "task" | "owner" | "due";

let nextId = 1;
const newItem = (): Row<ItemField> => ({
  id: nextId++,
  values: { topic: "", owner: "", minutes: "" },
  suggested: [],
});
const newAction = (): Row<ActionField> => ({
  id: nextId++,
  values: { task: "", owner: "", due: "" },
  suggested: [],
});

const str = (v: string | number | null | undefined) =>
  v == null ? "" : String(v);
const orNull = (v: string) => (v.trim() === "" ? null : v.trim());

// Fields the model filled: everything non-empty. Empty stays empty, unmarked.
function filled<F extends string>(values: Record<F, string>): F[] {
  return (Object.keys(values) as F[]).filter((k) => values[k] !== "");
}

function rowsFrom(agenda: Agenda, suggested: boolean) {
  const items = agenda.items.map((it) => {
    const values = {
      topic: it.topic,
      owner: str(it.owner),
      minutes: str(it.minutes),
    };
    return { id: nextId++, values, suggested: suggested ? filled(values) : [] };
  });
  const actions = agenda.action_items.map((a) => {
    const values = { task: a.task, owner: str(a.owner), due: str(a.due) };
    return { id: nextId++, values, suggested: suggested ? filled(values) : [] };
  });
  return { items, actions };
}

const inputClass =
  "w-full px-2.5 py-2 text-sm text-ink border-2 rounded-xl placeholder:text-ink/40 focus:outline-none focus:ring-4 focus:ring-lime";

function SuggestedInput({
  value,
  suggested,
  onChange,
  ...props
}: {
  value: string;
  suggested: boolean;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div className="relative">
      <input
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} ${
          suggested ? "border-ink bg-lime-soft pr-20" : "border-ink/40 bg-paper"
        }`}
      />
      {suggested && (
        <span
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-ink bg-lime border-2 border-ink rounded-full px-1.5"
          title="Filled by the model. Check it; the mark goes away when you edit the field."
        >
          suggested
        </span>
      )}
    </div>
  );
}

export function AgendaPanel({
  meetingId,
  agenda,
  token,
  onSaved,
}: {
  meetingId: string;
  agenda: Agenda | null;
  token: string | undefined;
  onSaved: (agenda: Agenda) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<Row<ItemField>[]>([]);
  const [actions, setActions] = useState<Row<ActionField>[]>([]);

  const [pasted, setPasted] = useState("");
  const [parsing, setParsing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    const rows = rowsFrom(agenda ?? { items: [], action_items: [] }, false);
    setItems(rows.items.length ? rows.items : [newItem()]);
    setActions(rows.actions);
    setPasted("");
    setParsed(null);
    setError(null);
    setEditing(true);
  };

  const close = () => {
    abortRef.current?.abort();
    setEditing(false);
  };

  // --- parse ---------------------------------------------------------------

  const parse = async () => {
    if (!token) {
      setError("Sign in to use the parser.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setParsing(true);
    setError(null);
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.round((Date.now() - started) / 1000)),
      500,
    );
    try {
      const result = await parseAgenda(pasted, token, controller.signal);
      const rows = rowsFrom(result.agenda, true);
      setItems(rows.items.length ? rows.items : [newItem()]);
      setActions(rows.actions);
      setParsed(result);
    } catch (err) {
      if (err instanceof AgendaError && err.cancelled) return;
      setError(err instanceof Error ? err.message : "The parser failed.");
    } finally {
      clearInterval(timer);
      abortRef.current = null;
      setParsing(false);
    }
  };

  const cancel = () => abortRef.current?.abort();

  // --- edit ----------------------------------------------------------------

  // Typing in a field takes it over from the model: the "suggested" mark goes.
  function edit<F extends string>(
    setRows: React.Dispatch<React.SetStateAction<Row<F>[]>>,
    id: number,
    field: NoInfer<F>,
    value: string,
  ) {
    setRows((rows) =>
      rows.map((r) =>
        r.id === id
          ? {
              ...r,
              values: { ...r.values, [field]: value },
              suggested: r.suggested.filter((f) => f !== field),
            }
          : r,
      ),
    );
  }

  // --- save ----------------------------------------------------------------

  const save = async () => {
    if (!token) {
      setError("Sign in to save the agenda.");
      return;
    }
    const keptItems = items.filter((r) =>
      Object.values(r.values).some((v) => v.trim()),
    );
    const keptActions = actions.filter((r) =>
      Object.values(r.values).some((v) => v.trim()),
    );
    if (keptItems.some((r) => !r.values.topic.trim())) {
      setError("Every agenda item needs a topic.");
      return;
    }
    if (keptActions.some((r) => !r.values.task.trim())) {
      setError("Every action item needs a task.");
      return;
    }
    const body: Agenda = {
      items: keptItems.map((r) => ({
        topic: r.values.topic.trim(),
        owner: orNull(r.values.owner),
        minutes: r.values.minutes ? Number(r.values.minutes) : null,
      })),
      action_items: keptActions.map((r) => ({
        task: r.values.task.trim(),
        owner: orNull(r.values.owner),
        due: orNull(r.values.due),
      })),
    };
    const suggestion: AiSuggestion | null = parsed
      ? {
          agenda: parsed.agenda,
          model: parsed.model,
          prompt_version: parsed.prompt_version,
        }
      : null;

    setSaving(true);
    setError(null);
    try {
      onSaved(await saveAgenda(meetingId, body, suggestion, token));
      setEditing(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the agenda.",
      );
    } finally {
      setSaving(false);
    }
  };

  // --- view ----------------------------------------------------------------

  if (!editing) {
    const empty =
      !agenda ||
      (agenda.items.length === 0 && agenda.action_items.length === 0);
    return (
      <div className="mt-4 pt-4 border-t-2 border-dashed border-ink/20">
        {!empty && agenda && (
          <div className="space-y-2 mb-3 text-sm">
            <ol className="list-decimal list-inside space-y-1 text-ink font-medium">
              {agenda.items.map((it, i) => (
                <li key={i}>
                  {it.topic}
                  {it.owner && (
                    <span className="text-ink/60"> — {it.owner}</span>
                  )}
                  {it.minutes && (
                    <span className="text-ink/50"> · {it.minutes} min</span>
                  )}
                </li>
              ))}
            </ol>
            {agenda.action_items.length > 0 && (
              <ul className="space-y-1 text-ink/80">
                {agenda.action_items.map((a, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <ListChecks className="w-3.5 h-3.5 text-ink/50" />
                    {a.task}
                    {a.owner && (
                      <span className="text-ink/60"> — {a.owner}</span>
                    )}
                    {a.due && (
                      <span className="text-ink/50"> · by {a.due}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <button
          onClick={startEditing}
          disabled={!token}
          className="text-xs font-bold text-ink bg-lime border-2 border-ink rounded-full px-3 py-1.5 hover:shadow-sticker-sm transition-shadow disabled:opacity-50"
        >
          {empty ? "+ Add agenda" : "Edit agenda"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t-2 border-dashed border-ink/20 space-y-4">
      {/* Paste an agenda */}
      <div className="rounded-2xl border-2 border-dashed border-ink bg-ink-soft p-4 space-y-2.5">
        <div className="flex items-center gap-1.5 font-display text-lg font-extrabold text-ink">
          <ClipboardPaste className="w-5 h-5 text-ink" />
          Paste an agenda
        </div>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          disabled={parsing}
          rows={5}
          placeholder="Paste an email, a chat message or notes. The form below is filled in for you to check."
          className={`${inputClass} border-ink bg-paper font-mono text-xs`}
        />
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-[11px] ${
              pasted.length > MAX_TEXT_CHARS
                ? "text-coral font-bold"
                : "text-ink/50"
            }`}
          >
            {pasted.length.toLocaleString("en-US")} /{" "}
            {MAX_TEXT_CHARS.toLocaleString("en-US")}
          </span>
          {parsing ? (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Reading the agenda… {elapsed}s
              </span>
              <button
                onClick={cancel}
                className="text-xs font-bold border-2 border-ink bg-paper hover:bg-coral-soft px-3 py-1.5 rounded-full"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={parse}
              disabled={!parserConfigured || !pasted.trim()}
              title={
                parserConfigured
                  ? undefined
                  : "PARSER_URL is not set for this build"
              }
              className="flex items-center gap-1.5 text-xs font-bold bg-ink text-cream px-4 py-2 rounded-full border-2 border-ink hover:bg-ink-deep disabled:opacity-40"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Parse
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 text-xs font-semibold bg-coral-soft text-ink border-2 border-coral rounded-xl">
          {error}
        </div>
      )}

      {parsed && (
        <div className="text-[11px] text-ink/80 bg-lime-soft border-2 border-ink/20 rounded-xl px-3 py-2">
          Filled by {parsed.model} ({parsed.prompt_version}) in{" "}
          {(parsed.latency_ms / 1000).toFixed(1)}s. Fields marked{" "}
          <span className="font-bold text-ink bg-lime px-1 rounded">
            suggested
          </span>{" "}
          came from the model: check them before saving.
          {(parsed.agenda.title ||
            parsed.agenda.starts_at ||
            parsed.agenda.duration_minutes) && (
            <span className="block mt-0.5">
              The text also says:{" "}
              {[
                parsed.agenda.title && `“${parsed.agenda.title}”`,
                parsed.agenda.starts_at && `starts ${parsed.agenda.starts_at}`,
                parsed.agenda.duration_minutes &&
                  `${parsed.agenda.duration_minutes} min`,
              ]
                .filter(Boolean)
                .join(", ")}
            </span>
          )}
        </div>
      )}

      {/* The agenda form: the same for typed and parsed agendas */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-ink uppercase tracking-wider">
          Agenda items
        </div>
        {items.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-[1fr_9rem_5.5rem_1.5rem] gap-2 items-center"
          >
            <SuggestedInput
              placeholder="Topic"
              value={r.values.topic}
              suggested={r.suggested.includes("topic")}
              onChange={(v) => edit(setItems, r.id, "topic", v)}
            />
            <SuggestedInput
              placeholder="Owner"
              value={r.values.owner}
              suggested={r.suggested.includes("owner")}
              onChange={(v) => edit(setItems, r.id, "owner", v)}
            />
            <SuggestedInput
              placeholder="Min"
              type="number"
              min={1}
              max={480}
              value={r.values.minutes}
              suggested={r.suggested.includes("minutes")}
              onChange={(v) => edit(setItems, r.id, "minutes", v)}
            />
            <button
              onClick={() =>
                setItems((rows) => rows.filter((x) => x.id !== r.id))
              }
              className="text-ink/40 hover:text-coral"
              aria-label="Remove item"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button
          onClick={() => setItems((rows) => [...rows, newItem()])}
          className="flex items-center gap-1 text-xs font-bold text-ink hover:underline underline-offset-4"
        >
          <Plus className="w-3.5 h-3.5" /> Add item
        </button>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-bold text-ink uppercase tracking-wider">
          Action items
        </div>
        {actions.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-[1fr_9rem_9.5rem_1.5rem] gap-2 items-center"
          >
            <SuggestedInput
              placeholder="Task"
              value={r.values.task}
              suggested={r.suggested.includes("task")}
              onChange={(v) => edit(setActions, r.id, "task", v)}
            />
            <SuggestedInput
              placeholder="Owner"
              value={r.values.owner}
              suggested={r.suggested.includes("owner")}
              onChange={(v) => edit(setActions, r.id, "owner", v)}
            />
            <SuggestedInput
              type="date"
              value={r.values.due}
              suggested={r.suggested.includes("due")}
              onChange={(v) => edit(setActions, r.id, "due", v)}
            />
            <button
              onClick={() =>
                setActions((rows) => rows.filter((x) => x.id !== r.id))
              }
              className="text-ink/40 hover:text-coral"
              aria-label="Remove action item"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button
          onClick={() => setActions((rows) => [...rows, newAction()])}
          className="flex items-center gap-1 text-xs font-bold text-ink hover:underline underline-offset-4"
        >
          <Plus className="w-3.5 h-3.5" /> Add action item
        </button>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={close}
          className="text-xs font-bold border-2 border-ink bg-paper hover:bg-ink-soft px-4 py-2 rounded-full"
        >
          Close
        </button>
        <button
          onClick={save}
          disabled={saving || parsing}
          className="text-xs font-display font-extrabold bg-lime text-ink px-5 py-2 rounded-full border-2 border-ink shadow-sticker-sm hover:shadow-sticker transition-shadow disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save agenda"}
        </button>
      </div>
    </div>
  );
}
