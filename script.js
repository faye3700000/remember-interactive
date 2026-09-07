const appState = {
  currentScene: 1,
  selectedMemory: null,
  personalSignificance: "",
  selectedClues: {},
  searchMode: null,
  inspectedNodes: [],
  currentResult: null,
  visitorResponse: null,
  receiptId: null,
  searchStartedAt: null,
  searchDurationMs: null,
  forcedMain: null,
  forcedSubtype: null,
  nodesInspectedSet: new Set()
};

let mapSystem = null;
let moveTimer = 0;
let lastMove = 0;
let idleResetTimer = null;
let searchTimer = null;
let archiveTimer = null;
let mapIntroTimer = null;
let printTimer = null;
let resetTimer = null;
let reduceMotion = false;
let subtypeCycle = 0;
let approachArmed = false;
let sceneHistory = [];
let navLocked = false;
let printDialogueOpen = false;
let lastRecordedScene = 1;

function resetAppState() {
  appState.currentScene = 1;
  appState.selectedMemory = null;
  appState.personalSignificance = "";
  appState.selectedClues = {};
  appState.searchMode = null;
  appState.inspectedNodes = [];
  appState.currentResult = null;
  appState.visitorResponse = null;
  appState.receiptId = null;
  appState.searchStartedAt = null;
  appState.searchDurationMs = null;
  appState.forcedMain = null;
  appState.forcedSubtype = null;
  appState.nodesInspectedSet = new Set();
  sceneHistory = [];
  lastRecordedScene = 1;
  const mem = document.getElementById("memory-input");
  const sig = document.getElementById("significance-input");
  const key = document.getElementById("keyword-input");
  if (mem) mem.value = "";
  if (sig) sig.value = "";
  if (key) key.value = "";
  const panel = document.getElementById("custom-panel");
  if (panel) panel.hidden = true;
  const memCount = document.getElementById("memory-count");
  const sigCount = document.getElementById("significance-count");
  if (memCount) memCount.textContent = "0 / 120";
  if (sigCount) sigCount.textContent = "0 / 200";
  document.querySelectorAll("[data-memory]").forEach((b) => b.setAttribute("aria-pressed", "false"));
}

function cancelSceneTimers(scene) {
  if (scene === 4 || scene === 7) clearTimeout(mapIntroTimer);
  if (scene === 6) {
    clearTimeout(searchTimer);
    searchTimer = null;
    if (mapSystem) mapSystem.searching = false;
  }
  if (scene === 11) {
    clearTimeout(printTimer);
    printTimer = null;
  }
  if (scene === 12) {
    clearTimeout(archiveTimer);
    archiveTimer = null;
  }
  if (scene === 13) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }
}

function recordHistory(fromScene, toScene) {
  if (fromScene == null || toScene == null) return;
  if (fromScene === toScene) return;
  if (fromScene === 13) return;
  const last = sceneHistory[sceneHistory.length - 1];
  if (last === fromScene) return;
  sceneHistory.push(fromScene);
}

function updateBackButton() {
  const btn = document.getElementById("back-btn");
  if (!btn) return;
  const scene = appState.currentScene;
  const show = scene !== 1 && scene !== 13;
  btn.hidden = !show;
  btn.disabled = navLocked || !show;
}

function closeOpenPanels() {
  const custom = document.getElementById("custom-panel");
  const secondary = document.getElementById("clue-secondary");
  const keyword = document.getElementById("keyword-panel");
  let closed = false;
  if (custom && !custom.hidden) {
    custom.hidden = true;
    closed = true;
  }
  if (secondary && !secondary.hidden) {
    secondary.hidden = true;
    closed = true;
  }
  if (keyword && !keyword.hidden) {
    keyword.hidden = true;
    closed = true;
  }
  return closed;
}

function lockNav(ms) {
  navLocked = true;
  updateBackButton();
  setTimeout(() => {
    navLocked = false;
    updateBackButton();
  }, ms || 320);
}

function invalidateAfter(level) {
  if (level === "memory" || level === "clues") {
    appState.currentResult = null;
    appState.visitorResponse = null;
    appState.receiptId = null;
    appState.searchDurationMs = null;
    appState.forcedMain = null;
    appState.forcedSubtype = null;
  }
  if (level === "memory") {
    appState.searchMode = null;
  }
}

