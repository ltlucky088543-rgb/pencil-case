// Everything drawn on the board. Reads game state and never changes it.
//
// Drawing happens in world units, where 1 is one cell. On tall screens the board is
// transposed by swapping x and y in the canvas transform, so the rules never need to
// know. Text would come out mirrored that way, so it goes in a separate screen pass.
(function () {
  const PC = globalThis.PC;
  const TAU = Math.PI * 2;
  const RES = 128; // pixels per cell in the paper and marks layers
  const SPRITE = 256; // pixels across a supply sprite
  const SPAN = 1.3; // art units across a supply sprite
  const FONT = '"Patrick Hand", "Comic Sans MS", "Segoe Print", cursive';
  const OUTLINE = '#2e3036';
  const RED_PEN = '#d3262f';
  const BALLPOINT = '#2b3d91';
  const GRAPHITE = '#4c5058';
  const ERASER = '#f5a3b7';
  const PAPER = '#fbfcf7';
  const MAX_PARTICLES = 400;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const rand = (a, b) => a + Math.random() * (b - a);
  const hash = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };

  PC.itemScale = (level) => Math.min(1.12, 0.76 + 0.05 * level);

  // ---- Shape helpers ------------------------------------------------------

  function box(c, x, y, w, h) {
    c.beginPath();
    c.rect(x, y, w, h);
  }

  function rounded(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function polygon(c, points) {
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
  }

  function circle(c, x, y, r) {
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
  }

  function ink(c, fill) {
    c.fillStyle = fill;
    c.fill();
    c.lineWidth = 0.024;
    c.strokeStyle = OUTLINE;
    c.stroke();
  }

  function starPath(c, x, y, r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, d = i % 2 ? r * 0.45 : r;
      if (i) c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
      else c.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    c.closePath();
  }

  // A loose tangle of pen lines. A new `frame` redraws it slightly differently,
  // which gives the jittery look of a flipbook.
  function scribblePath(c, x, y, r, seed, frame, loops) {
    const points = [];
    for (let i = 0; i < loops; i++) {
      const a = hash(seed + i * 1.37) * TAU;
      const d = r * (0.45 + 0.55 * hash(seed + i * 2.11 + frame * 0.73));
      points.push([x + Math.cos(a) * d, y + Math.sin(a) * d]);
    }
    c.beginPath();
    c.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i + 1 < points.length; i++) {
      const [px, py] = points[i], [qx, qy] = points[i + 1];
      c.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2);
    }
  }

  function blobPath(c, x, y, r, seed, frame) {
    const points = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU, d = r * (0.86 + 0.2 * hash(seed + i * 1.9 + frame * 0.4));
      points.push([x + Math.cos(a) * d, y + Math.sin(a) * d]);
    }
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    c.beginPath();
    c.moveTo(...mid(points[13], points[0]));
    points.forEach((p, i) => c.quadraticCurveTo(p[0], p[1], ...mid(p, points[(i + 1) % 14])));
    c.closePath();
  }

  // Shorthands for the newer art: a filled, outlined shape in one call.
  const fillRound = (c, x, y, w, h, r, fill) => { rounded(c, x, y, w, h, r); ink(c, fill); };
  const fillBox = (c, x, y, w, h, fill) => { box(c, x, y, w, h); ink(c, fill); };
  const fillCircle = (c, x, y, r, fill) => { circle(c, x, y, r); ink(c, fill); };
  const fillPoly = (c, points, fill) => { polygon(c, points); ink(c, fill); };
  const fillOval = (c, x, y, rx, ry, fill) => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); ink(c, fill); };

  function lines(c, hex, width, segments) {
    c.strokeStyle = hex;
    c.lineWidth = width;
    c.beginPath();
    for (const [x, y, x2, y2] of segments) {
      c.moveTo(x, y);
      c.lineTo(x2, y2);
    }
    c.stroke();
  }

  // A toothed ring, for gears and seals.
  function burstPath(c, x, y, r, inner, teeth) {
    c.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i * Math.PI) / teeth, d = i % 2 ? inner : r;
      if (i) c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
      else c.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    c.closePath();
  }

  const RAINBOW_INK = ['#d3262f', '#f6c21c', '#1d8f4e', '#2a7de1', '#8e44c9', '#e8562a'];

  // ---- Supplies -----------------------------------------------------------
  // Each one is drawn pointing along +x and about 1 unit long. `ready` is false for
  // a moment after firing, so the ruler can show its paper clip has gone.

  const ART = {
    pencil(c) {
      rounded(c, -0.5, -0.095, 0.13, 0.19, 0.045);
      ink(c, '#f08fa6');
      box(c, -0.39, -0.095, 0.09, 0.19);
      ink(c, '#b8c0c7');
      box(c, -0.3, -0.095, 0.5, 0.19);
      ink(c, '#f6c21c');
      c.fillStyle = '#ffdf72';
      c.fillRect(-0.29, -0.078, 0.48, 0.045);
      c.fillStyle = '#dca60c';
      c.fillRect(-0.29, 0.04, 0.48, 0.042);
      polygon(c, [[0.2, -0.095], [0.2, 0.095], [0.42, 0.024], [0.42, -0.024]]);
      ink(c, '#eed3a6');
      polygon(c, [[0.42, -0.024], [0.42, 0.024], [0.51, 0]]);
      ink(c, '#33363d');
    },
    ruler(c, ready) {
      box(c, -0.52, -0.13, 1.04, 0.26);
      ink(c, '#e4b871');
      c.fillStyle = '#aeb6bc';
      c.fillRect(-0.51, 0.082, 1.02, 0.036);
      c.strokeStyle = '#6b4a1f';
      c.lineWidth = 0.014;
      c.beginPath();
      for (let i = 0; i <= 12; i++) {
        const x = -0.48 + i * 0.08;
        c.moveTo(x, -0.125);
        c.lineTo(x, i % 4 === 0 ? -0.03 : -0.075);
      }
      c.stroke();
      if (ready) {
        c.strokeStyle = '#5d6a78';
        c.lineWidth = 0.026;
        rounded(c, 0.27, -0.09, 0.23, 0.15, 0.06);
        c.stroke();
        rounded(c, 0.31, -0.058, 0.15, 0.085, 0.035);
        c.stroke();
      }
    },
    eraser(c) {
      rounded(c, -0.46, -0.21, 0.92, 0.42, 0.08);
      ink(c, ERASER);
      c.fillStyle = '#fbd0da';
      c.fillRect(0.1, -0.17, 0.3, 0.05);
      box(c, -0.46, -0.21, 0.52, 0.42);
      ink(c, '#2f6fd0');
      c.fillStyle = '#fdfdfb';
      c.fillRect(-0.38, -0.08, 0.36, 0.16);
    },
    mechanical(c) {
      rounded(c, -0.52, -0.06, 0.08, 0.12, 0.02);
      ink(c, ERASER);
      box(c, -0.45, -0.08, 0.1, 0.16);
      ink(c, '#b8c0c7');
      rounded(c, -0.35, -0.085, 0.58, 0.17, 0.03);
      ink(c, '#2f5fb3');
      c.fillStyle = '#7ba1e2';
      c.fillRect(-0.32, -0.065, 0.5, 0.04);
      box(c, -0.33, -0.13, 0.28, 0.04);
      ink(c, '#b8c0c7');
      box(c, 0.22, -0.085, 0.1, 0.17);
      ink(c, '#33363d');
      polygon(c, [[0.32, -0.085], [0.32, 0.085], [0.44, 0.022], [0.44, -0.022]]);
      ink(c, '#b8c0c7');
      box(c, 0.44, -0.012, 0.1, 0.024);
      ink(c, '#33363d');
    },
    rubber(c, ready) {
      // A rubber band stretched across a forked stick, pulled back when it's loaded.
      const pull = ready ? -0.22 : 0.26;
      const stick = (width, color) => {
        c.strokeStyle = color;
        c.lineWidth = width;
        c.beginPath();
        c.moveTo(-0.5, 0);
        c.lineTo(-0.06, 0);
        c.lineTo(0.34, -0.27);
        c.moveTo(-0.06, 0);
        c.lineTo(0.34, 0.27);
        c.stroke();
      };
      stick(0.13, OUTLINE);
      stick(0.085, '#c98d4a');
      c.strokeStyle = '#a84f18';
      c.lineWidth = 0.045;
      c.beginPath();
      c.moveTo(0.34, -0.27);
      c.lineTo(pull, 0);
      c.lineTo(0.34, 0.27);
      c.stroke();
    },
    whiteout(c) {
      rounded(c, -0.42, -0.23, 0.62, 0.46, 0.08);
      ink(c, '#fdfdfb');
      box(c, -0.32, -0.23, 0.36, 0.46);
      ink(c, '#e7473c');
      c.fillStyle = '#fdfdfb';
      c.fillRect(-0.26, -0.08, 0.24, 0.16);
      box(c, 0.2, -0.13, 0.16, 0.26);
      ink(c, '#39414d');
      polygon(c, [[0.36, -0.07], [0.36, 0.07], [0.53, 0]]);
      ink(c, '#fdfdfb');
    },
    stapler(c) {
      rounded(c, -0.52, -0.2, 1.02, 0.4, 0.08);
      ink(c, '#39414d');
      rounded(c, -0.5, -0.15, 0.92, 0.3, 0.1);
      ink(c, '#c0303a');
      c.fillStyle = '#ee7c83';
      c.fillRect(-0.42, -0.1, 0.74, 0.05);
      box(c, 0.38, -0.12, 0.13, 0.24);
      ink(c, '#b8c0c7');
      circle(c, -0.38, 0, 0.05);
      ink(c, '#b8c0c7');
    },
    calculator(c) {
      rounded(c, -0.34, -0.5, 0.68, 1, 0.08);
      ink(c, '#39414d');
      box(c, -0.26, -0.42, 0.52, 0.2);
      ink(c, '#bcd8a8');
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 3; col++) {
          c.fillStyle = row === 3 && col === 2 ? '#f08a24' : '#d7dbe2';
          c.fillRect(-0.26 + col * 0.18, -0.14 + row * 0.15, 0.15, 0.11);
        }
      }
    },
    sharpener(c) {
      polygon(c, [[-0.42, -0.3], [0.34, -0.24], [0.44, 0.24], [-0.42, 0.3]]);
      ink(c, '#b3bcc7');
      c.fillStyle = '#dde2e8';
      c.fillRect(-0.34, -0.22, 0.56, 0.05);
      polygon(c, [[0.1, -0.21], [0.3, -0.19], [0.36, 0.2], [0.1, 0.22]]);
      ink(c, '#7c8a99');
      circle(c, 0.22, 0, 0.04);
      ink(c, '#39414d');
      circle(c, -0.16, 0, 0.15);
      ink(c, '#23262c');
      c.strokeStyle = '#c98d4a';
      c.lineWidth = 0.05;
      c.beginPath();
      c.arc(-0.34, 0.44, 0.1, 0, 4.4);
      c.stroke();
    },
    scissors(c, ready) {
      const open = ready ? 0.3 : 0.08;
      for (const side of [-1, 1]) {
        c.save();
        c.translate(0.06, 0);
        c.rotate(side * open);
        polygon(c, [[-0.02, -0.055], [0.46, -0.01], [0.46, 0.012], [-0.02, 0.055]]);
        ink(c, '#d7dbe2');
        c.strokeStyle = OUTLINE;
        c.lineWidth = 0.09;
        c.beginPath();
        c.moveTo(-0.02, 0);
        c.lineTo(-0.26, 0);
        c.stroke();
        circle(c, -0.38, 0, 0.13);
        c.lineWidth = 0.1;
        c.stroke();
        c.strokeStyle = '#1d8f4e';
        c.lineWidth = 0.062;
        c.stroke();
        c.restore();
      }
      circle(c, 0.06, 0, 0.045);
      ink(c, '#b8c0c7');
    },
    crayon(c) {
      polygon(c, [[-0.46, -0.12], [0.22, -0.12], [0.48, -0.03], [0.48, 0.03], [0.22, 0.12], [-0.46, 0.12]]);
      ink(c, '#e0562a');
      box(c, -0.34, -0.12, 0.46, 0.24);
      ink(c, '#f7e3a8');
      c.fillStyle = '#e0562a';
      c.fillRect(-0.3, -0.035, 0.38, 0.07);
    },
    tack(c) {
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.035;
      c.beginPath();
      c.moveTo(0.1, 0);
      c.lineTo(0.5, 0);
      c.stroke();
      circle(c, -0.08, 0, 0.3);
      ink(c, '#d9403a');
      circle(c, -0.08, 0, 0.18);
      ink(c, '#ef7d74');
      circle(c, -0.16, -0.1, 0.045);
      c.fillStyle = '#fff';
      c.fill();
    },
    coloredpencil(c) {
      ['#d3262f', '#f6c21c', '#1d8f4e', '#2a7de1', '#7a3fc0'].forEach((hex, i) => {
        c.fillStyle = hex;
        c.fillRect(-0.46 + i * 0.132, -0.095, 0.132, 0.19);
      });
      box(c, -0.46, -0.095, 0.66, 0.19);
      c.lineWidth = 0.024;
      c.strokeStyle = OUTLINE;
      c.stroke();
      polygon(c, [[0.2, -0.095], [0.2, 0.095], [0.42, 0.024], [0.42, -0.024]]);
      ink(c, '#eed3a6');
      polygon(c, [[0.42, -0.024], [0.42, 0.024], [0.51, 0]]);
      ink(c, '#2fa8a0');
    },
    protractor(c) {
      c.beginPath();
      c.arc(-0.22, 0, 0.58, -Math.PI / 2, Math.PI / 2);
      c.closePath();
      ink(c, '#a9e2f2');
      c.strokeStyle = '#1f6f8a';
      c.lineWidth = 0.014;
      c.beginPath();
      c.arc(-0.22, 0, 0.3, -Math.PI / 2, Math.PI / 2);
      for (let i = -6; i <= 6; i++) {
        const a = i * 0.24;
        c.moveTo(-0.22 + Math.cos(a) * 0.48, Math.sin(a) * 0.48);
        c.lineTo(-0.22 + Math.cos(a) * 0.58, Math.sin(a) * 0.58);
      }
      c.stroke();
      circle(c, -0.22, 0, 0.04);
      ink(c, '#1f6f8a');
    },
    glitter(c) {
      rounded(c, -0.46, -0.18, 0.66, 0.36, 0.07);
      ink(c, '#b455d6');
      [[-0.34, -0.06], [-0.2, 0.08], [-0.08, -0.08], [0.06, 0.06]].forEach(([x, y], i) => {
        starPath(c, x, y, 0.06);
        c.fillStyle = i % 2 ? '#ffe27a' : '#fff';
        c.fill();
      });
      polygon(c, [[0.2, -0.15], [0.2, 0.15], [0.34, 0.05], [0.34, -0.05]]);
      ink(c, '#f0d3fa');
      polygon(c, [[0.34, -0.035], [0.34, 0.035], [0.5, 0.012], [0.5, -0.012]]);
      ink(c, '#7a2f96');
    },
    marker(c) {
      rounded(c, -0.5, -0.14, 0.72, 0.28, 0.05);
      ink(c, '#2b2f36');
      c.fillStyle = '#fdfdfb';
      c.fillRect(-0.42, -0.06, 0.28, 0.12);
      box(c, -0.08, -0.14, 0.1, 0.28);
      ink(c, '#2a7de1');
      polygon(c, [[0.22, -0.12], [0.22, 0.12], [0.36, 0.07], [0.36, -0.07]]);
      ink(c, '#d7dbe2');
      polygon(c, [[0.36, -0.05], [0.36, 0.05], [0.52, 0.02], [0.52, -0.02]]);
      ink(c, '#2a7de1');
    },
    pen(c) {
      box(c, -0.53, -0.03, 0.11, 0.06);
      ink(c, '#d7dbe2');
      rounded(c, -0.42, -0.075, 0.66, 0.15, 0.03);
      ink(c, '#fdfdfb');
      c.fillStyle = '#2b3d91';
      c.fillRect(-0.4, -0.06, 0.4, 0.12);
      box(c, -0.38, -0.115, 0.26, 0.035);
      ink(c, '#b8c0c7');
      polygon(c, [[0.24, -0.075], [0.24, 0.075], [0.44, 0.02], [0.44, -0.02]]);
      ink(c, '#2b3d91');
      polygon(c, [[0.44, -0.02], [0.44, 0.02], [0.53, 0]]);
      ink(c, '#b8c0c7');
    },
    setsquare(c) {
      polygon(c, [[-0.42, -0.44], [-0.42, 0.44], [0.54, 0]]);
      ink(c, '#f5c469');
      polygon(c, [[-0.28, -0.2], [-0.28, 0.2], [0.14, 0]]);
      c.fillStyle = '#fbfcf7';
      c.fill();
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.018;
      c.stroke();
      c.beginPath();
      for (let i = 0; i < 7; i++) {
        c.moveTo(-0.42, -0.36 + i * 0.12);
        c.lineTo(-0.36, -0.36 + i * 0.12);
      }
      c.stroke();
    },
    sticky(c) {
      polygon(c, [[-0.36, -0.36], [0.36, -0.36], [0.36, 0.14], [0.14, 0.36], [-0.36, 0.36]]);
      ink(c, '#ffe76a');
      polygon(c, [[0.36, 0.14], [0.14, 0.14], [0.14, 0.36]]);
      ink(c, '#e8cc3d');
      c.strokeStyle = 'rgba(120, 100, 20, 0.5)';
      c.lineWidth = 0.02;
      c.beginPath();
      for (const y of [-0.06, 0.08, 0.22]) {
        c.moveTo(-0.26, y);
        c.lineTo(y > 0.1 ? 0.02 : 0.24, y);
      }
      c.stroke();
      circle(c, 0, -0.22, 0.08);
      ink(c, '#d9403a');
    },
    holepunch(c) {
      rounded(c, -0.5, -0.26, 0.98, 0.52, 0.08);
      ink(c, '#566f8c');
      rounded(c, -0.42, -0.17, 0.6, 0.34, 0.06);
      ink(c, '#8aa2bd');
      circle(c, 0.3, -0.12, 0.075);
      ink(c, '#23262c');
      circle(c, 0.3, 0.12, 0.075);
      ink(c, '#23262c');
    },
    board(c) {
      rounded(c, -0.52, -0.42, 1.04, 0.84, 0.04);
      ink(c, '#a9743a');
      box(c, -0.44, -0.34, 0.88, 0.68);
      ink(c, '#dab684');
      [[-0.36, -0.27, 0.3, 0.28, '#ffe76a'], [0.06, -0.22, 0.3, 0.22, '#9fd8f0'], [-0.18, 0.06, 0.32, 0.22, '#f7b3c6']].forEach(([x, y, w, h, hex]) => {
        box(c, x, y, w, h);
        ink(c, hex);
        circle(c, x + w / 2, y + 0.04, 0.03);
        ink(c, '#d9403a');
      });
    },
    laser(c) {
      rounded(c, -0.52, -0.085, 0.88, 0.17, 0.04);
      ink(c, '#aeb7c2');
      c.fillStyle = '#dde2e8';
      c.fillRect(-0.48, -0.06, 0.8, 0.035);
      circle(c, -0.12, 0, 0.05);
      ink(c, '#e0201f');
      polygon(c, [[0.36, -0.085], [0.36, 0.085], [0.46, 0.06], [0.46, -0.06]]);
      ink(c, '#39414d');
      circle(c, 0.5, 0, 0.05);
      ink(c, '#ff5a50');
    },
    gluegun(c) {
      rounded(c, -0.6, -0.06, 0.18, 0.12, 0.03);
      ink(c, '#fdf3d7');
      rounded(c, -0.34, 0.1, 0.22, 0.42, 0.06);
      ink(c, '#39414d');
      rounded(c, -0.46, -0.17, 0.72, 0.34, 0.09);
      ink(c, '#e8862a');
      c.fillStyle = '#f6b26f';
      c.fillRect(-0.38, -0.12, 0.56, 0.05);
      polygon(c, [[0.26, -0.09], [0.26, 0.09], [0.48, 0.03], [0.48, -0.03]]);
      ink(c, '#d7dbe2');
      box(c, -0.08, 0.17, 0.08, 0.12);
      ink(c, '#f6c21c');
    },
    shredder(c) {
      for (let i = 0; i < 6; i++) {
        box(c, 0.2, -0.31 + i * 0.11, 0.32, 0.05);
        ink(c, '#fdfdfb');
      }
      rounded(c, -0.52, -0.38, 0.74, 0.76, 0.06);
      ink(c, '#3a4656');
      c.fillStyle = '#14181d';
      c.fillRect(0.08, -0.32, 0.07, 0.64);
      circle(c, -0.34, -0.22, 0.05);
      ink(c, '#7ee08a');
    },
    graphing(c) {
      rounded(c, -0.36, -0.52, 0.72, 1.04, 0.08);
      ink(c, '#2f3a46');
      box(c, -0.28, -0.44, 0.56, 0.42);
      ink(c, '#bcd8a8');
      c.strokeStyle = '#2d5a2d';
      c.lineWidth = 0.022;
      c.beginPath();
      for (let i = 0; i <= 20; i++) {
        const x = -0.26 + i * 0.026, y = -0.23 - Math.sin(i * 0.55) * 0.14;
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.stroke();
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          c.fillStyle = col === 3 ? '#3b8fd9' : '#d7dbe2';
          c.fillRect(-0.28 + col * 0.145, 0.06 + row * 0.13, 0.12, 0.09);
        }
      }
    },
    electric(c) {
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.035;
      c.beginPath();
      c.moveTo(0.38, 0.2);
      c.quadraticCurveTo(0.62, 0.3, 0.5, 0.52);
      c.stroke();
      rounded(c, -0.42, -0.42, 0.84, 0.84, 0.12);
      ink(c, '#f6c21c');
      circle(c, 0, -0.12, 0.17);
      ink(c, '#23262c');
      polygon(c, [[0.04, 0.08], [-0.1, 0.26], [0, 0.26], [-0.05, 0.38], [0.11, 0.2], [0.01, 0.2]]);
      ink(c, '#fdfdfb');
    },
    whiteboard(c) {
      box(c, -0.56, -0.42, 1.12, 0.74);
      ink(c, '#fdfdfb');
      c.strokeStyle = '#8b97a6';
      c.lineWidth = 0.05;
      c.strokeRect(-0.54, -0.4, 1.08, 0.7);
      c.lineWidth = 0.03;
      c.strokeStyle = '#2a7de1';
      c.beginPath();
      c.moveTo(-0.4, 0.1);
      c.quadraticCurveTo(-0.2, -0.32, 0, 0.02);
      c.quadraticCurveTo(0.14, 0.2, 0.36, -0.2);
      c.stroke();
      rounded(c, -0.4, 0.34, 0.8, 0.08, 0.02);
      ink(c, '#aeb7c2');
    },
    geometry(c) {
      rounded(c, -0.54, -0.36, 1.08, 0.72, 0.06);
      ink(c, '#a3662a');
      box(c, -0.46, -0.28, 0.92, 0.56);
      ink(c, '#efe1c2');
      polygon(c, [[-0.4, 0.2], [-0.4, -0.2], [-0.04, 0.2]]);
      ink(c, '#f5c469');
      box(c, 0.02, -0.22, 0.42, 0.1);
      ink(c, '#e4b871');
      c.strokeStyle = '#6f7c8b';
      c.lineWidth = 0.035;
      c.beginPath();
      c.moveTo(0.08, 0.22);
      c.lineTo(0.22, -0.04);
      c.lineTo(0.38, 0.22);
      c.stroke();
      circle(c, 0.22, -0.04, 0.04);
      ink(c, '#d3262f');
    },
    label(c) {
      box(c, 0.3, -0.1, 0.26, 0.17);
      ink(c, '#fdfdfb');
      rounded(c, -0.46, -0.3, 0.8, 0.6, 0.1);
      ink(c, '#2f8f5b');
      box(c, -0.36, -0.22, 0.42, 0.14);
      ink(c, '#d8efc9');
      c.fillStyle = '#d7dbe2';
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 4; col++) c.fillRect(-0.36 + col * 0.14, -0.02 + row * 0.13, 0.11, 0.09);
      }
    },
    artkit(c) {
      rounded(c, -0.54, -0.36, 1.08, 0.72, 0.08);
      ink(c, '#b9834a');
      ['#d3262f', '#f0711a', '#f6c21c', '#1d8f4e', '#2a7de1', '#7a3fc0', '#ff4fa3', '#fdfdfb'].forEach((hex, i) => {
        circle(c, -0.36 + (i % 4) * 0.24, -0.14 + ((i / 4) | 0) * 0.28, 0.1);
        ink(c, hex);
      });
    },
    backpack(c) {
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.1;
      c.beginPath();
      c.arc(0, -0.46, 0.13, Math.PI, 0);
      c.stroke();
      c.strokeStyle = '#7f1a22';
      c.lineWidth = 0.06;
      c.stroke();
      rounded(c, -0.42, -0.48, 0.84, 1, 0.24);
      ink(c, '#c0303a');
      rounded(c, -0.3, 0.02, 0.6, 0.38, 0.08);
      ink(c, '#a32530');
      c.strokeStyle = '#ffe27a';
      c.lineWidth = 0.03;
      c.setLineDash([0.035, 0.03]);
      c.beginPath();
      c.moveTo(-0.26, 0.1);
      c.lineTo(0.26, 0.1);
      c.moveTo(-0.3, -0.22);
      c.lineTo(0.3, -0.22);
      c.stroke();
      c.setLineDash([]);
      starPath(c, 0, 0.24, 0.09);
      c.fillStyle = '#ffe27a';
      c.fill();
    },
    clip(c) {
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.075;
      rounded(c, -0.46, -0.16, 0.92, 0.32, 0.16);
      c.stroke();
      rounded(c, -0.3, -0.08, 0.62, 0.16, 0.08);
      c.stroke();
      c.strokeStyle = '#b8c0c7';
      c.lineWidth = 0.04;
      rounded(c, -0.46, -0.16, 0.92, 0.32, 0.16);
      c.stroke();
      rounded(c, -0.3, -0.08, 0.62, 0.16, 0.08);
      c.stroke();
    },
    chalk(c) {
      rounded(c, -0.46, -0.1, 0.92, 0.2, 0.08);
      ink(c, '#f4f1e8');
      c.fillStyle = '#d9d4c3';
      c.fillRect(-0.4, 0.03, 0.8, 0.04);
      rounded(c, 0.32, -0.1, 0.14, 0.2, 0.06);
      ink(c, '#e6e1d2');
    },
    clipboard(c) {
      rounded(c, -0.4, -0.48, 0.8, 0.96, 0.05);
      ink(c, '#c08a4e');
      box(c, -0.32, -0.36, 0.64, 0.76);
      ink(c, '#fdfdfb');
      c.strokeStyle = 'rgba(70, 110, 170, 0.6)';
      c.lineWidth = 0.014;
      c.beginPath();
      for (let i = 0; i < 5; i++) {
        c.moveTo(-0.24, -0.2 + i * 0.12);
        c.lineTo(0.24, -0.2 + i * 0.12);
      }
      c.stroke();
      rounded(c, -0.18, -0.54, 0.36, 0.14, 0.04);
      ink(c, '#b8c0c7');
    },
    binderclip(c) {
      polygon(c, [[-0.3, -0.34], [0.3, -0.34], [0.38, 0.34], [-0.38, 0.34]]);
      ink(c, '#2b2f36');
      c.strokeStyle = '#b8c0c7';
      c.lineWidth = 0.045;
      c.beginPath();
      c.moveTo(-0.2, -0.34);
      c.lineTo(-0.34, -0.56);
      c.lineTo(-0.06, -0.56);
      c.moveTo(0.2, -0.34);
      c.lineTo(0.34, -0.56);
      c.lineTo(0.06, -0.56);
      c.stroke();
    },
    paperchain(c) {
      ['#e8562a', '#f6c21c', '#1d8f4e', '#2a7de1'].forEach((hex, i) => {
        c.strokeStyle = OUTLINE;
        c.lineWidth = 0.09;
        c.beginPath();
        c.ellipse(-0.36 + i * 0.24, 0, 0.16, i % 2 ? 0.08 : 0.16, 0, 0, TAU);
        c.stroke();
        c.strokeStyle = hex;
        c.lineWidth = 0.055;
        c.stroke();
      });
    },
    bookmark(c) {
      polygon(c, [[-0.2, -0.5], [0.2, -0.5], [0.2, 0.5], [0, 0.34], [-0.2, 0.5]]);
      ink(c, '#d3262f');
      c.strokeStyle = '#ffe27a';
      c.lineWidth = 0.025;
      c.beginPath();
      c.moveTo(-0.12, -0.3);
      c.lineTo(0.12, -0.3);
      c.stroke();
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.04;
      rounded(c, -0.1, -0.58, 0.2, 0.3, 0.08);
      c.stroke();
    },
    lanyard(c) {
      c.strokeStyle = '#1d8f4e';
      c.lineWidth = 0.08;
      c.beginPath();
      c.moveTo(-0.3, -0.5);
      c.lineTo(0, 0);
      c.lineTo(0.3, -0.5);
      c.stroke();
      rounded(c, -0.2, 0, 0.4, 0.46, 0.05);
      ink(c, '#fdfdfb');
      circle(c, 0, 0.16, 0.08);
      ink(c, '#f6c21c');
      c.fillStyle = '#9aa3ab';
      c.fillRect(-0.12, 0.3, 0.24, 0.04);
    },
    remover(c) {
      for (const side of [-1, 1]) {
        polygon(c, [[-0.46, side * 0.04], [0.2, side * 0.04], [0.42, side * 0.26], [0.3, side * 0.32], [0.12, side * 0.16], [-0.46, side * 0.16]]);
        ink(c, '#566f8c');
      }
      circle(c, -0.36, 0, 0.06);
      ink(c, '#b8c0c7');
    },
    pastel(c) {
      ['#e88fb4', '#9fd8f0', '#ffe27a'].forEach((hex, i) => {
        rounded(c, -0.42, -0.3 + i * 0.22, 0.84, 0.17, 0.06);
        ink(c, hex);
      });
    },
    pointer(c) {
      polygon(c, [[-0.52, -0.06], [0.42, -0.025], [0.42, 0.025], [-0.52, 0.06]]);
      ink(c, '#a3662a');
      polygon(c, [[0.42, -0.025], [0.42, 0.025], [0.54, 0]]);
      ink(c, '#f4f1e8');
      box(c, -0.52, -0.06, 0.12, 0.12);
      ink(c, '#39414d');
    },
    papiermache(c) {
      c.fillStyle = '#c9b28a';
      blobPath(c, 0, 0.04, 0.38, 4, 0);
      ink(c, '#c9b28a');
      c.strokeStyle = 'rgba(80, 60, 30, 0.45)';
      c.lineWidth = 0.02;
      c.beginPath();
      c.moveTo(-0.24, -0.1);
      c.lineTo(0.18, 0.06);
      c.moveTo(-0.1, 0.18);
      c.lineTo(0.22, -0.16);
      c.stroke();
      rounded(c, 0.14, -0.46, 0.3, 0.16, 0.04);
      ink(c, '#fdfdfb');
    },
    duster(c) {
      rounded(c, -0.46, -0.24, 0.92, 0.22, 0.06);
      ink(c, '#8a5a32');
      rounded(c, -0.48, -0.02, 0.96, 0.26, 0.05);
      ink(c, '#4a4f58');
      c.fillStyle = 'rgba(244, 241, 232, 0.7)';
      c.fillRect(-0.44, 0.12, 0.88, 0.08);
    },
    sidewalk(c) {
      ['#3aa6c9', '#e88fb4', '#9fe0a0'].forEach((hex, i) => {
        circle(c, -0.24 + i * 0.24, 0, 0.16);
        ink(c, hex);
      });
    },
    easel(c) {
      c.strokeStyle = '#7a4a20';
      c.lineWidth = 0.06;
      c.beginPath();
      c.moveTo(-0.3, 0.52);
      c.lineTo(0, -0.5);
      c.lineTo(0.3, 0.52);
      c.stroke();
      box(c, -0.36, -0.36, 0.72, 0.5);
      ink(c, '#2b3f38');
      c.strokeStyle = '#f1f3ea';
      c.lineWidth = 0.025;
      c.beginPath();
      c.moveTo(-0.24, -0.18);
      c.lineTo(0.2, -0.18);
      c.moveTo(-0.24, -0.04);
      c.lineTo(0.08, -0.04);
      c.stroke();
    },
    lamp(c) {
      circle(c, -0.2, 0.3, 0.16);
      ink(c, '#39414d');
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.05;
      c.beginPath();
      c.moveTo(-0.2, 0.3);
      c.lineTo(0.02, -0.1);
      c.lineTo(0.2, 0.06);
      c.stroke();
      polygon(c, [[0.08, -0.06], [0.42, -0.24], [0.5, 0.06], [0.24, 0.12]]);
      ink(c, '#e3a21c');
      circle(c, 0.36, 0.0, 0.07);
      ink(c, '#fff6bf');
    },
    projector(c) {
      rounded(c, -0.46, -0.28, 0.8, 0.56, 0.08);
      ink(c, '#3a4656');
      circle(c, 0.34, 0, 0.17);
      ink(c, '#39414d');
      circle(c, 0.34, 0, 0.1);
      ink(c, '#cfe9f7');
      for (const x of [-0.3, -0.12]) {
        circle(c, x, -0.36, 0.11);
        ink(c, '#566f8c');
      }
    },
    chalkboard(c) {
      box(c, -0.56, -0.38, 1.12, 0.76);
      ink(c, '#7a4a20');
      box(c, -0.48, -0.3, 0.96, 0.6);
      ink(c, '#2b3f38');
      c.strokeStyle = '#f1f3ea';
      c.lineWidth = 0.03;
      c.beginPath();
      c.moveTo(-0.36, -0.1);
      c.lineTo(-0.1, -0.1);
      c.moveTo(-0.23, -0.22);
      c.lineTo(-0.23, 0.02);
      c.moveTo(0.04, -0.12);
      c.lineTo(0.3, -0.12);
      c.moveTo(0.04, -0.04);
      c.lineTo(0.3, -0.04);
      c.stroke();
    },
    trophy(c) {
      box(c, -0.22, 0.32, 0.44, 0.12);
      ink(c, '#7a4a20');
      box(c, -0.05, 0.12, 0.1, 0.2);
      ink(c, '#e3b23c');
      c.beginPath();
      c.moveTo(-0.3, -0.42);
      c.lineTo(0.3, -0.42);
      c.quadraticCurveTo(0.3, 0.14, 0, 0.14);
      c.quadraticCurveTo(-0.3, 0.14, -0.3, -0.42);
      ink(c, '#e3b23c');
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.05;
      c.beginPath();
      c.arc(-0.34, -0.22, 0.12, Math.PI / 2, (3 * Math.PI) / 2);
      c.moveTo(0.34, -0.34);
      c.arc(0.34, -0.22, 0.12, -Math.PI / 2, Math.PI / 2);
      c.stroke();
      starPath(c, 0, -0.18, 0.1);
      c.fillStyle = '#fff6bf';
      c.fill();
    },
    staplegun(c) {
      rounded(c, -0.48, -0.18, 0.96, 0.32, 0.08);
      ink(c, '#c0303a');
      rounded(c, -0.4, 0.1, 0.2, 0.38, 0.06);
      ink(c, '#39414d');
      box(c, 0.36, -0.14, 0.14, 0.26);
      ink(c, '#b8c0c7');
    },
    principal(c) {
      rounded(c, -0.5, -0.46, 1, 0.92, 0.04);
      ink(c, '#5a3fb8');
      box(c, -0.38, -0.34, 0.76, 0.28);
      ink(c, '#fdfdfb');
      rounded(c, -0.14, 0.04, 0.28, 0.42, 0.03);
      ink(c, '#7a4a20');
      circle(c, 0.08, 0.26, 0.03);
      ink(c, '#e3b23c');
      c.fillStyle = '#5a3fb8';
      c.fillRect(-0.3, -0.24, 0.6, 0.04);
      c.fillRect(-0.3, -0.16, 0.4, 0.04);
    },

    // Paintbrush and Rubber Stamp, and everything made from them.
    brush(c) {
      fillPoly(c, [[-0.52, -0.05], [0.1, -0.07], [0.1, 0.07], [-0.52, 0.05]], '#c0303a');
      fillBox(c, 0.1, -0.08, 0.14, 0.16, '#b8c0c7');
      fillPoly(c, [[0.24, -0.08], [0.42, -0.07], [0.54, 0], [0.42, 0.07], [0.24, 0.08]], '#e3c48a');
      fillPoly(c, [[0.4, -0.07], [0.54, 0], [0.4, 0.07]], '#8e44c9');
    },
    stamp(c) {
      fillCircle(c, 0, -0.34, 0.16, '#a3662a');
      fillBox(c, -0.07, -0.2, 0.14, 0.2, '#c08a4e');
      fillRound(c, -0.36, 0, 0.72, 0.22, 0.04, '#a3662a');
      fillBox(c, -0.34, 0.22, 0.68, 0.1, '#c42f45');
    },
    watercolor(c) {
      fillBox(c, -0.5, -0.09, 0.66, 0.18, '#3b8fd9');
      c.fillStyle = '#9fd0f7';
      c.fillRect(-0.49, -0.075, 0.64, 0.04);
      fillPoly(c, [[0.16, -0.09], [0.16, 0.09], [0.4, 0.024], [0.4, -0.024]], '#eed3a6');
      fillPoly(c, [[0.4, -0.024], [0.4, 0.024], [0.5, 0]], '#1f5a96');
      fillCircle(c, 0.46, 0.1, 0.045, '#3b8fd9');
    },
    roller(c) {
      fillRound(c, -0.52, -0.07, 0.36, 0.14, 0.06, '#c0303a');
      lines(c, '#7c8a99', 0.045, [[-0.16, 0, 0.2, 0]]);
      fillRound(c, 0.2, -0.36, 0.22, 0.72, 0.08, '#4fb3a9');
      c.fillStyle = 'rgba(255, 255, 255, 0.35)';
      c.fillRect(0.25, -0.31, 0.05, 0.62);
    },
    poster(c) {
      fillRound(c, -0.3, -0.22, 0.6, 0.64, 0.08, '#f4f1e8');
      fillRound(c, -0.3, 0.02, 0.6, 0.4, 0.08, '#f08a24');
      fillRound(c, -0.34, -0.36, 0.68, 0.16, 0.05, '#39414d');
      fillPoly(c, [[-0.18, -0.2], [-0.1, -0.2], [-0.11, 0.06], [-0.17, 0.06]], '#f08a24');
    },
    sponge(c) {
      fillRound(c, -0.42, -0.26, 0.84, 0.52, 0.1, '#f2c94c');
      c.fillStyle = '#c99a1c';
      for (const [x, y, r] of [[-0.22, -0.08, 0.05], [0.08, -0.12, 0.04], [0.24, 0.06, 0.05], [-0.06, 0.1, 0.035], [-0.28, 0.12, 0.03]]) {
        circle(c, x, y, r);
        c.fill();
      }
      fillCircle(c, 0.3, -0.16, 0.06, '#8e44c9');
    },
    fingerpaint(c) {
      ['#e0569a', '#3b8fd9', '#f6c21c', '#1d8f4e'].forEach((hex, i) => {
        const x = i % 2 ? 0.2 : -0.2, y = i < 2 ? -0.2 : 0.2;
        fillCircle(c, x, y, 0.19, '#fdfdfb');
        fillCircle(c, x, y, 0.12, hex);
      });
    },
    palette(c) {
      fillOval(c, 0, 0, 0.5, 0.36, '#e3c48a');
      fillCircle(c, -0.26, 0.12, 0.07, '#87592a');
      for (const [x, y, hex] of [[-0.18, -0.18, '#d3262f'], [0.06, -0.22, '#f6c21c'], [0.28, -0.08, '#2a7de1'], [0.24, 0.16, '#1d8f4e'], [0.0, 0.18, '#8e44c9']]) {
        fillCircle(c, x, y, 0.08, hex);
      }
    },
    clothespin(c) {
      fillPoly(c, [[-0.5, -0.13], [0.5, -0.05], [0.5, -0.005], [-0.5, -0.02]], '#d9b07a');
      fillPoly(c, [[-0.5, 0.02], [0.5, 0.005], [0.5, 0.05], [-0.5, 0.13]], '#c9a06a');
      lines(c, '#7c8a99', 0.04, [[-0.12, -0.14, -0.12, 0.14], [-0.04, -0.14, -0.04, 0.14]]);
      fillCircle(c, 0.38, -0.11, 0.06, '#8e44c9');
    },
    fixative(c) {
      fillRound(c, -0.46, -0.2, 0.7, 0.4, 0.06, '#6f8fa8');
      fillBox(c, -0.32, -0.2, 0.3, 0.4, '#f4f1e8');
      fillRound(c, 0.24, -0.14, 0.12, 0.28, 0.04, '#b8c0c7');
      fillBox(c, 0.36, -0.05, 0.1, 0.1, '#39414d');
    },
    redpen(c) {
      fillRound(c, -0.5, -0.08, 0.78, 0.16, 0.06, '#e02a2a');
      fillPoly(c, [[0.28, -0.08], [0.28, 0.08], [0.44, 0.03], [0.44, -0.03]], '#f4f1e8');
      fillPoly(c, [[0.44, -0.03], [0.44, 0.03], [0.52, 0]], '#951212');
      lines(c, '#7c8a99', 0.03, [[-0.4, -0.11, -0.06, -0.11]]);
    },
    embosser(c) {
      fillPoly(c, [[-0.5, -0.26], [0.1, -0.12], [0.1, -0.02], [-0.5, -0.12]], '#5a6470');
      fillPoly(c, [[-0.5, 0.26], [0.1, 0.12], [0.1, 0.02], [-0.5, 0.12]], '#5a6470');
      fillCircle(c, 0.26, 0, 0.22, '#9aa3ab');
      fillCircle(c, 0.26, 0, 0.12, '#b88a1c');
    },
    inkpad(c) {
      fillRound(c, -0.46, -0.3, 0.92, 0.6, 0.06, '#566f8c');
      fillRound(c, -0.38, -0.22, 0.76, 0.44, 0.04, '#3a3f8f');
      c.fillStyle = 'rgba(255, 255, 255, 0.18)';
      c.fillRect(-0.34, -0.18, 0.3, 0.06);
    },
    eraserstamp(c) {
      fillRound(c, -0.4, -0.26, 0.8, 0.52, 0.08, '#f5a3b7');
      starPath(c, 0, 0, 0.2);
      ink(c, '#c42f45');
    },
    waxseal(c) {
      blobPath(c, 0, 0, 0.36, 7, 0);
      ink(c, '#a3202f');
      circle(c, 0, 0, 0.22);
      c.strokeStyle = '#66101a';
      c.lineWidth = 0.03;
      c.stroke();
      starPath(c, 0, 0, 0.12);
      c.fillStyle = '#66101a';
      c.fill();
    },
    sticker(c) {
      fillRound(c, -0.4, -0.46, 0.8, 0.92, 0.04, '#fdfdfb');
      for (const [x, y] of [[-0.18, -0.24], [0.18, -0.24], [-0.18, 0.06], [0.18, 0.06], [0, 0.3]]) {
        starPath(c, x, y, 0.13);
        ink(c, '#f2b705');
      }
    },
    envelope(c) {
      fillBox(c, -0.46, -0.3, 0.92, 0.6, '#f1e6cc');
      lines(c, OUTLINE, 0.024, [[-0.46, -0.3, 0, 0.04], [0, 0.04, 0.46, -0.3]]);
      fillBox(c, 0.22, -0.24, 0.18, 0.2, '#c42f45');
    },
    stencil(c) {
      fillRound(c, -0.46, -0.34, 0.92, 0.68, 0.06, '#6fae7f');
      c.fillStyle = '#e8f3ea';
      circle(c, -0.22, -0.08, 0.12);
      c.fill();
      starPath(c, 0.16, -0.08, 0.14);
      c.fill();
      polygon(c, [[-0.32, 0.24], [-0.12, 0.24], [-0.22, 0.08]]);
      c.fill();
      c.fillRect(0.06, 0.12, 0.24, 0.1);
    },
    potato(c) {
      fillOval(c, 0, 0, 0.44, 0.32, '#c9a45c');
      c.beginPath();
      c.ellipse(0, 0, 0.34, 0.24, 0, 0, TAU);
      c.fillStyle = '#f1e2b0';
      c.fill();
      starPath(c, 0, 0, 0.17);
      ink(c, '#8e44c9');
    },
    watercolorset(c) {
      fillRound(c, -0.5, -0.3, 1, 0.6, 0.06, '#2b2f36');
      RAINBOW_INK.forEach((hex, i) => fillRound(c, -0.42 + (i % 3) * 0.29, -0.22 + Math.floor(i / 3) * 0.23, 0.24, 0.19, 0.04, hex));
    },
    airbrush(c) {
      fillRound(c, -0.5, -0.07, 0.86, 0.14, 0.05, '#b8c0c7');
      fillPoly(c, [[0.36, -0.07], [0.36, 0.07], [0.52, 0]], '#7c8a99');
      fillRound(c, -0.12, -0.32, 0.2, 0.26, 0.05, '#d64f9a');
      fillRound(c, -0.36, 0.06, 0.08, 0.22, 0.03, '#39414d');
    },
    pottery(c) {
      fillOval(c, 0, 0.26, 0.5, 0.18, '#566f8c');
      c.beginPath();
      c.moveTo(-0.22, 0.26);
      c.quadraticCurveTo(-0.38, -0.08, -0.12, -0.3);
      c.lineTo(0.12, -0.3);
      c.quadraticCurveTo(0.38, -0.08, 0.22, 0.26);
      c.closePath();
      ink(c, '#b5652e');
      fillOval(c, 0, -0.3, 0.12, 0.04, '#73390f');
    },
    paletteknife(c) {
      fillRound(c, -0.52, -0.06, 0.4, 0.12, 0.05, '#a3662a');
      lines(c, '#7c8a99', 0.04, [[-0.12, 0, 0.04, 0]]);
      fillPoly(c, [[0.04, 0], [0.24, -0.12], [0.54, 0], [0.24, 0.12]], '#c7ced6');
      fillCircle(c, 0.36, 0.02, 0.05, '#8e44c9');
    },
    fountainpen(c) {
      fillRound(c, -0.5, -0.09, 0.66, 0.18, 0.07, '#22265e');
      fillBox(c, 0.1, -0.09, 0.06, 0.18, '#e3b23c');
      fillPoly(c, [[0.16, -0.08], [0.16, 0.08], [0.54, 0]], '#e3b23c');
      lines(c, OUTLINE, 0.015, [[0.24, 0, 0.48, 0]]);
    },
    letterpress(c) {
      fillBox(c, -0.48, 0.16, 0.96, 0.24, '#39414d');
      fillBox(c, -0.36, -0.4, 0.1, 0.56, '#5a6470');
      fillBox(c, 0.26, -0.4, 0.1, 0.56, '#5a6470');
      fillBox(c, -0.42, -0.48, 0.84, 0.12, '#5a6470');
      fillBox(c, -0.26, -0.12, 0.52, 0.18, '#b8c0c7');
      c.fillStyle = OUTLINE;
      for (let i = 0; i < 4; i++) c.fillRect(-0.21 + i * 0.12, -0.08, 0.07, 0.1);
    },
    postmark(c) {
      fillBox(c, -0.42, -0.34, 0.84, 0.68, '#f1e6cc');
      circle(c, -0.14, 0, 0.2);
      c.strokeStyle = '#a3202f';
      c.lineWidth = 0.04;
      c.stroke();
      c.beginPath();
      for (let i = 0; i < 3; i++) {
        const y = -0.12 + i * 0.12;
        c.moveTo(0.08, y);
        c.quadraticCurveTo(0.17, y - 0.06, 0.25, y);
        c.quadraticCurveTo(0.33, y + 0.06, 0.4, y);
      }
      c.stroke();
    },
    mailbox(c) {
      fillBox(c, -0.06, 0.12, 0.12, 0.4, '#7a4a20');
      c.beginPath();
      c.moveTo(-0.4, 0.14);
      c.lineTo(-0.4, -0.1);
      c.arc(0, -0.1, 0.4, Math.PI, 0);
      c.lineTo(0.4, 0.14);
      c.closePath();
      ink(c, '#2f5fb3');
      fillBox(c, 0.3, -0.42, 0.06, 0.32, '#d3262f');
      fillBox(c, 0.36, -0.42, 0.14, 0.1, '#d3262f');
    },
    reportcard(c) {
      fillRound(c, -0.36, -0.46, 0.72, 0.92, 0.04, '#fdfdfb');
      lines(c, 'rgba(70, 110, 170, 0.6)', 0.016, [[-0.26, -0.04, 0.26, -0.04], [-0.26, 0.1, 0.26, 0.1], [-0.26, 0.24, 0.26, 0.24], [-0.26, 0.38, 0.1, 0.38]]);
      circle(c, 0, -0.26, 0.13);
      c.strokeStyle = '#e02a2a';
      c.lineWidth = 0.03;
      c.stroke();
      lines(c, '#e02a2a', 0.03, [[-0.06, -0.2, 0, -0.33], [0, -0.33, 0.06, -0.2], [-0.035, -0.25, 0.035, -0.25]]);
    },
    starchart(c) {
      fillBox(c, -0.46, -0.42, 0.92, 0.84, '#fdfdfb');
      const grid = [];
      for (let i = 1; i < 4; i++) grid.push([-0.46, -0.42 + i * 0.21, 0.46, -0.42 + i * 0.21], [-0.46 + i * 0.23, -0.42, -0.46 + i * 0.23, 0.42]);
      lines(c, 'rgba(70, 110, 170, 0.5)', 0.014, grid);
      for (const [x, y] of [[-0.345, -0.315], [-0.115, -0.315], [0.115, -0.315], [-0.345, -0.105], [-0.115, -0.105], [-0.345, 0.105], [0.345, -0.315]]) {
        starPath(c, x, y, 0.08);
        ink(c, '#f2b705');
      }
    },
    notary(c) {
      fillPoly(c, [[-0.16, 0.1], [-0.3, 0.52], [-0.18, 0.44], [-0.06, 0.54], [0, 0.14]], '#d3262f');
      fillPoly(c, [[0.16, 0.1], [0.3, 0.52], [0.18, 0.44], [0.06, 0.54], [0, 0.14]], '#d3262f');
      burstPath(c, 0, -0.06, 0.38, 0.31, 14);
      ink(c, '#e3b23c');
      fillCircle(c, 0, -0.06, 0.22, '#f1cf6a');
      starPath(c, 0, -0.06, 0.12);
      ink(c, '#b88a1c');
    },
    stampkit(c) {
      fillRound(c, -0.5, -0.04, 1, 0.42, 0.05, '#3a3f8f');
      [-0.28, 0, 0.28].forEach((x, i) => {
        fillBox(c, x - 0.05, -0.3, 0.1, 0.26, '#c08a4e');
        fillCircle(c, x, -0.36, 0.09, ['#d3262f', '#1d8f4e', '#f6c21c'][i]);
      });
    },
    spirograph(c) {
      burstPath(c, 0, 0, 0.5, 0.44, 24);
      ink(c, '#e8562a');
      fillCircle(c, 0, 0, 0.38, '#fdfdfb');
      c.strokeStyle = '#2a7de1';
      c.lineWidth = 0.02;
      c.beginPath();
      for (let i = 0; i <= 150; i++) {
        const a = (i / 150) * TAU, r = 0.18 + 0.13 * Math.cos(5 * a);
        if (i) c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.stroke();
    },
    tsquare(c) {
      fillBox(c, -0.52, -0.3, 0.12, 0.6, '#935808');
      fillBox(c, -0.4, -0.07, 0.94, 0.14, '#d98a1f');
      const ticks = [];
      for (let i = 0; i < 9; i++) ticks.push([-0.3 + i * 0.1, -0.07, -0.3 + i * 0.1, i % 2 ? -0.03 : 0]);
      lines(c, '#5a3a1e', 0.012, ticks);
    },
    bunsen(c) {
      c.beginPath();
      c.moveTo(-0.1, -0.08);
      c.quadraticCurveTo(-0.17, -0.36, 0, -0.56);
      c.quadraticCurveTo(0.17, -0.36, 0.1, -0.08);
      c.closePath();
      ink(c, '#2a7de1');
      c.beginPath();
      c.moveTo(-0.05, -0.08);
      c.quadraticCurveTo(-0.08, -0.26, 0, -0.38);
      c.quadraticCurveTo(0.08, -0.26, 0.05, -0.08);
      c.closePath();
      c.fillStyle = '#9fd8f0';
      c.fill();
      fillBox(c, -0.08, -0.08, 0.16, 0.42, '#9aa3ab');
      fillRound(c, -0.3, 0.32, 0.6, 0.14, 0.04, '#566f8c');
    },
    testtubes(c) {
      ['#1d9a54', '#e8562a', '#8e44c9'].forEach((hex, i) => {
        const x = -0.26 + i * 0.26;
        fillRound(c, x - 0.08, -0.46, 0.16, 0.82, 0.08, '#e9f4f8');
        fillRound(c, x - 0.08, -0.04, 0.16, 0.4, 0.08, hex);
      });
      fillBox(c, -0.46, 0.04, 0.92, 0.1, '#a3662a');
    },
    hallpass(c) {
      fillBox(c, -0.06, 0.18, 0.12, 0.34, '#a3662a');
      fillRound(c, -0.32, -0.46, 0.64, 0.66, 0.08, '#c08a4e');
      fillRound(c, -0.22, -0.32, 0.44, 0.2, 0.03, '#fdfdfb');
      lines(c, '#1d8f4e', 0.03, [[-0.15, -0.22, 0.15, -0.22]]);
    },
    ringbinder(c) {
      fillRound(c, -0.42, -0.46, 0.84, 0.92, 0.05, '#2f8f5b');
      fillBox(c, -0.42, -0.46, 0.16, 0.92, '#175c38');
      fillBox(c, -0.06, -0.22, 0.36, 0.2, '#fdfdfb');
      c.strokeStyle = '#c7ced6';
      c.lineWidth = 0.045;
      for (const y of [-0.26, 0, 0.26]) {
        c.beginPath();
        c.ellipse(-0.26, y, 0.1, 0.06, 0, 0, TAU);
        c.stroke();
      }
    },
    correction(c) {
      fillRound(c, -0.5, -0.18, 0.74, 0.36, 0.14, '#9aa3ab');
      fillCircle(c, -0.18, 0, 0.12, '#fdfdfb');
      fillPoly(c, [[0.24, -0.1], [0.48, -0.03], [0.48, 0.03], [0.24, 0.1]], '#5c656e');
      fillBox(c, 0.46, -0.05, 0.06, 0.1, '#fdfdfb');
    },
    laminator(c) {
      fillBox(c, -0.3, -0.44, 0.6, 0.5, '#e9f4f8');
      fillRound(c, -0.48, -0.16, 0.96, 0.4, 0.08, '#4c5a6a');
      fillBox(c, -0.36, -0.02, 0.72, 0.05, '#20282f');
      fillCircle(c, 0.34, 0.14, 0.04, '#1d9a54');
    },
    crayonbox(c) {
      RAINBOW_INK.slice(0, 5).forEach((hex, i) => {
        const x = -0.3 + i * 0.15;
        fillBox(c, x - 0.05, -0.36, 0.1, 0.3, hex);
        fillPoly(c, [[x - 0.05, -0.36], [x + 0.05, -0.36], [x, -0.48]], hex);
      });
      fillRound(c, -0.42, -0.12, 0.84, 0.58, 0.04, '#f6c21c');
      fillBox(c, -0.42, 0.06, 0.84, 0.18, '#1d8f4e');
    },
    popper(c) {
      fillPoly(c, [[-0.5, 0], [0.24, -0.22], [0.24, 0.22]], '#e88fb4');
      lines(c, '#fdfdfb', 0.03, [[-0.2, -0.08, -0.2, 0.08], [0, -0.14, 0, 0.14]]);
      for (const [hex, x, y] of [['#f6c21c', 0.38, -0.22], ['#2a7de1', 0.48, 0.04], ['#1d8f4e', 0.36, 0.2], ['#d3262f', 0.52, -0.12]]) fillBox(c, x - 0.04, y - 0.03, 0.08, 0.06, hex);
    },
    chalkline(c) {
      c.beginPath();
      c.moveTo(-0.5, 0);
      c.quadraticCurveTo(-0.42, -0.3, -0.1, -0.24);
      c.quadraticCurveTo(0.14, -0.14, 0.14, 0);
      c.quadraticCurveTo(0.14, 0.14, -0.1, 0.24);
      c.quadraticCurveTo(-0.42, 0.3, -0.5, 0);
      ink(c, '#3aa6c9');
      fillCircle(c, -0.18, 0, 0.08, '#1f6f8a');
      lines(c, '#3aa6c9', 0.025, [[0.14, 0, 0.5, 0]]);
      fillCircle(c, 0.5, 0, 0.04, '#e3b23c');
    },
    metronome(c) {
      fillPoly(c, [[-0.32, 0.46], [-0.14, -0.46], [0.14, -0.46], [0.32, 0.46]], '#7a4a20');
      fillPoly(c, [[-0.2, 0.36], [-0.08, -0.3], [0.08, -0.3], [0.2, 0.36]], '#e3c48a');
      lines(c, OUTLINE, 0.03, [[0, 0.3, 0.16, -0.32]]);
      fillBox(c, 0.06, -0.15, 0.1, 0.08, '#b8c0c7');
    },
    tuningfork(c) {
      c.beginPath();
      c.moveTo(-0.52, 0);
      c.lineTo(-0.12, 0);
      c.moveTo(0.52, -0.14);
      c.lineTo(0.02, -0.14);
      c.quadraticCurveTo(-0.12, -0.14, -0.12, 0);
      c.quadraticCurveTo(-0.12, 0.14, 0.02, 0.14);
      c.lineTo(0.52, 0.14);
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.11;
      c.stroke();
      c.strokeStyle = '#c7ced6';
      c.lineWidth = 0.065;
      c.stroke();
    },
    mural(c) {
      fillBox(c, -0.5, -0.38, 1, 0.76, '#fdfdfb');
      c.save();
      box(c, -0.5, -0.38, 1, 0.76);
      c.clip();
      RAINBOW_INK.slice(0, 4).forEach((hex, i) => {
        const y = 0.3 - i * 0.12;
        c.beginPath();
        c.moveTo(-0.5, y - 0.1);
        c.quadraticCurveTo(0, y - 0.6, 0.5, y - 0.1);
        c.lineTo(0.5, y);
        c.quadraticCurveTo(0, y - 0.5, -0.5, y);
        c.closePath();
        c.fillStyle = hex;
        c.fill();
      });
      c.restore();
      box(c, -0.5, -0.38, 1, 0.76);
      c.lineWidth = 0.024;
      c.strokeStyle = OUTLINE;
      c.stroke();
    },
    paintbucket(c) {
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.035;
      c.beginPath();
      c.arc(0, -0.2, 0.36, Math.PI, 0);
      c.stroke();
      fillPoly(c, [[-0.36, -0.2], [0.36, -0.2], [0.3, 0.46], [-0.3, 0.46]], '#b8c0c7');
      fillOval(c, 0, -0.2, 0.36, 0.08, '#f08a24');
      fillPoly(c, [[-0.2, -0.16], [-0.12, -0.16], [-0.13, 0.14], [-0.19, 0.14]], '#f08a24');
    },
    dryingrack(c) {
      lines(c, '#7a4a20', 0.05, [[-0.48, -0.38, -0.48, 0.5], [0.48, -0.38, 0.48, 0.5]]);
      lines(c, OUTLINE, 0.02, [[-0.48, -0.3, 0.48, -0.3]]);
      [['#e0569a', -0.26], ['#3b8fd9', 0], ['#f6c21c', 0.26]].forEach(([hex, x]) => {
        fillBox(c, x - 0.11, -0.26, 0.22, 0.32, '#fdfdfb');
        fillCircle(c, x, -0.08, 0.06, hex);
        fillBox(c, x - 0.025, -0.36, 0.05, 0.13, '#c9a06a');
      });
    },
    blockprint(c) {
      fillBox(c, -0.46, -0.06, 0.6, 0.46, '#fdfdfb');
      starPath(c, -0.16, 0.17, 0.15);
      c.fillStyle = '#6fae7f';
      c.fill();
      fillRound(c, -0.06, -0.44, 0.52, 0.38, 0.04, '#c08a4e');
      fillBox(c, -0.02, -0.08, 0.44, 0.06, '#6fae7f');
    },
    tiedye(c) {
      const shirt = [[-0.2, -0.42], [-0.5, -0.24], [-0.38, -0.04], [-0.28, -0.1], [-0.28, 0.44], [0.28, 0.44], [0.28, -0.1], [0.38, -0.04], [0.5, -0.24], [0.2, -0.42], [0.1, -0.34], [-0.1, -0.34]];
      fillPoly(c, shirt, '#fdfdfb');
      c.save();
      polygon(c, shirt);
      c.clip();
      c.lineWidth = 0.07;
      ['#d3262f', '#f6c21c', '#2a7de1', '#b455d6', '#1d8f4e'].forEach((hex, i) => {
        c.strokeStyle = hex;
        c.beginPath();
        c.arc(0, 0.06, 0.06 + i * 0.09, i, i + 4.4);
        c.stroke();
      });
      c.restore();
      polygon(c, shirt);
      c.lineWidth = 0.024;
      c.strokeStyle = OUTLINE;
      c.stroke();
    },
    artroom(c) {
      fillBox(c, -0.5, -0.42, 1, 0.8, '#a3662a');
      fillBox(c, -0.42, -0.34, 0.84, 0.64, '#9fd8f0');
      fillCircle(c, 0.22, -0.16, 0.1, '#f6c21c');
      c.beginPath();
      c.moveTo(-0.42, 0.3);
      c.quadraticCurveTo(-0.1, -0.12, 0.42, 0.16);
      c.lineTo(0.42, 0.3);
      c.closePath();
      ink(c, '#1d8f4e');
      blobPath(c, -0.36, 0.36, 0.13, 5, 0);
      ink(c, '#8e44c9');
    },
    postoffice(c) {
      fillBox(c, -0.42, -0.12, 0.84, 0.56, '#f1e6cc');
      fillPoly(c, [[-0.5, -0.1], [0, -0.44], [0.5, -0.1]], '#c42f45');
      fillBox(c, -0.1, 0.14, 0.2, 0.3, '#2f5fb3');
      fillBox(c, -0.34, 0, 0.16, 0.14, '#9fd8f0');
      fillBox(c, 0.18, 0, 0.16, 0.14, '#9fd8f0');
      fillBox(c, -0.1, -0.26, 0.2, 0.12, '#fdfdfb');
      lines(c, OUTLINE, 0.015, [[-0.1, -0.26, 0, -0.19], [0, -0.19, 0.1, -0.26]]);
    },
    honorroll(c) {
      fillRound(c, -0.42, -0.46, 0.84, 0.92, 0.06, '#7a4a20');
      fillBox(c, -0.32, -0.36, 0.64, 0.72, '#fdfdfb');
      for (let i = 0; i < 4; i++) {
        const y = -0.24 + i * 0.16;
        starPath(c, -0.2, y, 0.065);
        ink(c, '#e3b23c');
        lines(c, GRAPHITE, 0.02, [[-0.08, y, 0.22, y]]);
      }
    },
    sciencelab(c) {
      const flask = [[-0.1, -0.46], [0.1, -0.46], [0.1, -0.16], [0.4, 0.42], [-0.4, 0.42], [-0.1, -0.16]];
      fillPoly(c, flask, '#e9f4f8');
      fillPoly(c, [[-0.24, 0.1], [0.24, 0.1], [0.4, 0.42], [-0.4, 0.42]], '#1d9a54');
      fillCircle(c, -0.06, -0.02, 0.05, '#9fe0a0');
      fillCircle(c, 0.05, -0.16, 0.04, '#9fe0a0');
      fillCircle(c, -0.02, -0.56, 0.05, '#9fe0a0');
      fillBox(c, -0.13, -0.5, 0.26, 0.06, '#9aa3ab');
    },
    band(c) {
      lines(c, '#a3662a', 0.045, [[-0.08, -0.24, -0.44, -0.56], [0.08, -0.24, 0.44, -0.56]]);
      fillOval(c, 0, 0.3, 0.42, 0.14, '#d3262f');
      fillBox(c, -0.42, -0.2, 0.84, 0.5, '#d3262f');
      const zig = [];
      for (let i = 0; i < 6; i++) zig.push([-0.42 + i * 0.14, i % 2 ? 0.24 : -0.14, -0.28 + i * 0.14, i % 2 ? -0.14 : 0.24]);
      lines(c, '#f6c21c', 0.03, zig);
      fillOval(c, 0, -0.2, 0.42, 0.14, '#f4f1e8');
    },
    library(c) {
      fillBox(c, -0.48, -0.46, 0.96, 0.92, '#7a4a20');
      [-0.38, 0.04].forEach((y0, row) => {
        fillBox(c, -0.4, y0, 0.8, 0.34, '#4a2a0e');
        for (let i = 0; i < 6; i++) {
          const tall = i % 2 ? 0.26 : 0.3;
          fillBox(c, -0.385 + i * 0.128, y0 + 0.34 - tall, 0.11, tall, RAINBOW_INK[(i + row * 2) % 6]);
        }
      });
    },
    planetarium(c) {
      c.beginPath();
      c.arc(0, 0.2, 0.48, Math.PI, 0);
      c.closePath();
      ink(c, '#2f4a8a');
      fillBox(c, -0.5, 0.2, 1, 0.22, '#9aa3ab');
      for (const [x, y] of [[-0.28, 0.02], [0.3, 0.06], [-0.1, -0.16], [0.22, -0.14]]) {
        starPath(c, x, y, 0.05);
        c.fillStyle = '#ffe27a';
        c.fill();
      }
      fillCircle(c, 0.02, 0.02, 0.09, '#e8862a');
      c.strokeStyle = '#f1cf6a';
      c.lineWidth = 0.025;
      c.beginPath();
      c.ellipse(0.02, 0.02, 0.17, 0.05, -0.3, 0, TAU);
      c.stroke();
    },
    printingpress(c) {
      fillBox(c, -0.48, 0.18, 0.96, 0.24, '#39414d');
      fillBox(c, -0.38, -0.34, 0.14, 0.52, '#5a6470');
      fillBox(c, 0.24, -0.34, 0.14, 0.52, '#5a6470');
      fillBox(c, -0.44, -0.46, 0.88, 0.14, '#5a6470');
      fillBox(c, -0.2, 0.02, 0.4, 0.14, '#fdfdfb');
      circle(c, 0, -0.14, 0.13);
      c.strokeStyle = '#c42f45';
      c.lineWidth = 0.04;
      c.stroke();
      lines(c, '#c42f45', 0.025, [[-0.13, -0.14, 0.13, -0.14], [0, -0.27, 0, -0.01]]);
    },
    carbonpaper(c) {
      fillBox(c, -0.3, -0.48, 0.74, 0.86, '#2b2f36');
      fillBox(c, -0.44, -0.38, 0.74, 0.86, '#fdfdfb');
      lines(c, 'rgba(43, 61, 145, 0.7)', 0.02, [[-0.34, -0.2, 0.2, -0.2], [-0.34, -0.06, 0.14, -0.06], [-0.34, 0.08, 0.2, 0.08], [-0.34, 0.22, 0.06, 0.22]]);
    },
    photocopier(c) {
      fillBox(c, -0.46, -0.2, 0.92, 0.56, '#c7ced6');
      fillBox(c, -0.48, -0.32, 0.96, 0.14, '#9aa3ab');
      fillBox(c, -0.3, 0.02, 0.6, 0.06, '#7be04a');
      fillBox(c, 0.18, 0.18, 0.36, 0.1, '#fdfdfb');
      fillCircle(c, -0.32, 0.22, 0.04, '#1d9a54');
    },
    rubberball(c) {
      fillCircle(c, 0, 0, 0.4, '#c9702a');
      c.save();
      circle(c, 0, 0, 0.4);
      c.clip();
      c.lineWidth = 0.06;
      for (const [hex, a] of [['#d3262f', 0.3], ['#f6c21c', -0.6], ['#2a7de1', 1.2], ['#1d8f4e', -1.4]]) {
        c.strokeStyle = hex;
        c.beginPath();
        c.ellipse(0, 0, 0.42, 0.16, a, 0, TAU);
        c.stroke();
      }
      c.restore();
      circle(c, 0, 0, 0.4);
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.024;
      c.stroke();
    },
    gluetrap(c) {
      fillRound(c, -0.46, -0.32, 0.92, 0.64, 0.06, '#c08a4e');
      fillRound(c, -0.38, -0.24, 0.76, 0.48, 0.05, '#f6de7a');
      c.strokeStyle = 'rgba(150, 120, 20, 0.65)';
      c.lineWidth = 0.02;
      scribblePath(c, 0.05, 0, 0.16, 3, 0, 9);
      c.stroke();
    },
    yardstick(c) {
      fillBox(c, -0.56, -0.08, 1.12, 0.16, '#e9c27a');
      const ticks = [];
      for (let i = 0; i < 12; i++) ticks.push([-0.5 + i * 0.09, -0.08, -0.5 + i * 0.09, i % 3 ? -0.04 : 0]);
      lines(c, '#7a4a20', 0.012, ticks);
      fillBox(c, 0.44, -0.08, 0.12, 0.16, '#b8c0c7');
    },
    glowstick(c) {
      c.fillStyle = 'rgba(123, 224, 74, 0.35)';
      rounded(c, -0.54, -0.16, 1.08, 0.32, 0.16);
      c.fill();
      fillRound(c, -0.48, -0.08, 0.96, 0.16, 0.08, '#9ff07a');
      fillBox(c, -0.5, -0.06, 0.08, 0.12, '#39414d');
      c.fillStyle = 'rgba(255, 255, 255, 0.6)';
      c.fillRect(-0.36, -0.05, 0.7, 0.03);
    },
    gelpen(c) {
      fillRound(c, -0.5, -0.08, 0.76, 0.16, 0.06, '#d9b3ec');
      c.fillStyle = '#b455d6';
      c.fillRect(-0.44, -0.025, 0.66, 0.05);
      fillPoly(c, [[0.26, -0.08], [0.26, 0.08], [0.44, 0.03], [0.44, -0.03]], '#b455d6');
      fillPoly(c, [[0.44, -0.03], [0.44, 0.03], [0.52, 0]], '#7a2f96');
      starPath(c, -0.1, -0.2, 0.07);
      ink(c, '#ffe27a');
    },
    pinwheel(c) {
      lines(c, '#a3662a', 0.05, [[0, 0, 0.1, 0.56]]);
      ['#d3262f', '#f6c21c', '#2a7de1', '#1d8f4e'].forEach((hex, i) => {
        const a = (i * Math.PI) / 2, at = (r, turn) => [Math.cos(a + turn) * r, Math.sin(a + turn) * r];
        fillPoly(c, [[0, 0], at(0.44, 0), at(0.3, 0.9)], hex);
      });
      fillCircle(c, 0, 0, 0.05, '#fdfdfb');
    },
    stopwatch(c) {
      fillBox(c, -0.06, -0.52, 0.12, 0.1, '#7c8a99');
      fillCircle(c, 0, 0.04, 0.42, '#c7ced6');
      fillCircle(c, 0, 0.04, 0.34, '#fdfdfb');
      const ticks = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        ticks.push([Math.cos(a) * 0.26, 0.04 + Math.sin(a) * 0.26, Math.cos(a) * 0.31, 0.04 + Math.sin(a) * 0.31]);
      }
      lines(c, GRAPHITE, 0.018, ticks);
      lines(c, '#d3262f', 0.03, [[0, 0.04, 0.14, -0.18]]);
    },
    microscope(c) {
      fillRound(c, -0.36, 0.34, 0.72, 0.14, 0.04, '#39414d');
      c.beginPath();
      c.moveTo(-0.16, 0.36);
      c.quadraticCurveTo(-0.36, 0, -0.08, -0.24);
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.11;
      c.stroke();
      c.strokeStyle = '#566f8c';
      c.lineWidth = 0.07;
      c.stroke();
      fillBox(c, -0.02, 0.14, 0.36, 0.06, '#7c8a99');
      fillPoly(c, [[-0.06, -0.52], [0.08, -0.56], [0.24, 0.06], [0.1, 0.1]], '#c7ced6');
    },
    prism(c) {
      RAINBOW_INK.slice(0, 5).forEach((hex, i) => lines(c, hex, 0.04, [[0.1, 0, 0.56, -0.2 + i * 0.1]]));
      fillPoly(c, [[-0.4, 0.34], [0.36, 0.34], [-0.02, -0.38]], 'rgba(200, 235, 250, 0.9)');
      lines(c, '#fdfdfb', 0.035, [[-0.56, -0.1, -0.2, -0.02]]);
    },
    magnet(c) {
      c.beginPath();
      c.moveTo(-0.3, -0.34);
      c.lineTo(-0.3, 0.06);
      c.arc(0, 0.06, 0.3, Math.PI, 0, true);
      c.lineTo(0.3, -0.34);
      c.lineCap = 'butt';
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.22;
      c.stroke();
      c.strokeStyle = '#d3262f';
      c.lineWidth = 0.16;
      c.stroke();
      c.lineCap = 'round';
      fillBox(c, -0.41, -0.5, 0.22, 0.16, '#c7ced6');
      fillBox(c, 0.19, -0.5, 0.22, 0.16, '#c7ced6');
    },
    xylophone(c) {
      lines(c, '#7a4a20', 0.045, [[-0.5, -0.28, 0.5, -0.14], [-0.5, 0.28, 0.5, 0.14]]);
      RAINBOW_INK.forEach((hex, i) => {
        const x = -0.4 + i * 0.16, h = 0.36 - i * 0.035;
        fillRound(c, x - 0.055, -h, 0.11, h * 2, 0.03, hex);
      });
    },
    indexcards(c) {
      [[-0.12, -0.16, -0.2, '#f6de7a'], [0, -0.06, 0, '#9fd0f7'], [0.1, 0.06, 0.18, '#fdfdfb']].forEach(([x, y, turn, hex]) => {
        c.save();
        c.translate(x, y);
        c.rotate(turn);
        fillBox(c, -0.32, -0.22, 0.64, 0.44, hex);
        lines(c, 'rgba(70, 110, 170, 0.6)', 0.014, [[-0.26, -0.06, 0.26, -0.06], [-0.26, 0.05, 0.26, 0.05], [-0.26, 0.15, 0.1, 0.15]]);
        lines(c, 'rgba(211, 38, 47, 0.6)', 0.014, [[-0.26, -0.15, 0.26, -0.15]]);
        c.restore();
      });
    },
    beaker(c) {
      fillPoly(c, [[0.3, -0.42], [0.42, -0.5], [0.42, -0.42]], '#e9f4f8');
      fillBox(c, -0.3, -0.42, 0.6, 0.84, '#e9f4f8');
      fillBox(c, -0.3, 0, 0.6, 0.42, '#3fbf8a');
      lines(c, OUTLINE, 0.015, [[-0.3, -0.24, -0.16, -0.24], [-0.3, -0.08, -0.2, -0.08]]);
      fillCircle(c, 0.08, -0.12, 0.05, '#9fe0a0');
      fillCircle(c, -0.06, -0.26, 0.035, '#9fe0a0');
    },
    paperfan(c) {
      for (let i = 0; i < 7; i++) {
        const a0 = -1.1 + (i * 2.2) / 7, a1 = a0 + 2.2 / 7;
        fillPoly(c, [[-0.4, 0], [-0.4 + Math.cos(a0) * 0.9, Math.sin(a0) * 0.9], [-0.4 + Math.cos(a1) * 0.9, Math.sin(a1) * 0.9]], i % 2 ? '#e88fb4' : '#fdfdfb');
      }
      fillCircle(c, -0.4, 0, 0.06, '#a3662a');
    },
    bigcompass(c) {
      lines(c, OUTLINE, 0.1, [[-0.46, 0, 0.4, -0.28], [-0.46, 0, 0.4, 0.28]]);
      lines(c, '#a3662a', 0.065, [[-0.46, 0, 0.4, -0.28], [-0.46, 0, 0.4, 0.28]]);
      fillCircle(c, -0.46, 0, 0.1, '#7a4a20');
      fillCircle(c, 0.42, -0.29, 0.07, '#d3262f');
      fillBox(c, 0.36, 0.24, 0.18, 0.08, '#f4f1e8');
    },
    copyroom(c) {
      for (let i = 0; i < 3; i++) fillBox(c, 0.1 + i * 0.05, -0.56 + i * 0.06, 0.34, 0.24, '#fdfdfb');
      fillBox(c, -0.48, -0.16, 0.96, 0.6, '#9aa3ab');
      fillBox(c, -0.5, -0.3, 1, 0.16, '#5c656e');
      fillBox(c, -0.34, 0, 0.5, 0.06, '#7be04a');
      fillBox(c, 0.24, 0.2, 0.3, 0.16, '#fdfdfb');
      fillCircle(c, -0.36, 0.26, 0.04, '#1d9a54');
    },
    gymclass(c) {
      fillCircle(c, 0, 0, 0.42, '#d3262f');
      c.strokeStyle = '#8f1420';
      c.lineWidth = 0.03;
      c.beginPath();
      c.ellipse(0, 0, 0.42, 0.16, 0, 0, TAU);
      c.moveTo(0, -0.42);
      c.lineTo(0, 0.42);
      c.stroke();
      c.fillStyle = 'rgba(255, 255, 255, 0.35)';
      circle(c, -0.15, -0.17, 0.08);
      c.fill();
    },
    observatory(c) {
      lines(c, OUTLINE, 0.09, [[0, -0.1, 0.36, -0.52]]);
      lines(c, '#2f4a8a', 0.055, [[0, -0.1, 0.36, -0.52]]);
      fillBox(c, -0.42, 0.04, 0.84, 0.4, '#c7ced6');
      c.beginPath();
      c.arc(0, 0.04, 0.42, Math.PI, 0);
      c.closePath();
      ink(c, '#e9f4f8');
      fillBox(c, -0.06, -0.36, 0.12, 0.4, '#2f4a8a');
      fillBox(c, -0.1, 0.24, 0.2, 0.2, '#5a6470');
      starPath(c, -0.36, -0.4, 0.07);
      ink(c, '#ffe27a');
    },
    foodfight(c) {
      fillRound(c, -0.5, -0.32, 1, 0.64, 0.08, '#e8862a');
      fillRound(c, -0.42, -0.24, 0.4, 0.48, 0.05, '#f4c48a');
      fillRound(c, 0.04, -0.24, 0.38, 0.22, 0.05, '#f4c48a');
      fillRound(c, 0.04, 0.02, 0.38, 0.22, 0.05, '#f4c48a');
      blobPath(c, -0.22, 0, 0.13, 2, 0);
      ink(c, '#f6e7b0');
      fillCircle(c, 0.15, -0.13, 0.06, '#1d8f4e');
      fillCircle(c, 0.3, -0.13, 0.06, '#1d8f4e');
      fillRound(c, 0.09, 0.07, 0.28, 0.12, 0.05, '#c0303a');
    },
    detentionhall(c) {
      fillBox(c, -0.42, -0.48, 0.84, 0.96, '#7a4a20');
      fillBox(c, -0.3, -0.36, 0.6, 0.84, '#a3662a');
      fillRound(c, -0.26, -0.3, 0.52, 0.18, 0.03, '#f7b3c6');
      lines(c, RED_PEN, 0.02, [[-0.18, -0.21, 0.18, -0.21]]);
      fillCircle(c, 0.18, 0.1, 0.04, '#e3b23c');
      fillBox(c, -0.18, -0.04, 0.24, 0.14, '#cfe9f7');
    },
    magnifier(c) {
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.13;
      c.beginPath();
      c.moveTo(-0.52, 0);
      c.lineTo(-0.12, 0);
      c.stroke();
      c.strokeStyle = '#7a4a20';
      c.lineWidth = 0.085;
      c.stroke();
      circle(c, 0.16, 0, 0.32);
      ink(c, '#d6eef8');
      c.strokeStyle = '#39414d';
      c.lineWidth = 0.07;
      c.stroke();
      c.strokeStyle = '#fff';
      c.lineWidth = 0.04;
      c.beginPath();
      c.arc(0.16, 0, 0.2, 3.6, 4.6);
      c.stroke();
    },
    bell(c) {
      circle(c, 0, 0, 0.38);
      ink(c, '#e3b23c');
      circle(c, 0, 0, 0.24);
      ink(c, '#f2cf6b');
      circle(c, 0, 0, 0.08);
      ink(c, '#7a5a12');
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.05;
      c.beginPath();
      c.moveTo(0.26, 0.26);
      c.lineTo(0.44, 0.44);
      c.stroke();
      circle(c, 0.46, 0.46, 0.07);
      ink(c, '#aeb7c2');
    },
    sandtimer(c) {
      polygon(c, [[-0.24, -0.38], [0.24, -0.38], [0, 0]]);
      ink(c, '#e6f3f8');
      polygon(c, [[-0.24, 0.38], [0.24, 0.38], [0, 0]]);
      ink(c, '#e6f3f8');
      c.fillStyle = '#e0b35a';
      polygon(c, [[-0.12, -0.22], [0.12, -0.22], [0, -0.05]]);
      c.fill();
      polygon(c, [[-0.21, 0.36], [0.21, 0.36], [0, 0.14]]);
      c.fill();
      for (const y of [-0.46, 0.38]) {
        box(c, -0.34, y, 0.68, 0.08);
        ink(c, '#a3662a');
      }
      c.strokeStyle = '#7a4a20';
      c.lineWidth = 0.035;
      c.beginPath();
      c.moveTo(-0.3, -0.38);
      c.lineTo(-0.3, 0.38);
      c.moveTo(0.3, -0.38);
      c.lineTo(0.3, 0.38);
      c.stroke();
    },
    globe(c) {
      c.strokeStyle = '#7a4a20';
      c.lineWidth = 0.05;
      c.beginPath();
      c.arc(0, 0, 0.42, 2.2, 5.2);
      c.stroke();
      circle(c, 0, 0, 0.34);
      ink(c, '#3a8fd9');
      c.fillStyle = '#3fa35b';
      blobPath(c, -0.1, -0.1, 0.13, 3, 0);
      c.fill();
      blobPath(c, 0.13, 0.12, 0.1, 7, 0);
      c.fill();
      blobPath(c, -0.12, 0.18, 0.06, 11, 0);
      c.fill();
    },
    abacus(c) {
      rounded(c, -0.5, -0.36, 1, 0.72, 0.05);
      ink(c, '#b9834a');
      box(c, -0.42, -0.28, 0.84, 0.56);
      ink(c, '#f3e7cf');
      const colors = ['#d3262f', '#f6c21c', '#1d8f4e', '#2a7de1'];
      colors.forEach((hex, row) => {
        const y = -0.21 + row * 0.14;
        c.strokeStyle = '#7a4a20';
        c.lineWidth = 0.015;
        c.beginPath();
        c.moveTo(-0.42, y);
        c.lineTo(0.42, y);
        c.stroke();
        for (let i = 0; i < 4; i++) {
          circle(c, -0.32 + i * 0.09 + (row % 2) * 0.32, y, 0.05);
          ink(c, hex);
        }
      });
    },
    telescope(c) {
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.035;
      c.beginPath();
      c.moveTo(-0.05, 0.05);
      c.lineTo(-0.3, 0.42);
      c.moveTo(-0.05, 0.05);
      c.lineTo(0.15, 0.42);
      c.stroke();
      polygon(c, [[-0.5, -0.07], [0.3, -0.14], [0.3, 0.14], [-0.5, 0.07]]);
      ink(c, '#2f4a8a');
      box(c, -0.12, -0.12, 0.06, 0.24);
      ink(c, '#e8c56a');
      box(c, 0.3, -0.16, 0.12, 0.32);
      ink(c, '#39414d');
      circle(c, 0.44, 0, 0.12);
      ink(c, '#cfe9f7');
    },
    lunchbox(c) {
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.06;
      c.beginPath();
      c.arc(0, -0.34, 0.14, Math.PI, 0);
      c.stroke();
      rounded(c, -0.48, -0.34, 0.96, 0.7, 0.1);
      ink(c, '#2fa8a0');
      c.fillStyle = '#16706a';
      c.fillRect(-0.46, -0.16, 0.92, 0.05);
      circle(c, 0.02, 0.1, 0.13);
      ink(c, '#d3262f');
      polygon(c, [[0.02, -0.03], [0.14, -0.1], [0.08, 0.0]]);
      ink(c, '#3fa35b');
    },
    megaphone(c) {
      box(c, -0.5, -0.06, 0.2, 0.12);
      ink(c, '#39414d');
      polygon(c, [[-0.3, -0.12], [0.36, -0.34], [0.36, 0.34], [-0.3, 0.12]]);
      ink(c, '#e8562a');
      c.fillStyle = '#fdfdfb';
      polygon(c, [[-0.1, -0.15], [0.12, -0.22], [0.12, 0.22], [-0.1, 0.15]]);
      c.fill();
      c.beginPath();
      c.ellipse(0.38, 0, 0.06, 0.34, 0, 0, TAU);
      ink(c, '#f7a07e');
    },
    lasercutter(c) {
      rounded(c, -0.52, -0.4, 1.04, 0.8, 0.06);
      ink(c, '#39414d');
      box(c, -0.42, -0.3, 0.84, 0.6);
      ink(c, '#a9c9e6');
      c.strokeStyle = '#e0201f';
      c.lineWidth = 0.035;
      c.beginPath();
      c.moveTo(-0.36, 0.1);
      c.lineTo(0.36, 0.1);
      c.stroke();
      box(c, -0.06, -0.3, 0.14, 0.42);
      ink(c, '#d7dbe2');
      circle(c, 0.01, 0.1, 0.05);
      ink(c, '#ff5a50');
    },
    clock(c) {
      circle(c, 0, 0, 0.44);
      ink(c, '#7a4a20');
      circle(c, 0, 0, 0.36);
      ink(c, '#fdfdfb');
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.025;
      c.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        c.moveTo(Math.cos(a) * 0.3, Math.sin(a) * 0.3);
        c.lineTo(Math.cos(a) * 0.35, Math.sin(a) * 0.35);
      }
      c.moveTo(0, 0);
      c.lineTo(0, -0.25);
      c.moveTo(0, 0);
      c.lineTo(0.18, 0.06);
      c.stroke();
      circle(c, 0, 0, 0.035);
      ink(c, '#d3262f');
    },
    desk(c) {
      rounded(c, -0.54, -0.38, 1.08, 0.76, 0.05);
      ink(c, '#a3662a');
      box(c, -0.44, -0.26, 0.38, 0.28);
      ink(c, '#fdfdfb');
      box(c, -0.4, -0.3, 0.38, 0.28);
      ink(c, '#fdfdfb');
      box(c, 0.08, -0.26, 0.34, 0.1);
      ink(c, '#2a7de1');
      box(c, 0.1, -0.16, 0.3, 0.1);
      ink(c, '#d3262f');
      circle(c, 0.24, 0.18, 0.12);
      ink(c, '#d3262f');
      polygon(c, [[0.24, 0.06], [0.34, 0.0], [0.3, 0.08]]);
      ink(c, '#3fa35b');
    },
    volcano(c) {
      box(c, -0.54, 0.26, 1.08, 0.14);
      ink(c, '#b9834a');
      polygon(c, [[-0.46, 0.28], [-0.12, -0.3], [0.12, -0.3], [0.46, 0.28]]);
      ink(c, '#8a5a32');
      polygon(c, [[-0.14, -0.28], [0.14, -0.28], [0.08, -0.1], [0.02, 0.02], [-0.04, -0.12], [-0.1, -0.06]]);
      ink(c, '#f0711a');
      circle(c, 0.02, -0.4, 0.08);
      ink(c, '#ffb27a');
    },
    bus(c) {
      rounded(c, -0.54, -0.26, 1.08, 0.52, 0.08);
      ink(c, '#f6c21c');
      c.fillStyle = '#23262c';
      c.fillRect(-0.5, -0.03, 1, 0.06);
      for (let i = 0; i < 5; i++) {
        box(c, -0.44 + i * 0.16, -0.2, 0.12, 0.12);
        ink(c, '#cfe9f7');
      }
      box(c, 0.38, -0.2, 0.12, 0.4);
      ink(c, '#cfe9f7');
      circle(c, -0.3, 0.17, 0.06);
      ink(c, '#d3262f');
    },
    // Mythics.
    timemachine(c) {
      burstPath(c, 0, 0, 0.5, 0.43, 12);
      ink(c, '#e3b23c');
      fillCircle(c, 0, 0, 0.36, '#14506a');
      fillCircle(c, 0, 0, 0.28, '#e9f7fb');
      lines(c, OUTLINE, 0.04, [[0, 0, 0, -0.19], [0, 0, -0.13, 0.06]]);
      c.strokeStyle = '#d3262f';
      c.lineWidth = 0.045;
      c.beginPath();
      c.arc(0, 0, 0.2, -0.4, Math.PI * 1.1);
      c.stroke();
      fillPoly(c, [[0.12, -0.16], [0.26, -0.14], [0.2, -0.02]], '#d3262f');
    },
    blackhole(c) {
      const glow = c.createRadialGradient(0, 0, 0.1, 0, 0, 0.58);
      glow.addColorStop(0, '#0b0418');
      glow.addColorStop(0.45, '#3b1f6b');
      glow.addColorStop(0.75, 'rgba(142, 68, 201, 0.55)');
      glow.addColorStop(1, 'rgba(142, 68, 201, 0)');
      c.fillStyle = glow;
      circle(c, 0, 0, 0.58);
      c.fill();
      c.lineWidth = 0.05;
      ['#f6c21c', '#e8862a', '#e0569a'].forEach((hex, i) => {
        c.strokeStyle = hex;
        c.beginPath();
        c.ellipse(0, 0, 0.5 - i * 0.07, 0.2 - i * 0.035, -0.35, i, i + 4.6);
        c.stroke();
      });
      fillCircle(c, 0, 0, 0.17, '#07020f');
    },
    graduation(c) {
      fillRound(c, -0.42, 0.2, 0.84, 0.18, 0.09, '#f4ecd2');
      fillBox(c, -0.06, 0.18, 0.12, 0.22, '#d3262f');
      fillPoly(c, [[-0.24, -0.14], [0.24, -0.14], [0.2, 0.12], [-0.2, 0.12]], '#151d45');
      fillPoly(c, [[0, -0.48], [0.54, -0.22], [0, 0.04], [-0.54, -0.22]], '#1f2a5c');
      lines(c, '#f1cf6a', 0.035, [[0, -0.22, 0.4, -0.18], [0.4, -0.18, 0.4, 0.1]]);
      fillCircle(c, 0.4, 0.12, 0.06, '#f1cf6a');
    },
    supercomputer(c) {
      for (const x of [-0.5, 0.18]) {
        fillRound(c, x, -0.5, 0.32, 0.98, 0.04, '#26323a');
        for (let i = 0; i < 5; i++) {
          c.fillStyle = ['#7be04a', '#3aa6c9', '#f6c21c'][(i + (x > 0 ? 1 : 0)) % 3];
          c.fillRect(x + 0.06, -0.4 + i * 0.17, 0.2, 0.06);
        }
      }
      fillRound(c, -0.26, -0.24, 0.52, 0.42, 0.04, '#39414d');
      fillBox(c, -0.2, -0.18, 0.4, 0.3, '#0c4f3e');
      lines(c, '#7be04a', 0.03, [[-0.14, 0.02, -0.06, -0.08], [-0.06, -0.08, 0.02, 0.04], [0.02, 0.04, 0.14, -0.12]]);
      fillBox(c, -0.32, 0.26, 0.64, 0.14, '#c7ced6');
    },
    dragon(c) {
      // Faces +x, since it also flies down the path.
      [0.13, 0.17, 0.2, 0.2, 0.18].forEach((r, i) => fillCircle(c, -0.52 + i * 0.17, i % 2 ? 0.05 : -0.04, r, i % 2 ? '#f08a24' : '#d3262f'));
      fillPoly(c, [[-0.24, -0.1], [-0.4, -0.54], [0.02, -0.14]], '#f6c21c');
      fillPoly(c, [[-0.24, 0.1], [-0.4, 0.54], [0.02, 0.14]], '#f6c21c');
      fillRound(c, 0.12, -0.2, 0.34, 0.4, 0.12, '#d3262f');
      fillPoly(c, [[0.16, -0.18], [0.06, -0.4], [0.26, -0.2]], '#f1cf6a');
      fillPoly(c, [[0.16, 0.18], [0.06, 0.4], [0.26, 0.2]], '#f1cf6a');
      fillCircle(c, 0.3, -0.1, 0.06, '#fdfdfb');
      fillCircle(c, 0.3, 0.1, 0.06, '#fdfdfb');
      fillPoly(c, [[0.46, -0.1], [0.62, -0.03], [0.54, 0], [0.62, 0.05], [0.46, 0.1]], '#f08a24');
    },
    chainreaction(c) {
      c.lineWidth = 0.05;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.ellipse(0, 0, 0.5, 0.19, (i * Math.PI) / 3, 0, TAU);
        c.strokeStyle = OUTLINE;
        c.lineWidth = 0.065;
        c.stroke();
        c.strokeStyle = ['#7be04a', '#3aa6c9', '#f08a24'][i];
        c.lineWidth = 0.035;
        c.stroke();
        const a = (i * Math.PI) / 3 + 0.2;
        fillCircle(c, Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0.06, ['#7be04a', '#3aa6c9', '#f08a24'][i]);
      }
      burstPath(c, 0, 0, 0.2, 0.12, 9);
      ink(c, '#f6c21c');
    },
    satellite(c) {
      fillPoly(c, [[-0.06, 0.16], [0.06, 0.16], [0.16, 0.6], [-0.16, 0.6]], 'rgba(224, 32, 31, 0.55)');
      for (const x of [-0.56, 0.2]) {
        fillBox(c, x, -0.24, 0.36, 0.28, '#2a7de1');
        lines(c, '#cfe0f5', 0.015, [[x + 0.12, -0.24, x + 0.12, 0.04], [x + 0.24, -0.24, x + 0.24, 0.04], [x, -0.1, x + 0.36, -0.1]]);
      }
      fillRound(c, -0.18, -0.34, 0.36, 0.44, 0.06, '#c7ced6');
      lines(c, OUTLINE, 0.03, [[0, -0.34, 0, -0.5]]);
      fillCircle(c, 0, -0.52, 0.05, '#e0201f');
      fillPoly(c, [[-0.1, 0.1], [0.1, 0.1], [0.05, 0.2], [-0.05, 0.2]], '#39414d');
    },
    encyclopedia(c) {
      fillRound(c, -0.5, 0.2, 1, 0.22, 0.04, '#23315e');
      fillRound(c, -0.44, 0, 0.88, 0.2, 0.04, '#7a1f2a');
      fillPoly(c, [[0, -0.02], [-0.52, -0.12], [-0.52, -0.5], [0, -0.38]], '#fdfbf0');
      fillPoly(c, [[0, -0.02], [0.52, -0.12], [0.52, -0.5], [0, -0.38]], '#f6f1dc');
      lines(c, 'rgba(90, 70, 40, 0.6)', 0.016, [[-0.44, -0.4, -0.08, -0.32], [-0.44, -0.3, -0.08, -0.22], [-0.44, -0.2, -0.2, -0.15], [0.08, -0.32, 0.44, -0.4], [0.08, -0.22, 0.44, -0.3], [0.08, -0.12, 0.3, -0.17]]);
      fillBox(c, -0.3, 0.07, 0.6, 0.05, '#e3b23c');
      fillBox(c, -0.34, 0.28, 0.68, 0.05, '#e3b23c');
    },
    peprally(c) {
      for (const [x, hex] of [[-0.28, '#f08a24'], [0.28, '#3b6fd9']]) {
        burstPath(c, x, 0.12, 0.3, 0.2, 13);
        ink(c, hex);
        burstPath(c, x, 0.12, 0.17, 0.1, 11);
        c.fillStyle = 'rgba(255, 255, 255, 0.55)';
        c.fill();
      }
      starPath(c, 0, -0.28, 0.26);
      ink(c, '#f6c21c');
    },
    snowday(c) {
      fillCircle(c, 0, 0, 0.5, '#2c5f94');
      c.strokeStyle = '#eaf6ff';
      c.lineWidth = 0.055;
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3, x = Math.cos(a), y = Math.sin(a);
        c.moveTo(0, 0);
        c.lineTo(x * 0.42, y * 0.42);
        for (const turn of [-0.6, 0.6]) {
          c.moveTo(x * 0.26, y * 0.26);
          c.lineTo(x * 0.26 + Math.cos(a + turn) * 0.14, y * 0.26 + Math.sin(a + turn) * 0.14);
        }
      }
      c.stroke();
    },
    glue(c) {
      rounded(c, -0.46, -0.2, 0.62, 0.4, 0.07);
      ink(c, '#fdfdfb');
      box(c, -0.36, -0.2, 0.34, 0.4);
      ink(c, '#2a7de1');
      c.fillStyle = '#fdfdfb';
      c.fillRect(-0.3, -0.09, 0.22, 0.18);
      polygon(c, [[0.16, -0.17], [0.16, 0.17], [0.32, 0.055], [0.32, -0.055]]);
      ink(c, '#2a7de1');
      polygon(c, [[0.32, -0.04], [0.32, 0.04], [0.47, 0.014], [0.47, -0.014]]);
      ink(c, '#175bb0');
    },
    compass(c, ready) {
      const spread = ready ? 0.3 : 0.2;
      const leg = (y, width, color) => {
        c.strokeStyle = color;
        c.lineWidth = width;
        c.beginPath();
        c.moveTo(-0.3, 0);
        c.lineTo(0.42, y);
        c.stroke();
      };
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.016;
      c.beginPath();
      c.arc(-0.3, 0, 0.42, -0.42, 0.42);
      c.stroke();
      for (const y of [-spread, spread]) {
        leg(y, 0.1, OUTLINE);
        leg(y, 0.058, '#b3bcc7');
      }
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.022;
      c.beginPath();
      c.moveTo(0.42, -spread);
      c.lineTo(0.54, -spread * 1.14);
      c.stroke();
      c.save();
      c.translate(0.42, spread);
      c.rotate(Math.atan2(spread, 0.72));
      box(c, -0.05, -0.045, 0.1, 0.09);
      ink(c, '#f6c21c');
      polygon(c, [[0.05, -0.045], [0.05, 0.045], [0.14, 0]]);
      ink(c, '#33363d');
      c.restore();
      circle(c, -0.44, 0, 0.04);
      ink(c, '#b3bcc7');
      circle(c, -0.3, 0, 0.1);
      ink(c, '#d3262f');
    },
    tape(c) {
      c.beginPath();
      c.arc(-0.1, 0, 0.36, -Math.PI / 2, Math.PI / 2, true);
      c.lineTo(0.5, 0.12);
      c.lineTo(0.5, -0.1);
      c.closePath();
      ink(c, '#1f8a86');
      circle(c, -0.1, 0, 0.28);
      ink(c, '#a6e6dd');
      circle(c, -0.1, 0, 0.13);
      ink(c, '#14625f');
      polygon(c, [[-0.1, -0.28], [0.5, -0.1], [0.5, -0.03], [-0.1, -0.21]]);
      ink(c, '#d3f2ed');
      c.fillStyle = OUTLINE;
      for (let i = 0; i < 4; i++) {
        polygon(c, [[0.5, -0.1 + i * 0.055], [0.5, -0.05 + i * 0.055], [0.56, -0.075 + i * 0.055]]);
        c.fill();
      }
    },
    highlighter(c) {
      rounded(c, -0.5, -0.16, 0.66, 0.32, 0.06);
      ink(c, '#ff4fa3');
      c.fillStyle = '#ff94c8';
      c.fillRect(-0.46, -0.125, 0.52, 0.06);
      box(c, 0.08, -0.16, 0.08, 0.32);
      ink(c, '#d42a80');
      polygon(c, [[0.16, -0.16], [0.16, 0.16], [0.3, 0.1], [0.3, -0.1]]);
      ink(c, '#f7eef3');
      polygon(c, [[0.3, -0.1], [0.3, 0.1], [0.5, -0.02], [0.5, -0.1]]);
      ink(c, '#ff2a8f');
    },
    case(c) {
      // A pencil and a ruler poking out of the top
      box(c, -0.3, -0.46, 0.1, 0.25);
      ink(c, '#f6c21c');
      polygon(c, [[-0.3, -0.46], [-0.2, -0.46], [-0.25, -0.56]]);
      ink(c, '#33363d');
      box(c, 0.1, -0.5, 0.18, 0.3);
      ink(c, '#e4b871');
      rounded(c, -0.52, -0.3, 1.04, 0.62, 0.13);
      ink(c, '#5a3fb8');
      c.fillStyle = '#7a60d6';
      c.fillRect(-0.44, 0.02, 0.88, 0.05);
      c.strokeStyle = '#d7dbe2';
      c.lineWidth = 0.04;
      c.setLineDash([0.035, 0.03]);
      c.beginPath();
      c.moveTo(-0.44, -0.14);
      c.lineTo(0.44, -0.14);
      c.stroke();
      c.setLineDash([]);
      rounded(c, 0.22, -0.16, 0.07, 0.2, 0.02);
      ink(c, '#d7dbe2');
    },
  };

  const sprites = new Map();

  function sprite(type, ready, tint) {
    const key = `${type}|${ready}|${tint}`;
    if (sprites.has(key)) return sprites.get(key);
    const layer = document.createElement('canvas');
    layer.width = layer.height = SPRITE;
    const c = layer.getContext('2d');
    c.translate(SPRITE / 2, SPRITE / 2);
    c.scale(SPRITE / SPAN, SPRITE / SPAN);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    ART[type](c, ready);
    if (tint) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = tint;
      c.fillRect(0, 0, SPRITE, SPRITE);
    }
    sprites.set(key, layer);
    return layer;
  }

  // Data URLs of the same art, for the shop, recipe card and dialogs.
  const icons = new Map();

  // Secret supplies show as a dark shape until you make them.
  PC.SECRET_TINT = 'rgba(35, 38, 44, 0.85)';

  PC.supplyIcon = function (type, angle = -Math.PI / 4, tint = null) {
    const key = type + angle + tint;
    if (icons.has(key)) return icons.get(key);
    const layer = document.createElement('canvas');
    layer.width = layer.height = 128;
    const c = layer.getContext('2d');
    c.translate(64, 64);
    if (!PC.SUPPLIES[type].still) c.rotate(angle);
    c.drawImage(sprite(type, true, tint), -64, -64, 128, 128);
    icons.set(key, layer.toDataURL());
    return icons.get(key);
  };

  // ---- Enemies ------------------------------------------------------------
  // Drawn facing +x, centred on 0,0.

  const ENEMY_ART = {
    scribble(c, r, seed, frame) {
      circle(c, 0, 0, r * 0.82);
      c.fillStyle = 'rgba(251, 252, 247, 0.92)';
      c.fill();
      c.strokeStyle = BALLPOINT;
      c.lineWidth = 0.03;
      scribblePath(c, 0, 0, r, seed, frame, 15);
      c.stroke();
    },
    plane(c, r) {
      polygon(c, [[r * 1.55, 0], [-r * 1.05, -r * 1.05], [-r * 0.55, 0], [-r * 1.05, r * 1.05]]);
      ink(c, '#fdfdfb');
      polygon(c, [[r * 1.55, 0], [-r * 0.55, 0], [-r * 1.05, r * 1.05]]);
      c.fillStyle = 'rgba(112, 136, 170, 0.32)';
      c.fill();
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.016;
      c.beginPath();
      c.moveTo(r * 1.55, 0);
      c.lineTo(-r * 0.55, 0);
      c.stroke();
    },
    spitball(c, r, seed, frame) {
      blobPath(c, 0, 0, r, seed, frame);
      ink(c, '#dfe5e8');
      circle(c, -r * 0.3, -r * 0.35, r * 0.18);
      c.fillStyle = '#fff';
      c.fill();
    },
    textbook(c, r) {
      const w = r * 1.25, h = r * 0.98;
      rounded(c, -w, -h, w * 2, h * 2, r * 0.12);
      ink(c, '#8c2f39');
      c.fillStyle = '#6b222b';
      c.fillRect(-w + 0.012, -h + 0.012, w * 0.36, h * 2 - 0.024);
      c.fillStyle = '#f1ecdf';
      c.fillRect(-w * 0.62, h - 0.05, w * 1.58, 0.036);
      c.strokeStyle = '#e8c56a';
      c.lineWidth = 0.02;
      c.beginPath();
      c.moveTo(-w * 0.4, -h * 0.5);
      c.lineTo(w * 0.15, -h * 0.5);
      c.moveTo(-w * 0.4, -h * 0.15);
      c.lineTo(w * 0.05, -h * 0.15);
      c.stroke();
    },
    crumple(c, r, seed, frame) {
      const points = [];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU, d = r * (0.84 + 0.24 * hash(seed + i * 1.9 + frame * 0.25));
        points.push([Math.cos(a) * d, Math.sin(a) * d]);
      }
      polygon(c, points);
      ink(c, '#f4f3ec');
      c.strokeStyle = 'rgba(70, 80, 92, 0.6)';
      c.lineWidth = 0.014;
      c.beginPath();
      points.forEach(([x, y], i) => {
        if (i % 2) return;
        c.moveTo(x * 0.92, y * 0.92);
        c.lineTo(x * 0.2 + hash(seed + i) * r * 0.3, y * 0.2);
      });
      c.stroke();
    },
    quiz(c, r) {
      ENEMY_ART.exam(c, r);
      c.fillStyle = 'rgba(42, 125, 225, 0.16)';
      c.fillRect(-r * 1.07, -r * 1.35, r * 2.14, r * 0.46);
    },
    flash(c, r) {
      const w = r * 1.35, h = r * 0.95;
      box(c, -w, -h, w * 2, h * 2);
      ink(c, '#fdfdfb');
      c.fillStyle = '#9fc7ef';
      c.fillRect(-w + 0.01, -h + 0.01, w * 0.6, h * 2 - 0.02);
      c.strokeStyle = '#d3262f';
      c.lineWidth = 0.014;
      c.beginPath();
      c.moveTo(-w, -h * 0.45);
      c.lineTo(w, -h * 0.45);
      c.stroke();
    },
    ink(c, r, seed, frame) {
      blobPath(c, 0, 0, r, seed, frame);
      ink(c, '#4a5bc4');
      for (let i = 0; i < 3; i++) {
        circle(c, -r * 0.5 + i * r * 0.3, -r * 0.45 + i * r * 0.32, r * 0.09);
        c.fillStyle = '#d7e0ff';
        c.fill();
      }
    },
    cheat(c, r) {
      const w = r * 0.95, h = r * 1.1;
      polygon(c, [[-w, -h], [w * 0.5, -h], [w, -h * 0.5], [w, h], [-w, h]]);
      ink(c, '#fdfdfb');
      c.strokeStyle = 'rgba(40, 60, 110, 0.6)';
      c.lineWidth = 0.012;
      c.beginPath();
      for (let i = 0; i < 5; i++) {
        c.moveTo(-w * 0.75, -h * 0.65 + i * h * 0.33);
        c.lineTo(w * 0.35, -h * 0.65 + i * h * 0.33);
      }
      c.stroke();
      c.fillStyle = '#1d9a54';
      c.fillRect(-r * 0.62, -r * 0.16, r * 0.5, r * 0.16);
      c.fillRect(-r * 0.45, -r * 0.33, r * 0.16, r * 0.5);
    },
    rough(c, r) {
      const w = r * 1.05, h = r * 1.15;
      box(c, -w, -h, w * 2, h * 2);
      ink(c, '#f7f3e4');
      c.strokeStyle = 'rgba(60, 70, 90, 0.5)';
      c.lineWidth = 0.012;
      c.beginPath();
      for (let i = 0; i < 5; i++) {
        c.moveTo(-w * 0.8, -h * 0.7 + i * h * 0.34);
        c.lineTo(w * 0.8, -h * 0.7 + i * h * 0.34);
      }
      c.stroke();
      c.strokeStyle = RED_PEN;
      c.lineWidth = 0.028;
      c.beginPath();
      c.moveTo(-w * 0.8, -h * 0.75);
      c.lineTo(w * 0.1, h * 0.75);
      c.moveTo(w * 0.1, -h * 0.75);
      c.lineTo(-w * 0.8, h * 0.75);
      c.stroke();
    },
    detention(c, r) {
      const w = r * 1.2, h = r * 0.9;
      box(c, -w, -h, w * 2, h * 2);
      ink(c, '#f7b3c6');
      c.strokeStyle = RED_PEN;
      c.lineWidth = 0.022;
      circle(c, -w * 0.35, 0, r * 0.5);
      c.stroke();
      c.beginPath();
      c.moveTo(-w * 0.35 - r * 0.34, r * 0.34);
      c.lineTo(-w * 0.35 + r * 0.34, -r * 0.34);
      c.stroke();
    },
    laminated(c, r) {
      const w = r * 1.05, h = r * 1.2;
      rounded(c, -w * 1.12, -h * 1.1, w * 2.24, h * 2.2, r * 0.2);
      ink(c, 'rgba(190, 228, 245, 0.75)');
      box(c, -w * 0.85, -h * 0.85, w * 1.7, h * 1.7);
      ink(c, '#fdfdfb');
      c.strokeStyle = 'rgba(90, 170, 210, 0.8)';
      c.lineWidth = 0.028;
      c.beginPath();
      c.moveTo(-w * 0.7, h * 0.3);
      c.lineTo(-w * 0.1, -h * 0.7);
      c.moveTo(-w * 0.6, h * 0.65);
      c.lineTo(w * 0.1, -h * 0.5);
      c.stroke();
    },
    essay(c, r) {
      const w = r * 1.05, h = r * 1.15;
      c.strokeStyle = '#e8862a';
      c.lineWidth = 0.03;
      c.beginPath();
      for (const y of [-0.6, 0, 0.6]) {
        c.moveTo(-w * 1.15, h * y);
        c.lineTo(-w * 1.7, h * y);
      }
      c.stroke();
      box(c, -w, -h, w * 2, h * 2);
      ink(c, '#fff1d8');
      c.strokeStyle = 'rgba(50, 60, 90, 0.65)';
      c.lineWidth = 0.014;
      for (let i = 0; i < 4; i++) {
        scribblePath(c, -w * 0.25, -h * 0.6 + i * h * 0.4, r * 0.36, i * 7 + 2, 0, 7);
        c.stroke();
      }
    },
    gum(c, r, seed, frame) {
      blobPath(c, 0, 0, r * 1.1, seed, frame);
      ink(c, '#f490bb');
      c.fillStyle = 'rgba(255, 255, 255, 0.6)';
      circle(c, -r * 0.35, -r * 0.4, r * 0.24);
      c.fill();
    },
    crane(c, r) {
      polygon(c, [[r * 0.1, -r * 0.1], [-r * 0.5, -r * 1.5], [-r * 0.7, -r * 0.1]]);
      ink(c, '#f7d9e3');
      polygon(c, [[r * 0.1, r * 0.1], [-r * 0.5, r * 1.5], [-r * 0.7, r * 0.1]]);
      ink(c, '#f7d9e3');
      polygon(c, [[r * 1.3, 0], [r * 0.1, -r * 0.38], [-r * 1.4, 0], [r * 0.1, r * 0.38]]);
      ink(c, '#fdf3f6');
    },
    makeup(c, r) {
      const w = r * 1.05, h = r * 1.15;
      box(c, -w, -h, w * 2, h * 2);
      ink(c, '#eaf7ea');
      c.strokeStyle = '#1d8f4e';
      c.lineWidth = 0.032;
      c.beginPath();
      c.arc(-w * 0.2, 0, r * 0.55, 0.6, 5.4);
      c.stroke();
      polygon(c, [[-w * 0.2 + r * 0.2, -r * 0.62], [-w * 0.2 + r * 0.62, -r * 0.5], [-w * 0.2 + r * 0.34, -r * 0.16]]);
      c.fillStyle = '#1d8f4e';
      c.fill();
    },
    monitor(c, r) {
      polygon(c, [[r, -r * 0.85], [r, r * 0.85], [-r * 0.2, r], [-r * 1.2, 0], [-r * 0.2, -r]]);
      ink(c, '#3b6fd9');
      polygon(c, [[r * 0.2, -r * 0.94], [r * 0.6, -r * 0.9], [-r * 0.5, r * 0.82], [-r * 0.82, r * 0.5]]);
      ink(c, '#f08a24');
    },
    excuse(c, r) {
      polygon(c, [[-r, -r * 0.85], [r * 0.9, -r], [r, r * 0.8], [r * 0.5, r], [-r * 0.9, r * 0.9]]);
      ink(c, '#fff6bf');
      c.strokeStyle = 'rgba(90, 60, 130, 0.75)';
      c.lineWidth = 0.016;
      c.beginPath();
      for (let i = 0; i < 4; i++) {
        const y = -r * 0.5 + i * r * 0.34;
        c.moveTo(-r * 0.7, y);
        c.quadraticCurveTo(-r * 0.4, y - r * 0.2, -r * 0.1, y);
        c.quadraticCurveTo(r * 0.1, y + r * 0.2, r * 0.3, y);
      }
      c.stroke();
    },
    stack(c, r) {
      const w = r * 1.15, h = r;
      [[-0.26, 0.26], [-0.13, 0.13], [0, 0]].forEach(([x, y]) => {
        box(c, -w + x * r, -h + y * r, w * 2, h * 2);
        ink(c, '#fdfdfb');
      });
      c.strokeStyle = 'rgba(70, 110, 170, 0.55)';
      c.lineWidth = 0.013;
      c.beginPath();
      for (let i = 0; i < 5; i++) {
        c.moveTo(-w * 0.8, -h * 0.65 + i * h * 0.32);
        c.lineTo(w * 0.3, -h * 0.65 + i * h * 0.32);
      }
      c.stroke();
    },
    copycat(c, r) {
      const w = r * 0.95, h = r * 1.05;
      box(c, -w - r * 0.3, -h + r * 0.28, w * 2, h * 2);
      ink(c, '#b9a7e6');
      box(c, -w, -h, w * 2, h * 2);
      ink(c, '#e9e1fb');
      for (const side of [-1, 1]) {
        polygon(c, [[w * 0.4, side * h], [w, side * h * 1.45], [w, side * h * 0.8]]);
        ink(c, '#e9e1fb');
      }
      c.strokeStyle = 'rgba(90, 63, 184, 0.65)';
      c.lineWidth = 0.014;
      c.beginPath();
      for (let i = 0; i < 4; i++) {
        c.moveTo(-w * 0.75, -h * 0.55 + i * h * 0.36);
        c.lineTo(w * 0.2, -h * 0.55 + i * h * 0.36);
      }
      c.stroke();
    },
    fine(c, r) {
      const w = r * 1.2, h = r * 1.05;
      rounded(c, -w, -h, w * 2, h * 2, r * 0.12);
      ink(c, '#1d7a52');
      c.fillStyle = '#f4ecd2';
      c.fillRect(-w * 0.9, h * 0.74, w * 1.8, h * 0.18);
      circle(c, -w * 0.28, -h * 0.1, r * 0.48);
      ink(c, '#f2c94c');
      c.strokeStyle = '#8a6400';
      c.lineWidth = 0.02;
      circle(c, -w * 0.28, -h * 0.1, r * 0.3);
      c.stroke();
    },
    member(c, r) {
      polygon(c, [[-r, -r], [r * 0.95, -r], [r * 0.7, -r * 0.35], [r, r * 0.2], [r * 0.75, r], [-r, r]]);
      ink(c, '#d9e8c8');
      c.strokeStyle = '#1d8f4e';
      c.lineWidth = 0.02;
      scribblePath(c, -r * 0.35, 0, r * 0.4, 5, 0, 9);
      c.stroke();
    },
    project(c, r) {
      const h = r * 1.3;
      polygon(c, [[-r * 0.5, -h * 0.8], [-r * 0.5, h * 0.8], [-r * 1.25, h], [-r * 1.25, -h]]);
      ink(c, '#9fd8a8');
      polygon(c, [[r * 0.5, -h * 0.8], [r * 0.5, h * 0.8], [r * 1.25, h], [r * 1.25, -h]]);
      ink(c, '#9fd8a8');
      box(c, -r * 0.5, -h * 0.8, r, h * 1.6);
      ink(c, '#eaf7ea');
      [['#f6c21c', -0.9, -0.6], ['#e0569a', -0.9, 0.5], ['#3aa6c9', 0.9, -0.6], ['#f08a24', 0.9, 0.5]].forEach(([hex, x, y]) => {
        box(c, r * x - r * 0.2, h * y - r * 0.18, r * 0.4, r * 0.36);
        c.fillStyle = hex;
        c.fill();
      });
    },
    dissertation(c, r) {
      const w = r * 1.15, h = r * 1.4;
      rounded(c, -w, -h, w * 2, h * 2, r * 0.1);
      ink(c, '#2a1d55');
      c.fillStyle = '#e3b23c';
      c.fillRect(-w * 0.86, -h * 0.94, w * 1.72, h * 0.08);
      c.fillRect(-w * 0.86, h * 0.86, w * 1.72, h * 0.08);
      box(c, -w * 0.62, -h * 0.5, w * 1.24, h);
      ink(c, '#f4ecd2');
    },
    review(c, r) {
      const w = r * 1.05, h = r * 1.2;
      box(c, -w, -h, w * 2, h * 2);
      ink(c, '#eef3fb');
      c.strokeStyle = 'rgba(70, 110, 170, 0.5)';
      c.lineWidth = 0.012;
      c.beginPath();
      for (let i = 0; i < 5; i++) {
        c.moveTo(-w * 0.8, -h * 0.6 + i * h * 0.3);
        c.lineTo(w * 0.2, -h * 0.6 + i * h * 0.3);
      }
      c.stroke();
      c.strokeStyle = '#2a7de1';
      c.lineWidth = 0.024;
      circle(c, -w * 0.35, h * 0.3, r * 0.42);
      c.stroke();
    },
    folder(c, r) {
      const w = r * 1.3, h = r * 1.02;
      box(c, -w - r * 0.1, -h - r * 0.18, w * 1.1, r * 0.5);
      ink(c, '#e0bf73');
      box(c, -w, -h, w * 2, h * 2);
      ink(c, '#f0d387');
      box(c, -w * 0.82, -h - r * 0.08, w * 1.6, r * 0.16);
      ink(c, '#fdfdfb');
    },
    dictionary(c, r) {
      const w = r * 1.35, h = r * 1.08;
      rounded(c, -w, -h, w * 2, h * 2, r * 0.1);
      ink(c, '#23315e');
      c.fillStyle = '#16204a';
      c.fillRect(-w + 0.012, -h + 0.012, w * 0.4, h * 2 - 0.024);
      c.fillStyle = '#e8c56a';
      for (let i = 0; i < 5; i++) c.fillRect(w - r * 0.14, -h * 0.8 + i * h * 0.38, r * 0.14, h * 0.18);
      c.strokeStyle = '#e8c56a';
      c.lineWidth = 0.022;
      c.beginPath();
      c.moveTo(-w * 0.4, -h * 0.55);
      c.lineTo(w * 0.25, -h * 0.55);
      c.stroke();
    },
    exam(c, r) {
      const w = r * 1.08, h = r * 1.36;
      box(c, -w, -h, w * 2, h * 2);
      ink(c, '#fdfdfb');
      c.fillStyle = 'rgba(211, 38, 47, 0.14)';
      c.fillRect(-w + 0.01, -h + 0.01, w * 2 - 0.02, h * 0.34);
      c.strokeStyle = 'rgba(70, 110, 170, 0.5)';
      c.lineWidth = 0.014;
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const y = -h * 0.5 + i * h * 0.3;
        c.moveTo(-w * 0.82, y);
        c.lineTo(w * 0.82, y);
      }
      c.stroke();
    },
  };

  // x, y and radius of each eye, as multiples of the enemy's size
  const EYES = {
    scribble: [0.4, 0.33, 0.24],
    plane: [0.55, 0.24, 0.2],
    spitball: [0.36, 0.36, 0.3],
    textbook: [0.66, 0.42, 0.25],
    crumple: [0.42, 0.33, 0.22],
    exam: [0.64, 0.5, 0.22],
    quiz: [0.64, 0.5, 0.22],
    flash: [0.62, 0.36, 0.24],
    ink: [0.4, 0.33, 0.24],
    cheat: [0.5, 0.45, 0.22],
    rough: [0.62, 0.42, 0.23],
    detention: [0.7, 0.38, 0.23],
    folder: [0.72, 0.45, 0.22],
    dictionary: [0.74, 0.45, 0.22],
    review: [0.55, 0.42, 0.23],
    laminated: [0.48, 0.4, 0.22],
    essay: [0.6, 0.42, 0.25],
    gum: [0.45, 0.36, 0.26],
    crane: [0.72, 0.16, 0.14],
    makeup: [0.66, 0.42, 0.22],
    monitor: [0.62, 0.4, 0.22],
    excuse: [0.6, 0.4, 0.22],
    stack: [0.75, 0.42, 0.21],
    copycat: [0.55, 0.42, 0.22],
    fine: [0.72, 0.42, 0.22],
    member: [0.38, 0.4, 0.23],
    project: [0.28, 0.62, 0.17],
    dissertation: [0.86, 0.42, 0.17],
  };

  function drawEyes(c, type, r) {
    const [x, y, size] = EYES[type];
    const eye = r * size;
    for (const side of [-1, 1]) {
      circle(c, r * x, side * r * y, eye);
      ink(c, '#fbfcfb');
      circle(c, r * x + eye * 0.35, side * r * y, eye * 0.52);
      c.fillStyle = '#15181c';
      c.fill();
    }
  }

  PC.enemyIcon = function (type) {
    if (icons.has(type)) return icons.get(type);
    const layer = document.createElement('canvas');
    layer.width = layer.height = 96;
    const c = layer.getContext('2d');
    const def = PC.ENEMIES[type], unit = 28 / def.size;
    c.translate(48, 48);
    c.scale(unit, unit);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    ENEMY_ART[type](c, def.size, 2.4, 0);
    drawEyes(c, type, def.size);
    icons.set(type, layer.toDataURL());
    return icons.get(type);
  };

  // ---- Fixed layers -------------------------------------------------------

  function makeLayer(res = RES) {
    const layer = document.createElement('canvas');
    layer.width = PC.COLS * res;
    layer.height = PC.ROWS * res;
    return layer;
  }

  // The page each map is drawn on. Marks multiply over it, so every page stays pale.
  // `minor` and `major` are the small and the cell-sized lines, or with `dots` just dots.
  const PAPERS = {
    graph: { base: PAPER, minor: 'rgba(96, 156, 210, 0.2)', major: 'rgba(70, 132, 196, 0.42)' },
    legal: { base: '#fdf6cc', minor: 'rgba(170, 140, 50, 0.14)', major: 'rgba(170, 120, 40, 0.32)' },
    mint: { base: '#edf7ec', minor: 'rgba(60, 150, 100, 0.2)', major: 'rgba(40, 130, 85, 0.36)' },
    pink: { base: '#fdeff1', minor: 'rgba(210, 110, 130, 0.14)', major: 'rgba(205, 90, 115, 0.32)' },
    sky: { base: '#eef6fd', minor: 'rgba(80, 130, 200, 0.13)', major: 'rgba(60, 110, 190, 0.3)' },
    dots: { base: '#fbfaf4', dots: 'rgba(90, 100, 120, 0.5)' },
    news: { base: '#f3f2ed', minor: 'rgba(90, 90, 90, 0.1)', major: 'rgba(70, 70, 70, 0.28)' },
    kraft: { base: '#f3e6cd', minor: 'rgba(130, 90, 40, 0.12)', major: 'rgba(130, 85, 35, 0.3)' },
    lawn: { base: '#f0f6dd', minor: 'rgba(110, 150, 50, 0.16)', major: 'rgba(95, 140, 45, 0.34)' },
    check: { base: '#fdf5f0', checks: 'rgba(214, 110, 90, 0.13)', major: 'rgba(200, 100, 85, 0.24)' },
  };

  // Things left on the desk. Nothing can be placed on them. Drawn about a cell wide.
  const PROPS = {
    mug(c) {
      c.strokeStyle = '#3b6fd9';
      c.lineWidth = 0.09;
      c.beginPath();
      c.arc(0.36, 0, 0.14, -1.4, 1.4);
      c.stroke();
      fillCircle(c, 0, 0, 0.34, '#3b6fd9');
      fillCircle(c, 0, 0, 0.26, '#6b3f1d');
      c.fillStyle = 'rgba(255, 255, 255, 0.25)';
      circle(c, -0.08, -0.09, 0.08);
      c.fill();
    },
    ink(c) {
      blobPath(c, 0, 0, 0.4, 11, 0);
      c.fillStyle = '#2b3d91';
      c.fill();
      blobPath(c, 0.34, 0.3, 0.1, 3, 0);
      c.fill();
      c.fillStyle = 'rgba(255, 255, 255, 0.3)';
      circle(c, -0.12, -0.14, 0.07);
      c.fill();
    },
    book(c) {
      fillRound(c, -0.36, -0.42, 0.72, 0.84, 0.04, '#1d8f4e');
      fillBox(c, -0.36, -0.42, 0.12, 0.84, '#0f5c30');
      fillBox(c, -0.14, -0.24, 0.4, 0.2, '#fdfbf0');
    },
    apple(c) {
      fillCircle(c, -0.09, 0.04, 0.27, '#d3262f');
      fillCircle(c, 0.1, 0.04, 0.27, '#d3262f');
      c.fillStyle = '#d3262f';
      c.fillRect(-0.14, -0.14, 0.28, 0.4);
      lines(c, '#5a3a1e', 0.05, [[0, -0.14, 0.04, -0.34]]);
      fillPoly(c, [[0.04, -0.28], [0.24, -0.38], [0.2, -0.22]], '#1d8f4e');
    },
    ball(c) {
      fillCircle(c, 0, 0, 0.36, '#f08a24');
      c.strokeStyle = OUTLINE;
      c.lineWidth = 0.03;
      c.beginPath();
      c.moveTo(-0.36, 0);
      c.lineTo(0.36, 0);
      c.moveTo(0, -0.36);
      c.lineTo(0, 0.36);
      c.stroke();
    },
    tray(c) {
      fillRound(c, -0.42, -0.36, 0.84, 0.72, 0.08, '#8fa3b8');
      fillRound(c, -0.34, -0.28, 0.34, 0.56, 0.05, '#c7d3df');
      fillCircle(c, 0.2, -0.12, 0.12, '#f6c21c');
      fillRound(c, 0.06, 0.08, 0.28, 0.18, 0.04, '#c0303a');
    },
  };

  // A bonus cell: a taped-on square with a sign for what it gives.
  function drawSpot(c, kind) {
    const { hex } = PC.SPOTS[kind];
    rounded(c, -0.44, -0.44, 0.88, 0.88, 0.1);
    c.save();
    c.globalAlpha = 0.16;
    c.fillStyle = hex;
    c.fill();
    c.restore();
    c.setLineDash([0.09, 0.07]);
    c.strokeStyle = hex;
    c.lineWidth = 0.035;
    c.stroke();
    c.setLineDash([]);
    if (kind === 'power') {
      burstPath(c, 0, 0, 0.26, 0.13, 8);
      c.fillStyle = hex;
      c.fill();
    } else if (kind === 'speed') {
      polygon(c, [[0.08, -0.3], [-0.2, 0.05], [-0.02, 0.05], [-0.08, 0.3], [0.2, -0.06], [0.02, -0.06]]);
      c.fillStyle = hex;
      c.fill();
    } else {
      c.lineWidth = 0.045;
      for (const r of [0.1, 0.24]) {
        circle(c, 0, 0, r);
        c.stroke();
      }
    }
  }

  function paintPaper(layer, map, res = RES) {
    const c = layer.getContext('2d');
    const page = PAPERS[map.paper];
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = page.base;
    c.fillRect(0, 0, layer.width, layer.height);

    // A little tooth in the paper from a small noise tile
    const tile = document.createElement('canvas');
    tile.width = tile.height = 256;
    const t = tile.getContext('2d');
    const img = t.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = 90;
      img.data[i + 1] = 110;
      img.data[i + 2] = 130;
      img.data[i + 3] = Math.random() ** 3 * 18;
    }
    t.putImageData(img, 0, 0);
    c.fillStyle = c.createPattern(tile, 'repeat');
    c.fillRect(0, 0, layer.width, layer.height);

    c.save();
    c.scale(res, res);

    // Four small squares to a cell. Every page reads the same either way up, which
    // notebook lines wouldn't when the board is transposed.
    const rule = (step, color, width) => {
      c.strokeStyle = color;
      c.lineWidth = width;
      c.beginPath();
      for (let x = step; x < PC.COLS; x += step) {
        c.moveTo(x, 0);
        c.lineTo(x, PC.ROWS);
      }
      for (let y = step; y < PC.ROWS; y += step) {
        c.moveTo(0, y);
        c.lineTo(PC.COLS, y);
      }
      c.stroke();
    };
    if (page.checks) {
      c.fillStyle = page.checks;
      for (let x = 0; x < PC.COLS; x++) for (let y = 0; y < PC.ROWS; y++) if ((x + y) % 2) c.fillRect(x, y, 1, 1);
    }
    if (page.minor) rule(0.25, page.minor, 0.006);
    if (page.major) rule(1, page.major, 0.013);
    if (page.dots) {
      c.fillStyle = page.dots;
      for (let x = 0; x <= PC.COLS * 2; x++) {
        for (let y = 0; y <= PC.ROWS * 2; y++) {
          circle(c, x / 2, y / 2, x % 2 || y % 2 ? 0.012 : 0.026);
          c.fill();
        }
      }
    }

    c.lineCap = 'round';
    c.lineJoin = 'round';
    paintPaths(c, map);

    for (const [kind, x, y] of map.spots || []) {
      c.save();
      c.translate(x + 0.5, y + 0.5);
      drawSpot(c, kind);
      c.restore();
    }
    for (const [kind, x, y] of map.props || []) {
      c.save();
      c.translate(x + 0.5, y + 0.5);
      c.save();
      c.translate(0.05, 0.06);
      c.fillStyle = 'rgba(34, 40, 50, 0.2)';
      circle(c, 0, 0, 0.38);
      c.fill();
      c.restore();
      PROPS[kind](c);
      c.restore();
    }
    c.restore();
  }

  // The path: a band shaded with the side of a pencil, with hand-drawn edges
  function paintPaths(c, map) {
    // One stroke for every path, so where they share cells the band isn't drawn twice.
    const trace = () => {
      c.beginPath();
      for (const { pts } of map.paths) pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    };
    trace();
    c.strokeStyle = 'rgba(251, 252, 247, 0.82)';
    c.lineWidth = 0.84;
    c.stroke();
    trace();
    c.strokeStyle = 'rgba(92, 98, 108, 0.13)';
    c.lineWidth = 0.84;
    c.stroke();

    map.paths.forEach(({ pts }, k) => {
      const earlier = map.paths.slice(0, k).flatMap((path) => path.pts);
      const others = map.paths.filter((path, j) => j !== k).flatMap((path) => path.pts);
      const close = (list, x, y, gap) => list.some((q) => Math.abs(q.x - x) < gap && Math.hypot(q.x - x, q.y - y) < gap);
      // Where a path joins an earlier one, the earlier one has already drawn it.
      const drawn = pts.map((p) => earlier.length > 0 && close(earlier, p.x, p.y, 0.1));
      pts.forEach((p, i) => {
        if (drawn[i] || Math.random() < 0.2) return;
        const lat = 0.4, skew = rand(0.12, 0.2);
        c.strokeStyle = `rgba(70, 75, 84, ${rand(0.1, 0.3)})`;
        c.lineWidth = rand(0.008, 0.018);
        c.beginPath();
        c.moveTo(p.x - p.ty * lat + p.tx * skew, p.y + p.tx * lat + p.ty * skew);
        c.lineTo(p.x + p.ty * lat - p.tx * skew, p.y - p.tx * lat - p.ty * skew);
        c.stroke();
      });
      for (const side of [-1, 1]) {
        for (let pass = 0; pass < 2; pass++) {
          c.strokeStyle = 'rgba(50, 54, 62, 0.5)';
          c.lineWidth = 0.02;
          c.beginPath();
          let pen = false;
          pts.forEach((p, i) => {
            const lat = side * (0.43 + 0.012 * Math.sin(i * 0.21 + pass * 2));
            const x = p.x - p.ty * lat, y = p.y + p.tx * lat;
            // No edge line across another path, or across this one where it crosses itself.
            const inside = drawn[i] || close(others, x, y, 0.38)
              || pts.some((q, j) => Math.abs(i - j) > 30 && Math.abs(q.x - x) < 0.38 && Math.hypot(q.x - x, q.y - y) < 0.38);
            if (!inside && pen) c.lineTo(x, y);
            else if (!inside) c.moveTo(x, y);
            pen = !inside;
          });
          c.stroke();
        }
      }
    });

    // Pencil chevrons where the homework comes in, pointing the way it walks
    c.strokeStyle = 'rgba(46, 50, 58, 0.62)';
    c.lineWidth = 0.03;
    for (const path of map.paths) {
      for (const d of [0.82, 1.06]) {
        const p = PC.pointAt(path, d);
        const at = (along, side) => [p.x + p.tx * along - p.ty * side, p.y + p.ty * along + p.tx * side];
        c.beginPath();
        c.moveTo(...at(0, -0.18));
        c.lineTo(...at(0.14, 0));
        c.lineTo(...at(0, 0.18));
        c.stroke();
      }
    }
  }

  // A small picture of a map for the map picker.
  PC.mapIcon = function (key) {
    if (icons.has('map ' + key)) return icons.get('map ' + key);
    const map = PC.MAPS[key], layer = makeLayer(24);
    paintPaper(layer, map, 24);
    const c = layer.getContext('2d');
    c.setTransform(24, 0, 0, 24, 0, 0);
    c.lineJoin = 'round';
    c.beginPath();
    for (const { pts } of map.paths) pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.strokeStyle = 'rgba(70, 76, 88, 0.55)';
    c.lineWidth = 0.8;
    c.stroke();
    for (const [x, y] of map.exits) {
      starPath(c, x + 0.5, y + 0.5, 0.6);
      c.lineWidth = 0.08;
      c.fillStyle = '#f5b301';
      c.fill();
      c.strokeStyle = OUTLINE;
      c.stroke();
    }
    icons.set('map ' + key, layer.toDataURL());
    return icons.get('map ' + key);
  };

  PC.createRenderer = function (canvas) {
    const ctx = canvas.getContext('2d');
    const view = { cell: 60, portrait: false, dpr: 1 };
    const paper = makeLayer(), marks = makeLayer();
    const marksCtx = marks.getContext('2d');
    let shownMap = null;

    // Redraw the page when a game on another map comes up.
    function showMap(key) {
      if (key === shownMap) return;
      shownMap = key;
      paintPaper(paper, PC.MAPS[key]);
    }

    let clock = 0, shake = 0, shakeX = 0, shakeY = 0, reveal = 0, lifeFlash = 0, freezeFlash = 0, rewindFlash = 0;
    let particles = [], rings = [], strokes = [], floaters = [], wedges = [];
    const mixing = new Map();

    function resize(cell, portrait) {
      view.cell = cell;
      view.portrait = portrait;
      view.dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = (portrait ? PC.ROWS : PC.COLS) * cell, h = (portrait ? PC.COLS : PC.ROWS) * cell;
      canvas.width = w * view.dpr;
      canvas.height = h * view.dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }

    function setWorld() {
      const k = view.cell * view.dpr;
      if (view.portrait) ctx.setTransform(0, k, k, 0, shakeX, shakeY);
      else ctx.setTransform(k, 0, 0, k, shakeX, shakeY);
    }

    function setScreen() {
      ctx.setTransform(view.dpr, 0, 0, view.dpr, shakeX, shakeY);
    }

    const toScreen = (x, y) => (view.portrait ? [y * view.cell, x * view.cell] : [x * view.cell, y * view.cell]);

    function toWorld(clientX, clientY) {
      const box = canvas.getBoundingClientRect();
      const a = (clientX - box.left) / view.cell, b = (clientY - box.top) / view.cell;
      return view.portrait ? { x: b, y: a } : { x: a, y: b };
    }

    // ---- Marks: what the battle leaves on the page ----

    function mark(alpha, draw) {
      const c = marksCtx;
      c.save();
      c.scale(RES, RES);
      c.globalCompositeOperation = 'multiply';
      c.globalAlpha = alpha;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      draw(c);
      c.restore();
    }

    function markCheck(x, y, size) {
      mark(0.72, (c) => {
        c.strokeStyle = RED_PEN;
        c.lineWidth = Math.max(0.025, size * 0.2);
        c.beginPath();
        c.moveTo(x - size * 0.55, y);
        c.lineTo(x - size * 0.12, y + size * 0.5);
        c.lineTo(x + size * 0.75, y - size * 0.7);
        c.stroke();
      });
    }

    function markScribble(x, y, r, hex, alpha) {
      mark(alpha, (c) => {
        c.strokeStyle = hex;
        c.lineWidth = 0.016;
        scribblePath(c, x, y, r, Math.random() * 99, 0, 10);
        c.stroke();
      });
    }

    function markCircle(x, y, r) {
      mark(0.34, (c) => {
        c.strokeStyle = GRAPHITE;
        c.lineWidth = 0.016;
        circle(c, x, y, r);
        c.stroke();
        c.fillStyle = GRAPHITE;
        circle(c, x, y, 0.016);
        c.fill();
      });
    }

    function markCrumbs(x, y, r, hex) {
      mark(0.7, (c) => {
        c.fillStyle = hex;
        for (let i = 0; i < 7; i++) {
          const a = rand(0, TAU), d = r * rand(0.1, 1);
          c.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, rand(0.02, 0.05), rand(0.012, 0.03));
        }
      });
    }

    function markBlob(x, y, r, hex, alpha) {
      mark(alpha, (c) => {
        c.fillStyle = hex;
        blobPath(c, x, y, r, Math.random() * 99, 0);
        c.fill();
      });
    }

    function markStrip(x, y, length, hex) {
      mark(0.34, (c) => {
        c.translate(x, y);
        c.rotate(rand(0, Math.PI));
        c.fillStyle = hex;
        c.fillRect(-length / 2, -0.05, length, 0.1);
      });
    }

    function markLine(x, y, x2, y2, hex, width, alpha) {
      mark(alpha, (c) => {
        c.strokeStyle = hex;
        c.lineWidth = width;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x2, y2);
        c.stroke();
      });
    }

    function markStaple(x, y) {
      mark(0.8, (c) => {
        c.translate(x, y);
        c.rotate(rand(0, Math.PI));
        c.strokeStyle = GRAPHITE;
        c.lineWidth = 0.022;
        c.beginPath();
        c.moveTo(-0.09, 0.03);
        c.lineTo(-0.09, 0);
        c.lineTo(0.09, 0);
        c.lineTo(0.09, 0.03);
        c.stroke();
      });
    }

    // A rubber stamp print: a tilted square frame with a star inside.
    function markStamp(x, y, r, hex) {
      mark(0.45, (c) => {
        c.translate(x, y);
        c.rotate(rand(-0.4, 0.4));
        c.strokeStyle = hex;
        c.lineWidth = 0.025;
        const half = r * 0.6;
        rounded(c, -half, -half, half * 2, half * 2, half * 0.2);
        c.stroke();
        starPath(c, 0, 0, half * 0.6);
        c.fillStyle = hex;
        c.fill();
      });
    }

    function markBurst(x, y, r, hex) {
      mark(0.6, (c) => {
        c.strokeStyle = hex;
        c.lineWidth = 0.022;
        c.beginPath();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU + rand(-0.1, 0.1);
          c.moveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5);
          c.lineTo(x + Math.cos(a) * r * rand(0.8, 1.15), y + Math.sin(a) * r * rand(0.8, 1.15));
        }
        c.stroke();
      });
    }

    // Older marks fade a little each wave so the page stays readable.
    function fadeMarks(amount) {
      marksCtx.save();
      marksCtx.globalCompositeOperation = 'destination-out';
      marksCtx.globalAlpha = amount;
      marksCtx.fillRect(0, 0, marks.width, marks.height);
      marksCtx.restore();
    }

    function eraseMarks(x, y, r) {
      marksCtx.save();
      marksCtx.scale(RES, RES);
      marksCtx.globalCompositeOperation = 'destination-out';
      marksCtx.globalAlpha = 0.5;
      circle(marksCtx, x, y, r);
      marksCtx.fill();
      marksCtx.restore();
    }

    // ---- Short-lived effects ----

    function confetti(x, y, hex, count, speed) {
      for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
        const a = rand(0, TAU), v = rand(0.4, 1) * speed;
        particles.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          r: rand(0.02, 0.055), hex, t: 0, life: rand(0.22, 0.5),
        });
      }
    }

    function ring(x, y, radius, hex, life) {
      rings.push({ x, y, radius, hex, t: 0, life });
    }

    function floater(x, y, text, hex, size) {
      floaters.push({ x, y, text, hex, size, t: 0, life: 0.9 });
    }

    function jolt(amount) {
      if (!calm) shake = Math.max(shake, amount);
    }

    function handle(ev) {
      const item = ev.type ? PC.SUPPLIES[ev.type] : null;
      switch (ev.k) {
        case 'hit':
          confetti(ev.x, ev.y, item.hex, 2, 1);
          if (Math.random() > 0.3) break;
          if (ev.type === 'pencil' || ev.type === 'mechanical') markScribble(ev.x, ev.y, 0.07, GRAPHITE, 0.4);
          else if (ev.type === 'crayon' || ev.type === 'coloredpencil') markScribble(ev.x, ev.y, 0.09, item.hex, 0.5);
          else if (ev.type === 'pen' || ev.type === 'label') markScribble(ev.x, ev.y, 0.06, BALLPOINT, 0.4);
          else if (ev.type === 'glue') markBlob(ev.x, ev.y, rand(0.06, 0.12), '#bcd7f2', 0.5);
          else if (ev.type === 'tape') markStrip(ev.x, ev.y, rand(0.25, 0.4), '#7fd6cb');
          else if (ev.type === 'stapler') markStaple(ev.x, ev.y);
          else if (item.paint) markBlob(ev.x, ev.y, rand(0.05, 0.1), item.hex, 0.35);
          else if (ev.type === 'eraser') {
            // An eraser rubs out whatever it lands on and leaves crumbs behind.
            eraseMarks(ev.x, ev.y, 0.2);
            markCrumbs(ev.x, ev.y, 0.2, ERASER);
          }
          break;
        case 'kill': {
          markCheck(ev.x + rand(-0.08, 0.08), ev.y + rand(-0.08, 0.08), Math.max(0.15, ev.size * 0.8));
          if (Math.random() < 0.5) markScribble(ev.x, ev.y, ev.size, BALLPOINT, 0.3);
          for (const type of new Set(ev.marks)) confetti(ev.x, ev.y, PC.SUPPLIES[type].hex, 5, 2);
          confetti(ev.x, ev.y, '#c9ced4', 4, 1.6);
          floater(ev.x, ev.y, '+$' + ev.bounty, '#2b3640', 16);
          break;
        }
        case 'splash':
          ring(ev.x, ev.y, ev.radius, item.hex, 0.26);
          if (ev.type === 'compass') {
            // Only some shots leave a circle, or a long run turns the page black.
            if (Math.random() < 0.15) markCircle(ev.x, ev.y, ev.radius);
            confetti(ev.x, ev.y, item.hex, 6, 1.6);
          } else if (item.paint) {
            if (Math.random() < 0.3) markBlob(ev.x, ev.y, ev.radius * 0.5, item.hex, 0.3);
            confetti(ev.x, ev.y, item.hex, 8, 1.7);
          } else {
            const glitter = ev.type === 'glitter';
            const dust = ev.type === 'chalk' || ev.type === 'pastel';
            markCrumbs(ev.x, ev.y, ev.radius * 0.8, glitter ? '#e6b800' : dust ? '#cfc9b6' : '#8b97a6');
            confetti(ev.x, ev.y, glitter ? '#ffe27a' : dust ? '#f4f1e8' : '#aeb7c2', 8, 1.7);
          }
          break;
        case 'stamp':
          ring(ev.x, ev.y, ev.radius, item.hex, 0.22);
          confetti(ev.x, ev.y, item.hex, 6, 1.4);
          if (Math.random() < 0.3) markStamp(ev.x, ev.y, ev.radius, item.paint ? item.hex : '#c42f45');
          break;
        case 'splat':
          ring(ev.x, ev.y, ev.radius, item.hex, 0.3);
          confetti(ev.x, ev.y, item.hex, 10, 2);
          if (Math.random() < 0.35) markBlob(ev.x, ev.y, ev.radius * 0.55, item.hex, 0.3);
          break;
        case 'rain':
          ring(ev.x, ev.y, 0.32, item.hex, 0.26);
          confetti(ev.x, ev.y, item.hex, 6, 1.6);
          break;
        case 'fail':
          floater(ev.x, ev.y - 0.25, 'Fail!', RED_PEN, 18);
          markLine(ev.x - 0.12, ev.y - 0.12, ev.x + 0.12, ev.y + 0.12, RED_PEN, 0.03, 0.6);
          markLine(ev.x - 0.12, ev.y + 0.12, ev.x + 0.12, ev.y - 0.12, RED_PEN, 0.03, 0.6);
          break;
        case 'cone':
          wedges.push({ x: ev.x, y: ev.y, aim: ev.aim, width: ev.width, range: ev.range, hex: item.hex, t: 0, life: 0.28 });
          break;
        case 'nova':
          ring(ev.x, ev.y, ev.radius, item.hex, 0.32);
          confetti(ev.x, ev.y, item.hex, 10, 2.4);
          break;
        case 'crit':
          floater(ev.x, ev.y - 0.2, 'Blot!', BALLPOINT, 19);
          markBlob(ev.x, ev.y, 0.12, BALLPOINT, 0.5);
          break;
        case 'blink':
          ring(ev.x, ev.y, 0.42, '#7fb5ea', 0.24);
          confetti(ev.x, ev.y, '#9fc7ef', 5, 1.4);
          break;
        case 'shield':
          ring(ev.x, ev.y, ev.radius, '#2a7de1', 0.4);
          break;
        case 'heal':
          ring(ev.x, ev.y, ev.radius, '#1d9a54', 0.4);
          floater(ev.x, ev.y - 0.25, 'Heal', '#157a42', 16);
          break;
        case 'jam':
          strokes.push({ points: [[ev.fromX, ev.fromY], [ev.x, ev.y]], hex: ev.hex || RED_PEN, width: 0.05, t: 0, life: 0.3, dash: [0.08, 0.08] });
          floater(ev.x, ev.y - 0.3, ev.text || 'Detention!', ev.hex || RED_PEN, 18);
          break;
        case 'revive':
          ring(ev.x, ev.y, 0.45, '#1d8f4e', 0.4);
          floater(ev.x, ev.y - 0.25, 'Retake!', '#157a42', 16);
          break;
        case 'copy':
          ring(ev.x, ev.y, 0.4, '#8e6fd9', 0.3);
          confetti(ev.x, ev.y, '#b9a7e6', 5, 1.4);
          break;
        case 'fine':
          floater(ev.x, ev.y - 0.25, `-$${ev.amount}`, RED_PEN, 15);
          break;
        case 'rewind':
          rewindFlash = 1;
          floater(PC.COLS / 2, PC.ROWS / 2 - 1, 'Rewind!', '#14506a', 26);
          break;
        case 'blast':
          ring(ev.x, ev.y, ev.radius, item.hex, 0.35);
          // The beam comes from the top of the screen, whichever way the board is turned.
          strokes.push({ points: [view.portrait ? [ev.x - 1.4, ev.y] : [ev.x, ev.y - 1.4], [ev.x, ev.y]], hex: item.hex, width: 0.16, t: 0, life: 0.2 });
          confetti(ev.x, ev.y, item.hex, 10, 2);
          if (Math.random() < 0.4) markBlob(ev.x, ev.y, 0.16, '#3a2a2a', 0.35);
          break;
        case 'puddle':
          confetti(ev.x, ev.y, '#dfe5e8', 8, 1.4);
          if (Math.random() < 0.4) markBlob(ev.x, ev.y, 0.5, '#d9dee3', 0.4);
          break;
        case 'snip':
          for (const side of [-1, 1]) {
            strokes.push({ points: [[ev.x - 0.26, ev.y - side * 0.26], [ev.x + 0.26, ev.y + side * 0.26]], hex: item.hex, width: 0.06, t: 0, life: 0.2 });
          }
          if (Math.random() < 0.4) markLine(ev.x - 0.16, ev.y - 0.1, ev.x + 0.16, ev.y + 0.1, item.hex, 0.02, 0.6);
          break;
        case 'burst':
          ring(ev.x, ev.y, ev.radius, item.hex, 0.5);
          confetti(ev.x, ev.y, item.hex, 24, 3.2);
          markBurst(ev.x, ev.y, 0.62, item.hex);
          jolt(5);
          break;
        case 'merge':
          mixing.set(ev.tower.id, { parents: ev.parents, t: 0 });
          floater(ev.x, ev.y - 0.3, `${item.name} ${ev.level}`, item.deep, 23);
          break;
        case 'stroke':
          strokes.push({ points: [[ev.x, ev.y], [ev.x2, ev.y2]], hex: ev.hex || item.hex, width: 0.3, t: 0, life: 0.3 });
          if (Math.random() < 0.3) markLine(ev.x, ev.y, ev.x2, ev.y2, ev.hex || item.hex, 0.2, 0.16);
          break;
        case 'chain': {
          const points = ev.links.map((p) => [p.x, p.y]);
          strokes.push({ points, hex: item.hex, width: 0.07, t: 0, life: 0.22, dash: [0.09, 0.07] });
          break;
        }
        case 'place':
          confetti(ev.x, ev.y, item.hex, 6, 1.2);
          break;
        case 'sell':
          ring(ev.x, ev.y, 0.5, item.hex, 0.3);
          confetti(ev.x, ev.y, item.hex, 14, 2);
          break;
        case 'leak':
          lifeFlash = 1;
          jolt(9);
          break;
        case 'star':
          floater(ev.x, ev.y, '+1 star', '#b27c00', 20);
          break;
        case 'interest':
          floater(ev.x, ev.y - 0.3, `+$${ev.amount} interest`, '#157a42', 18);
          break;
        case 'zap':
          strokes.push({ points: [[ev.x, ev.y], [ev.x2, ev.y2]], hex: '#ffcf3a', width: 0.07, t: 0, life: 0.12 });
          break;
        case 'freeze':
          freezeFlash = 1;
          floater(PC.COLS / 2, PC.ROWS / 2, ev.snow ? 'Snow day!' : 'Tick... tock.', '#2a5f9e', 24);
          break;
        case 'bus':
          jolt(4);
          break;
        case 'boss':
          jolt(12);
          break;
        case 'waveStart':
          fadeMarks(0.07);
          break;
        default:
      }
    }

    // ---- Drawing ----

    function drawSupply(x, y, type, level, o) {
      const span = SPAN * PC.itemScale(level) * (1 + (o.pop || 0) * 0.4);
      const angle = PC.SUPPLIES[type].still ? 0 : o.aim;
      const back = (o.kick || 0) * 0.07;
      ctx.save();
      ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
      ctx.save();
      ctx.translate(x + 0.04, y + 0.06);
      ctx.rotate(angle);
      ctx.drawImage(sprite(type, true, 'rgba(34, 40, 50, 0.3)'), -span / 2, -span / 2, span, span);
      ctx.restore();
      ctx.translate(x - Math.cos(angle) * back, y - Math.sin(angle) * back);
      ctx.rotate(angle);
      ctx.drawImage(sprite(type, (o.kick || 0) < 0.2, null), -span / 2, -span / 2, span, span);
      ctx.restore();
    }

    function drawTower(t, lifted) {
      if (t.st.field) {
        ctx.fillStyle = 'rgba(224, 179, 90, 0.13)';
        circle(ctx, t.x, t.y, t.st.range);
        ctx.fill();
      }
      if (PC.SUPPLIES[t.type].mythic) {
        // Slow rays of light behind every mythic.
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(calm ? 0 : clock * 0.5 + t.id);
        ctx.globalAlpha = lifted ? 0.15 : 0.5;
        burstPath(ctx, 0, 0, 0.72, 0.4, 10);
        ctx.fillStyle = '#ffe08a';
        ctx.fill();
        ctx.globalAlpha = lifted ? 0.2 : 0.6;
        burstPath(ctx, 0, 0, 0.56, 0.36, 10);
        ctx.fillStyle = PC.SUPPLIES[t.type].hex;
        ctx.fill();
        ctx.restore();
      }
      // Globe moons are grey. Other orbiters take their supply's color, and planets vary.
      t.orbs.forEach((o, i) => {
        const hex = t.type === 'globe' ? '#dfe7ef' : t.type === 'planetarium' ? RAINBOW_INK[i % 6] : t.st.hex;
        circle(ctx, o.x, o.y, t.type === 'planetarium' ? 0.15 : 0.13);
        ink(ctx, hex);
        circle(ctx, o.x - 0.04, o.y - 0.03, 0.035);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.fill();
      });
      const mix = mixing.get(t.id);
      const k = mix ? mix.t / 0.45 : 1;
      drawSupply(t.x, t.y, t.type, t.level, {
        aim: t.aim, kick: t.kick, alpha: lifted ? 0.3 : 1, pop: mix ? (1 - k) ** 2 : 0,
      });
      if (mix) {
        // The two parent supplies spin into the new one.
        const r = 0.42 * (1 - k);
        mix.parents.forEach((type, i) => {
          const a = k * 7 + i * Math.PI;
          ctx.save();
          ctx.translate(t.x + Math.cos(a) * r, t.y + Math.sin(a) * r);
          ctx.rotate(a);
          const span = 0.8 * (1 - k) + 0.1;
          ctx.drawImage(sprite(type, true, null), -span / 2, -span / 2, span, span);
          ctx.restore();
        });
      }
      if (t.jam > 0) {
        // In detention: crossed out in red until the sweep runs down.
        ctx.strokeStyle = RED_PEN;
        ctx.lineWidth = 0.05;
        circle(ctx, t.x, t.y, 0.42);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(t.x - 0.3, t.y + 0.3);
        ctx.lineTo(t.x + 0.3, t.y - 0.3);
        ctx.stroke();
      }
      if (t.setup > 0) {
        // Sweep shows how long until it can fire.
        ctx.strokeStyle = 'rgba(50, 62, 80, 0.8)';
        ctx.lineWidth = 0.035;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 0.46, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, t.setup / PC.SETUP_SECONDS));
        ctx.stroke();
      }
    }

    function drawEnemy(e) {
      const d = e.def, r = d.size;
      const frame = calm ? 0 : Math.floor(clock * 7 + e.seed) % 3;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (d.stealth) ctx.globalAlpha = 0.34 + 0.14 * Math.sin(clock * 3 + e.seed);
      if (e.slowT > 0) {
        ctx.fillStyle = 'rgba(150, 196, 240, 0.5)';
        blobPath(ctx, 0, 0, r * 1.5, e.seed, 0);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(34, 40, 50, 0.22)';
      circle(ctx, 0.03, 0.05, r * 0.9);
      ctx.fill();
      ctx.rotate(e.ang);
      ENEMY_ART[e.type](ctx, r, e.seed, frame);

      // Every hit leaves something stuck to them.
      for (const st of e.marks) {
        ctx.fillStyle = PC.SUPPLIES[st.type].hex;
        circle(ctx, Math.cos(st.a) * st.r * r, Math.sin(st.a) * st.r * r, st.size * r);
        ctx.fill();
      }
      if (e.rallyT > 0) {
        // Speed lines behind anything a Hall Monitor is hurrying along.
        ctx.strokeStyle = 'rgba(59, 111, 217, 0.75)';
        ctx.lineWidth = 0.022;
        ctx.beginPath();
        for (const y of [-0.5, 0.5]) {
          ctx.moveTo(-r * 1.2, r * y);
          ctx.lineTo(-r * 1.8, r * y);
        }
        ctx.stroke();
      }
      if (e.paintT > 0) {
        // Wet paint drips off the back while it can still splash.
        ctx.globalAlpha *= 0.75;
        ctx.fillStyle = PC.SUPPLIES[e.paintType].hex;
        blobPath(ctx, -r * 0.2, 0, r * 0.55, e.seed + 3, frame);
        ctx.fill();
        circle(ctx, -r * 1.05, r * 0.25, r * 0.16);
        ctx.fill();
        ctx.globalAlpha /= 0.75;
      }
      if (e.wrapT > 0) {
        ctx.fillStyle = 'rgba(127, 214, 203, 0.65)';
        ctx.fillRect(-r * 0.5, -r * 1.05, r * 0.26, r * 2.1);
        ctx.fillRect(r * 0.02, -r * 1.05, r * 0.26, r * 2.1);
      }
      drawEyes(ctx, e.type, r);
      if (e.cutT > 0) {
        ctx.strokeStyle = PC.SUPPLIES.scissors.hex;
        ctx.lineWidth = 0.03;
        ctx.setLineDash([0.05, 0.04]);
        ctx.beginPath();
        ctx.moveTo(-r, -r * 0.7);
        ctx.lineTo(r, r * 0.7);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();

      if (e.stunT > 0) {
        for (let i = 0; i < 3; i++) {
          const a = clock * 6 + (i * TAU) / 3;
          starPath(ctx, e.x + Math.cos(a) * r * 0.9, e.y + Math.sin(a) * r * 0.9, 0.06);
          ctx.fillStyle = '#f5b301';
          ctx.fill();
        }
      }
      if (e.starF > 0) {
        starPath(ctx, e.x + r * 0.7, e.y - r * 0.7, 0.075);
        ink(ctx, '#f2b705');
      }
      if (e.excuseT > 0) {
        // Excused: a gold halo, and nothing can touch it.
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, r * 1.5, r * 1.5, 0, 0, TAU);
        ctx.setLineDash([0.07, 0.05]);
        ctx.strokeStyle = '#e0a400';
        ctx.lineWidth = 0.035;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (e.shieldT > 0) {
        // A Peer Review's shield: a blue bubble that fades as it runs out.
        ctx.globalAlpha = Math.min(1, e.shieldT * 1.5);
        circle(ctx, e.x, e.y, r * 1.45);
        ctx.fillStyle = 'rgba(42, 125, 225, 0.14)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(42, 125, 225, 0.75)';
        ctx.lineWidth = 0.025;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (e.stingT > 0 && Math.random() < 0.3) confetti(e.x, e.y, RED_PEN, 1, 0.9);
      if (d.erases) eraseMarks(e.x, e.y, r * 1.05);
    }

    function drawShot(p) {
      const item = PC.SUPPLIES[p.type];
      if (p.bus) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.ang);
        ctx.drawImage(sprite(p.st.busArt || 'bus', true, null), -0.7, -0.7, 1.4, 1.4);
        ctx.restore();
        return;
      }
      if (p.boomerang) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(clock * 16);
        ctx.drawImage(sprite('setsquare', true, null), -0.3, -0.3, 0.6, 0.6);
        ctx.restore();
        return;
      }
      if (p.lob) {
        const up = view.portrait ? [-1, 0] : [0, -1];
        const x = p.x + up[0] * p.z, y = p.y + up[1] * p.z;
        ctx.fillStyle = 'rgba(30, 36, 46, 0.22)';
        circle(ctx, p.x, p.y, 0.08);
        ctx.fill();
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(clock * 14);
        if (p.type === 'ruler') {
          ctx.strokeStyle = '#5d6a78';
          ctx.lineWidth = 0.028;
          rounded(ctx, -0.12, -0.07, 0.24, 0.14, 0.06);
          ctx.stroke();
        } else if (p.type === 'whiteout' || p.type === 'papiermache') {
          circle(ctx, 0, 0, 0.11);
          ink(ctx, p.type === 'whiteout' ? '#fdfdfb' : '#c9b28a');
        } else if (p.type === 'chalk' || p.type === 'pastel') {
          circle(ctx, 0, 0, 0.12);
          ctx.fillStyle = p.st.hex === PC.SUPPLIES.chalk.hex ? '#f4f1e8' : p.st.hex;
          ctx.fill();
        } else if (p.st.trapCharges) {
          ctx.drawImage(sprite(p.type, true, null), -0.2, -0.2, 0.4, 0.4);
        } else if (p.st.paint) {
          blobPath(ctx, 0, 0, 0.11, p.t * 9, 0);
          ink(ctx, p.st.hex);
        } else if (p.type === 'glitter') {
          starPath(ctx, 0, 0, 0.13);
          ink(ctx, '#ffe27a');
        } else {
          ctx.strokeStyle = OUTLINE;
          ctx.lineWidth = 0.035;
          ctx.beginPath();
          ctx.moveTo(-0.15, 0);
          ctx.lineTo(0.15, 0);
          ctx.stroke();
        }
        ctx.restore();
        return;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.ty - p.y, p.tx - p.x));
      if (p.type === 'glue') {
        circle(ctx, 0, 0, 0.085);
        ink(ctx, '#fdfdfb');
      } else if (p.type === 'tape') {
        ctx.fillStyle = 'rgba(127, 214, 203, 0.9)';
        ctx.fillRect(-0.15, -0.055, 0.3, 0.11);
        ctx.strokeStyle = item.deep;
        ctx.lineWidth = 0.012;
        ctx.strokeRect(-0.15, -0.055, 0.3, 0.11);
      } else if (p.type === 'eraser') {
        rounded(ctx, -0.1, -0.06, 0.2, 0.12, 0.03);
        ink(ctx, ERASER);
      } else if (p.type === 'rubber') {
        ctx.strokeStyle = '#a84f18';
        ctx.lineWidth = 0.035;
        ctx.beginPath();
        ctx.ellipse(0, 0, 0.17, 0.07, 0, 0, TAU);
        ctx.stroke();
      } else if (p.type === 'stapler') {
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 0.03;
        ctx.beginPath();
        ctx.moveTo(-0.07, -0.09);
        ctx.lineTo(0.03, -0.09);
        ctx.lineTo(0.03, 0.09);
        ctx.lineTo(-0.07, 0.09);
        ctx.stroke();
      } else if (p.type === 'calculator') {
        box(ctx, -0.07, -0.07, 0.14, 0.14);
        ink(ctx, '#bcd8a8');
      } else if (p.type === 'mechanical') {
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 0.028;
        ctx.beginPath();
        ctx.moveTo(-0.12, 0);
        ctx.lineTo(0.12, 0);
        ctx.stroke();
      } else if (p.st.paint) {
        // A drop of paint, stretched along its flight.
        ctx.beginPath();
        ctx.ellipse(0, 0, 0.11, 0.065, 0, 0, TAU);
        ink(ctx, p.st.hex);
      } else if (p.st.starPay) {
        starPath(ctx, 0, 0, 0.1);
        ink(ctx, '#f2b705');
      } else {
        polygon(ctx, [[-0.12, -0.04], [0.05, -0.04], [0.15, 0], [0.05, 0.04], [-0.12, 0.04]]);
        ink(ctx, p.st.hex);
      }
      ctx.restore();
    }

    function drawTraps(s) {
      for (const z of s.traps) {
        ctx.globalAlpha = Math.min(1, z.t * 2);
        if (z.type !== 'tack') {
          ctx.drawImage(sprite(z.type, true, null), z.x - 0.34, z.y - 0.34, 0.68, 0.68);
        } else {
          for (let i = 0; i < z.charges; i++) {
            const a = z.seed + i * 2.1;
            ctx.drawImage(sprite('tack', true, null), z.x + Math.cos(a) * 0.14 - 0.19, z.y + Math.sin(a) * 0.14 - 0.19, 0.38, 0.38);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawWedges() {
      for (const w of wedges) {
        ctx.globalAlpha = (1 - w.t / w.life) * 0.34;
        ctx.fillStyle = w.hex;
        ctx.beginPath();
        ctx.moveTo(w.x, w.y);
        ctx.arc(w.x, w.y, w.range, w.aim - w.width, w.aim + w.width);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawPuddles(s) {
      ctx.lineWidth = 0.02;
      ctx.strokeStyle = 'rgba(80, 90, 102, 0.7)';
      for (const z of s.puddles) {
        // White-Out stays white. Other puddles take a wash of their supply's color.
        const white = z.type === 'whiteout';
        ctx.fillStyle = white ? '#fdfdfb' : PC.SUPPLIES[z.type].hex;
        ctx.globalAlpha = Math.min(1, z.t * 2) * (white ? 0.94 : 0.6);
        blobPath(ctx, z.x, z.y, z.r, z.seed, 0);
        ctx.fill();
        ctx.stroke();
        if (z.type === 'blackhole') {
          ctx.globalAlpha = Math.min(1, z.t * 2);
          circle(ctx, z.x, z.y, z.r * 0.34);
          ctx.fillStyle = '#07020f';
          ctx.fill();
          for (let i = 0; i < 3; i++) {
            const a = clock * 5 + (i * TAU) / 3;
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.r * (0.45 + i * 0.16), a, a + 2);
            ctx.strokeStyle = ['#f6c21c', '#e0569a', '#9fc7ff'][i];
            ctx.lineWidth = 0.04;
            ctx.stroke();
          }
          ctx.lineWidth = 0.02;
          ctx.strokeStyle = 'rgba(80, 90, 102, 0.7)';
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawStrokes() {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'multiply';
      for (const s of strokes) {
        const k = s.t / s.life;
        ctx.strokeStyle = s.hex;
        ctx.globalAlpha = 1 - k * k;
        ctx.lineWidth = s.width * (1 - k * 0.5);
        ctx.setLineDash(s.dash || []);
        ctx.beginPath();
        s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    function drawRings() {
      for (const g of rings) {
        const k = g.t / g.life;
        ctx.strokeStyle = g.hex;
        ctx.globalAlpha = (1 - k) * 0.85;
        ctx.lineWidth = 0.09 * (1 - k) + 0.012;
        circle(ctx, g.x, g.y, g.radius * (0.25 + 0.75 * Math.sqrt(k)));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function drawParticles() {
      for (const p of particles) {
        const r = p.r * (1 - (p.t / p.life) * 0.5);
        ctx.fillStyle = p.hex;
        ctx.fillRect(p.x - r, p.y - r * 0.7, r * 2, r * 1.4);
      }
    }

    // A sticker chart where the path ends. Each life lost peels off one gold star.
    function drawStars(s) {
      for (const [c, r] of PC.mapOf(s).exits) drawStarChart(s, c + 0.08, r + 0.08);
    }

    function drawStarChart(s, x, y) {
      const w = 0.84, h = 0.84, cols = 5, rows = 4;
      ctx.fillStyle = 'rgba(34, 40, 50, 0.28)';
      ctx.fillRect(x + 0.04, y + 0.05, w, h);
      ctx.fillStyle = '#fffdf2';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = lifeFlash > 0 ? RED_PEN : OUTLINE;
      ctx.lineWidth = lifeFlash > 0 ? 0.05 : 0.022;
      ctx.strokeRect(x, y, w, h);
      for (let i = 0; i < cols * rows; i++) {
        const cx = x + 0.1 + (i % cols) * 0.16, cy = y + 0.13 + ((i / cols) | 0) * 0.195;
        starPath(ctx, cx, cy, 0.075);
        if (i < Math.ceil((s.lives / s.maxLives) * cols * rows)) {
          ctx.fillStyle = '#f5b301';
          ctx.fill();
        } else {
          ctx.strokeStyle = '#c3c8cc';
          ctx.lineWidth = 0.012;
          ctx.stroke();
        }
      }
    }

    function drawRange(x, y, range, hex) {
      ctx.save();
      ctx.fillStyle = hex;
      ctx.globalAlpha = 0.1;
      circle(ctx, x, y, range);
      ctx.fill();
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = hex;
      ctx.lineWidth = 0.024;
      ctx.setLineDash([0.13, 0.1]);
      ctx.stroke();
      ctx.restore();
    }

    function drawCell(c, r, hex, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = hex;
      ctx.fillRect(c + 0.04, r + 0.04, 0.92, 0.92);
      ctx.restore();
    }

    function drawPlacement(s, ui) {
      const d = ui.drag && ui.drag.moved ? ui.drag : null;
      const armed = !d && ui.armed ? { type: ui.armed, level: 1 } : null;
      const held = d || armed;
      if (!held) return;
      const pulse = 0.5 + 0.5 * Math.sin(clock * 6);

      // Everything this supply could merge with
      for (const t of s.towers) {
        if (t === held.tower || !PC.mergeResult(held.type, held.level, t)) continue;
        const made = PC.combine(held.type, t.type);
        ctx.strokeStyle = PC.SUPPLIES[made].hex;
        ctx.lineWidth = 0.05;
        ctx.globalAlpha = 0.55 + 0.45 * pulse;
        circle(ctx, t.x, t.y, 0.5);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      const spot = d ? (d.c === null ? null : { c: d.c, r: d.r }) : ui.hover;
      if (!spot) return;
      const other = PC.towerAt(s, spot.c, spot.r);
      const hex = PC.SUPPLIES[held.type].hex;
      if (other && other !== held.tower) {
        const result = PC.mergeResult(held.type, held.level, other);
        if (result) {
          const made = PC.towerStats(result.type, result.level);
          drawRange(other.x, other.y, made.range, PC.SUPPLIES[result.type].hex);
        } else if (held.tower) {
          drawCell(spot.c, spot.r, '#20272e', 0.12);
        }
      } else if (PC.isBuildable(s.map, spot.c, spot.r)) {
        drawCell(spot.c, spot.r, hex, 0.2);
        drawRange(spot.c + 0.5, spot.r + 0.5, PC.towerStats(held.type, held.level).range, hex);
      }
    }

    // With 15 supplies nobody remembers every recipe, so each target shows what it would make.
    function drawMergePreviews(s, ui) {
      const d = ui.drag && ui.drag.moved ? ui.drag : null;
      const held = d || (ui.armed ? { type: ui.armed, level: 1 } : null);
      if (!held) return;
      for (const t of s.towers) {
        if (t === held.tower) continue;
        const result = PC.mergeResult(held.type, held.level, t);
        if (!result) continue;
        const span = 0.62, x = Math.max(0.27, t.x - 0.28), y = Math.max(0.27, t.y - 0.28);
        // Mythics count as legendary here: both stay secret until made.
        const secret = PC.SUPPLIES[result.type].legendary && !ui.found.has(result.type);
        circle(ctx, x, y, 0.25);
        ctx.fillStyle = 'rgba(255, 253, 242, 0.94)';
        ctx.fill();
        ctx.lineWidth = 0.02;
        ctx.strokeStyle = PC.SUPPLIES[result.type].hex;
        ctx.stroke();
        ctx.drawImage(sprite(result.type, true, secret ? PC.SECRET_TINT : null), x - span / 2, y - span / 2, span, span);
      }
    }

    // Screen pass: anything with text, or that has to sit level with the screen.
    function drawLabels(s, ui) {
      setScreen();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Level stickers
      for (const t of s.towers) {
        const [x, y] = toScreen(t.x, t.y);
        const r = Math.max(8.5, view.cell * 0.165);
        const bx = x + view.cell * 0.27, by = y + view.cell * 0.27;
        const lifted = ui.drag && ui.drag.moved && ui.drag.tower === t;
        ctx.globalAlpha = lifted ? 0.3 : 1;
        circle(ctx, bx, by, r);
        // Advanced fusions get a gold sticker, legendary ones a holographic one, and mythics
        // a dark one with a gold rim.
        const mythic = PC.SUPPLIES[t.type].mythic;
        if (mythic) ctx.fillStyle = '#1b1036';
        else if (PC.SUPPLIES[t.type].legendary) {
          const holo = ctx.createLinearGradient(bx - r, by - r, bx + r, by + r);
          ['#ff9ad5', '#ffe27a', '#9ff0c8', '#9fc7ff', '#d4a8ff'].forEach((hex, i) => holo.addColorStop(i / 4, hex));
          ctx.fillStyle = holo;
        } else ctx.fillStyle = PC.SUPPLIES[t.type].from ? '#ffd84d' : '#fffdf2';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = mythic ? '#f1cf6a' : PC.SUPPLIES[t.type].deep;
        ctx.stroke();
        ctx.font = `${Math.round(r * 1.6)}px ${FONT}`;
        ctx.fillStyle = mythic ? '#ffe9a8' : '#1d2026';
        ctx.fillText(t.level, bx, by + 1);
        if (t.boost > 1) {
          // Gold arrow: this supply is being sharpened.
          polygon(ctx, [[bx - r - 10, by + 5], [bx - r - 1, by + 5], [bx - r - 5.5, by - 6]]);
          ctx.fillStyle = '#e0a400';
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = '#6b4e00';
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      for (const e of s.enemies) {
        const [x, y] = toScreen(e.x, e.y);
        if (e.def.letter) {
          ctx.font = `${Math.round(view.cell * e.def.size * 1.3)}px ${FONT}`;
          ctx.fillStyle = RED_PEN;
          ctx.fillText(e.def.letter, x, y);
        }
        if (e.hp >= e.maxHp) continue;
        const w = Math.max(16, e.def.size * view.cell * 1.7), top = y - e.def.size * view.cell - 7;
        ctx.fillStyle = 'rgba(23, 26, 31, 0.8)';
        ctx.fillRect(x - w / 2, top, w, 4);
        ctx.fillStyle = '#7ee08a';
        ctx.fillRect(x - w / 2 + 1, top + 1, (w - 2) * Math.max(0, e.hp / e.maxHp), 2);
      }

      for (const f of floaters) {
        const [x, y] = toScreen(f.x, f.y);
        const k = f.t / f.life;
        ctx.globalAlpha = 1 - k * k;
        ctx.font = `${f.size}px ${FONT}`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(251, 252, 247, 0.92)';
        ctx.strokeText(f.text, x, y - k * 24);
        ctx.fillStyle = f.hex;
        ctx.fillText(f.text, x, y - k * 24);
      }
      ctx.globalAlpha = 1;

      const d = ui.drag && ui.drag.moved ? ui.drag : null;
      const held = d || (ui.armed ? { type: ui.armed, level: 1 } : null);
      const spot = d ? (d.c === null ? null : { c: d.c, r: d.r }) : ui.hover;
      const other = held && spot ? PC.towerAt(s, spot.c, spot.r) : null;
      if (other && other !== held.tower) {
        const result = PC.mergeResult(held.type, held.level, other);
        if (result) {
          const [x, y] = toScreen(other.x, other.y);
          const item = PC.SUPPLIES[result.type];
          const text = item.legendary && !ui.found.has(result.type) ? (item.mythic ? '??? MYTHIC!' : '??? Legendary!') : `${item.name} ${result.level}`;
          ctx.font = `20px ${FONT}`;
          const w = ctx.measureText(text).width + 14;
          ctx.fillStyle = item.deep;
          ctx.fillRect(x - w / 2, y - view.cell * 0.5 - 24, w, 23);
          ctx.fillStyle = '#fff';
          ctx.fillText(text, x, y - view.cell * 0.5 - 12);
        }
      }
    }

    function advance(dt) {
      for (const p of particles) {
        p.t += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.93;
        p.vy *= 0.93;
      }
      for (const list of [rings, strokes, floaters, wedges]) for (const f of list) f.t += dt;
      particles = particles.filter((p) => p.t < p.life);
      wedges = wedges.filter((g) => g.t < g.life);
      rings = rings.filter((g) => g.t < g.life);
      strokes = strokes.filter((g) => g.t < g.life);
      floaters = floaters.filter((g) => g.t < g.life);
      for (const [id, m] of mixing) {
        m.t += dt;
        if (m.t >= 0.45) mixing.delete(id);
      }
      lifeFlash = Math.max(0, lifeFlash - dt * 3);
      freezeFlash = Math.max(0, freezeFlash - dt * 1.5);
      rewindFlash = Math.max(0, rewindFlash - dt * 1.5);
      shake = Math.max(0, shake - dt * 32);
      shakeX = rand(-shake, shake);
      shakeY = rand(-shake, shake);
    }

    function drawPage() {
      ctx.drawImage(paper, 0, 0, PC.COLS, PC.ROWS);
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(marks, 0, 0, PC.COLS, PC.ROWS);
      ctx.globalCompositeOperation = 'source-over';
    }

    function draw(s, ui, dt) {
      showMap(s.map);
      clock += dt;
      advance(dt);
      reveal = ui.gallery ? Math.min(1, reveal + dt * 0.8) : 0;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      setWorld();
      drawPage();

      if (reveal < 1) {
        const showing = ui.selected || (ui.hover && !ui.drag && !ui.armed && PC.towerAt(s, ui.hover.c, ui.hover.r));
        if (showing) drawRange(showing.x, showing.y, showing.st.range, PC.SUPPLIES[showing.type].hex);
        drawPlacement(s, ui);
        drawPuddles(s);
        drawTraps(s);
        drawWedges();

        for (const t of s.towers) drawTower(t, ui.drag && ui.drag.moved && ui.drag.tower === t);
        for (const e of s.enemies) drawEnemy(e);
        drawStars(s);
        for (const p of s.shots) drawShot(p);
        drawStrokes();
        drawRings();
        drawParticles();
        if (freezeFlash > 0) {
          ctx.fillStyle = `rgba(150, 200, 255, ${freezeFlash * 0.22})`;
          ctx.fillRect(0, 0, PC.COLS, PC.ROWS);
        }
        if (rewindFlash > 0) {
          ctx.fillStyle = `rgba(58, 166, 201, ${rewindFlash * 0.25})`;
          ctx.fillRect(0, 0, PC.COLS, PC.ROWS);
        }
        drawMergePreviews(s, ui);
        drawLabels(s, ui);
      }

      // When a run ends everything lifts away and leaves only the marked-up page.
      if (reveal > 0) {
        setWorld();
        ctx.globalAlpha = reveal;
        drawPage();
        ctx.globalAlpha = 1;
      }
    }

    function reset() {
      marksCtx.clearRect(0, 0, marks.width, marks.height);
      particles = [];
      rings = [];
      strokes = [];
      floaters = [];
      wedges = [];
      mixing.clear();
    }

    return { resize, draw, handle, toWorld, reset };
  };
})();
