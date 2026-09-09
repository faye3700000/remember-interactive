const PreviewArt = {
  _imgs: {},
  _ready: null,

  sources: {
    personWoman: "assets/preview/person-woman.jpg",
    personWomanBlur: "assets/preview/person-woman-blur.jpg",
    personPair: "assets/preview/person-pair.jpg",
    personGroup: "assets/preview/person-group.jpg",
    personFamilySoft: "assets/preview/person-family-soft.jpg",
    personFamily: "assets/preview/person-family.jpg",
    personGhost: "assets/preview/person-ghost.jpg",
    personAbstract: "assets/preview/person-abstract.jpg",
    personGlitch: "assets/preview/person-glitch.jpg",
    schoolGroup: "assets/preview/school-group.jpg",
    schoolClass: "assets/preview/school-class.jpg",
    schoolDesk: "assets/preview/school-desk.jpg",
    workGroup: "assets/preview/work-group.jpg",
    scene: "assets/preview/preview-scene.jpg",
    mosaic: "assets/preview/preview-mosaic.jpg",
    failed: "assets/preview/preview-failed.jpg"
  },

  themePools: {
    school: {
      people: ["schoolGroup", "schoolDesk", "personGroup"],
      scene: ["schoolClass", "scene"],
      damage: ["personGlitch", "schoolGroup", "schoolDesk"]
    },
    family: {
      people: ["personFamilySoft", "personFamily", "personPair"],
      scene: ["personFamilySoft", "scene"],
      damage: ["personFamily", "personGlitch"]
    },
    friends: {
      people: ["personPair", "personGroup", "personWoman"],
      scene: ["personPair", "scene"],
      damage: ["personGlitch", "personGroup"]
    },
    work: {
      people: ["workGroup", "personPair", "personWoman"],
      scene: ["workGroup", "scene"],
      damage: ["personGlitch", "workGroup"]
    },
    self: {
      people: ["personWoman", "personWomanBlur", "personGhost"],
      scene: ["personAbstract", "scene"],
      damage: ["personGhost", "personGlitch"]
    },
    city: {
      people: ["personPair", "personWoman"],
      scene: ["scene", "personAbstract"],
      damage: ["mosaic", "personGlitch"]
    },
    default: {
      people: ["personWoman", "personWomanBlur", "personPair", "personGroup", "personFamilySoft", "personGhost", "personAbstract"],
      scene: ["scene", "schoolClass"],
      damage: ["personGlitch", "mosaic", "failed"]
    }
  },

  preload() {
    if (this._ready) return this._ready;
    this._ready = Promise.all(
      Object.entries(this.sources).map(([key, src]) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            this._imgs[key] = img;
            resolve();
          };
          img.onerror = () => resolve();
          img.src = src;
        });
      })
    );
    return this._ready;
  },

  paint(canvas, spec) {
    if (!canvas || !spec) return;
    const token = (canvas._paintToken || 0) + 1;
    canvas._paintToken = token;
    this.preload().then(() => {
      if (canvas._paintToken !== token) return;
      this._draw(canvas, spec);
    });
  },

  _draw(canvas, spec) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(8, Math.floor((rect.width || 320) * dpr));
    const h = Math.max(8, Math.floor((rect.height || 220) * dpr));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const rng = mulberry32(spec.seed >>> 0);
    const kind = spec.kind;
    const outcome = spec.outcome;
    const variant = spec.variant || 0;

    ctx.fillStyle = "#F3F1EC";
    ctx.fillRect(0, 0, w, h);

    const role = spec.role || (kind === "mosaic" || kind === "failed" ? "damage" : kind === "photo" ? "scene" : "people");
    const themeImg = this._themeImage(spec.theme, role, rng, variant);

    if (kind === "sound") {
      this._fillPhoto(ctx, themeImg || this._imgs.scene, w, h, rng, 0.18);
      this._drawWave(ctx, w, h, rng, outcome);
    } else if (kind === "chat") {
      this._fillPhoto(ctx, this._themeImage(spec.theme, "people", rng, variant) || this._imgs.scene, w, h, rng, 0.45);
      this._drawChat(ctx, w, h, rng, outcome);
    } else if (kind === "failed") {
      this._fillPhoto(ctx, this._themeImage(spec.theme, "damage", rng, variant) || this._imgs.failed, w, h, rng, 1);
      this._glitchRows(ctx, w, h, rng);
      this._dropTiles(ctx, w, h, rng, 0.16);
      this._drawDownloadMark(ctx, w, h);
    } else if (kind === "mosaic" || role === "damage") {
      this._fillPhoto(ctx, this._themeImage(spec.theme, "damage", rng, variant) || this._imgs.mosaic, w, h, rng, 1);
      this._glitchRows(ctx, w, h, rng);
      this._pixelate(ctx, w, h, 6 + variant * 3);
      if (outcome === "fragmented" || outcome === "inaccessible") this._dropTiles(ctx, w, h, rng, 0.16);
      if (outcome === "inaccessible") this._drawDownloadMark(ctx, w, h);
    } else {
      this._fillPhoto(ctx, themeImg, w, h, rng, 1);
      if (!themeImg) this._silhouette(ctx, w, h, rng, kind === "person" ? 1 + (variant % 2) : 0);
      if (outcome === "fragmented") {
        this._glitchRows(ctx, w, h, rng);
        this._dropTiles(ctx, w, h, rng, 0.14);
      }
      if (outcome === "similar" && spec.subtype === "Thumbnail Only") this._pixelate(ctx, w, h, 10);
      if (outcome === "similar" && spec.subtype === "Compressed Copy") this._pixelate(ctx, w, h, 6);
    }

    if (outcome === "inaccessible" && kind === "sound") {
      this._pixelate(ctx, w, h, 6);
      this._drawFailMark(ctx, w, h);
    }

    ctx.fillStyle = "rgba(243,241,236,0.08)";
    for (let y = 0; y < h; y += 4 * dpr) ctx.fillRect(0, y, w, dpr);
  },

  _themeImage(theme, role, rng, variant) {
    const pool = this.themePools[theme] || this.themePools.default;
    const keys = pool[role] || pool.people;
    return this._pick(keys, rng, variant);
  },

  _pick(keys, rng, variant) {
    const list = keys.filter((k) => this._imgs[k]);
    if (!list.length) return null;
    const start = Math.floor(rng() * list.length);
    return this._imgs[list[(start + (variant || 0)) % list.length]];
  },

  _fillPhoto(ctx, img, w, h, rng, alpha) {
    if (!img) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const ir = img.width / img.height;
    const cr = w / h;
    let dw;
    let dh;
    if (ir > cr) {
      dh = h * 1.12;
      dw = dh * ir;
    } else {
      dw = w * 1.12;
      dh = dw / ir;
    }
    const dx = (w - dw) / 2 + (rng() - 0.5) * w * 0.08;
    const dy = (h - dh) / 2 + (rng() - 0.5) * h * 0.06;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  },

  _silhouette(ctx, w, h, rng, count) {
    for (let i = 0; i < count; i += 1) {
      const cx = w * (0.42 + i * 0.12 + (rng() - 0.5) * 0.08);
      const s = h * (0.5 + rng() * 0.1);
      ctx.fillStyle = `rgba(0,0,0,${0.28 + rng() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(cx, h * 0.38, s * 0.12, s * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.28, h);
      ctx.quadraticCurveTo(cx - s * 0.22, h * 0.52, cx, h * 0.46);
      ctx.quadraticCurveTo(cx + s * 0.22, h * 0.52, cx + s * 0.28, h);
      ctx.fill();
    }
  },

  _drawWave(ctx, w, h, rng, outcome) {
    const mid = h * 0.5;
    const broken = outcome === "fragmented" || outcome === "inaccessible";
    ctx.strokeStyle = "rgba(0,0,0,0.72)";
    ctx.lineWidth = Math.max(1.5, w / 420);
    ctx.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const t = x / w;
      let amp = (Math.sin(t * 38 + rng() * 6) * 0.45 + Math.sin(t * 17) * 0.3 + (rng() - 0.5) * 0.2) * h * 0.28;
      if (broken && t > 0.44 && t < 0.62) amp *= 0.08;
      const y = mid + amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const bars = 48;
    for (let i = 0; i < bars; i += 1) {
      if (broken && i > bars * 0.42 && i < bars * 0.6) continue;
      const bh = (0.15 + rng() * 0.7) * h * 0.42;
      ctx.fillStyle = `rgba(221,156,51,${0.18 + rng() * 0.35})`;
      const x = (w * 0.06) + i * ((w * 0.88) / bars);
      ctx.fillRect(x, mid - bh / 2, Math.max(2, w / 220), bh);
    }
  },

  _drawChat(ctx, w, h, rng, outcome) {
    const rows = [
      { x: 0.08, width: 0.46, y: 0.18 },
      { x: 0.4, width: 0.48, y: 0.38 },
      { x: 0.1, width: 0.38, y: 0.58 },
      { x: 0.42, width: 0.44, y: 0.76 }
    ];
    rows.forEach((row, i) => {
      const missing = (outcome === "fragmented" && i === 1) || (outcome === "inaccessible" && i > 1);
      const x = row.x * w;
      const y = row.y * h;
      const rw = row.width * w;
      const rh = h * 0.12;
      ctx.beginPath();
      this._roundRect(ctx, x, y, rw, rh, 8);
      if (missing) {
        ctx.fillStyle = "rgba(243,241,236,0.55)";
        ctx.fill();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = "rgba(196,196,196,0.9)";
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = i % 2 === 0 ? "rgba(0,0,0,0.72)" : "rgba(221,156,51,0.35)";
        ctx.fill();
      }
    });
  },

  _roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  _pixelate(ctx, w, h, size) {
    const tw = Math.max(8, Math.floor(w / size));
    const th = Math.max(8, Math.floor(h / size));
    const tmp = document.createElement("canvas");
    tmp.width = tw;
    tmp.height = th;
    const tctx = tmp.getContext("2d");
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(ctx.canvas, 0, 0, tw, th);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
  },

  _glitchRows(ctx, w, h, rng) {
    const slices = 5 + Math.floor(rng() * 6);
    for (let i = 0; i < slices; i += 1) {
      const y = Math.floor(rng() * h);
      const hh = 3 + Math.floor(rng() * 16);
      const shift = (rng() - 0.5) * w * 0.14;
      ctx.drawImage(ctx.canvas, 0, y, w, hh, shift, y, w, hh);
    }
  },

  _dropTiles(ctx, w, h, rng, ratio) {
    const cols = 8;
    const rows = 6;
    const tw = w / cols;
    const th = h / rows;
    ctx.fillStyle = "#F3F1EC";
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (rng() < ratio) ctx.fillRect(x * tw, y * th, tw + 1, th + 1);
      }
    }
  },

  _drawFailMark(ctx, w, h) {
    this._drawDownloadMark(ctx, w, h);
  },

  _drawDownloadMark(ctx, w, h) {
    const r = Math.min(w, h) * 0.13;
    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = Math.max(3, w / 220);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(4, w / 180);
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.38);
    ctx.lineTo(cx, cy + r * 0.18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.28, cy + r * 0.02);
    ctx.lineTo(cx, cy + r * 0.32);
    ctx.lineTo(cx + r * 0.28, cy + r * 0.02);
    ctx.stroke();
    ctx.fillRect(cx - r * 0.32, cy + r * 0.42, r * 0.64, Math.max(3, w / 260));
    ctx.restore();
  },

  _softBlur(ctx, w, h, px) {
    ctx.save();
    ctx.filter = `blur(${px}px)`;
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.restore();
  }
};

function reduceMotionSafe() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