function goBack() {
  if (navLocked) return;
  if (printDialogueOpen) return;
  const scene = appState.currentScene;
  if (scene === 1 || scene === 13) return;
  if (closeOpenPanels()) {
    AudioEngine.blip();
    return;
  }
  lockNav(320);
  AudioEngine.blip();
  cancelSceneTimers(scene);
  let target = sceneHistory.pop();
  while (target === scene) target = sceneHistory.pop();
  if (scene === 6) target = 5;
  else if (scene === 7) target = 5;
  else if (scene === 8 && (target === 6 || target == null)) target = 7;
  else if (scene === 11) target = 10;
  else if (scene === 12) target = 10;
  if (target == null) {
    const fallback = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 5, 8: 7, 9: 8, 10: 9, 11: 10, 12: 10 };
    target = fallback[scene] || 1;
  }
  goToScene(target, { fromBack: true });
}

function bumpIdle() {
  clearTimeout(idleResetTimer);
  if (appState.currentScene === 1 || appState.currentScene === 13) return;
  idleResetTimer = setTimeout(() => {
    goToScene(13);
  }, 45000);
}

function showSceneEl(id, on) {
  const el = document.getElementById(id);
  if (!el) return;
  if (on) el.removeAttribute("hidden");
  else el.setAttribute("hidden", "");
}

function goToScene(n, opts) {
  const options = opts || {};
  const leaving = appState.currentScene;
  if (leaving !== n) cancelSceneTimers(leaving);
  if (n >= 3 && !appState.selectedMemory && !options.fromBack) {
    appState.selectedMemory = { ...MEMORY_PRESETS.photograph };
  }
  if (!options.fromBack && !options.skipHistory) {
    recordHistory(leaving, n);
  }
  lastRecordedScene = n;
  appState.currentScene = n;
  for (let i = 1; i <= 13; i += 1) showSceneEl(`scene-${i}`, false);
  if (n === 4 || n === 5) showSceneEl("scene-4", true);
  else if (n === 7 || n === 8) showSceneEl("scene-8", true);
  else if (document.getElementById(`scene-${n}`)) showSceneEl(`scene-${n}`, true);

  const filter = document.getElementById("filter-panel");
  if (n === 5) filter.removeAttribute("hidden");
  else filter.setAttribute("hidden", "");

  if (n === 1) {
    AudioEngine.setMode("idle");
    if (!options.fromBack && mapSystem) mapSystem.clear();
    if (options.fromBack && mapSystem) mapSystem.searching = false;
  } else if (n === 2) {
    restoreEntrance();
  } else if (n === 3) {
    restoreClues();
  } else if (n === 4 || n === 5) {
    if (mapSystem && !mapSystem.nodes.length) {
      mapSystem.spawn(createArchiveNodes(188, appState.selectedClues, false));
    }
    if (mapSystem) mapSystem.searching = false;
    AudioEngine.setMode(appState.searchMode === "expand" ? "expand" : appState.searchMode === "refine" ? "quiet" : "map");
    renderFilterClues();
  } else if (n === 6) {
    if (mapSystem && !mapSystem.nodes.length) {
      mapSystem.spawn(createArchiveNodes(188, appState.selectedClues, false));
    }
    if (options.fromBack) {
      if (mapSystem) mapSystem.searching = false;
      AudioEngine.setMode("map");
    } else {
      AudioEngine.setMode("search");
      startSearchSequence();
    }
  } else if (n === 7 || n === 8) {
    ensureResult();
    renderPreview();
    AudioEngine.setMode("quiet");
    if (n === 7 && !options.fromBack) {
      clearTimeout(mapIntroTimer);
      mapIntroTimer = setTimeout(() => {
        if (appState.currentScene === 7) goToScene(8);
      }, reduceMotion ? 200 : 900);
    }
  } else if (n === 9) {
    AudioEngine.setMode("reflect");
    restoreReflection();
  } else if (n === 10) {
    finalizeReceipt();
    Receipt.mount(appState, document.getElementById("receipt-screen"), document.getElementById("print-receipt-root"));
  } else if (n === 12) {
    const kind = appState.currentResult ? appState.currentResult.mainState : "inaccessible";
    AudioEngine.setMode(`archive-${kind}`);
    archiveTimer = setTimeout(() => goToScene(13), reduceMotion ? 4000 : 12000);
  } else if (n === 13) {
    AudioEngine.fadeOut(2);
    resetTimer = setTimeout(() => {
      resetAppState();
      if (mapSystem) mapSystem.clear();
      goToScene(1, { skipHistory: true });
    }, reduceMotion ? 1200 : 2800);
  }

  updateBackButton();
  if (!options.skipIdle) bumpIdle();
}

