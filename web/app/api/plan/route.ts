import { NextResponse } from "next/server";

type PlanRequest = {
  postcode1: string;
  postcode2: string;
  preferences?: string;
};

type PostcodesIoSingle = {
  status: number;
  result: null | { latitude: number; longitude: number };
};

type PostcodesIoReverse = {
  status: number;
  result: Array<{
    postcode: string;
    admin_district: string | null;
    region: string | null;
  }>;
};

function normalizePostcode(p: string) {
  return p.replace(/\s+/g, "").toUpperCase();
}

async function postcodeToLatLon(postcode: string) {
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as PostcodesIoSingle;

  if (data.status !== 200 || !data.result) {
    throw new Error(`Invalid postcode or lookup failed: ${postcode}`);
  }
  return { lat: data.result.latitude, lon: data.result.longitude };
}

function midpoint(lat1: number, lon1: number, lat2: number, lon2: number) {
  return { lat: (lat1 + lat2) / 2, lon: (lon1 + lon2) / 2 };
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

type TravelOption = { mode: string; duration_minutes: number; notes: string };

async function osrmDurationMinutes(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number },
) {
  const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=false`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`OSRM error: ${res.status}`);
  }
  const data = await res.json();
  const seconds = data?.routes?.[0]?.duration;
  if (!seconds) throw new Error("Missing OSRM duration");
  return Math.max(5, Math.round(seconds / 60));
}

function estimateTravelOptions(distanceKm: number, drivingMinutes: number): TravelOption[] {
  // Prototype estimates for London. Sorted by time.
  const car = drivingMinutes;
  const train = Math.max(14, Math.round((distanceKm / 36) * 60) + 10);
  const bus = Math.max(18, Math.round((distanceKm / 14) * 60) + 8);

  const opts: TravelOption[] = [
    { mode: "Car", duration_minutes: car, notes: "Live driving estimate" },
    { mode: "Train", duration_minutes: train, notes: "Includes walk/wait time" },
    { mode: "Bus", duration_minutes: bus, notes: "Slower but cheaper" },
  ];

  return opts.sort((a, b) => a.duration_minutes - b.duration_minutes);
}

async function latLonToArea(lat: number, lon: number) {
  const url = `https://api.postcodes.io/postcodes?lon=${encodeURIComponent(
    String(lon),
  )}&lat=${encodeURIComponent(String(lat))}&radius=2000&limit=1`;

  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as PostcodesIoReverse;

  if (data.status !== 200 || !data.result?.length) {
    throw new Error("Reverse lookup failed");
  }

  const r = data.result[0];
  return {
    postcode: r.postcode,
    district: r.admin_district ?? "Unknown district",
    region: r.region ?? "Unknown region",
  };
}

async function tavilySearch(query: string) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("Missing TAVILY_API_KEY");

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: "basic",
      max_results: 6,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tavily error: ${text}`);
  }

  return res.json();
}

async function formatWithOpenAI(payload: {
  area: { district: string; region: string };
  foodSearch: any;
  activitySearch: any;
  preferences?: string;
}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OPENAI_API_KEY");

  const system = `You are a meetup coordinator. Use the provided web search results to produce a practical meetup plan.

Return STRICT JSON with keys:
- midpoint_area: string
- food_options: array of exactly 3
- activity_options: array of exactly 3

For each food option include:
- name: string
- rating: number | null (Google rating if you can find it; otherwise null)
- details: string (specific: cuisine, halal info, approximate price level, address/area, prayer space if mentioned)
- highlights: string[] (2–4 concise bullets)
- source_url: string | null

For each activity option include:
- name: string
- rating: number | null (if available; otherwise null)
- details: string (specific: what it is, approximate price, duration, where it is)
- highlights: string[] (2–4 concise bullets)
- source_url: string | null

Do not invent ratings; only include a rating if it appears in the search results. If unsure, use null.`;

  const user = {
    area: payload.area,
    preferences: payload.preferences ?? "",
    food_search_results: payload.foodSearch,
    activity_search_results: payload.activitySearch,
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error: ${text}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No model output");
  return JSON.parse(content);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PlanRequest;

    const p1 = normalizePostcode(body.postcode1 || "");
    const p2 = normalizePostcode(body.postcode2 || "");
    if (!p1 || !p2) {
      return NextResponse.json({ error: "Both postcodes are required" }, { status: 400 });
    }

    const [a, b] = await Promise.all([postcodeToLatLon(p1), postcodeToLatLon(p2)]);
    const mid = midpoint(a.lat, a.lon, b.lat, b.lon);
    const area = await latLonToArea(mid.lat, mid.lon);

    const d1 = haversineKm(a.lat, a.lon, mid.lat, mid.lon);
    const d2 = haversineKm(b.lat, b.lon, mid.lat, mid.lon);

    const [drive1, drive2] = await Promise.all([
      osrmDurationMinutes(a, mid).catch(() => Math.max(8, Math.round((d1 / 22) * 60))),
      osrmDurationMinutes(b, mid).catch(() => Math.max(8, Math.round((d2 / 22) * 60))),
    ]);

    const travel_from_person_1 = estimateTravelOptions(d1, drive1);
    const travel_from_person_2 = estimateTravelOptions(d2, drive2);

    const recommended_mode_person_1 = travel_from_person_1[0]?.mode ?? null;
    const recommended_mode_person_2 = travel_from_person_2[0]?.mode ?? null;

    const foodQuery =
      `Top halal-friendly restaurants in ${area.district}, ${area.region}. ` +
      `Prefer Indian/Chinese/American/burgers/vegan/vegetarian. Include rating >= 4.3 if available.`;
    const activityQuery =
      `Beginner-friendly activities in ${area.district}, ${area.region}. ` +
      `Reasonably priced, good reviews.`;

    const [foodSearch, activitySearch] = await Promise.all([
      tavilySearch(foodQuery),
      tavilySearch(activityQuery),
    ]);

    const formatted = await formatWithOpenAI({
      area: { district: area.district, region: area.region },
      foodSearch,
      activitySearch,
      preferences: body.preferences,
    });

    return NextResponse.json({
      ok: true,
      inputs: { postcode1: p1, postcode2: p2 },
      midpoint: mid,
      area,
      travel: {
        from_person_1: travel_from_person_1,
        from_person_2: travel_from_person_2,
        recommended_mode_person_1,
        recommended_mode_person_2,
      },
      result: formatted,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
