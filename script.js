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
let blockApproachUntil = 0;

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
  const customClue = document.getElementById("custom-clue-input");
  if (mem) mem.value = "";
  if (sig) sig.value = "";
  if (key) key.value = "";
  if (customClue) customClue.value = "";
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
  const show = scene !== 1 && scene !== 2 && scene !== 3 && scene !== 13;
  btn.hidden = !show;
  btn.disabled = navLocked || !show;
}

function closeOpenPanels() {
  if (appState.currentScene === 2) {
    const custom = document.getElementById("custom-panel");
    if (custom && !custom.hidden) {
      custom.hidden = true;
      return true;
    }
    return false;
  }
  if (appState.currentScene === 3) {
    const secondary = document.getElementById("clue-secondary");
    const keyword = document.getElementById("keyword-panel");
    const customClue = document.getElementById("custom-clue-panel");
    let closed = false;
    if (secondary && !secondary.hidden) {
      secondary.hidden = true;
      closed = true;
    }
    if (keyword && !keyword.hidden) {
      keyword.hidden = true;
      closed = true;
    }
    if (customClue && !customClue.hidden) {
      customClue.hidden = true;
      closed = true;
    }
    return closed;
  }
  return false;
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
    moveTimer = 0;
    lastMove = 0;
    if (options.fromBack) blockApproachUntil = performance.now() + 800;
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
    if (mapSystem && mapSystem.restoreHomes) mapSystem.restoreHomes();
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

  if (n === 4 || n === 5) document.body.classList.add("map-exploring");
  else document.body.classList.remove("map-exploring");

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
  const customClue = document.getElementById("custom-clue-input");
  if (key) key.value = appState.selectedClues.keyword || "";
  if (customClue) customClue.value = appState.selectedClues.custom || "";
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
  if (mapSystem) {
    mapSystem.searching = true;
    mapSystem.searchT0 = performance.now();
    mapSystem.searchLen = duration;
    camera.targetX = 0;
    camera.targetY = 0;
    camera.targetScale = MAP_SCALE_INIT;
  }
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
  const customPanel = document.getElementById("custom-clue-panel");
  if (id === "keyword") {
    panel.hidden = true;
    if (customPanel) customPanel.hidden = true;
    keyPanel.hidden = false;
    document.getElementById("keyword-input").focus();
    return;
  }
  if (id === "custom") {
    panel.hidden = true;
    keyPanel.hidden = true;
    if (customPanel) customPanel.hidden = false;
    const input = document.getElementById("custom-clue-input");
    if (input) {
      input.value = appState.selectedClues.custom || "";
      input.focus();
    }
    return;
  }
  keyPanel.hidden = true;
  if (customPanel) customPanel.hidden = true;
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
      if (k === "custom") {
        const input = document.getElementById("custom-clue-input");
        if (input) input.value = "";
      }
      if (k === "keyword") {
        const input = document.getElementById("keyword-input");
        if (input) input.value = "";
      }
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

function paintStageCanvas(canvas, spec) {
  const host = canvas.parentElement || canvas;
  const run = () => PreviewArt.paint(canvas, spec);
  run();
  if (canvas._ro) canvas._ro.disconnect();
  if (typeof ResizeObserver === "undefined") return;
  canvas._ro = new ResizeObserver(() => {
    const rect = host.getBoundingClientRect();
    const key = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    if (canvas._cssSize === key) return;
    canvas._cssSize = key;
    run();
  });
  const rect = host.getBoundingClientRect();
  canvas._cssSize = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
  canvas._ro.observe(host);
}

function previewSpec(r, extra) {
  const theme = extra.theme || r.visualTheme || visualThemeFor(appState);
  return {
    kind: extra.kind || r.visualKind,
    outcome: extra.outcome || r.mainState,
    subtype: extra.subtype || r.subtype,
    seed: extra.seed || r.visualSeed || 1,
    variant: extra.variant || 0,
    theme,
    role: extra.role || r.visualRole || visualRoleFor(extra.subtype || r.subtype, extra.outcome || r.mainState)
  };
}

function renderPreview() {
  const r = appState.currentResult;
  r.visualTheme = r.visualTheme || visualThemeFor(appState);
  r.visualKind = visualKindFor(r.mediaKind || mediaKindFor(appState), r.mainState, r.subtype, r.visualTheme);
  r.visualRole = visualRoleFor(r.subtype, r.mainState);
  document.getElementById("result-state-label").textContent = `Outcome // ${r.mainLabel}`;
  document.getElementById("result-title").textContent = r.mainLabel;
  document.getElementById("result-subtype").textContent = r.subtype;
  document.getElementById("result-confidence").textContent = `Confidence ${Math.round(r.confidence * 100)}% · ${r.technicalStatus}`;
  const stage = document.getElementById("preview-stage");
  const similar = document.getElementById("similar-choices");
  similar.hidden = r.mainState !== "similar";
  similar.innerHTML = "";
  if (r.mainState === "similar") {
    const cands = r.candidates || [];
    stage.innerHTML = `<div class="cand">${cands
      .map(
        (c) => `<button type="button" data-cand="${c.id}" aria-pressed="${r.selectedCandidate === c.id}">
          <canvas class="cand-art" aria-hidden="true"></canvas>
          <span class="cand-meta">
            <span>${c.subtype}</span>
            <span class="pct">${c.similarity}%</span>
            <span>${c.source}</span>
          </span>
        </button>`
      )
      .join("")}</div>`;
    stage.querySelectorAll("button").forEach((b) => {
      const cand = cands.find((c) => c.id === b.getAttribute("data-cand"));
      paintStageCanvas(b.querySelector("canvas"), previewSpec(r, {
        kind: cand.visualKind,
        outcome: "similar",
        subtype: cand.subtype,
        seed: cand.visualSeed,
        variant: Number(cand.id.slice(-1)),
        role: cand.visualRole
      }));
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
    return;
  }

  const caption =
    r.mainState === "inaccessible"
      ? `<p class="fail-caption">CONFIDENCE ${Math.round(r.confidence * 100)}% · ${r.technicalStatus}</p>
         <p class="expired">TIMESTAMP EXPIRED · PATH BROKEN</p>`
      : "";
  stage.innerHTML = `<div class="preview-visual preview-${r.mainState}" role="img" aria-label="${r.mainLabel} preview">
    <canvas class="pv-canvas"></canvas>
    ${caption}
  </div>`;
  paintStageCanvas(stage.querySelector("canvas"), previewSpec(r, {
    kind: r.visualKind,
    outcome: r.mainState,
    subtype: r.subtype,
    seed: r.visualSeed || 1,
    variant: 0,
    role: r.visualRole
  }));
}

function selectCandidate(id) {
  const r = appState.currentResult;
  const cand = (r.candidates || []).find((c) => c.id === id);
  if (!cand) return;
  r.selectedCandidate = id;
  r.subtype = cand.subtype;
  r.source = cand.source;
  r.confidence = cand.similarity / 100;
  r.visualKind = cand.visualKind;
  document.getElementById("result-subtype").textContent = r.subtype;
  document.getElementById("result-confidence").textContent = `Confidence ${cand.similarity}% · ${r.technicalStatus}`;
  document.querySelectorAll("#preview-stage [data-cand]").forEach((b) => {
    b.setAttribute("aria-pressed", b.getAttribute("data-cand") === id ? "true" : "false");
  });
}

function bindUi() {
  document.getElementById("reset-view").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (mapSystem) mapSystem.resetCamera();
  });

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
    renderClueTypes();
    renderTags();
  });
  document.getElementById("custom-clue-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.target.blur();
    }
  });
  document.getElementById("custom-clue-input").addEventListener("change", (e) => {
    const v = e.target.value.trim();
    const prev = appState.selectedClues.custom || "";
    if (v) appState.selectedClues.custom = v;
    else delete appState.selectedClues.custom;
    if (v !== prev) invalidateAfter("clues");
    renderClueTypes();
    renderTags();
  });

  document.getElementById("entrance-back").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    returnToIdle();
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

