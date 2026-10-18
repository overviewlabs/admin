import { VOICE_NEWS_PLACES_2026 } from "./voice-news-places.js";

export interface VoiceNewsSearchPlan {
  query: string;
  category: "news";
  /** Rolling 24-hour or seven-day window, as enforced by searchWeb. */
  timeRange: "day" | "week";
  count: 3;
  location: {
    name: string;
    officialName: string;
    entityType: string;
    state: string;
    stateCode: string;
  };
}

const STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", PR: "Puerto Rico", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
} as const;
type StateCode = keyof typeof STATES;
type Topic = "news" | "crime";
type Place = { stateCode: StateCode; officialName: string; baseName: string; entityType: string };
type PlaceIndex = Map<StateCode, Map<string, Place[]>>;

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

const stateAliases = new Map<string, StateCode>();
for (const [code, name] of Object.entries(STATES)) {
  stateAliases.set(normalize(code), code as StateCode);
  stateAliases.set(normalize(name), code as StateCode);
}
stateAliases.set("d.c.", "DC");
stateAliases.set("d.c", "DC");
const orderedStateAliases = [...stateAliases.keys()].sort((a, b) => b.length - a.length);
let places: PlaceIndex | undefined;

function placeIndex(): PlaceIndex {
  if (places) return places;
  const index: PlaceIndex = new Map();
  for (const row of VOICE_NEWS_PLACES_2026.split("\n")) {
    const tab = row.indexOf("\t");
    const stateCode = row.slice(0, tab) as StateCode;
    const officialName = row.slice(tab + 1);
    if (!Object.hasOwn(STATES, stateCode) || !officialName) continue;
    // Match legal descriptors, not arbitrary final words. Balance areas keep their
    // full official names rather than becoming aliases for a different city.
    const suffix = / (city and borough|consolidated government|unified government|metropolitan government|urban county|municipality|borough|zona urbana|comunidad|corporation|village|town|city|CDP)$/i.exec(officialName);
    const place: Place = {
      stateCode,
      officialName,
      baseName: suffix ? officialName.slice(0, suffix.index) : officialName,
      entityType: suffix?.[1] ?? "other",
    };
    const state = index.get(stateCode) ?? new Map<string, Place[]>();
    index.set(stateCode, state);
    // Avoid adding the same row twice when its base and legal name are equal.
    // Separate Census rows with identical names deliberately remain separate.
    for (const alias of new Set([normalize(officialName), normalize(place.baseName)])) {
      const matches = state.get(alias) ?? [];
      matches.push(place);
      state.set(alias, matches);
    }
  }
  places = index;
  return index;
}

function resolveLocation(name: string, state: string): VoiceNewsSearchPlan["location"] | null {
  const code = stateAliases.get(normalize(state));
  if (!code) return null;
  const statePlaces = placeIndex().get(code);
  const matches = statePlaces?.get(normalize(name));
  if (matches?.length !== 1) return null;
  const place = matches[0]!;
  // A city can use its familiar short name only when no other local entity in
  // that state has that name. Towns, villages and CDPs retain their descriptor.
  const nameIsUnique = statePlaces?.get(normalize(place.baseName))?.length === 1;
  return {
    name: place.entityType === "city" && nameIsUnique ? place.baseName : place.officialName,
    officialName: place.officialName,
    entityType: place.entityType,
    state: STATES[code],
    stateCode: code,
  };
}

function parseLocation(value: string): VoiceNewsSearchPlan["location"] | null {
  const comma = value.lastIndexOf(",");
  if (comma >= 0) return resolveLocation(value.slice(0, comma), value.slice(comma + 1));
  const normalized = normalize(value);
  for (const state of orderedStateAliases) {
    if (normalized.endsWith(` ${state}`)) {
      return resolveLocation(normalized.slice(0, -(state.length + 1)), state);
    }
  }
  return null;
}

function priorLocation(value: unknown): VoiceNewsSearchPlan["location"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { name, state } = value as Record<string, unknown>;
  if (typeof name !== "string" || name.length > 160 || typeof state !== "string" || state.length > 60) return null;
  // This is deliberately a fresh Gazetteer lookup, not trust in client context.
  return resolveLocation(name, state);
}

const TOPIC = "(?:news|headlines|crime(?: activity| news| reports| updates)?)";
const MODIFIER = "(?:(?:recent|latest|current|local) )?";
const prefixes = [
  new RegExp(`^(?:(?:can|could|would|will) you )?(?:please )?(?:check|find|look up|search for) (?:the )?${MODIFIER}${TOPIC}$`),
  new RegExp(`^(?:are there )?any ${MODIFIER}${TOPIC}$`),
  new RegExp(`^what(?:'s| is| are) (?:the )?${MODIFIER}${TOPIC}$`),
  new RegExp(`^search (?:the )?news(?: for (?:the )?${MODIFIER}${TOPIC})?$`),
  new RegExp(`^(?:show|give) me (?:the )?${MODIFIER}${TOPIC}$`),
];

function parseTopic(prefix: string): Topic | null {
  if (!prefixes.some((pattern) => pattern.test(prefix))) return null;
  return /\bcrime\b/.test(prefix) ? "crime" : "news";
}

/**
 * Accept only a complete, narrowly specified public-news request. Unrecognized
 * language stays with normal agent tools. Neither user text nor prior context
 * is interpolated into a search query; every location comes from the Gazetteer.
 * The caller owns session authorization and scopes any retained prior location.
 */
export function planVoiceNewsSearch(text: unknown, previousLocation?: unknown): VoiceNewsSearchPlan | null {
  if (typeof text !== "string" || text.length > 320 || /[\p{C}"“”`]/u.test(text)) return null;
  let request = normalize(text).replace(/[.?!]$/, "").trim();
  if (request.startsWith("please ")) request = request.slice(7);
  let timeRange: VoiceNewsSearchPlan["timeRange"] = "week";
  let hasTimeRange = false;
  const removeTimeRange = () => {
    const suffix = / (today|this week)$/.exec(request);
    if (!suffix) return true;
    if (hasTimeRange) return false;
    hasTimeRange = true;
    timeRange = suffix[1] === "today" ? "day" : "week";
    request = request.slice(0, suffix.index);
    return true;
  };
  if (!removeTimeRange()) return null;
  request = request.replace(/ i should be aware (?:about|of)$/, "");
  if (!removeTimeRange()) return null;

  const makePlan = (topic: Topic, location: VoiceNewsSearchPlan["location"]): VoiceNewsSearchPlan => ({
    query: `"${location.name}" "${location.state}" ${topic}`,
    category: "news",
    timeRange,
    count: 3,
    location,
  });

  // A previous canonical location may resolve an entirely implicit follow-up,
  // but can never rescue a malformed or unknown explicit location.
  const implicitTopic = parseTopic(request);
  if (implicitTopic) {
    const location = priorLocation(previousLocation);
    return location ? makePlan(implicitTopic, location) : null;
  }
  for (const connector of request.matchAll(/ (?:in|for) /g)) {
    const topic = parseTopic(request.slice(0, connector.index));
    if (!topic) continue;
    const location = parseLocation(request.slice(connector.index + connector[0].length));
    if (location) return makePlan(topic, location);
  }
  return null;
}
