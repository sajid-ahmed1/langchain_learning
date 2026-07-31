"use client";

import { useEffect, useMemo, useState } from "react";

const HOME_POSTCODE_KEY = "halfway:home-postcode";

type TravelOption = { mode: string; duration_minutes: number; notes: string };

type OptionTravel = {
  from_person_1?: TravelOption[];
  from_person_2?: TravelOption[];
  origin_1?: string;
  origin_2?: string;
  destination?: string;
  same?: boolean;
  approximate?: boolean;
};

type PlanInclude = "both" | "food" | "activities";

type Option = {
  name?: string;
  title?: string;
  why?: string;
  description?: string;
  details?: string;
  source_url?: string;
  rating?: number | null;
  highlights?: string[];
  travel?: OptionTravel;
};

type ApiResult = {
  midpoint_area?: string;
  food_options?: Option[];
  activity_options?: Option[];
};

type TravelBlock = {
  from_person_1?: TravelOption[];
  from_person_2?: TravelOption[];
  recommended_mode_person_1?: string | null;
  recommended_mode_person_2?: string | null;
};

type ApiResponse = {
  ok: boolean;
  result?: ApiResult;
  area?: {
    label?: string;
    precise?: string;
    district?: string;
    postcode?: string;
  };
  error?: string;
  travel?: TravelBlock;
  midpoint?: { lat: number; lon: number };
};

function prettyOptionName(o: Option) {
  return o.name ?? o.title ?? "(unknown)";
}

function Stars({ rating }: { rating: number | null | undefined }) {
  if (rating === null || rating === undefined) return <span className="ratingMuted">No rating</span>;
  return (
    <span className="rating">
      <span className="star" aria-hidden="true">★</span>
      {rating.toFixed(1)}
    </span>
  );
}

