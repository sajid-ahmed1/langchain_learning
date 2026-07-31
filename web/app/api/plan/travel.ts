/**
 * Door-to-door travel estimates.
 *
 * The previous version timed the in-vehicle leg only, off a straight-line
 * distance, which made public transport look far faster than it is. Journeys
 * are now built the way transport planners break them up:
 *
 *   access walk + wait + in-vehicle + interchange + egress walk
 *
 * Only the car figure comes from real routing (OSRM). Train and bus remain
 * estimates: an accurate figure needs a timetable-aware journey planner, so
 * every option carries a `basis` saying which it is, and `notes` spelling out
 * what went into it.
 */

export type TravelBasis = "routed" | "estimated";

export type TravelOption = {
  mode: string;
  duration_minutes: number;
  notes: string;
  basis: TravelBasis;
};

/**
 * Straight-line distances understate real networks. Road/rail paths in a built
 * up area typically run ~30% longer than the crow-flies distance, so this is
 * applied when OSRM hasn't given us a real road distance.
 */
export const DETOUR_FACTOR = 1.3;

/** Finding a space and walking from it. Car routing ends at the destination. */
const PARKING_AND_WALK_MIN = 5;

const RAIL = {
  /** Walk to the origin station and from the destination station. */
  accessMin: 8,
  egressMin: 5,
  /** Roughly half a typical off-peak headway. */
  waitMin: 5,
  /** Average incl. dwell time at stops, in line with London Underground. */
  speedKph: 33,
  /** Longer trips rarely stay on one line. */
  interchangeMin: 5,
  interchangeAboveKm: 8,
  floorMin: 15,
};

const BUS = {
  accessMin: 4,
  egressMin: 4,
  waitMin: 6,
  /** London bus average incl. stops and traffic. */
  speedKph: 14,
  interchangeMin: 7,
  interchangeAboveKm: 6,
  floorMin: 14,
};

function minutesFor(km: number, kph: number) {
  return Math.round((km / kph) * 60);
}

function transitEstimate(km: number, cfg: typeof RAIL) {
  const inVehicle = minutesFor(km, cfg.speedKph);
  const interchange = km > cfg.interchangeAboveKm ? cfg.interchangeMin : 0;
  const total = cfg.accessMin + cfg.waitMin + inVehicle + interchange + cfg.egressMin;

  return {
    minutes: Math.max(cfg.floorMin, total),
    inVehicle,
    interchange,
  };
}

/**
 * @param networkKm distance along the network — OSRM road distance where we have
 *   it, otherwise a detour-adjusted straight line.
 * @param drivingMinutes OSRM driving duration, or a fallback estimate.
 * @param drivingIsRouted whether drivingMinutes came from real routing.
 */
export function buildTravelOptions(
  networkKm: number,
  drivingMinutes: number,
  drivingIsRouted: boolean,
): TravelOption[] {
  const car = drivingMinutes + PARKING_AND_WALK_MIN;

  const rail = transitEstimate(networkKm, RAIL);
  const bus = transitEstimate(networkKm, BUS);

  const describe = (cfg: typeof RAIL, r: ReturnType<typeof transitEstimate>, label: string) => {
    const parts = [
      `${cfg.accessMin} min walk`,
      `${cfg.waitMin} min wait`,
      `${r.inVehicle} min on ${label}`,
    ];
    if (r.interchange) parts.push(`${r.interchange} min change`);
    parts.push(`${cfg.egressMin} min walk`);
    return `Estimate: ${parts.join(" + ")}`;
  };

  const options: TravelOption[] = [
    {
      mode: "Car",
      duration_minutes: car,
      notes: drivingIsRouted
        ? `Live driving route + ${PARKING_AND_WALK_MIN} min parking and walking`
        : `Estimated drive + ${PARKING_AND_WALK_MIN} min parking and walking`,
      basis: drivingIsRouted ? "routed" : "estimated",
    },
    {
      mode: "Train",
      duration_minutes: rail.minutes,
      notes: describe(RAIL, rail, "board"),
      basis: "estimated",
    },
    {
      mode: "Bus",
      duration_minutes: bus.minutes,
      notes: describe(BUS, bus, "bus"),
      basis: "estimated",
    },
  ];

  return options.sort((a, b) => a.duration_minutes - b.duration_minutes);
}
