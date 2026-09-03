const PLATFORMS = [
  "WeChat",
  "QQ",
  "Photos",
  "Cloud",
  "Browser",
  "Email",
  "Old Device"
];

const FILE_TYPES = ["Photo", "Voice", "Video", "Chat", "Link", "Document", "Unknown"];
const PEOPLE = ["Family", "Friend", "Classmate", "Colleague", "Myself", "Cannot remember"];
const LOCATIONS = ["Home", "School", "Workplace", "Another city", "Online", "Unknown"];
const ACCESS_STATES = ["Accessible", "Uncertain", "Expired", "Locked", "Offline", "Cached"];

const MEMORY_PRESETS = {
  photograph: { id: "photograph", label: "A photograph", fileHint: "Photo" },
  voice: { id: "voice", label: "A voice message", fileHint: "Voice" },
  conversation: { id: "conversation", label: "A conversation", fileHint: "Chat" },
  link: { id: "link", label: "A saved link or article", fileHint: "Link" }
};

const CLUE_TYPES = [
  { id: "time", label: "Time" },
  { id: "person", label: "Person" },
  { id: "location", label: "Location" },
  { id: "fileType", label: "File Type" },
  { id: "platform", label: "Platform" },
  { id: "keyword", label: "Keyword" }
];

const CLUE_OPTIONS = {
  time: ["Before 2015", "2015–2018", "2019–2021", "2022–2024", "Recently", "Uncertain"],
  person: PEOPLE,
  location: LOCATIONS,
  fileType: FILE_TYPES,
  platform: [...PLATFORMS, "Unknown"]
};

const RESULT_CATALOG = {
  complete: {
    label: "Complete Memory",
    subtypes: ["Original File Recovered", "Cloud Backup Recovered", "Duplicate Copy Recovered"],
    finalMessage: "The memory was recovered, but its survival depended on a copy you may not remember creating."
  },
  fragmented: {
    label: "Fragmented Memory",
    subtypes: ["Partial Image", "Audio Without Context", "Missing Chat History", "Damaged File"],
    finalMessage: "Parts of the memory remain. The missing context cannot be reconstructed."
  },
  similar: {
    label: "Similar Memory",
    subtypes: ["Same Person, Different Time", "Similar Scene", "Compressed Copy", "Reposted Version", "Thumbnail Only"],
    finalMessage: "The system found resemblance, but recognition does not confirm identity."
  },
  inaccessible: {
    label: "Inaccessible Memory",
    subtypes: [
      "Content Expired",
      "Content Not Found",
      "Source Deleted",
      "Link Invalid",
      "Permission Denied",
      "Cache Cleared",
      "Old Device Offline",
      "Unsupported Format"
    ],
    finalMessage: "The memory may still exist, but the path to it is no longer available."
  }
};

const INTERPRETATIONS = {
  yes: "You recognised the memory, although the system could only reconstruct its digital trace.",
  close: "Similarity produced recognition, but resemblance could not confirm identity.",
  no: "The search found data, but it did not recover the memory you remember."
};

const NEXT_ACTIONS = {
  complete: "Keep a second copy in a place you control.",
  fragmented: "Search adjacent dates and related people.",
  similar: "Compare original timestamps and filenames.",
  inaccessible: "Check an old device or export before the path closes."
};

const TECH_STATUS = {
  complete: ["Checksum verified", "Mirror copy intact", "Index pointer resolved"],
  fragmented: ["Partial sector read", "Header missing", "Waveform truncated"],
  similar: ["Nearest-neighbour match", "Hash collision rejected", "Thumbnail index only"],
  inaccessible: ["Access token expired", "Endpoint unreachable", "Cache index empty"]
};

const SEARCH_MESSAGES = [
  "Searching local files…",
  "Checking cached previews…",
  "Following platform references…",
  "Contacting old devices…",
  "Reconstructing fragments…",
  "Verifying possible matches…"
];

const KEYWORDS_POOL = [
  "birthday", "rain", "classroom", "night bus", "unsent", "screenshot",
  "voice note", "draft", "reunion", "corridor", "export", "untitled"
];

function charCount(str) {
  return Array.from(str || "").length;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function randomDateForTime(timeLabel) {
  const ranges = {
    "Before 2015": [2008, 2014],
    "2015–2018": [2015, 2018],
    "2019–2021": [2019, 2021],
    "2022–2024": [2022, 2024],
    Recently: [2025, 2026],
    Uncertain: [2010, 2026]
  };
  const [a, b] = ranges[timeLabel] || [2011, 2026];
  const year = a + Math.floor(Math.random() * (b - a + 1));
  const month = 1 + Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function generateReceiptId() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, "0");
  return `RM-${t}-${r}`;
}