function returnToIdle() {
  const custom = document.getElementById("custom-panel");
  if (custom) custom.hidden = true;
  moveTimer = 0;
  lastMove = 0;
  blockApproachUntil = performance.now() + 800;
  AudioEngine.blip();
  window.setTimeout(() => {
    goToScene(1, { fromBack: true });
  }, 0);
}

function bindApproach() {
  const start = () => {
    if (performance.now() < blockApproachUntil) return;
    if (appState.currentScene !== 1) return;
    moveTimer = 0;
    lastMove = 0;
    AudioEngine.startFromGesture();
    goToScene(2);
  };
  document.getElementById("scene-1").addEventListener("click", start);
  document.getElementById("scene-1").addEventListener("touchstart", (e) => {
    if (performance.now() < blockApproachUntil) return;
    start();
  }, { passive: true });
  window.addEventListener("keydown", (e) => {
    if (appState.currentScene === 1 && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      start();
    }
  });
  window.addEventListener("mousemove", () => {
    if (performance.now() < blockApproachUntil) return;
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

const MAP_SCALE_MIN = 0.45;
const MAP_SCALE_MAX = 3.2;
const MAP_SCALE_INIT = 0.85;
const MAP_CLICK_PX = 8;
const CLUSTER_LAYOUT = {
  WeChat: { x: -30, y: 10, spread: 165 },
  WhatsApp: { x: 240, y: -240, spread: 150 },
  Messages: { x: -560, y: -90, spread: 55, linear: true },
  QQ: { x: 430, y: -80, spread: 300 },
  Photos: { x: -430, y: 150, spread: 255, large: true },
  Cloud: { x: 150, y: 360, spread: 300 },
  Browser: { x: -180, y: -360, spread: 310, broken: true },
  Email: { x: 560, y: 180, spread: 70, linear: true },
  "Old Device": { x: -680, y: 430, spread: 140 }
};

let mapP5 = null;
const camera = {
  x: 0,
  y: 0,
  scale: MAP_SCALE_INIT,
  targetX: 0,
  targetY: 0,
  targetScale: MAP_SCALE_INIT
};

function isMapNavigable() {
  return appState.currentScene === 4 || appState.currentScene === 5;
}

function pointerOverMapChrome(target) {
  if (!target || !target.closest) return false;
  return !!target.closest(".filter-panel, #back-btn, #reset-view, button, input, textarea, a");
}

function canvasPoint(evt, canvas) {
  const r = canvas.getBoundingClientRect();
  return { x: evt.clientX - r.left, y: evt.clientY - r.top };
}

function screenToWorld(sx, sy) {
  return {
    x: (sx - (mapP5 ? mapP5.width / 2 : 0)) / camera.scale + camera.x,
    y: (sy - (mapP5 ? mapP5.height / 2 : 0)) / camera.scale + camera.y
  };
}

function worldToScreen(wx, wy) {
  return {
    x: (wx - camera.x) * camera.scale + (mapP5 ? mapP5.width / 2 : 0),
    y: (wy - camera.y) * camera.scale + (mapP5 ? mapP5.height / 2 : 0)
  };
}

function placeInCluster(node) {
  const c = CLUSTER_LAYOUT[node.platform] || CLUSTER_LAYOUT.WeChat;
  if (c.linear) {
    node.x = c.x + (Math.random() - 0.5) * 36;
    node.y = c.y + (Math.random() - 0.5) * 460;
  } else {
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.pow(Math.random(), 0.52) * c.spread;
    node.x = c.x + Math.cos(ang) * rad;
    node.y = c.y + Math.sin(ang) * rad * 0.7;
  }
  node.homeX = node.x;
  node.homeY = node.y;
  node.vx = (Math.random() - 0.5) * 0.22;
  node.vy = (Math.random() - 0.5) * 0.22;
  node.r = (c.large ? 5.4 : 3.1) + node.similarity * (c.large ? 6.2 : 4.2);
  node.fade = node.faint ? 0.28 : 0.85;
  return node;
}

const sketch = (p) => {
  let particles = [];
  mapP5 = p;
  mapSystem = {
    nodes: [],
    edges: [],
    searching: false,
    inspect: null,
    hover: null,
    neighbors: new Set(),
    contextPlatform: null,
    contextUntil: 0,
    hintHidden: false,
    bounds: { minX: -900, minY: -700, maxX: 900, maxY: 700 },
    spawn(list) {
      this.nodes = list.map((n) => placeInCluster(Object.assign({}, n)));
      this.rebuildEdges();
      this.updateBounds();
      this.resetCamera(true);
    },
    rebuildEdges() {
      this.edges = [];
      const byPlat = {};
      const nodes = this.nodes.filter((n) => n.visible !== false);
      nodes.forEach((n) => {
        if (!byPlat[n.platform]) byPlat[n.platform] = [];
        byPlat[n.platform].push(n);
      });
      PLATFORMS.forEach((plat) => {
        const group = byPlat[plat] || [];
        const layout = CLUSTER_LAYOUT[plat] || {};
        if (layout.linear) {
          group.sort((a, b) => String(a.date).localeCompare(String(b.date)));
          for (let i = 0; i < group.length - 1; i += 1) {
            this.edges.push({ a: group[i], b: group[i + 1], life: 0.85, cross: false });
          }
          return;
        }
        const maxD = plat === "WeChat" || plat === "WhatsApp" ? 78 : plat === "Cloud" ? 210 : plat === "QQ" ? 150 : plat === "Photos" ? 120 : plat === "Browser" ? 95 : 88;
        for (let i = 0; i < group.length; i += 1) {
          let links = 0;
          const cap = plat === "WeChat" || plat === "WhatsApp" ? 5 : plat === "Cloud" ? 6 : plat === "Browser" ? 2 : 3;
          for (let j = i + 1; j < group.length && links < cap; j += 1) {
            const d = Math.hypot(group[i].x - group[j].x, group[i].y - group[j].y);
            const dateClose = plat === "Photos" && group[i].date && group[j].date && group[i].date.slice(0, 7) === group[j].date.slice(0, 7);
            if (d < maxD || dateClose) {
              const broken = layout.broken || group[i].expired || group[j].expired;
              this.edges.push({ a: group[i], b: group[j], life: broken ? 0.22 : 1, cross: false });
              links += 1;
            }
          }
        }
      });
      const extras = Math.min(18, Math.floor(nodes.length * 0.04));
      for (let k = 0; k < extras; k += 1) {
        const a = nodes[Math.floor(Math.random() * nodes.length)];
        const b = nodes[Math.floor(Math.random() * nodes.length)];
        if (a && b && a !== b && a.platform !== b.platform) {
          this.edges.push({ a, b, life: 0.35, cross: true });
        }
      }
    },
    updateBounds() {
      const vis = this.nodes.filter((n) => n.visible !== false && n.fade > 0);
      if (!vis.length) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      vis.forEach((n) => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x);
        maxY = Math.max(maxY, n.y);
      });
      this.bounds = { minX, minY, maxX, maxY };
    },
    clampCamera() {
      const b = this.bounds;
      const pad = 280;
      camera.targetX = clamp(camera.targetX, b.minX - pad, b.maxX + pad);
      camera.targetY = clamp(camera.targetY, b.minY - pad, b.maxY + pad);
      camera.targetScale = clamp(camera.targetScale, MAP_SCALE_MIN, MAP_SCALE_MAX);
    },
    resetCamera(instant) {
      camera.targetX = 0;
      camera.targetY = 0;
      camera.targetScale = MAP_SCALE_INIT;
      if (instant || reduceMotion) {
        camera.x = 0;
        camera.y = 0;
        camera.scale = MAP_SCALE_INIT;
      }
      this.updateZoomLabel();
    },
    updateZoomLabel() {
      const el = document.getElementById("zoom-indicator");
      if (el) el.textContent = `ZOOM ${Math.round(camera.scale * 100)}%`;
    },
    hideHint() {
      if (this.hintHidden) return;
      this.hintHidden = true;
      const hint = document.getElementById("map-hint");
      if (hint) hint.style.opacity = "0";
    },
    zoomAt(sx, sy, factor) {
      const world = screenToWorld(sx, sy);
      camera.targetScale = clamp(camera.scale * factor, MAP_SCALE_MIN, MAP_SCALE_MAX);
      camera.targetX = world.x - (sx - p.width / 2) / camera.targetScale;
      camera.targetY = world.y - (sy - p.height / 2) / camera.targetScale;
      this.clampCamera();
      this.hideHint();
    },
    hitNode(sx, sy) {
      const w = screenToWorld(sx, sy);
      const hitR = 20 / camera.scale;
      let best = null;
      let bestD = Infinity;
      this.nodes.forEach((n) => {
        if (n.visible === false) return;
        const d = Math.hypot(n.x - w.x, n.y - w.y);
        const need = Math.max(hitR, n.r * 1.4);
        if (d < need && d < bestD) {
          bestD = d;
          best = n;
        }
      });
      return best;
    },
    selectNode(node) {
      this.inspect = node;
      this.neighbors = new Set();
      this.edges.forEach((e) => {
        if (e.a === node) this.neighbors.add(e.b);
        if (e.b === node) this.neighbors.add(e.a);
      });
      this.contextPlatform = node.platform;
      this.contextUntil = performance.now() + 3000;
      if (!appState.nodesInspectedSet.has(node.id)) {
        appState.nodesInspectedSet.add(node.id);
        appState.inspectedNodes.push(node.id);
      }
      const card = document.getElementById("node-inspect");
      card.hidden = false;
      card.innerHTML = `<p class="inspect-platform">${node.platform.toUpperCase()}</p>
        <p>${node.fileType} · ${node.date}</p>
        <p>${node.person}</p>
        <p>Location: ${node.location}</p>
        <p>Status: ${node.access}</p>
        <p>Similarity: ${Math.round(node.similarity * 100)}%</p>`;
      AudioEngine.blip();
      this.hideHint();
    },
    closeInspect() {
      this.inspect = null;
      this.neighbors = new Set();
      const card = document.getElementById("node-inspect");
      if (card) card.hidden = true;
    },
    restoreHomes() {
      this.nodes.forEach((n) => {
        if (n.homeX != null) {
          n.x = n.homeX;
          n.y = n.homeY;
        }
        n.fade = n.faint ? 0.28 : 0.85;
      });
      this.searching = false;
      this.searchT0 = 0;
      this.searchLen = 0;
    },
    refine(clues) {
      this.nodes.forEach((n) => {
        const match = nodeMatchesClues(n, clues);
        n.visible = match;
        if (match) n.similarity = clamp(n.similarity + 0.12, 0, 0.99);
      });
      this.rebuildEdges();
      this.updateBounds();
    },
    expand(clues) {
      const extra = createArchiveNodes(48, clues, true).map((n) => placeInCluster(n));
      extra.forEach((n) => {
        n.visible = true;
        n.fade = 0.28;
      });
      this.nodes.push(...extra);
      this.rebuildEdges();
      this.updateBounds();
    },
    clear() {
      this.nodes = [];
      this.edges = [];
      this.inspect = null;
      this.hover = null;
      this.neighbors = new Set();
      this.searching = false;
      this.contextPlatform = null;
      this.hintHidden = false;
      const hint = document.getElementById("map-hint");
      if (hint) hint.style.opacity = "";
      this.closeInspect();
      this.resetCamera(true);
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
    p.background(243, 241, 236);
    p.noStroke();
    p.fill(0, 0, 0, 32);
    particles.forEach((pt) => {
      if (!reduceMotion) pt.y -= pt.v;
      if (pt.y < 0) pt.y = p.height;
      p.circle(pt.x, pt.y, pt.s);
    });

    const ease = reduceMotion ? 1 : 0.16;
    camera.x += (camera.targetX - camera.x) * ease;
    camera.y += (camera.targetY - camera.y) * ease;
    camera.scale += (camera.targetScale - camera.scale) * ease;
    if (p.frameCount % 8 === 0 && mapSystem) mapSystem.updateZoomLabel();

    if (appState.currentScene >= 4 && appState.currentScene <= 6 && mapSystem.nodes.length) {
      drawMap(p);
    }
    if (appState.currentScene === 12) drawArchive(p);
  };

  p.mousePressed = () => false;
  p.touchStarted = () => false;
  p.mouseWheel = () => false;

  function drawMap(p5) {
    const mx = p5.mouseX;
    const my = p5.mouseY;
    mapSystem.hover = isMapNavigable() ? mapSystem.hitNode(mx, my) : null;

    p5.push();
    p5.translate(p5.width / 2, p5.height / 2);
    p5.scale(camera.scale);
    p5.translate(-camera.x, -camera.y);

    if (mapSystem.contextPlatform && performance.now() < mapSystem.contextUntil) {
      const layout = CLUSTER_LAYOUT[mapSystem.contextPlatform];
      if (layout) {
        const ls = worldToScreen(layout.x, layout.y);
        if (ls.x < p5.width - 380) {
          const remain = (mapSystem.contextUntil - performance.now()) / 3000;
          p5.noStroke();
          p5.fill(196, 196, 196, 55 * remain);
          p5.textAlign(p5.CENTER, p5.CENTER);
          p5.textSize(48);
          p5.text(`${mapSystem.contextPlatform.toUpperCase()} ARCHIVE`, layout.x, layout.y);
          p5.textAlign(p5.LEFT, p5.BASELINE);
        }
      }
    }

    const sw = 1 / camera.scale;
    const searchAmt = mapSystem.searching && mapSystem.searchLen
      ? Math.min(1, (performance.now() - (mapSystem.searchT0 || 0)) / mapSystem.searchLen)
      : 0;
    const searchFade = searchAmt * searchAmt;

    mapSystem.edges.forEach((e) => {
      if ((!e.a.visible && e.a.fade <= 0) || (!e.b.visible && e.b.fade <= 0)) return;
      if (e.a.visible === false || e.b.visible === false) return;
      if (e.a.expired || e.b.expired || e.cross) e.life -= 0.0015;
      if (e.life <= 0) return;
      const linked =
        mapSystem.inspect &&
        (e.a === mapSystem.inspect || e.b === mapSystem.inspect);
      const edgeA = (linked ? 120 : e.cross ? 28 : 42) * e.life * (1 - searchFade);
      if (edgeA < 2) return;
      p5.stroke(0, 0, 0, edgeA);
      if (linked) p5.stroke(221, 156, 51, Math.min(200, edgeA + 40));
      p5.strokeWeight(linked ? sw * 1.6 : sw);
      if (e.cross || CLUSTER_LAYOUT[e.a.platform] && CLUSTER_LAYOUT[e.a.platform].broken) {
        p5.drawingContext.setLineDash([4 / camera.scale, 6 / camera.scale]);
      }
      p5.line(e.a.x, e.a.y, e.b.x, e.b.y);
      p5.drawingContext.setLineDash([]);
    });

    const t = p5.millis() / 320;
    mapSystem.nodes.forEach((n) => {
      if (n.visible === false) {
        n.fade -= 0.01;
        if (n.fade <= 0) return;
      }
      if (!reduceMotion && !mapSystem.searching) {
        n.x += n.vx;
        n.y += n.vy;
        if (Math.abs(n.x - n.homeX) > 28) n.vx *= -1;
        if (Math.abs(n.y - n.homeY) > 28) n.vy *= -1;
      }
      if (mapSystem.searching) {
        n.x += (0 - n.x) * (0.018 + searchFade * 0.04);
        n.y += (0 - n.y) * (0.018 + searchFade * 0.04);
      }
      const selected = mapSystem.inspect === n;
      const neighbor = mapSystem.neighbors.has(n);
      const hover = mapSystem.hover === n;
      const dim = mapSystem.inspect && !selected && !neighbor;
      let r = n.r * (hover ? 1.7 : 1) * (selected ? 2.1 : 1) * (mapSystem.searching ? 1 - searchFade * 0.9 : 1);
      if (selected && !reduceMotion) r *= 1 + Math.sin(t) * 0.08;
      const alpha = (n.uncertain ? 140 : 230) * n.fade * (dim ? 0.32 : 1) * (mapSystem.searching ? 1 - searchFade * 0.94 : 1);
      if (alpha < 2 || r < 0.2) return;
      p5.noStroke();
      if (selected || hover) p5.fill(221, 156, 51, alpha);
      else p5.fill(0, 0, 0, alpha);
      p5.circle(n.x, n.y, r * 2);
    });
    p5.pop();

    if (mapSystem.inspect) {
      const card = document.getElementById("node-inspect");
      if (card && !card.hidden) {
        const s = worldToScreen(mapSystem.inspect.x, mapSystem.inspect.y);
        const maxLeft = window.innerWidth - 360 - 16;
        const left = clamp(s.x + 18, 16, Math.max(16, maxLeft - 280));
        const top = clamp(s.y - 20, 88, window.innerHeight - 180);
        card.style.left = `${left}px`;
        card.style.top = `${top}px`;
      }
    }
  }

  function drawArchive(p5) {
    p5.stroke(196, 196, 196, 80);
    p5.strokeWeight(0.5);
    for (let x = 40; x < p5.width; x += 48) p5.line(x, 80, x, p5.height - 40);
    for (let y = 80; y < p5.height - 40; y += 36) p5.line(40, y, p5.width - 40, y);
    const t = reduceMotion ? 1 : (p5.frameCount % 180) / 180;
    const x = p5.lerp(p5.width / 2, p5.width * 0.72, t);
    const y = p5.lerp(p5.height * 0.35, p5.height * 0.7, t);
    p5.noFill();
    p5.stroke(0, 0, 0, 180);
    p5.rect(x, y, 28, 40);
  }
};

function bindMapPointer() {
  const wrap = document.getElementById("canvas-wrap");
  const hint = document.getElementById("map-hint");
  if (hint && (window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window)) {
    hint.textContent = "PINCH TO ZOOM · DRAG TO MOVE · TAP A NODE TO INSPECT";
  }
  let dragging = false;
  let moved = false;
  let lastX = 0;
  let lastY = 0;
  let lastTap = 0;
  let pointers = new Map();
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let pinchMid = null;

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  wrap.addEventListener(
    "wheel",
    (e) => {
      if (!isMapNavigable()) return;
      if (pointerOverMapChrome(e.target)) return;
      e.preventDefault();
      const pt = canvasPoint(e, wrap.querySelector("canvas") || wrap);
      const horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
      if (horiz) {
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        camera.targetX += dx / camera.scale;
        if (mapSystem) mapSystem.clampCamera();
        mapSystem.hideHint();
        return;
      }
      const factor = e.deltaY < 0 ? 1.09 : 0.91;
      if (mapSystem) mapSystem.zoomAt(pt.x, pt.y, factor);
    },
    { passive: false }
  );

  wrap.addEventListener(
    "touchmove",
    (e) => {
      if (!isMapNavigable()) return;
      if (pointerOverMapChrome(e.target)) return;
      e.preventDefault();
    },
    { passive: false }
  );

  wrap.addEventListener("pointerdown", (e) => {
    if (!isMapNavigable()) return;
    if (pointerOverMapChrome(e.target)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = true;
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
      wrap.classList.add("is-panning");
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchStartDist = dist(pts[0], pts[1]);
      pinchStartScale = camera.scale;
      pinchMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    }
  });

  window.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!isMapNavigable()) return;
    if (pointers.size === 2 && pinchStartDist) {
      const pts = [...pointers.values()];
      const d = dist(pts[0], pts[1]) || 1;
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const canvas = wrap.querySelector("canvas") || wrap;
      const local = canvasPoint({ clientX: mid.x, clientY: mid.y }, canvas);
      const world = screenToWorld(local.x, local.y);
      camera.targetScale = clamp(pinchStartScale * (d / pinchStartDist), MAP_SCALE_MIN, MAP_SCALE_MAX);
      camera.targetX = world.x - (local.x - mapP5.width / 2) / camera.targetScale;
      camera.targetY = world.y - (local.y - mapP5.height / 2) / camera.targetScale;
      mapSystem.clampCamera();
      mapSystem.hideHint();
      e.preventDefault();
      return;
    }
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.hypot(dx, dy) > MAP_CLICK_PX) moved = true;
    lastX = e.clientX;
    lastY = e.clientY;
    camera.targetX -= dx / camera.scale;
    camera.targetY -= dy / camera.scale;
    mapSystem.clampCamera();
    mapSystem.hideHint();
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      pinchStartDist = 0;
      pinchMid = null;
    }
    if (pointers.size === 0) {
      wrap.classList.remove("is-panning");
      if (dragging && isMapNavigable() && !pointerOverMapChrome(e.target)) {
        const canvas = wrap.querySelector("canvas") || wrap;
        const pt = canvasPoint(e, canvas);
        if (!moved) {
          const now = performance.now();
          const node = mapSystem.hitNode(pt.x, pt.y);
          if (node) mapSystem.selectNode(node);
          else {
            mapSystem.closeInspect();
            if (now - lastTap < 320) mapSystem.resetCamera();
            lastTap = now;
          }
        }
      }
      dragging = false;
      moved = false;
    }
  }

  window.addEventListener("pointerup", endPointer);
  window.addEventListener("pointercancel", endPointer);

  wrap.addEventListener("dblclick", (e) => {
    if (!isMapNavigable()) return;
    if (pointerOverMapChrome(e.target)) return;
    const canvas = wrap.querySelector("canvas") || wrap;
    const pt = canvasPoint(e, canvas);
    if (!mapSystem.hitNode(pt.x, pt.y)) mapSystem.resetCamera();
  });
}

function init() {
  reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  PreviewArt.preload();
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
  bindMapPointer();
  ["pointerdown", "keydown", "touchstart", "mousemove", "touchmove"].forEach((ev) => {
    window.addEventListener(ev, () => bumpIdle(), { passive: true });
  });
}

window.addEventListener("DOMContentLoaded", init);