function restoreEntrance() {
  const selected = appState.selectedMemory;
  document.querySelectorAll("[data-memory]").forEach((b) => {
    const id = b.getAttribute("data-memory");
    const pressed = !!(selected && ((id === "other" && selected.id === "other") || selected.id === id));
    b.setAttribute("aria-pressed", pressed ? "true" : "false");
  });
  const mem = document.getElementById("memory-input");
  const sig = document.getElementById("significance-input");
  const panel = document.getElementById("custom-panel");
  if (selected && selected.id === "other") {
    mem.value = selected.label || "";
    panel.hidden = false;
  } else if (panel) {
    panel.hidden = true;
  }
  sig.value = appState.personalSignificance || "";
  document.getElementById("memory-count").textContent = `${charCount(mem.value)} / 120`;
  document.getElementById("significance-count").textContent = `${charCount(sig.value)} / 200`;
}

function restoreClues() {
  renderClueTypes();
  renderTags();
  const key = document.getElementById("keyword-input");
  if (key) key.value = appState.selectedClues.keyword || "";
}

function restoreReflection() {
  const p = document.getElementById("interpretation");
  const cont = document.getElementById("continue-to-receipt");
  if (appState.visitorResponse) {
    p.hidden = false;
    p.textContent = INTERPRETATIONS[appState.visitorResponse];
    cont.hidden = false;
    document.querySelectorAll("[data-response]").forEach((b) => {
      b.setAttribute("aria-pressed", b.getAttribute("data-response") === appState.visitorResponse ? "true" : "false");
    });
  } else {
    p.hidden = true;
    cont.hidden = true;
    document.querySelectorAll("[data-response]").forEach((b) => b.setAttribute("aria-pressed", "false"));
  }
}

function ensureResult() {
  if (!appState.currentResult) {
    const outcome = determineOutcome(appState);
    outcome.timestampLabel = new Date().toLocaleString("en-GB", { hour12: false });
    appState.currentResult = outcome;
    appState.receiptId = generateReceiptId();
    outcome.receiptId = appState.receiptId;
  }
}

function finalizeReceipt() {
  ensureResult();
  if (appState.searchStartedAt && !appState.searchDurationMs) {
    appState.searchDurationMs = Date.now() - appState.searchStartedAt;
  }
  appState.currentResult.sessionInterpretation =
    INTERPRETATIONS[appState.visitorResponse] || appState.currentResult.sessionInterpretation;
}

function startSearchSequence() {
  clearTimeout(searchTimer);
  const status = document.getElementById("search-status");
  let i = 0;
  const duration = reduceMotion ? 2500 : 7000 + Math.floor(Math.random() * 3000);
  const step = duration / SEARCH_MESSAGES.length;
  status.textContent = SEARCH_MESSAGES[0];
  if (mapSystem) mapSystem.searching = true;
  const tick = () => {
    i += 1;
    if (i < SEARCH_MESSAGES.length) {
      status.textContent = SEARCH_MESSAGES[i];
      searchTimer = setTimeout(tick, step);
    } else {
      if (mapSystem) mapSystem.searching = false;
      appState.searchDurationMs = Date.now() - appState.searchStartedAt;
      ensureResult();
      goToScene(7);
    }
  };
  searchTimer = setTimeout(tick, step);
}

function memoryFromCustom() {
  const text = document.getElementById("memory-input").value.trim();
  const sig = document.getElementById("significance-input").value.trim();
  if (charCount(text) < 3) {
    document.getElementById("custom-error").hidden = false;
    return false;
  }
  document.getElementById("custom-error").hidden = true;
  appState.selectedMemory = { id: "other", label: text, fileHint: null };
  appState.personalSignificance = sig;
  return true;
}