function countActiveClues(clues) {
  let n = 0;
  CLUE_TYPES.forEach((c) => {
    const v = clues[c.id];
    if (!v) return;
    if (c.id === "keyword" && charCount(v) < 1) return;
    if (v === "Uncertain" || v === "Unknown" || v === "Cannot remember") return;
    n += 1;
  });
  return n;
}

function cluesConflict(memory, clues) {
  if (!memory || !clues.fileType || clues.fileType === "Unknown") return false;
  const expected = memory.fileHint;
  if (!expected) return false;
  const pairs = {
    Photo: ["Voice", "Chat"],
    Voice: ["Photo", "Link"],
    Chat: ["Photo", "Video"],
    Link: ["Voice", "Video"]
  };
  return (pairs[expected] || []).includes(clues.fileType);
}

function derivePlatforms(clues, searchMode) {
  if (clues.platform && clues.platform !== "Unknown") {
    if (searchMode === "expand") {
      return [clues.platform, ...PLATFORMS.filter((p) => p !== clues.platform).slice(0, 3)];
    }
    return [clues.platform];
  }
  if (searchMode === "refine") return PLATFORMS.slice(0, 4);
  return [...PLATFORMS];
}

function weightedMainState(state) {
  const clues = state.selectedClues || {};
  const memory = state.selectedMemory;
  const scores = { complete: 8, fragmented: 12, similar: 12, inaccessible: 10 };
  const accuracy = countActiveClues(clues);

  if (accuracy >= 4) scores.complete += 28;
  else if (accuracy === 3) scores.complete += 12;
  else if (accuracy <= 1) {
    scores.similar += 18;
    scores.fragmented += 14;
  }

  if (state.searchMode === "refine") scores.complete += 10;
  if (state.searchMode === "expand") {
    scores.similar += 16;
    scores.fragmented += 10;
    scores.inaccessible += 8;
  }

  if (cluesConflict(memory, clues)) scores.inaccessible += 24;

  const oldTime = clues.time === "Before 2015" || clues.time === "2015–2018";
  if (clues.platform === "WeChat" && oldTime) {
    scores.inaccessible += 36;
  }
  if ((memory && memory.id === "link") || clues.fileType === "Link" || clues.platform === "Browser") {
    scores.inaccessible += 18;
  }
  if (clues.platform === "Old Device") scores.inaccessible += 22;
  if (
    (memory && memory.id === "photograph") &&
    clues.person &&
    clues.person !== "Cannot remember"
  ) {
    scores.similar += 22;
  }

  const keys = Object.keys(scores);
  const total = keys.reduce((s, k) => s + scores[k], 0);
  let roll = Math.random() * total;
  let chosen = "fragmented";
  for (const k of keys) {
    roll -= scores[k];
    if (roll <= 0) {
      chosen = k;
      break;
    }
  }
  return { main: chosen, scores, oldTime };
}

function pickSubtype(main, state, flags) {
  const clues = state.selectedClues || {};
  const memory = state.selectedMemory;
  if (main === "inaccessible") {
    if (clues.platform === "WeChat" && flags.oldTime) return "Content Expired";
    if (clues.platform === "Browser" || (memory && memory.id === "link") || clues.fileType === "Link") {
      return "Link Invalid";
    }
    if (clues.platform === "Old Device") return "Old Device Offline";
    if (cluesConflict(memory, clues)) return "Unsupported Format";
    return pick(RESULT_CATALOG.inaccessible.subtypes);
  }
  if (main === "similar") {
    if (clues.person && clues.person !== "Cannot remember") return "Same Person, Different Time";
    if (memory && memory.id === "photograph") return pick(["Similar Scene", "Thumbnail Only", "Compressed Copy"]);
    return pick(RESULT_CATALOG.similar.subtypes);
  }
  if (main === "complete") {
    if (clues.platform === "Cloud") return "Cloud Backup Recovered";
    if (state.searchMode === "expand") return "Duplicate Copy Recovered";
    return "Original File Recovered";
  }
  if (memory && memory.id === "voice") return "Audio Without Context";
  if (memory && memory.id === "conversation") return "Missing Chat History";
  if (memory && memory.id === "photograph") return "Partial Image";
  return pick(RESULT_CATALOG.fragmented.subtypes);
}

function confidenceFor(main, accuracy, searchMode) {
  const base = { complete: 0.86, fragmented: 0.54, similar: 0.61, inaccessible: 0.18 }[main];
  let c = base + accuracy * 0.03;
  if (searchMode === "refine") c += 0.06;
  if (searchMode === "expand") c -= 0.08;
  return clamp(c + (Math.random() * 0.06 - 0.03), 0.08, 0.97);
}

