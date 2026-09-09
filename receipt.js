const Receipt = {
  lastHtml: "",

  fields(state) {
    const r = state.currentResult;
    if (!r) return [];
    const memory = state.selectedMemory || {};
    const clues = state.selectedClues || {};
    const clueLines = CLUE_TYPES.map((c) => {
      const v = clues[c.id];
      if (!v) return null;
      return `${c.label}: ${v}`;
    }).filter(Boolean);

    const responseLabel = {
      yes: "Yes, this is it",
      close: "It is close, but not the same",
      no: "No, I still cannot find it"
    }[state.visitorResponse] || "—";

    const duration = state.searchDurationMs
      ? `${(state.searchDurationMs / 1000).toFixed(1)} s`
      : "—";

    return [
      ["Receipt ID", state.receiptId || r.receiptId],
      ["Date and time", r.timestampLabel],
      ["Selected memory", memory.label || "—"],
      ["Personal significance", state.personalSignificance || "—"],
      ["Search clues", clueLines.length ? clueLines.join(" · ") : "None recorded"],
      ["Platforms searched", (r.platformsSearched || []).join(", ")],
      ["Nodes inspected", String(state.inspectedNodes.length)],
      ["Search duration", duration],
      ["Main result state", r.mainLabel],
      ["Result subtype", r.subtype],
      ["Source", r.source],
      ["Recovery confidence", `${Math.round(r.confidence * 100)}%`],
      ["Technical status", r.technicalStatus],
      ["Visitor response", responseLabel],
      ["Suggested next action", r.suggestedNextAction],
      ["Final interpretation", r.sessionInterpretation || INTERPRETATIONS[state.visitorResponse] || "—"]
    ];
  },

  render(state) {
    const r = state.currentResult;
    const rows = this.fields(state)
      .map(
        ([k, v]) =>
          `<div class="rc-row"><span class="rc-k">${this.esc(k)}</span><span class="rc-v">${this.esc(v)}</span></div>`
      )
      .join("");
    const html = `
      <article class="receipt-card" id="receipt-card">
        <header class="rc-head">
          <p class="rc-mark">REMEMBER</p>
          <p class="rc-sub">Memory Receipt // incomplete retrieval</p>
        </header>
        <div class="rc-body">${rows}</div>
        <footer class="rc-foot">
          <p class="rc-final">${this.esc(r.finalMessage)}</p>
        </footer>
      </article>
    `;
    this.lastHtml = html;
    return html;
  },

  mount(state, screenEl, printEl) {
    const html = this.render(state);
    if (screenEl) screenEl.innerHTML = html;
    if (printEl) printEl.innerHTML = html;
  },

  esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  },

  async saveImage(state) {
    const card = document.getElementById("receipt-card");
    if (!card || !window.html2canvas) {
      throw new Error("Receipt preview is not ready.");
    }
    const canvas = await html2canvas(card, {
      backgroundColor: "#F3F1EC",
      scale: 2,
      useCORS: true
    });
    const link = document.createElement("a");
    link.download = `${state.receiptId || "remember-receipt"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }
};
