// Paste an agenda (Lab 6): the two calls the agenda panel makes.
//
// parseAgenda -> the parser's own function URL (infra/ai.yml). It only reads
//                text and answers JSON; it never writes anything.
// saveAgenda  -> the main API, PUT /api/meetings/{id}/agenda, with its usual
//                validation. The only way an agenda is ever written.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PARSER_URL = process.env.NEXT_PUBLIC_PARSER_URL || "";

export const parserConfigured = Boolean(PARSER_URL);

// The parser rejects longer texts with 413; checked here too, before sending.
export const MAX_TEXT_CHARS = 10_000;

export interface AgendaItem {
  topic: string;
  owner: string | null;
  minutes: number | null;
}

export interface ActionItem {
  task: string;
  owner: string | null;
  due: string | null; // YYYY-MM-DD
}

export interface Agenda {
  items: AgendaItem[];
  action_items: ActionItem[];
}

// What the parser returns: the agenda plus what it found about the meeting.
export interface ParsedAgenda extends Agenda {
  title: string | null;
  starts_at: string | null;
  duration_minutes: number | null;
  language: string;
}

export interface ParseResult {
  agenda: ParsedAgenda;
  model: string;
  prompt_version: string;
  usage: { input_tokens: number; output_tokens: number };
  latency_ms: number;
  cost_usd: number;
}

export interface AiSuggestion {
  agenda: ParsedAgenda;
  model: string;
  prompt_version: string;
}

// An error with a message the user can act on. `cancelled` is not an error to
// show: the user pressed Cancel.
export class AgendaError extends Error {
  constructor(
    message: string,
    readonly cancelled = false,
  ) {
    super(message);
  }
}

const PARSE_ERRORS: Record<number, string> = {
  400: "The parser could not read the request. Try again.",
  401: "Your session has expired. Please sign in again.",
  413: `The text is too long. Paste at most ${MAX_TEXT_CHARS.toLocaleString("en-US")} characters.`,
  422: "No agenda found in this text. Check the text, or type the agenda by hand.",
  429: "The parser is busy right now. Try again in a minute, or type the agenda by hand.",
  502: "The model is not available right now. Type the agenda by hand, or try later.",
  503: "The parser is not configured. Type the agenda by hand.",
};

export async function parseAgenda(
  text: string,
  token: string,
  signal: AbortSignal,
): Promise<ParseResult> {
  if (!PARSER_URL) {
    throw new AgendaError("The parser is not configured. Type the agenda by hand.");
  }
  if (text.length > MAX_TEXT_CHARS) {
    throw new AgendaError(PARSE_ERRORS[413]);
  }

  // "Monday" means the user's Monday: today and the time zone come from the
  // browser, not from the function, which runs in UTC.
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  let res: Response;
  try {
    res = await fetch(PARSER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text, today, tz }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new AgendaError("Cancelled.", true);
    }
    throw new AgendaError(
      "Network error: the parser could not be reached. Check your connection, or type the agenda by hand.",
    );
  }

  if (!res.ok) {
    throw new AgendaError(
      PARSE_ERRORS[res.status] ?? `The parser failed (HTTP ${res.status}). Type the agenda by hand.`,
    );
  }
  return (await res.json()) as ParseResult;
}

export async function saveAgenda(
  meetingId: string,
  agenda: Agenda,
  suggestion: AiSuggestion | null,
  token: string,
): Promise<Agenda> {
  const res = await fetch(`${API_URL}/api/meetings/${meetingId}/agenda`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    // The suggestion goes along with what the user saved: the difference
    // between the two is the parser's quality signal.
    body: JSON.stringify({ ...agenda, ai_suggestion: suggestion }),
  });
  if (res.status === 401) {
    throw new AgendaError("Your session has expired. Please sign in again.");
  }
  if (res.status === 422) {
    throw new AgendaError(
      "Some fields are not valid: every item needs a topic, every action item a task, and minutes must be 1–480.",
    );
  }
  if (!res.ok) {
    throw new AgendaError(`Could not save the agenda (HTTP ${res.status}).`);
  }
  const meeting = (await res.json()) as { agenda: Agenda | null };
  return meeting.agenda ?? { items: [], action_items: [] };
}