function ModeIcon({ mode }: { mode: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (mode.toLowerCase() === "car") {
    return (
      <svg {...common}>
        <path d="M5 17h14M4 17v-4l2-5h12l2 5v4" />
        <path d="M6 17v2M18 17v2" />
        <circle cx="8" cy="13.5" r="1" />
        <circle cx="16" cy="13.5" r="1" />
      </svg>
    );
  }

  if (mode.toLowerCase() === "train") {
    return (
      <svg {...common}>
        <rect x="6" y="3" width="12" height="13" rx="3" />
        <path d="M6 9h12" />
        <path d="M9 19l-2 2M15 19l2 2" />
        <circle cx="9.5" cy="13" r="0.8" />
        <circle cx="14.5" cy="13" r="0.8" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect x="4" y="4" width="16" height="12" rx="2.5" />
      <path d="M4 10h16" />
      <path d="M7 16v2.5M17 16v2.5" />
      <circle cx="8" cy="13.2" r="0.8" />
      <circle cx="16" cy="13.2" r="0.8" />
    </svg>
  );
}

// Keep a stable left-to-right order rather than the API's sort-by-time.
const MODE_ORDER = ["Car", "Train", "Bus"];

/** A picked way of getting to one venue, used to build the calendar entry. */
type Choice = { mode: string; minutes: number; origin: string };

function BubbleRow({
  label,
  origin,
  items,
  selected,
  onSelect,
}: {
  label: string;
  origin: string;
  items?: TravelOption[];
  selected?: Choice | null;
  onSelect: (choice: Choice) => void;
}) {
  if (!items?.length) return null;

  return (
    <div className="bubbleGroup">
      <div className="bubbleLabel">{label}</div>
      <div className="bubbles">
        {MODE_ORDER.map((mode) => {
          const match = items.find((t) => t.mode.toLowerCase() === mode.toLowerCase());
          if (!match) return null;

          const isSelected =
            selected?.mode === match.mode &&
            selected?.origin === origin &&
            selected?.minutes === match.duration_minutes;

          return (
            <button
              type="button"
              className={`bubble bubble-${mode.toLowerCase()} ${isSelected ? "bubbleOn" : ""}`}
              key={mode}
              aria-pressed={isSelected}
              onClick={() =>
                onSelect({ mode: match.mode, minutes: match.duration_minutes, origin })
              }
            >
              <span className="bubbleIcon">
                <ModeIcon mode={mode} />
              </span>
              <span className="bubbleBody">
                <span className="bubbleMode">{mode}</span>
                <span className="bubbleTime">{match.duration_minutes} min</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Travel time to one specific venue, per person, spelled out so it is obvious
 * where each set of times is taking you.
 */
function TravelBubbles({
  travel,
  selected,
  onSelect,
}: {
  travel?: OptionTravel;
  selected?: Choice | null;
  onSelect: (choice: Choice) => void;
}) {
  const p1 = travel?.from_person_1;
  const p2 = travel?.from_person_2;
  if (!p1?.length) return null;

  const to = travel?.destination ? ` to ${travel.destination}` : "";
  const origin1 = travel?.origin_1 ?? "Person 1";
  const origin2 = travel?.origin_2 ?? "Person 2";

  if (travel?.same || !p2?.length) {
    const bothOrigins =
      travel?.origin_1 && travel?.origin_2
        ? `${travel.origin_1} and ${travel.origin_2}`
        : "both postcodes";
    return (
      <div className="travelBlock">
        <BubbleRow
          label={`From ${bothOrigins}${to}`}
          origin={bothOrigins}
          items={p1}
          selected={selected}
          onSelect={onSelect}
        />
      </div>
    );
  }

  return (
    <div className="travelBlock">
      <BubbleRow
        label={`From ${origin1}${to}`}
        origin={origin1}
        items={p1}
        selected={selected}
        onSelect={onSelect}
      />
      <BubbleRow
        label={`From ${origin2}${to}`}
        origin={origin2}
        items={p2}
        selected={selected}
        onSelect={onSelect}
      />
    </div>
  );
}

/**
 * One suggested place. Picking a travel bubble selects how you're getting
 * there, which unlocks the add-to-calendar popup for that place.
 */
function PlaceItem({
  option,
  index,
  idPrefix,
  showRating,
  areaLabel,
}: {
  option: Option;
  index: number;
  idPrefix: string;
  showRating: boolean;
  areaLabel?: string;
}) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(() => toInputValue(defaultMeetTime()));

  const place = prettyOptionName(option);
  const details = option.details ?? option.why ?? option.description;

  const start = useMemo(() => {
    const parsed = new Date(when);
    return Number.isNaN(parsed.getTime()) ? defaultMeetTime() : parsed;
  }, [when]);

  const event = choice ? buildEvent(place, areaLabel, choice, start) : null;

  return (
    <div className={`item ${choice ? "itemOn" : ""}`}>
      <div className="itemTop">
        <div className="itemName">
          <span className="num">{index + 1}</span>
          {place}
        </div>
        <div className="itemMeta">
          {showRating ? <Stars rating={option.rating} /> : null}
          {option.source_url ? (
            <a className="link" href={option.source_url} target="_blank" rel="noreferrer">
              Source
            </a>
          ) : null}
        </div>
      </div>

      {details ? <div className="itemWhy">{details}</div> : null}

      {option.highlights?.length ? (
        <ul className="highlights">
          {option.highlights.map((h, i) => (
            <li key={`${idPrefix}-h-${index}-${i}`}>{h}</li>
          ))}
        </ul>
      ) : null}

      <TravelBubbles
        travel={option.travel}
        selected={choice}
        onSelect={(next) => {
          const same =
            choice?.mode === next.mode &&
            choice?.origin === next.origin &&
            choice?.minutes === next.minutes;
          setChoice(same ? null : next);
          if (same) setOpen(false);
        }}
      />

      {option.travel?.approximate ? (
        <div className="approxNote">Times are to the midpoint area (exact spot not found).</div>
      ) : null}

      {choice && event ? (
        <div className="planRow">
          <button type="button" className="calendarButton" onClick={() => setOpen((v) => !v)}>
            <CalendarIcon />
            Add to calendar
          </button>
          <span className="planSummary">
            {place} · {choice.mode.toLowerCase()} from {choice.origin} ({choice.minutes} min)
          </span>

          {open ? (
            <div className="popover" role="dialog" aria-label={`Add ${place} to a calendar`}>
              <label className="popLabel">
                When are you meeting?
                <input
                  type="datetime-local"
                  className="input popInput"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
              </label>

              <div className="popHint">
                Two hours booked. Leave by{" "}
                {pad(new Date(start.getTime() - choice.minutes * 60000).getHours())}:
                {pad(new Date(start.getTime() - choice.minutes * 60000).getMinutes())} to arrive on
                time.
              </div>

              <div className="popActions">
                <button type="button" className="popButton" onClick={() => downloadIcs(event)}>
                  Apple Calendar
                </button>
                <a
                  className="popButton popPrimary"
                  href={googleCalendarUrl(event)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Calendar
                </a>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="pickHint">Pick a travel option to add this to your calendar.</div>
      )}
    </div>
  );
}

function Footprint({ flip }: { flip: boolean }) {
  return (
    <svg
      viewBox="0 0 24 32"
      width="100%"
      height="100%"
      aria-hidden="true"
      style={{ transform: flip ? "scaleX(-1)" : undefined }}
    >
      {/* sole */}
      <ellipse cx="12" cy="20" rx="6.4" ry="9.2" fill="currentColor" />
      {/* toes */}
      <ellipse cx="7.6" cy="7.6" rx="2.5" ry="3" fill="currentColor" />
      <ellipse cx="13" cy="5.4" rx="2" ry="2.4" fill="currentColor" />
      <ellipse cx="17.2" cy="7.4" rx="1.6" ry="2" fill="currentColor" />
    </svg>
  );
}

/** Footprints walking away from you — the app's stand-in for a spinner. */
function Footprints({ compact = false }: { compact?: boolean }) {
  const steps = compact ? 4 : 6;

  return (
    <span className={`steps ${compact ? "stepsCompact" : ""}`} role="img" aria-label="Loading">
      {Array.from({ length: steps }).map((_, i) => (
        <span
          className="step"
          key={i}
          style={{
            animationDelay: `${i * 0.18}s`,
            // Offset and toe-out each alternate print so the trail reads as a walk.
            transform:
              `translateY(${i % 2 === 0 ? "0px" : compact ? "5px" : "10px"}) ` +
              `rotate(${i % 2 === 0 ? -9 : 9}deg)`,
          }}
        >
          <Footprint flip={i % 2 === 1} />
        </span>
      ))}
    </span>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 11a8 8 0 1 0-.6 4" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Basic-format UTC stamp, e.g. 20260801T120000Z. */
function toCalendarStamp(d: Date) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
  );
}

/** Value shape for <input type="datetime-local">, which works in local time. */
function toInputValue(d: Date) {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function defaultMeetTime() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

type CalendarEvent = {
  title: string;
  location: string;
  description: string;
  start: Date;
  end: Date;
};

function buildEvent(
  place: string,
  areaLabel: string | undefined,
  choice: Choice,
  start: Date,
): CalendarEvent {
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const leaveBy = new Date(start.getTime() - choice.minutes * 60 * 1000);

  const description = [
    `Meeting at ${place}.`,
    `Getting there by ${choice.mode.toLowerCase()} from ${choice.origin}: about ${choice.minutes} minutes.`,
    `Leave by roughly ${pad(leaveBy.getHours())}:${pad(leaveBy.getMinutes())}.`,
    "Planned with Halfway.",
  ].join("\n");

  return {
    title: `Halfway: ${place}`,
    location: areaLabel ? `${place}, ${areaLabel}` : place,
    description,
    start,
    end,
  };
}

function googleCalendarUrl(event: CalendarEvent) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toCalendarStamp(event.start)}/${toCalendarStamp(event.end)}`,
    details: event.description,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Apple Calendar (and anything else that reads .ics) via a local download. */
function downloadIcs(event: CalendarEvent) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Halfway//Meetup Planner//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@halfway.local`,
    `DTSTAMP:${toCalendarStamp(new Date())}`,
    `DTSTART:${toCalendarStamp(event.start)}`,
    `DTEND:${toCalendarStamp(event.end)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `LOCATION:${escapeIcs(event.location)}`,
    `DESCRIPTION:${escapeIcs(event.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `halfway-${event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [postcode1, setPostcode1] = useState("");
  const [postcode2, setPostcode2] = useState("");
  const [preferences, setPreferences] = useState("");
  const [include, setInclude] = useState<PlanInclude>("both");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedPostcode, setSavedPostcode] = useState<string | null>(null);
  // Names already shown, so "Show me different options" can ask for new ones.
  const [seen, setSeen] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);

  // Read the saved postcode after mount; localStorage isn't available on the server.
  useEffect(() => {
    const stored = window.localStorage.getItem(HOME_POSTCODE_KEY);
    if (!stored) return;
    setSavedPostcode(stored);
    setPostcode1((current) => (current ? current : stored));
  }, []);

  function saveHomePostcode() {
    const value = postcode1.trim();
    if (!value) return;
    window.localStorage.setItem(HOME_POSTCODE_KEY, value);
    setSavedPostcode(value);
  }

  function clearHomePostcode() {
    window.localStorage.removeItem(HOME_POSTCODE_KEY);
    setSavedPostcode(null);
  }

  const canSubmit = useMemo(() => {
    return postcode1.trim().length > 0 && postcode2.trim().length > 0 && !loading;
  }, [postcode1, postcode2, loading]);

  /**
   * Runs a plan. A refresh keeps the postcodes and preferences exactly as they
   * are and only asks for suggestions other than the ones already seen.
   */
  async function plan({ refresh = false }: { refresh?: boolean } = {}) {
    const nextAttempt = refresh ? attempt + 1 : 0;
    const exclude = refresh ? seen : [];

    setLoading(true);
    setError(null);
    setData(null);
    setAttempt(nextAttempt);
    if (!refresh) setSeen([]);

    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          postcode1,
          postcode2,
          preferences,
          include,
          exclude,
          attempt: nextAttempt,
        }),
      });

      const json = (await res.json()) as ApiResponse;
      if (!res.ok) throw new Error((json as any)?.error ?? "Request failed");
      setData(json);

      const names = [
        ...(json.result?.food_options ?? []),
        ...(json.result?.activity_options ?? []),
      ]
        .map((o) => o.name ?? o.title)
        .filter((n): n is string => Boolean(n));

      setSeen((prev) => Array.from(new Set([...(refresh ? prev : []), ...names])));
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && canSubmit) plan();
  }

  const postcode1Saved = Boolean(savedPostcode) && savedPostcode === postcode1.trim();

  const result = data?.result as ApiResult | undefined;

  return (
    <div className="page">
      <div className="bg" aria-hidden="true" />

      <main className="container">
        <header className="header">
          <h1 className="title">Halfway</h1>
          <p className="subtitle">Split the distance, double the fun.</p>
        </header>

        <section className="panel" aria-label="Inputs">
          <div className="grid">
            {/* Not a wrapping <label>: an interactive control inside one breaks
                the implicit label/input association. */}
            <div className="field">
              <span className="labelRow">
                <label className="label" htmlFor="postcode1">
                  Person 1 postcode
                </label>
                {postcode1Saved ? (
                  <span className="saveState">
                    <span className="savedTag">Saved</span>
                    <button type="button" className="linkButton" onClick={clearHomePostcode}>
                      Forget
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="linkButton"
                    onClick={saveHomePostcode}
                    disabled={!postcode1.trim()}
                  >
                    Save this postcode
                  </button>
                )}
              </span>
              <input
                id="postcode1"
                className="input"
                value={postcode1}
                onChange={(e) => setPostcode1(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="e.g. E1 1HJ"
                autoComplete="postal-code"
              />
            </div>

            <label className="field">
              <span className="label">Person 2 postcode</span>
              <input
                className="input"
                value={postcode2}
                onChange={(e) => setPostcode2(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="e.g. SW1A 1AA"
                autoComplete="postal-code"
              />
            </label>

            <label className="field span2">
              <span className="label">Preferences (optional)</span>
              <input
                className="input"
                value={preferences}
                onChange={(e) => setPreferences(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="e.g. vegan-friendly, budget under £20, no alcohol venues"
              />
            </label>

            <label className="field span2">
              <span className="label">What do you want to see?</span>
              <select
                className="input select"
                value={include}
                onChange={(e) => setInclude(e.target.value as PlanInclude)}
              >
                <option value="both">Food and activities</option>
                <option value="food">Food only</option>
                <option value="activities">Activities only</option>
              </select>
            </label>
          </div>

          <div className="actions">
            <button className="button" onClick={() => plan()} disabled={!canSubmit}>
              {loading ? (
                <>
                  <Footprints compact />
                  Planning…
                </>
              ) : (
                "Plan meetup"
              )}
            </button>

            <div className="hint">
              Tip: press <kbd>Enter</kbd> to submit.
            </div>
          </div>

          {error && (
            <div className="alert" role="alert">
              <strong>Something went wrong:</strong> {error}
            </div>
          )}
        </section>

        {(result?.midpoint_area || result?.food_options || result?.activity_options) && (
          <section className="results" aria-label="Results">
            <div className="resultsHeader">
              <h2 className="resultsTitle">Your meetup options</h2>
              {(data?.area?.label || result?.midpoint_area) && (
                <div className="chip">
                  Meet around: {data?.area?.label ?? result?.midpoint_area}
                </div>
              )}
            </div>

            <div className={`cards ${include === "both" ? "" : "cardsSingle"}`}>
              <div className="card" hidden={include === "activities"}>
                <div className="cardTitle">Food (Top 3)</div>
                <div className="cardBody">
                  {(result?.food_options?.length ? result.food_options : []).map((o, idx) => (
                    <PlaceItem
                      key={`food-${idx}`}
                      option={o}
                      index={idx}
                      idPrefix="food"
                      showRating
                      areaLabel={data?.area?.label ?? result?.midpoint_area}
                    />
                  ))}

                  {!result?.food_options?.length && (
                    <div className="empty">No food options returned yet.</div>
                  )}
                </div>
              </div>

              <div className="card" hidden={include === "food"}>
                <div className="cardTitle">Activities (Top 3)</div>
                <div className="cardBody">
                  {(result?.activity_options?.length ? result.activity_options : []).map((o, idx) => (
                    <PlaceItem
                      key={`act-${idx}`}
                      option={o}
                      index={idx}
                      idPrefix="act"
                      showRating={false}
                      areaLabel={data?.area?.label ?? result?.midpoint_area}
                    />
                  ))}

                  {!result?.activity_options?.length && (
                    <div className="empty">No activity options returned yet.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="refreshRow">
              <button
                type="button"
                className="refreshButton"
                onClick={() => plan({ refresh: true })}
                disabled={loading}
              >
                <RefreshIcon />
                Show me different options
              </button>
              <span className="refreshHint">
                Keeps your postcodes and preferences — just swaps the suggestions.
              </span>
            </div>

            <details className="raw">
              <summary>Raw JSON</summary>
              <pre className="json">{JSON.stringify(result, null, 2)}</pre>
            </details>
          </section>
        )}

        {loading && (
          <section className="placeholder" aria-label="Loading">
            <div className="placeholderCard loadingCard">
              <Footprints />
              <div className="placeholderTitle">Walking to the middle…</div>
              <div className="placeholderText">
                Finding your midpoint, then checking travel times to each place.
              </div>
            </div>
          </section>
        )}

        {!loading && !error && !result && (
          <section className="placeholder" aria-label="Placeholder">
            <div className="placeholderCard">
              <div className="placeholderTitle">Ready when you are</div>
              <div className="placeholderText">
                Add two postcodes above and you’ll get a midpoint area plus suggestions.
              </div>
            </div>
          </section>
        )}

        <footer className="footer">
          <span>Built on Next.js + Vercel-compatible APIs</span>
        </footer>
      </main>

      <style jsx>{`
        :global(.itemMeta) {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        :global(.rating) {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          font-weight: 600;
        }

        :global(.ratingMuted) {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.78);
          border: 1px solid rgba(255, 255, 255, 0.18);
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
        }

        :global(.star) {
          color: #f5c542;
        }

        :global(.highlights) {
          margin: 10px 0 0;
          padding-left: 18px;
          color: rgba(255, 255, 255, 0.68);
          font-size: 13px;
          line-height: 1.45;
        }

        :global(.highlights li) {
          margin: 4px 0;
        }

        /* Sits next to its own label — pushing it to the column edge would put it
           right beside the Person 2 label. */
        .labelRow {
          display: flex;
          align-items: baseline;
          gap: 10px;
          flex-wrap: wrap;
        }

        .saveState {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .savedTag {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 999px;
          color: rgba(186, 230, 253, 0.95);
          background: rgba(56, 189, 248, 0.16);
          border: 1px solid rgba(56, 189, 248, 0.4);
        }

        .linkButton {
          background: none;
          border: none;
          padding: 0;
          font: inherit;
          font-size: 11px;
          color: rgba(125, 211, 252, 0.9);
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .linkButton:hover:not(:disabled) {
          color: rgba(186, 230, 253, 1);
        }

        .linkButton:disabled {
          color: rgba(255, 255, 255, 0.3);
          cursor: not-allowed;
          text-decoration: none;
        }

        .refreshRow {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 16px;
        }

        .refreshButton {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 11px 16px;
          border-radius: 999px;
          border: 1px solid rgba(125, 211, 252, 0.35);
          background: rgba(56, 189, 248, 0.1);
          color: rgba(224, 242, 254, 0.95);
          font-size: 13px;
          font-weight: 620;
          cursor: pointer;
          transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
        }

        .refreshButton:hover:not(:disabled) {
          background: rgba(56, 189, 248, 0.18);
          border-color: rgba(125, 211, 252, 0.6);
          transform: translateY(-1px);
        }

        .refreshButton:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .refreshHint {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.45);
        }

        .select {
          appearance: none;
          cursor: pointer;
          background-image: linear-gradient(45deg, transparent 50%, rgba(255, 255, 255, 0.6) 50%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.6) 50%, transparent 50%);
          background-position: calc(100% - 18px) 50%, calc(100% - 13px) 50%;
          background-size: 5px 5px, 5px 5px;
          background-repeat: no-repeat;
          padding-right: 34px;
        }

        .select option {
          background: #0b1020;
          color: rgba(255, 255, 255, 0.92);
        }

        /* Needs to out-specify the two-column .cards rule below. */
        .cards.cardsSingle {
          grid-template-columns: 1fr;
        }

        :global(.travelBlock) {
          display: grid;
          gap: 10px;
          margin-top: 12px;
        }

        :global(.bubbleGroup) {
          display: grid;
          gap: 6px;
        }

        :global(.bubbleLabel) {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.55);
          letter-spacing: 0.01em;
        }

        :global(.bubbles) {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        :global(.bubble) {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 9px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.14);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
          transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
        }

        :global(.bubble:hover) {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.09);
        }

        :global(.bubbleIcon) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          flex-shrink: 0;
          border-radius: 999px;
          color: #fff;
        }

        :global(.bubble-car .bubbleIcon) {
          background: linear-gradient(140deg, rgba(37, 99, 235, 0.98), rgba(29, 78, 216, 0.8));
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
        }

        :global(.bubble-train .bubbleIcon) {
          background: linear-gradient(140deg, rgba(6, 182, 212, 0.98), rgba(8, 145, 178, 0.8));
          box-shadow: 0 4px 14px rgba(6, 182, 212, 0.35);
        }

        :global(.bubble-bus .bubbleIcon) {
          background: linear-gradient(140deg, rgba(56, 189, 248, 0.98), rgba(2, 132, 199, 0.82));
          box-shadow: 0 4px 14px rgba(56, 189, 248, 0.35);
        }

        :global(.bubble-car:hover) {
          border-color: rgba(37, 99, 235, 0.6);
        }

        :global(.bubble-train:hover) {
          border-color: rgba(6, 182, 212, 0.6);
        }

        :global(.bubble-bus:hover) {
          border-color: rgba(56, 189, 248, 0.6);
        }

        :global(.bubbleBody) {
          display: flex;
          flex-direction: column;
          min-width: 0;
          line-height: 1.25;
        }

        :global(.bubbleMode) {
          font-size: 11px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.55);
        }

        :global(.bubbleTime) {
          font-size: 13px;
          font-weight: 650;
          color: rgba(255, 255, 255, 0.94);
          white-space: nowrap;
        }

        :global(.bubble) {
          cursor: pointer;
          text-align: left;
          font: inherit;
        }

        :global(.bubbleOn) {
          background: rgba(56, 189, 248, 0.16);
          border-color: rgba(56, 189, 248, 0.65);
          box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.16);
        }

        :global(.itemOn) {
          background: rgba(56, 189, 248, 0.04);
          border-radius: 12px;
        }

        :global(.pickHint) {
          margin-top: 10px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.42);
        }

        :global(.planRow) {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 12px;
        }

        :global(.calendarButton) {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 13px;
          border-radius: 999px;
          border: 1px solid rgba(125, 211, 252, 0.45);
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.9), rgba(14, 165, 233, 0.85));
          color: #fff;
          font-size: 13px;
          font-weight: 620;
          cursor: pointer;
          box-shadow: 0 8px 22px rgba(2, 132, 199, 0.35);
        }

        :global(.calendarButton:hover) {
          filter: brightness(1.06);
        }

        :global(.planSummary) {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
        }

        :global(.popover) {
          position: absolute;
          z-index: 20;
          top: calc(100% + 8px);
          left: 0;
          width: min(320px, 100%);
          display: grid;
          gap: 10px;
          padding: 14px;
          border-radius: 14px;
          background: rgba(8, 20, 40, 0.97);
          border: 1px solid rgba(125, 211, 252, 0.28);
          box-shadow: 0 18px 50px rgba(2, 6, 23, 0.6);
        }

        :global(.popLabel) {
          display: grid;
          gap: 6px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.72);
        }

        :global(.popInput) {
          color-scheme: dark;
        }

        :global(.popHint) {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
        }

        :global(.popActions) {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        :global(.popButton) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.07);
          color: rgba(255, 255, 255, 0.92);
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
        }

        :global(.popButton:hover) {
          border-color: rgba(125, 211, 252, 0.5);
          background: rgba(56, 189, 248, 0.14);
        }

        :global(.popPrimary) {
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.95), rgba(14, 165, 233, 0.9));
          border-color: rgba(125, 211, 252, 0.5);
        }

        :global(.approxNote) {
          margin-top: 8px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
        }

        .page {
          min-height: 100vh;
          position: relative;
          color: #0b1220;
          background: #040a16;
        }

        .bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(900px 500px at 15% 10%, rgba(37, 99, 235, 0.38), transparent 60%),
            radial-gradient(900px 500px at 85% 15%, rgba(14, 165, 233, 0.3), transparent 60%),
            radial-gradient(900px 500px at 50% 90%, rgba(6, 182, 212, 0.2), transparent 60%),
            linear-gradient(180deg, #05101f 0%, #040b18 55%, #030812 100%);
          filter: saturate(120%);
          pointer-events: none;
        }

        .container {
          position: relative;
          max-width: 980px;
          margin: 0 auto;
          padding: 56px 18px 28px;
        }

        .header {
          text-align: left;
          margin-bottom: 20px;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          letter-spacing: 0.02em;
          color: rgba(255, 255, 255, 0.85);
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(10px);
        }

        .title {
          margin: 10px 0 6px;
          font-size: 34px;
          line-height: 1.15;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.95);
        }

        .subtitle {
          margin: 0;
          max-width: 60ch;
          color: rgba(255, 255, 255, 0.68);
          font-size: 14px;
          line-height: 1.5;
        }

        .panel {
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 12px 50px rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(14px);
          padding: 16px;
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .span2 {
          grid-column: span 2;
        }

        .field {
          display: grid;
          gap: 6px;
        }

        .label {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.72);
        }

        .input {
          width: 100%;
          padding: 12px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(9, 12, 24, 0.55);
          color: rgba(255, 255, 255, 0.92);
          outline: none;
          transition: border-color 120ms ease, transform 120ms ease;
        }

        .input::placeholder {
          color: rgba(255, 255, 255, 0.45);
        }

        .input:focus {
          border-color: rgba(56, 189, 248, 0.75);
          box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
        }

        .actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 14px;
        }

        .button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: rgba(255, 255, 255, 0.95);
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.95), rgba(14, 165, 233, 0.9));
          cursor: pointer;
          font-weight: 600;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
          transition: transform 120ms ease, filter 120ms ease, opacity 120ms ease;
        }

        .button:hover {
          transform: translateY(-1px);
          filter: brightness(1.02);
        }

        .button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }

        :global(.steps) {
          display: inline-flex;
          align-items: flex-end;
          gap: 8px;
          height: 34px;
        }

        :global(.stepsCompact) {
          height: 18px;
          gap: 5px;
        }

        :global(.step) {
          display: block;
          width: 17px;
          height: 26px;
          color: rgba(255, 255, 255, 0.9);
          opacity: 0.15;
          animation: walk 1.35s ease-in-out infinite;
        }

        :global(.stepsCompact .step) {
          width: 8px;
          height: 13px;
        }

        @keyframes walk {
          0%,
          70%,
          100% {
            opacity: 0.15;
          }
          25%,
          45% {
            opacity: 1;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          :global(.step) {
            animation: none;
            opacity: 0.65;
          }
        }

        .loadingCard {
          display: grid;
          justify-items: center;
          gap: 10px;
          text-align: center;
          padding: 26px 16px;
        }

        .hint {
          color: rgba(255, 255, 255, 0.6);
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
          justify-content: flex-end;
          flex: 1;
        }

        kbd {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
            monospace;
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.82);
        }

        .alert {
          margin-top: 12px;
          border-radius: 12px;
          padding: 12px;
          border: 1px solid rgba(244, 63, 94, 0.35);
          background: rgba(244, 63, 94, 0.12);
          color: rgba(255, 255, 255, 0.9);
        }

        .results {
          margin-top: 18px;
        }

        .resultsHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 12px 0;
        }

        .resultsTitle {
          margin: 0;
          font-size: 16px;
          color: rgba(255, 255, 255, 0.92);
        }

        .chip {
          display: inline-flex;
          align-items: center;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.82);
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .cards {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 14px;
        }

        .card {
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 12px 50px rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(14px);
          overflow: hidden;
        }

        .cardTitle {
          padding: 12px 14px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.92);
          border-bottom: 1px solid rgba(255, 255, 255, 0.10);
        }

        .cardBody {
          padding: 10px 14px 14px;
        }

        :global(.item) {
          padding: 10px 0;
          border-bottom: 1px dashed rgba(255, 255, 255, 0.14);
        }

        :global(.item:last-child) {
          border-bottom: none;
        }

        :global(.itemTop) {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
        }

        :global(.itemName) {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 650;
          color: rgba(255, 255, 255, 0.92);
        }

        :global(.num) {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          background: rgba(37, 99, 235, 0.28);
          border: 1px solid rgba(56, 189, 248, 0.4);
          color: rgba(255, 255, 255, 0.9);
        }

        :global(.itemWhy) {
          margin-top: 6px;
          color: rgba(255, 255, 255, 0.68);
          font-size: 13px;
          line-height: 1.45;
        }

        :global(.link) {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.85);
          text-decoration: none;
          border: 1px solid rgba(255, 255, 255, 0.16);
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
        }

        :global(.link:hover) {
          border-color: rgba(56, 189, 248, 0.5);
          background: rgba(56, 189, 248, 0.14);
        }

        :global(.empty) {
          color: rgba(255, 255, 255, 0.85);
          font-size: 13px;
          padding: 8px 0;
        }

        .raw {
          margin-top: 12px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          padding: 10px 14px;
          color: rgba(255, 255, 255, 0.85);
        }

        .json {
          margin: 10px 0 0;
          white-space: pre-wrap;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.75);
        }

        .placeholder {
          margin-top: 18px;
        }

        .placeholderCard {
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.12);
          padding: 16px;
          color: rgba(255, 255, 255, 0.75);
        }

        .placeholderTitle {
          color: rgba(255, 255, 255, 0.92);
          font-weight: 700;
          margin-bottom: 6px;
        }

        .placeholderText {
          font-size: 13px;
          line-height: 1.5;
        }

        .footer {
          margin-top: 20px;
          color: rgba(255, 255, 255, 0.5);
          font-size: 12px;
          padding: 6px 2px;
        }

        @media (max-width: 760px) {
          .grid {
            grid-template-columns: 1fr;
          }

          .span2 {
            grid-column: span 1;
          }

          .actions {
            flex-direction: column;
            align-items: stretch;
          }

          .hint {
            justify-content: flex-start;
          }

          .cards {
            grid-template-columns: 1fr;
          }

          .resultsHeader {
            flex-direction: column;
            align-items: flex-start;
          }

          /* Keep the three modes side by side; stack the icon above the text
             so they still fit on a narrow screen. */
          :global(.bubble) {
            flex-direction: column;
            align-items: center;
            gap: 6px;
            padding: 10px 6px;
            border-radius: 16px;
            text-align: center;
          }

          :global(.bubbleBody) {
            align-items: center;
          }

          :global(.bubbleTime) {
            font-size: 12px;
          }
        }
      `}</style>
    </div>
  );
}