function renderClueTypes() {
  const row = document.getElementById("clue-types");
  row.innerHTML = "";
  CLUE_TYPES.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = c.label;
    b.setAttribute("aria-pressed", appState.selectedClues[c.id] ? "true" : "false");
    b.addEventListener("click", () => {
      AudioEngine.blip();
      openSecondary(c.id);
    });
    row.appendChild(b);
  });
}

function openSecondary(id) {
  const panel = document.getElementById("clue-secondary");
  const keyPanel = document.getElementById("keyword-panel");
  if (id === "keyword") {
    panel.hidden = true;
    keyPanel.hidden = false;
    document.getElementById("keyword-input").focus();
    return;
  }
  keyPanel.hidden = true;
  panel.hidden = false;
  panel.innerHTML = "";
  (CLUE_OPTIONS[id] || []).forEach((opt) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = opt;
    b.setAttribute("aria-pressed", appState.selectedClues[id] === opt ? "true" : "false");
    b.addEventListener("click", () => {
      AudioEngine.blip();
      appState.selectedClues[id] = opt;
      invalidateAfter("clues");
      renderClueTypes();
      renderTags();
      openSecondary(id);
    });
    panel.appendChild(b);
  });
}

function renderTags() {
  const row = document.getElementById("clue-tags");
  row.innerHTML = "";
  Object.entries(appState.selectedClues).forEach(([k, v]) => {
    if (!v) return;
    const tag = document.createElement("span");
    tag.className = "tag";
    const label = CLUE_TYPES.find((c) => c.id === k);
    tag.innerHTML = `${label ? label.label : k}: ${Receipt.esc(v)} <button type="button" aria-label="Remove">×</button>`;
    tag.querySelector("button").addEventListener("click", () => {
      delete appState.selectedClues[k];
      invalidateAfter("clues");
      renderClueTypes();
      renderTags();
    });
    row.appendChild(tag);
  });
}

function renderFilterClues() {
  const row = document.getElementById("filter-clues");
  row.innerHTML = "";
  Object.entries(appState.selectedClues).forEach(([k, v]) => {
    if (!v) return;
    const tag = document.createElement("span");
    tag.className = "tag";
    const label = CLUE_TYPES.find((c) => c.id === k);
    tag.textContent = `${label ? label.label : k}: ${v}`;
    row.appendChild(tag);
  });
  if (!row.children.length) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = "No specific clues";
    row.appendChild(tag);
  }
}

function renderPreview() {
  const r = appState.currentResult;
  document.getElementById("result-state-label").textContent = `Outcome // ${r.mainLabel}`;
  document.getElementById("result-title").textContent = r.mainLabel;
  document.getElementById("result-subtype").textContent = r.subtype;
  document.getElementById("result-confidence").textContent = `Confidence ${Math.round(r.confidence * 100)}% · ${r.technicalStatus}`;
  const stage = document.getElementById("preview-stage");
  const similar = document.getElementById("similar-choices");
  similar.hidden = r.mainState !== "similar";
  similar.innerHTML = "";
  if (r.mainState === "complete") {
    stage.innerHTML = `<div class="preview-complete pv-complete" role="img" aria-label="Organised reconstructed preview">
      <div class="pv-frame"></div>
      <div class="pv-line" style="top:30%;left:8%;width:84%"></div>
      <div class="pv-line" style="top:70%;left:18%;width:64%"></div>
      <div class="pv-line" style="top:20%;left:50%;width:1px;height:60%;height:180px;width:1px"></div>
    </div>`;
  } else if (r.mainState === "fragmented") {
    let extra = "";
    if (r.subtype === "Audio Without Context") extra = `<div class="wave broken"></div>`;
    else if (r.subtype === "Missing Chat History") extra = `<div class="chat-lines">[ 12:04 ] ·····<br/>[ 12:05 ] — message removed —<br/>[ 12:11 ] ·····</div>`;
    else {
      extra = `<div class="pv-tile" style="left:12%;top:18%;width:28%;height:40%"></div>
        <div class="pv-tile missing" style="left:42%;top:18%;width:22%;height:28%"></div>
        <div class="pv-tile" style="left:18%;top:62%;width:16%;height:20%"></div>
        <div class="pv-tile missing" style="left:58%;top:48%;width:24%;height:32%"></div>`;
    }
    stage.innerHTML = `<div class="preview-fragmented" role="img" aria-label="Fragmented preview">${extra}</div>`;
  } else if (r.mainState === "similar") {
    const cands = r.candidates || [];
    stage.innerHTML = `<div class="cand">${cands
      .map(
        (c) => `<button type="button" data-cand="${c.id}" aria-pressed="${r.selectedCandidate === c.id}">
          <span>${c.subtype}</span><span class="pct">${c.similarity}%</span>
          <span>${c.source}</span>
        </button>`
      )
      .join("")}</div>`;
    stage.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        AudioEngine.blip();
        selectCandidate(b.getAttribute("data-cand"));
      });
    });
    similar.innerHTML = `<button type="button" class="ghost-btn" id="none-of-these">None of these</button>`;
    document.getElementById("none-of-these").addEventListener("click", () => {
      AudioEngine.blip();
      r.selectedCandidate = "none";
      r.subtype = "None of these";
      document.getElementById("result-subtype").textContent = r.subtype;
    });
  } else {
    stage.innerHTML = `<div class="preview-inaccessible" role="img" aria-label="Inaccessible preview">
      <div class="empty-frame"></div>
      <div class="lock" aria-hidden="true"></div>
      <div class="fail-x">×</div>
      <div class="broken-path"></div>
      <p class="expired">TIMESTAMP EXPIRED · PATH BROKEN</p>
    </div>`;
  }
}

