"use client";

import { useMemo, useState } from "react";

type Option = {
  name?: string;
  title?: string;
  why?: string;
  description?: string;
  details?: string;
  source_url?: string;
  rating?: number | null;
  highlights?: string[];
};

type ApiResult = {
  midpoint_area?: string;
  food_options?: Option[];
  activity_options?: Option[];
};

type TravelOption = { mode: string; duration_minutes: number; notes: string };

type TravelBlock = {
  from_person_1?: TravelOption[];
  from_person_2?: TravelOption[];
  recommended_mode_person_1?: string | null;
  recommended_mode_person_2?: string | null;
};

type ApiResponse = {
  ok: boolean;
  result?: ApiResult;
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

function TravelTable({ title, items }: { title: string; items?: TravelOption[] }) {
  return (
    <div className="travelCard">
      <div className="travelTitle">{title}</div>
      {items?.length ? (
        <div className="travelList">
          {items.map((t) => (
            <div className="travelRow" key={`${title}-${t.mode}`}>
              <div className="travelMode">{t.mode}</div>
              <div className="travelTime">{t.duration_minutes} min</div>
              <div className="travelNotes">{t.notes}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">No travel estimates.</div>
      )}
    </div>
  );
}

export default function Home() {
  const [postcode1, setPostcode1] = useState("");
  const [postcode2, setPostcode2] = useState("");
  const [preferences, setPreferences] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return postcode1.trim().length > 0 && postcode2.trim().length > 0 && !loading;
  }, [postcode1, postcode2, loading]);

  async function plan() {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postcode1, postcode2, preferences }),
      });

      const json = (await res.json()) as ApiResponse;
      if (!res.ok) throw new Error((json as any)?.error ?? "Request failed");
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && canSubmit) plan();
  }

  const result = data?.result as ApiResult | undefined;
  const travel = data?.travel as TravelBlock | undefined;

  function travelLooksSame(a?: TravelOption[], b?: TravelOption[]) {
    if (!a?.length || !b?.length) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].mode !== b[i].mode) return false;
      if (a[i].duration_minutes !== b[i].duration_minutes) return false;
    }
    return true;
  }

  const sameTravel = travelLooksSame(travel?.from_person_1, travel?.from_person_2);

  return (
    <div className="page">
      <div className="bg" aria-hidden="true" />

      <main className="container">
        <header className="header">
          <h1 className="title">Half-way Planner</h1>
          <p className="subtitle">
            Enter two postcodes and get a midpoint area with food + activity ideas.
          </p>
        </header>

        <section className="panel" aria-label="Inputs">
          <div className="grid">
            <label className="field">
              <span className="label">Person 1 postcode</span>
              <input
                className="input"
                value={postcode1}
                onChange={(e) => setPostcode1(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="e.g. E1 1HJ"
                autoComplete="postal-code"
              />
            </label>

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
          </div>

          <div className="actions">
            <button className="button" onClick={plan} disabled={!canSubmit}>
              {loading ? (
                <>
                  <span className="spinner" aria-hidden="true" />
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
              {result?.midpoint_area && (
                <div className="chip">Midpoint area: {result.midpoint_area}</div>
              )}
            </div>

            {travel && (
              <div className="travel">
                <div className="travelHeader">
                  <h3 className="travelHeaderTitle">Travel options (sorted by time)</h3>
                </div>

                {sameTravel ? (
                  <>
                    <div className="travelNote">
                      These estimates are to the midpoint, so Person 1 and Person 2 are the same distance.
                    </div>
                    <div className="travelGridOne">
                      <TravelTable title="To the midpoint" items={travel.from_person_1} />
                    </div>
                  </>
                ) : (
                  <div className="travelGrid">
                    <TravelTable title="From Person 1" items={travel.from_person_1} />
                    <TravelTable title="From Person 2" items={travel.from_person_2} />
                  </div>
                )}
              </div>
            )}

            <div className="cards">
              <div className="card">
                <div className="cardTitle">Food (Top 3)</div>
                <div className="cardBody">
                  {(result?.food_options?.length ? result.food_options : []).map((o, idx) => (
                    <div className="item" key={`food-${idx}`}>
                      <div className="itemTop">
                        <div className="itemName">
                          <span className="num">{idx + 1}</span>
                          {prettyOptionName(o)}
                        </div>
                        <div className="itemMeta">
                          <Stars rating={o.rating} />
                          {o.source_url ? (
                            <a className="link" href={o.source_url} target="_blank" rel="noreferrer">
                              Source
                            </a>
                          ) : null}
                        </div>
                      </div>
                      {o.details || o.why || o.description ? (
                        <div className="itemWhy">{o.details ?? o.why ?? o.description}</div>
                      ) : null}
                      {o.highlights?.length ? (
                        <ul className="highlights">
                          {o.highlights.map((h, i) => (
                            <li key={`food-h-${idx}-${i}`}>{h}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}

                  {!result?.food_options?.length && (
                    <div className="empty">No food options returned yet.</div>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="cardTitle">Activities (Top 3)</div>
                <div className="cardBody">
                  {(result?.activity_options?.length ? result.activity_options : []).map((o, idx) => (
                    <div className="item" key={`act-${idx}`}>
                      <div className="itemTop">
                        <div className="itemName">
                          <span className="num">{idx + 1}</span>
                          {prettyOptionName(o)}
                        </div>
                        <div className="itemMeta">
                          {o.source_url ? (
                            <a className="link" href={o.source_url} target="_blank" rel="noreferrer">
                              Source
                            </a>
                          ) : null}
                        </div>
                      </div>
                      {o.details || o.why || o.description ? (
                        <div className="itemWhy">{o.details ?? o.why ?? o.description}</div>
                      ) : null}
                      {o.highlights?.length ? (
                        <ul className="highlights">
                          {o.highlights.map((h, i) => (
                            <li key={`act-h-${idx}-${i}`}>{h}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}

                  {!result?.activity_options?.length && (
                    <div className="empty">No activity options returned yet.</div>
                  )}
                </div>
              </div>
            </div>

            <details className="raw">
              <summary>Raw JSON</summary>
              <pre className="json">{JSON.stringify(result, null, 2)}</pre>
            </details>
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
        .itemMeta {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .rating {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.16);
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
        }

        .ratingMuted {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.65);
          border: 1px solid rgba(255, 255, 255, 0.12);
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.05);
        }

        .star {
          color: #f5c542;
        }

        .highlights {
          margin: 10px 0 0;
          padding-left: 18px;
          color: rgba(255, 255, 255, 0.68);
          font-size: 13px;
          line-height: 1.45;
        }

        .highlights li {
          margin: 4px 0;
        }

        .travel {
          margin-top: 12px;
          border-radius: 16px;
          background: linear-gradient(160deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.7));
          border: 1px solid rgba(148, 163, 184, 0.25);
          box-shadow: 0 12px 40px rgba(2, 6, 23, 0.45);
          padding: 12px;
          color: rgba(226, 232, 240, 0.95);
        }

        .travelHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }

        .travelHeaderTitle {
          margin: 0;
          font-size: 13px;
          color: #f8fafc;
          letter-spacing: 0.02em;
        }

        .travelChips {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .travelGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .travelNote {
          margin: 8px 0 12px;
          color: rgba(226, 232, 240, 0.7);
          font-size: 12px;
          line-height: 1.4;
        }

        .travelGridOne {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }

        :global(.travelCard) {
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.55);
          border: 1px solid rgba(148, 163, 184, 0.22);
          padding: 12px;
          backdrop-filter: blur(6px);
        }

        :global(.travelTitle) {
          font-weight: 700;
          color: #f8fafc;
          margin-bottom: 10px;
          font-size: 13px;
        }

        :global(.travelList) {
          display: grid;
          gap: 8px;
        }

        :global(.travelRow) {
          display: grid;
          grid-template-columns: 88px 78px 1fr;
          gap: 10px;
          align-items: baseline;
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(2, 6, 23, 0.55);
          border: 1px solid rgba(148, 163, 184, 0.2);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
        }

        :global(.travelMode) {
          color: #e2e8f0;
          font-weight: 650;
          font-size: 13px;
          letter-spacing: 0.02em;
          background: rgba(59, 130, 246, 0.14);
          border: 1px solid rgba(59, 130, 246, 0.35);
          padding: 4px 8px;
          border-radius: 999px;
          justify-self: start;
        }

        :global(.travelTime) {
          color: #f8fafc;
          font-size: 13px;
          background: rgba(16, 185, 129, 0.18);
          border: 1px solid rgba(16, 185, 129, 0.4);
          padding: 4px 8px;
          border-radius: 999px;
          justify-self: start;
        }

        :global(.travelNotes) {
          color: rgba(226, 232, 240, 0.8);
          font-size: 12px;
        }

        .page {
          min-height: 100vh;
          position: relative;
          color: #0b1220;
          background: #070a12;
        }

        .bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(900px 500px at 15% 10%, rgba(99, 102, 241, 0.35), transparent 60%),
            radial-gradient(900px 500px at 85% 15%, rgba(16, 185, 129, 0.28), transparent 60%),
            radial-gradient(900px 500px at 50% 90%, rgba(244, 63, 94, 0.18), transparent 60%),
            linear-gradient(180deg, #060814 0%, #050711 55%, #040611 100%);
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
          border-color: rgba(99, 102, 241, 0.7);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
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
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(16, 185, 129, 0.8));
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

        .spinner {
          width: 14px;
          height: 14px;
          border-radius: 999px;
          border: 2px solid rgba(255, 255, 255, 0.35);
          border-top-color: rgba(255, 255, 255, 0.95);
          animation: spin 700ms linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
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

        .item {
          padding: 10px 0;
          border-bottom: 1px dashed rgba(255, 255, 255, 0.14);
        }

        .item:last-child {
          border-bottom: none;
        }

        .itemTop {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
        }

        .itemName {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 650;
          color: rgba(255, 255, 255, 0.92);
        }

        .num {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          background: rgba(99, 102, 241, 0.22);
          border: 1px solid rgba(99, 102, 241, 0.35);
          color: rgba(255, 255, 255, 0.9);
        }

        .itemWhy {
          margin-top: 6px;
          color: rgba(255, 255, 255, 0.68);
          font-size: 13px;
          line-height: 1.45;
        }

        .link {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.85);
          text-decoration: none;
          border: 1px solid rgba(255, 255, 255, 0.16);
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
        }

        .link:hover {
          border-color: rgba(16, 185, 129, 0.45);
          background: rgba(16, 185, 129, 0.12);
        }

        .empty {
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

          .travelGrid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