function sourceFor(state, main) {
  const clues = state.selectedClues || {};
  if (clues.platform && clues.platform !== "Unknown") return clues.platform;
  if (main === "inaccessible" && clues.platform === "Old Device") return "Old Device";
  if (state.selectedMemory && state.selectedMemory.id === "link") return "Browser";
  return pick(PLATFORMS);
}

function similarCandidates(state, source) {
  const subtypes = RESULT_CATALOG.similar.subtypes.slice();
  const base = 58 + Math.floor(Math.random() * 18);
  return [0, 1, 2].map((i) => ({
    id: `cand-${i}`,
    subtype: subtypes[(i + subtypes.length - 1) % subtypes.length],
    similarity: clamp(base - i * (8 + Math.floor(Math.random() * 7)), 22, 94),
    source: i === 0 ? source : pick(PLATFORMS)
  }));
}

function determineOutcome(state) {
  const flags = {};
  const weighted = weightedMainState(state);
  flags.oldTime = weighted.oldTime;
  const main = state.forcedMain || weighted.main;
  const catalog = RESULT_CATALOG[main];
  const subtype = state.forcedSubtype || pickSubtype(main, state, flags);
  const accuracy = countActiveClues(state.selectedClues || {});
  const source = sourceFor(state, main);
  const confidence = confidenceFor(main, accuracy, state.searchMode);
  const result = {
    mainState: main,
    mainLabel: catalog.label,
    subtype,
    source,
    confidence,
    technicalStatus: pick(TECH_STATUS[main]),
    suggestedNextAction: NEXT_ACTIONS[main],
    finalMessage: catalog.finalMessage,
    platformsSearched: derivePlatforms(state.selectedClues || {}, state.searchMode),
    candidates: main === "similar" ? similarCandidates(state, source) : null,
    selectedCandidate: null
  };
  return result;
}

function nodeMatchesClues(node, clues) {
  if (!clues) return true;
  let score = 0;
  let checks = 0;
  if (clues.platform && clues.platform !== "Unknown") {
    checks += 1;
    if (node.platform === clues.platform) score += 1;
  }
  if (clues.fileType && clues.fileType !== "Unknown") {
    checks += 1;
    if (node.fileType === clues.fileType) score += 1;
  }
  if (clues.person && clues.person !== "Cannot remember") {
    checks += 1;
    if (node.person === clues.person) score += 1;
  }
  if (clues.location && clues.location !== "Unknown") {
    checks += 1;
    if (node.location === clues.location) score += 1;
  }
  if (clues.keyword && charCount(clues.keyword)) {
    checks += 1;
    if ((node.keyword || "").toLowerCase().includes(clues.keyword.toLowerCase())) score += 1;
  }
  if (!checks) return true;
  return score >= Math.ceil(checks * 0.5);
}

function createArchiveNodes(count, clues, extraUncertain) {
  const nodes = [];
  const preferredPlatform = clues && clues.platform && clues.platform !== "Unknown" ? clues.platform : null;
  for (let i = 0; i < count; i += 1) {
    let platform = pick(PLATFORMS);
    if (preferredPlatform && Math.random() < 0.45) platform = preferredPlatform;
    const fileType =
      clues && clues.fileType && clues.fileType !== "Unknown" && Math.random() < 0.4
        ? clues.fileType
        : pick(FILE_TYPES);
    const person =
      clues && clues.person && clues.person !== "Cannot remember" && Math.random() < 0.35
        ? clues.person
        : pick(PEOPLE);
    const location =
      clues && clues.location && clues.location !== "Unknown" && Math.random() < 0.3
        ? clues.location
        : pick(LOCATIONS);
    const keyword =
      clues && clues.keyword && Math.random() < 0.25 ? clues.keyword : pick(KEYWORDS_POOL);
    const uncertain = extraUncertain || Math.random() < 0.22;
    const access = uncertain ? pick(["Uncertain", "Expired", "Cached"]) : pick(ACCESS_STATES);
    let similarity = 0.2 + Math.random() * 0.55;
    if (nodeMatchesClues({ platform, fileType, person, location, keyword }, clues)) {
      similarity += 0.18;
    }
    nodes.push({
      id: `n-${i}-${Math.floor(Math.random() * 9999)}`,
      platform,
      date: randomDateForTime((clues && clues.time) || "Uncertain"),
      fileType,
      person,
      location,
      keyword,
      access,
      similarity: clamp(similarity, 0.08, 0.99),
      uncertain,
      expired: access === "Expired" || access === "Offline",
      visible: true,
      faint: !!extraUncertain
    });
  }
  return nodes;
}