function selectCandidate(id) {
  const r = appState.currentResult;
  const cand = (r.candidates || []).find((c) => c.id === id);
  if (!cand) return;
  r.selectedCandidate = id;
  r.subtype = cand.subtype;
  r.source = cand.source;
  r.confidence = cand.similarity / 100;
  document.getElementById("result-subtype").textContent = r.subtype;
  document.getElementById("result-confidence").textContent = `Confidence ${cand.similarity}% · ${r.technicalStatus}`;
}

function bindUi() {
  document.getElementById("back-btn").addEventListener("click", (e) => {
    e.preventDefault();
    goBack();
  });

  document.querySelectorAll("[data-memory]").forEach((btn) => {
    btn.addEventListener("click", () => {
      AudioEngine.startFromGesture();
      AudioEngine.blip();
      const id = btn.getAttribute("data-memory");
      if (id === "other") {
        document.getElementById("custom-panel").hidden = false;
        document.getElementById("memory-input").focus();
        return;
      }
      const next = { ...MEMORY_PRESETS[id] };
      const changed = !appState.selectedMemory || appState.selectedMemory.id !== next.id;
      appState.selectedMemory = next;
      if (changed) invalidateAfter("memory");
      goToScene(3);
    });
  });

  document.getElementById("custom-cancel").addEventListener("click", () => {
    document.getElementById("custom-panel").hidden = true;
  });
  document.getElementById("custom-continue").addEventListener("click", () => {
    const prev = appState.selectedMemory && appState.selectedMemory.label;
    if (memoryFromCustom()) {
      if (prev !== appState.selectedMemory.label) invalidateAfter("memory");
      goToScene(3);
    }
  });

  const mem = document.getElementById("memory-input");
  const sig = document.getElementById("significance-input");
  mem.addEventListener("input", () => {
    document.getElementById("memory-count").textContent = `${charCount(mem.value)} / 120`;
  });
  sig.addEventListener("input", () => {
    document.getElementById("significance-count").textContent = `${charCount(sig.value)} / 200`;
    appState.personalSignificance = sig.value.trim();
  });

  document.getElementById("keyword-input").addEventListener("change", (e) => {
    const v = e.target.value.trim();
    const prev = appState.selectedClues.keyword || "";
    if (v) appState.selectedClues.keyword = v;
    else delete appState.selectedClues.keyword;
    if (v !== prev) invalidateAfter("clues");
    renderTags();
  });

  document.getElementById("clues-back").addEventListener("click", () => goBack());
  document.getElementById("begin-search").addEventListener("click", () => {
    AudioEngine.blip();
    appState.searchStartedAt = Date.now();
    if (mapSystem) mapSystem.clear();
    goToScene(4);
    clearTimeout(mapIntroTimer);
    mapIntroTimer = setTimeout(() => {
      if (appState.currentScene === 4) goToScene(5);
    }, reduceMotion ? 400 : 1800);
  });

  document.getElementById("refine-search").addEventListener("click", () => {
    AudioEngine.blip();
    appState.searchMode = "refine";
    mapSystem.refine(appState.selectedClues);
    AudioEngine.setMode("quiet");
    document.getElementById("filter-note").textContent = "Field narrowed. Non-matching traces are fading.";
  });
  document.getElementById("expand-search").addEventListener("click", () => {
    AudioEngine.blip();
    appState.searchMode = "expand";
    mapSystem.expand(appState.selectedClues);
    AudioEngine.setMode("expand");
    document.getElementById("filter-note").textContent = "Additional regions opened. Uncertain results increased.";
  });
  document.getElementById("retrieve-record").addEventListener("click", () => {
    AudioEngine.blip();
    goToScene(6);
  });

  document.getElementById("continue-from-preview").addEventListener("click", () => {
    if (appState.currentScene === 7) goToScene(8);
    else goToScene(9);
  });
  document.querySelectorAll("[data-response]").forEach((b) => {
    b.addEventListener("click", () => {
      AudioEngine.blip();
      appState.visitorResponse = b.getAttribute("data-response");
      const p = document.getElementById("interpretation");
      p.hidden = false;
      p.textContent = INTERPRETATIONS[appState.visitorResponse];
      document.getElementById("continue-to-receipt").hidden = false;
    });
  });
  document.getElementById("continue-to-receipt").addEventListener("click", () => goToScene(10));

  document.getElementById("print-receipt").addEventListener("click", () => printSequence());
  document.getElementById("save-receipt").addEventListener("click", async () => {
    await Receipt.saveImage(appState);
    goToScene(12);
  });
  document.getElementById("search-again").addEventListener("click", () => {
    resetAppState();
    if (mapSystem) mapSystem.clear();
    goToScene(2);
  });
  document.getElementById("finish").addEventListener("click", () => goToScene(13));
}

function printSequence() {
  AudioEngine.printSound();
  goToScene(11);
  const html = Receipt.render(appState);
  document.getElementById("print-animation").innerHTML = html;
  document.getElementById("print-receipt-root").innerHTML = html;
  const delay = reduceMotion ? 400 : 2600;
  clearTimeout(printTimer);
  printTimer = setTimeout(() => {
    if (appState.currentScene !== 11) return;
    printDialogueOpen = true;
    window.print();
  }, delay);
}

function bindApproach() {
  const start = () => {
    if (appState.currentScene !== 1) return;
    AudioEngine.startFromGesture();
    goToScene(2);
  };
  document.getElementById("scene-1").addEventListener("click", start);
  document.getElementById("scene-1").addEventListener("touchstart", start, { passive: true });
  window.addEventListener("keydown", (e) => {
    if (appState.currentScene === 1 && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      start();
    }
  });
  window.addEventListener("mousemove", () => {
    if (appState.currentScene !== 1) return;
    const now = performance.now();
    if (now - lastMove < 400) moveTimer += now - lastMove;
    else moveTimer = 0;
    lastMove = now;
    if (moveTimer > 2800) start();
  });
}

function bindShortcuts() {
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      goBack();
      return;
    }
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    const k = e.key;
    if (k >= "1" && k <= "9") {
      const n = Number(k);
      if (n >= 4 && mapSystem && !mapSystem.nodes.length) {
        mapSystem.spawn(createArchiveNodes(188, appState.selectedClues, false));
      }
      if (n >= 7) ensureResult();
      goToScene(n);
      return;
    }
    if (k === "c" || k === "C") forceResult("complete");
    if (k === "f" || k === "F") forceResult("fragmented");
    if (k === "s" || k === "S") forceResult("similar");
    if (k === "i" || k === "I") forceResult("inaccessible");
    if (k === "v" || k === "V") cycleSubtype();
    if (k === "r" || k === "R") {
      resetAppState();
      if (mapSystem) mapSystem.clear();
      goToScene(1);
    }
  });
}

function forceResult(main) {
  appState.forcedMain = main;
  appState.forcedSubtype = null;
  appState.currentResult = null;
  if (!appState.selectedMemory) {
    appState.selectedMemory = MEMORY_PRESETS.photograph;
  }
  ensureResult();
  goToScene(8);
}

function cycleSubtype() {
  if (!appState.currentResult) ensureResult();
  const main = appState.currentResult.mainState;
  const list = RESULT_CATALOG[main].subtypes;
  subtypeCycle = (subtypeCycle + 1) % list.length;
  appState.currentResult.subtype = list[subtypeCycle];
  appState.forcedSubtype = list[subtypeCycle];
  if (appState.currentScene === 8) renderPreview();
  if (appState.currentScene === 10) {
    Receipt.mount(appState, document.getElementById("receipt-screen"), document.getElementById("print-receipt-root"));
  }
}

const sketch = (p) => {
  let particles = [];
  mapSystem = {
    nodes: [],
    edges: [],
    searching: false,
    inspect: null,
    spawn(list) {
      const w = p.width;
      const h = p.height;
      this.nodes = list.map((n, i) => {
        const region = PLATFORMS.indexOf(n.platform);
        const col = (region + 0.5) / PLATFORMS.length;
        return Object.assign(n, {
          x: col * w + (p.random() - 0.5) * (w / PLATFORMS.length) * 0.8,
          y: p.random(110, h - 40),
          vx: (p.random() - 0.5) * 0.25,
          vy: (p.random() - 0.5) * 0.25,
          r: 3.4 + n.similarity * 4.8,
          fade: n.faint ? 0.25 : 0.85
        });
      });
      this.rebuildEdges();
    },
    rebuildEdges() {
      this.edges = [];
      const nodes = this.nodes.filter((n) => n.visible);
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < 90 && a.platform === b.platform) {
            this.edges.push({ a, b, life: a.expired || b.expired ? 0.2 : 1 });
          }
        }
      }
    },
    refine(clues) {
      this.nodes.forEach((n) => {
        const match = nodeMatchesClues(n, clues);
        n.visible = match;
        if (match) n.similarity = clamp(n.similarity + 0.12, 0, 0.99);
      });
      this.rebuildEdges();
    },
    expand(clues) {
      const extra = createArchiveNodes(48, clues, true).map((n) => {
        n.x = p.random(p.width);
        n.y = p.random(p.height);
        n.vx = (p.random() - 0.5) * 0.4;
        n.vy = (p.random() - 0.5) * 0.4;
        n.r = 2;
        n.fade = 0.28;
        n.visible = true;
        return n;
      });
      this.nodes.push(...extra);
      this.rebuildEdges();
    },
    clear() {
      this.nodes = [];
      this.edges = [];
      this.inspect = null;
      this.searching = false;
    }
  };

  p.setup = () => {
    const c = p.createCanvas(p.windowWidth, p.windowHeight);
    c.parent("canvas-wrap");
    for (let i = 0; i < 90; i += 1) {
      particles.push({
        x: p.random(p.width),
        y: p.random(p.height),
        s: p.random(0.4, 1.6),
        v: p.random(0.1, 0.45)
      });
    }
  };

  p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);

  p.draw = () => {
    p.background(32, 34, 36);
    p.noStroke();
    p.fill(243, 241, 236, 28);
    particles.forEach((pt) => {
      if (!reduceMotion) pt.y -= pt.v;
      if (pt.y < 0) pt.y = p.height;
      p.circle(pt.x, pt.y, pt.s);
    });

    if (appState.currentScene >= 4 && appState.currentScene <= 8 && mapSystem.nodes.length) {
      drawMap(p);
    }
    if (appState.currentScene === 12) drawArchive(p);
  };

  p.mousePressed = () => inspectNear(p.mouseX, p.mouseY);
  p.touchStarted = () => {
    if (p.touches[0]) inspectNear(p.touches[0].x, p.touches[0].y);
    return true;
  };

  function inspectNear(x, y) {
    if (appState.currentScene !== 4 && appState.currentScene !== 5) return;
    let best = null;
    let bestD = 18;
    mapSystem.nodes.forEach((n) => {
      if (!n.visible) return;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    });
    if (best) {
      mapSystem.inspect = best;
      if (!appState.nodesInspectedSet.has(best.id)) {
        appState.nodesInspectedSet.add(best.id);
        appState.inspectedNodes.push(best.id);
      }
      const card = document.getElementById("node-inspect");
      card.hidden = false;
      card.innerHTML = `<p>${best.platform} · ${best.date}</p>
        <p>${best.fileType} · ${best.person}</p>
        <p>${best.location} · ${best.keyword}</p>
        <p>${best.access} · sim ${Math.round(best.similarity * 100)}%</p>`;
      AudioEngine.blip();
    }
  }

  function drawMap(p5) {
    const mx = p5.mouseX;
    const my = p5.mouseY;
    p5.stroke(96, 119, 132, 70);
    p5.strokeWeight(0.6);
    p5.noFill();
    PLATFORMS.forEach((name, i) => {
      const x = ((i + 0.5) / PLATFORMS.length) * p5.width;
      p5.line(x, 88, x, p5.height - 20);
      p5.noStroke();
      p5.fill(96, 119, 132);
      p5.textSize(10);
      p5.text(name, x - 22, 78);
      p5.stroke(96, 119, 132, 70);
    });

    mapSystem.edges.forEach((e) => {
      if (!e.a.visible || !e.b.visible) return;
      if (e.a.expired || e.b.expired) e.life -= 0.002;
      if (e.life <= 0) return;
      p5.stroke(243, 241, 236, 40 * e.life);
      p5.line(e.a.x, e.a.y, e.b.x, e.b.y);
    });

    mapSystem.nodes.forEach((n) => {
      if (!n.visible) {
        n.fade -= 0.01;
        if (n.fade <= 0) return;
      }
      if (!reduceMotion) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > p5.width) n.vx *= -1;
        if (n.y < 100 || n.y > p5.height) n.vy *= -1;
      }
      if (mapSystem.searching) {
        n.x += (p5.width / 2 - n.x) * 0.012;
        n.y += (p5.height / 2 - n.y) * 0.012;
        if (p5.frameCount % 40 < 12) {
          n.x += p5.random(-4, 4);
          n.y += p5.random(-4, 4);
        }
      }
      const d = Math.hypot(n.x - mx, n.y - my);
      const near = d < 48;
      const r = n.r * (near ? 2.2 : 1) * (mapSystem.inspect === n ? 2.6 : 1);
      const alpha = (n.uncertain ? 140 : 230) * n.fade;
      p5.noStroke();
      if (n.uncertain) p5.drawingContext.filter = "blur(1.2px)";
      p5.fill(243, 241, 236, alpha);
      if (mapSystem.searching && p5.frameCount % 16 < 4) {
        p5.rect(n.x - r, n.y - r, r * 2, r * 2);
      } else {
        p5.circle(n.x, n.y, r * 2);
      }
      p5.drawingContext.filter = "none";
    });
  }

  function drawArchive(p5) {
    p5.stroke(96, 119, 132, 80);
    p5.strokeWeight(0.5);
    for (let x = 40; x < p5.width; x += 48) p5.line(x, 80, x, p5.height - 40);
    for (let y = 80; y < p5.height - 40; y += 36) p5.line(40, y, p5.width - 40, y);
    const t = reduceMotion ? 1 : (p5.frameCount % 180) / 180;
    const x = p5.lerp(p5.width / 2, p5.width * 0.72, t);
    const y = p5.lerp(p5.height * 0.35, p5.height * 0.7, t);
    p5.noFill();
    p5.stroke(243, 241, 236, 180);
    p5.rect(x, y, 28, 40);
  }
};

function init() {
  reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  bindUi();
  bindApproach();
  bindShortcuts();
  updateBackButton();
  window.addEventListener("beforeprint", () => {
    printDialogueOpen = true;
  });
  window.addEventListener("afterprint", () => {
    printDialogueOpen = false;
    if (appState.currentScene === 11) goToScene(12);
  });
  new p5(sketch);
  ["pointerdown", "keydown", "touchstart", "mousemove", "touchmove"].forEach((ev) => {
    window.addEventListener(ev, () => bumpIdle(), { passive: true });
  });
}

window.addEventListener("DOMContentLoaded", init);
