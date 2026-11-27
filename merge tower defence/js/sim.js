// Game rules. No DOM in here, so tools/balance.html can run whole games without drawing.
// Anything the player should see or hear is pushed onto s.fx for render.js and main.js.
(function () {
  const PC = globalThis.PC;
  const TAU = Math.PI * 2;

  function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- Path ---------------------------------------------------------------

  function buildPath(route) {
    const cells = new Set();
    for (let i = 0; i + 1 < route.length; i++) {
      let [c, r] = route[i];
      const [c2, r2] = route[i + 1];
      const dc = Math.sign(c2 - c), dr = Math.sign(r2 - r);
      for (;;) {
        cells.add(c + ',' + r);
        if (c === c2 && r === r2) break;
        c += dc;
        r += dr;
      }
    }

    // Round every corner with a quadratic curve.
    const corners = route.map(([c, r]) => ({ x: c + 0.5, y: r + 0.5 }));
    const raw = [];
    const R = 0.42;
    corners.forEach((p, i) => {
      if (i === 0 || i === corners.length - 1) {
        raw.push(p);
        return;
      }
      const toward = (q) => {
        const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy);
        return { x: p.x + (dx / l) * R, y: p.y + (dy / l) * R };
      };
      const a = toward(corners[i - 1]), b = toward(corners[i + 1]);
      for (let k = 0; k <= 12; k++) {
        const t = k / 12, u = 1 - t;
        raw.push({
          x: u * u * a.x + 2 * u * t * p.x + t * t * b.x,
          y: u * u * a.y + 2 * u * t * p.y + t * t * b.y,
        });
      }
    });

    // Resample at even spacing so a distance maps straight to an index.
    const step = 0.05;
    const pts = [{ x: raw[0].x, y: raw[0].y }];
    let carried = 0;
    for (let i = 0; i + 1 < raw.length; i++) {
      const a = raw[i], b = raw[i + 1];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      let at = step - carried;
      while (at <= seg) {
        pts.push({ x: a.x + ((b.x - a.x) * at) / seg, y: a.y + ((b.y - a.y) * at) / seg });
        at += step;
      }
      carried = seg - (at - step);
    }
    pts.forEach((p, i) => {
      const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
      const dx = q.x - o.x, dy = q.y - o.y, l = Math.hypot(dx, dy) || 1;
      p.tx = dx / l;
      p.ty = dy / l;
    });
    return { pts, step, length: (pts.length - 1) * step, cells };
  }

  // Work out each map's paths once: where they run, which cells are taken and where they end.
  for (const map of Object.values(PC.MAPS)) {
    map.paths = map.routes.map(buildPath);
    map.pts = map.paths.flatMap((path) => path.pts);
    map.taken = new Set(map.paths.flatMap((path) => [...path.cells]));
    for (const [, c, r] of map.props || []) map.taken.add(c + ',' + r);
    map.spotAt = new Map((map.spots || []).map(([kind, c, r]) => [c + ',' + r, kind]));
    // Two routes can share an exit, which only needs one star chart.
    map.exits = [...new Set(map.routes.map((route) => route[route.length - 1].join()))].map((cell) => cell.split(',').map(Number));
  }

  PC.mapOf = (s) => PC.MAPS[s.map];

  PC.pointAt = function (P, d) {
    const f = Math.max(0, Math.min(d / P.step, P.pts.length - 1.001));
    const i = f | 0, k = f - i, a = P.pts[i], b = P.pts[i + 1];
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, tx: a.tx, ty: a.ty };
  };

  PC.isBuildable = (map, c, r) =>
    c >= 0 && r >= 0 && c < PC.COLS && r < PC.ROWS && !PC.MAPS[map].taken.has(c + ',' + r);

  // How far homework still has to walk. With two paths of different lengths, this is what
  // says who is closest to your stars.
  const leftOf = (e) => e.path.length - e.d;

  // ---- Towers -------------------------------------------------------------

  PC.towerStats = function (type, level) {
    const p = PC.SUPPLIES[type], L = level - 1;
    // Everything in the data carries over, and these are the numbers that grow with level.
    return {
      ...p,
      type,
      level,
      dmg: p.dmg * PC.LEVEL.damage ** L,
      rate: p.rate * (1 + PC.LEVEL.rate * L),
      range: p.range + PC.LEVEL.range * L,
      auraRange: (p.auraRange || p.range) + PC.LEVEL.range * L,
      splash: p.splash ? p.splash + 0.05 * L : 0,
      slow: p.slow ? Math.min(0.65, p.slow + 0.03 * L) : 0,
      chain: p.chain ? p.chain + Math.max(0, level - 3) : 0,
      push: p.push ? p.push + 0.05 * L : 0,
      ramp: p.ramp || 0,
      rampMax: p.rampMax || 0,
      stretch: p.stretch || 0,
      spread: p.spread || 0,
      puddle: p.puddle ? p.puddle + 0.04 * L : 0,
      stun: p.stun ? p.stun + 0.05 * L : 0,
      cut: p.cut ? p.cut + 0.03 * L : 0,
      payout: p.payout ? p.payout + 0.1 * L : 0,
      aura: p.aura ? p.aura + 0.06 * L : 0,
      haste: p.haste ? p.haste + 0.05 * L : 0,
      bite: p.bite ? p.bite + 0.01 * L : 0,
      reach: p.reach ? p.reach + 0.03 * L : 0,
      expose: p.expose ? p.expose + 0.03 * L : 0,
      field: p.field ? Math.min(0.6, p.field + 0.03 * L) : 0,
      orbits: p.orbits ? p.orbits + (level >= 5 ? 1 : 0) : 0,
      interest: p.interest ? p.interest + 0.01 * L : 0,
      spareEvery: p.spareEvery ? p.spareEvery - (level >= 5 ? 1 : 0) : 0,
      freeze: p.freeze ? p.freeze + 0.1 * L : 0,
      volley: p.volley ? p.volley + Math.floor(L / 2) : 0,
      paint: p.paint ? p.paint + 0.1 * L : 0,
      paintR: p.paint ? (p.paintR || 0.6) + 0.03 * L : 0,
      paintAura: p.paintAura ? p.paintAura + 0.1 * L : 0,
      starPay: p.starPay ? p.starPay + 0.05 * L : 0,
      execute: p.execute ? Math.min(0.3, p.execute + 0.01 * L) : 0,
      drops: p.drops ? p.drops + Math.floor(L / 2) : 0,
      rewind: p.rewind ? p.rewind + 0.2 * L : 0,
    };
  };

  function makeTower(s, type, level, c, r, spent, setup) {
    return {
      id: s.nextId++, type, level, c, r, x: c + 0.5, y: r + 0.5,
      spent, setup, cd: 0, aim: -0.8, kick: 0, born: s.time, boost: 1, haste: 1, heat: 0, jam: 0,
      lastTarget: null, spin: 0, orbs: [], hitAt: new Map(), reach: 1, seeing: false, painting: 0, copyKey: null, gumGuard: 0,
      st: PC.towerStats(type, level),
    };
  }

  PC.towerAt = (s, c, r) => s.towers.find((t) => t.c === c && t.r === r) || null;

  // The price of the nth item from now, at this school's rate.
  PC.priceAt = (s, n) => PC.itemPrice(s.bought + n, rules(s).priceStep);
  PC.price = (s) => PC.priceAt(s, 0);

  // What dropping `type`/`level` onto tower `onto` would make, or null if they can't merge.
  PC.mergeResult = function (type, level, onto) {
    if (level !== onto.level || level >= PC.MAX_LEVEL) return null;
    return { type: PC.combine(type, onto.type), level: level + 1 };
  };

  function mergeInto(s, onto, type, level, spent) {
    const result = PC.mergeResult(type, level, onto);
    const parents = [type, onto.type];
    onto.type = result.type;
    onto.level = result.level;
    onto.spent += spent;
    onto.st = PC.towerStats(onto.type, onto.level);
    onto.copyKey = null;
    onto.setup = PC.SETUP_SECONDS * 0.6;
    onto.cd = 0;
    onto.heat = 0;
    onto.born = s.time;
    s.stats.merges++;
    s.fx.push({ k: 'merge', x: onto.x, y: onto.y, type: onto.type, level: onto.level, parents, tower: onto });
    burst(s, onto);
    return onto;
  }

  // Returns the tower the item landed in, or null if the drop isn't allowed.
  PC.buyItem = function (s, type, c, r) {
    const price = PC.price(s);
    if (s.money < price) return null;
    const onto = PC.towerAt(s, c, r);
    if (onto) {
      if (!PC.mergeResult(type, 1, onto)) return null;
      s.money -= price;
      s.bought++;
      return mergeInto(s, onto, type, 1, price);
    }
    if (!PC.isBuildable(s.map, c, r)) return null;
    s.money -= price;
    s.bought++;
    const t = makeTower(s, type, 1, c, r, price, PC.SETUP_SECONDS);
    s.towers.push(t);
    s.fx.push({ k: 'place', x: t.x, y: t.y, type });
    return t;
  };

  // Drop tower t on a cell: an empty cell moves it, a matching tower merges, any other tower swaps.
  PC.moveTower = function (s, t, c, r) {
    if (t.c === c && t.r === r) return null;
    const other = PC.towerAt(s, c, r);
    if (other) {
      if (PC.mergeResult(t.type, t.level, other)) {
        s.towers.splice(s.towers.indexOf(t), 1);
        return { action: 'merged', tower: mergeInto(s, other, t.type, t.level, t.spent) };
      }
      [other.c, other.r, t.c, t.r] = [t.c, t.r, other.c, other.r];
      for (const m of [t, other]) {
        m.x = m.c + 0.5;
        m.y = m.r + 0.5;
        m.setup = PC.SETUP_SECONDS;
        s.fx.push({ k: 'place', x: m.x, y: m.y, type: m.type });
      }
      return { action: 'swapped', tower: t };
    }
    if (!PC.isBuildable(s.map, c, r)) return null;
    t.c = c;
    t.r = r;
    t.x = c + 0.5;
    t.y = r + 0.5;
    t.setup = PC.SETUP_SECONDS;
    s.fx.push({ k: 'place', x: t.x, y: t.y, type: t.type });
    return { action: 'moved', tower: t };
  };

  PC.sellValue = (s, t) => Math.floor(t.spent * rules(s).refund);

  PC.sell = function (s, t) {
    s.money += PC.sellValue(s, t);
    s.towers.splice(s.towers.indexOf(t), 1);
    s.fx.push({ k: 'sell', x: t.x, y: t.y, type: t.type });
  };

  // ---- Damage -------------------------------------------------------------

  const rules = (s) => PC.DIFFICULTIES[s.difficulty];

  function damage(s, e, amount, type, ignoreArmor) {
    // An Excuse Note can't be marked at all while it is excused.
    if (e.dead || e.excuseT > 0) return;
    const cut = e.cutT > 0;
    // The homework's own armor and the school's armor stack. Piercing, wounds and cuts skip both.
    let dealt = !ignoreArmor && !cut ? amount * (1 - (e.def.armor || 0)) * (1 - (rules(s).armor || 0)) : amount;
    if (cut) dealt *= 1 + e.cutF;
    // A Peer Review's shield holds even when the homework is cut open. Piercing gets past it.
    if (e.shieldT > 0 && !ignoreArmor) dealt *= 1 - e.shieldF;
    // A Worksheet Stack only loses so many sheets to one hit, however big.
    if (e.def.cap) dealt = Math.min(dealt, e.maxHp * e.def.cap);
    s.stats.damage[type] += Math.min(dealt, e.hp);
    e.hp -= dealt;
    e.quiet = 0;
    if (e.hp <= 0) kill(s, e);
  }

  // The best Calculator in range pays a bonus on every kill.
  function payoutAt(s, e) {
    let best = 0;
    for (const t of s.towers) {
      if (t.st.payout > best && Math.hypot(e.x - t.x, e.y - t.y) <= t.st.range) best = t.st.payout;
    }
    return best;
  }

  function kill(s, e) {
    // A Makeup Test gets one more try: a clean sheet and part of its health back.
    if (e.def.revive && !e.revived) {
      e.revived = true;
      e.hp = e.maxHp * e.def.revive;
      Object.assign(e, { stingT: 0, wrapT: 0, wrapDps: 0, cutT: 0, cutF: 0, paintT: 0, marks: [] });
      s.fx.push({ k: 'revive', x: e.x, y: e.y });
      return;
    }
    e.dead = true;
    s.stats.kills++;
    // Gold stars from a Sticker Sheet add to any Calculator bonus, and an Overdue Book
    // gives back everything it took.
    const bounty = Math.round(PC.bounty(e.def, s.wave) * (1 + payoutAt(s, e) + e.starF) * rules(s).pay) + e.took;
    s.money += bounty;
    s.fx.push({ k: 'kill', x: e.x, y: e.y, size: e.def.size, bounty, marks: e.marks.map((n) => n.type) });
    // Wet paint splashes onto the neighbors, and can set off their paint in turn.
    if (e.paintT > 0) {
      s.fx.push({ k: 'splat', x: e.x, y: e.y, radius: e.paintR, type: e.paintType });
      for (const o of s.enemies) {
        if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) <= e.paintR + o.def.size * 0.5) damage(s, o, e.paintDmg, e.paintType, true);
      }
    }
    if (e.def.splits) {
      for (let i = 0; i < e.def.splits; i++) {
        spawn(s, e.def.splitsInto || 'spitball', Math.max(0, e.d + (i - 1) * 0.28), e.path);
      }
    }
    // Chewing Gum sticks to the closest supply. The guard stops a crowd of it from
    // holding every supply on the page shut.
    if (e.def.gums) {
      const gap = (t) => Math.hypot(t.x - e.x, t.y - e.y);
      const near = s.towers.filter((t) => gap(t) <= e.def.gumRange && t.gumGuard <= 0).sort((a, b) => gap(a) - gap(b))[0];
      if (near) {
        near.jam = Math.max(near.jam, e.def.gums);
        near.gumGuard = e.def.gums + 3;
        s.fx.push({ k: 'jam', x: near.x, y: near.y, fromX: e.x, fromY: e.y, text: 'Gummed up!', hex: '#e86aa0' });
      }
    }
  }

  // Laminated homework is too slick to slow down, short of a Black Hole.
  function slowDown(e, amount, time, anyway) {
    if (e.def.slick && !anyway) return;
    e.slowF = Math.max(e.slowF, amount);
    e.slowT = Math.max(e.slowT, time);
  }

  // How fast homework is walking right now, with everything that speeds it up or slows it.
  function paceOf(e) {
    const rush = e.def.rush ? 1 + e.def.rush * (1 - Math.max(0, e.hp) / e.maxHp) : 1;
    const rally = e.rallyT > 0 ? 1 + e.rallyF : 1;
    return e.speed * rush * rally * (1 - e.slowF * (e.def.slowResist || 1));
  }

  function mark(s, e, type) {
    if (e.marks.length >= 7) {
      e.marks[(s.rng() * 7) | 0].type = type;
      return;
    }
    e.marks.push({ type, a: s.rng() * TAU, r: 0.2 + s.rng() * 0.55, size: 0.14 + s.rng() * 0.16 });
  }

  // One hit from a tower: damage, then whatever the supply leaves behind.
  function strike(s, e, st, mult) {
    if (e.dead) return;
    mark(s, e, st.type);
    // The cut comes first, so the snip that opens a Textbook gets through it.
    if (st.cut) {
      e.cutF = Math.max(e.cutF, st.cut);
      e.cutT = st.cutTime;
    }
    // Paint and stars go on first too, so the hit that finishes homework off still counts.
    if (st.paint) {
      const wet = e.paintT > 0;
      e.paintDmg = Math.max(wet ? e.paintDmg : 0, st.dmg * st.paint);
      e.paintR = Math.max(wet ? e.paintR : 0, st.paintR);
      e.paintType = st.type;
      e.paintT = st.paintTime || 4;
    }
    if (st.starPay) e.starF = Math.max(e.starF, st.starPay);
    damage(s, e, st.dmg * mult, st.type, st.pierce);
    // Carbon Paper copies the hit onto every other piece of the same homework on the page.
    if (st.carbon) {
      for (const o of s.enemies) {
        if (o !== e && !o.dead && o.type === e.type) damage(s, o, st.dmg * mult * st.carbon, st.type, st.pierce);
      }
    }
    s.fx.push({ k: 'hit', x: e.x, y: e.y, type: st.type });
    // The cap stops a small hole punch deleting a boss in a few bites.
    if (st.bite) damage(s, e, Math.min(e.hp * st.bite * (e.def.slowResist || 1), st.dmg * 6), st.type, true);
    // A failing grade finishes off weak homework. Bosses are never failed outright.
    if (st.execute && !e.dead && !e.def.letter && e.hp < e.maxHp * st.execute) {
      s.fx.push({ k: 'fail', x: e.x, y: e.y });
      damage(s, e, e.hp + 1, st.type, true);
    }
    if (e.dead) return;
    if (st.slow) slowDown(e, st.slow, st.slowTime);
    if (st.sting) {
      e.stingDps = Math.max(e.stingDps, st.dmg * st.sting);
      e.stingT = st.stingTime;
    }
    if (st.wrap) {
      const add = st.dmg * st.wrap;
      e.wrapDps = Math.min(e.wrapDps + add, add * st.wrapLayers);
      e.wrapT = st.wrapTime;
    }
    // Each shove is weaker than the last, or a few Erasers could hold a wave back forever.
    if (st.push && !e.def.steady) {
      e.d = Math.max(0, e.d - st.push * (e.def.slowResist || 1) * 0.7 ** e.pushes);
      e.pushes++;
      placeEnemy(e);
    }
    // The guard leaves a gap between stuns for the same reason.
    if (st.stun && !e.def.steady && e.stunGuard <= 0) {
      e.stunT = st.stun * (e.def.slowResist || 1);
      e.stunGuard = e.stunT + 1.2;
    }
  }

  function splashAt(s, x, y, st, kind = 'splash') {
    s.fx.push({ k: kind, x, y, type: st.type, radius: st.splash });
    for (const e of s.enemies) {
      if (!e.dead && Math.hypot(e.x - x, e.y - y) <= st.splash + e.def.size * 0.5) strike(s, e, st, 1);
    }
  }

  function addPuddle(s, x, y, st) {
    s.puddles.push({ x, y, r: st.puddle, dps: st.dmg, slow: st.puddleSlow, grabs: st.grabs, t: st.puddleTime, life: st.puddleTime, type: st.type, seed: s.rng() * 99 });
    s.fx.push({ k: 'puddle', x, y, type: st.type });
  }

  function stepPuddles(s, dt) {
    for (const z of s.puddles) {
      z.t -= dt;
      for (const e of s.enemies) {
        // Paper Cranes fly over anything lying on the page, but not over a Black Hole.
        if (e.dead || (e.def.flies && !z.grabs) || Math.hypot(e.x - z.x, e.y - z.y) > z.r) continue;
        damage(s, e, z.dps * dt, z.type, true);
        slowDown(e, z.slow, 0.2, z.grabs);
      }
    }
    s.puddles = s.puddles.filter((z) => z.t > 0);
  }

  function addTrap(s, x, y, st) {
    s.traps.push({ x, y, r: st.trapRadius, st, charges: st.trapCharges, t: st.trapLife, type: st.type, hit: new Set(), seed: s.rng() * 99 });
    if (s.traps.length > 40) s.traps.shift();
    s.fx.push({ k: 'place', x, y, type: st.type });
  }

  // Each enemy can only set off a given trap once.
  function stepTraps(s, dt) {
    for (const z of s.traps) {
      z.t -= dt;
      for (const e of s.enemies) {
        if (z.charges <= 0) break;
        if (e.dead || e.def.flies || z.hit.has(e) || Math.hypot(e.x - z.x, e.y - z.y) > z.r + e.def.size * 0.5) continue;
        z.hit.add(e);
        z.charges--;
        strike(s, e, z.st, 1);
      }
    }
    s.traps = s.traps.filter((z) => z.t > 0 && z.charges > 0);
  }

  function burst(s, t) {
    const radius = PC.BURST.radius + PC.BURST.radiusPerLevel * t.level;
    s.fx.push({ k: 'burst', x: t.x, y: t.y, type: t.type, radius });
    if (!t.st.dmg) return;
    const st = t.st.carbon ? { ...t.st, carbon: 0 } : t.st;
    for (const e of s.enemies) {
      if (!e.dead && Math.hypot(e.x - t.x, e.y - t.y) <= radius) strike(s, e, st, PC.BURST.damage);
    }
  }

  // ---- Enemies ------------------------------------------------------------

  function placeEnemy(e) {
    const p = PC.pointAt(e.path, e.d);
    e.x = p.x - p.ty * e.lat;
    e.y = p.y + p.tx * e.lat;
    e.ang = Math.atan2(p.ty, p.tx);
  }

  // A map with a harsh opening eases in: homework starts at `open` and reaches `hp` by wave 10.
  function mapHp(map, wave) {
    const open = map.open || map.hp;
    return open + (map.hp - open) * Math.min(1, (wave - 1) / 9);
  }

  function spawn(s, type, d, path) {
    const def = PC.ENEMIES[type];
    const map = PC.mapOf(s);
    const hp = PC.enemyHp(s.wave, rules(s)) * def.hp * rules(s).hp * mapHp(map, s.wave);
    const e = {
      id: s.nextId++, type, def, hp, maxHp: hp, speed: def.speed * rules(s).speed * (map.speed || 1), d: d || 0, x: 0, y: 0, ang: 0,
      // Fresh homework takes the routes in turn. Anything it leaves behind stays on its path.
      path: path || map.paths[s.spawned++ % map.paths.length],
      lat: (s.rng() - 0.5) * (type === 'exam' ? 0.1 : 0.36),
      slowF: 0, slowT: 0, stingDps: 0, stingT: 0, wrapDps: 0, wrapT: 0,
      cutF: 0, cutT: 0, stunT: 0, stunGuard: 0, pushes: 0, quiet: 0, clock: 0,
      paintT: 0, paintDmg: 0, paintR: 0, paintType: null, starF: 0, shieldT: 0, shieldF: 0,
      excuseT: 0, rallyT: 0, rallyF: 0, freezeGuard: 0, rewinds: 0, took: 0, revived: false, copied: false,
      marks: [], dead: false, seed: s.rng() * TAU,
    };
    placeEnemy(e);
    s.enemies.push(e);
    if (def.letter) s.fx.push({ k: 'boss', wave: s.wave, type });
    return e;
  }

  // The tricks that make each kind of homework different. Stunned enemies can't use them.
  function useAbilities(s, e, dt) {
    const d = e.def;
    e.quiet += dt;
    if (d.regen && e.quiet >= d.regenDelay) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * d.regen * dt);

    const every = d.blinkEvery || d.healEvery || d.jamEvery || d.dropEvery || d.shieldEvery
      || d.excuseEvery || d.rallyEvery || d.copyEvery || d.fineEvery;
    if (!every) return;
    e.clock += dt;
    if (e.clock < every) return;
    e.clock = 0;

    if (d.blink) {
      s.fx.push({ k: 'blink', x: e.x, y: e.y });
      e.d += d.blink;
      placeEnemy(e);
      s.fx.push({ k: 'blink', x: e.x, y: e.y });
    }
    if (d.heal) {
      s.fx.push({ k: 'heal', x: e.x, y: e.y, radius: d.healRadius });
      for (const o of s.enemies) {
        if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) <= d.healRadius) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * d.heal);
      }
    }
    if (d.jam) {
      const gap = (t) => Math.hypot(t.x - e.x, t.y - e.y);
      const near = s.towers.filter((t) => gap(t) <= d.jamRange).sort((a, b) => gap(a) - gap(b))[0];
      if (near) {
        near.jam = Math.max(near.jam, d.jam);
        s.fx.push({ k: 'jam', x: near.x, y: near.y, fromX: e.x, fromY: e.y });
      }
    }
    if (d.drops) spawn(s, d.drops, Math.max(0, e.d - 0.2), e.path);
    if (d.shield) {
      s.fx.push({ k: 'shield', x: e.x, y: e.y, radius: d.shieldRadius });
      for (const o of s.enemies) {
        if (o.dead || Math.hypot(o.x - e.x, o.y - e.y) > d.shieldRadius) continue;
        o.shieldF = Math.max(o.shieldT > 0 ? o.shieldF : 0, d.shield);
        o.shieldT = d.shieldTime;
      }
    }
    if (d.excuse) e.excuseT = d.excuse;
    if (d.rally) {
      for (const o of s.enemies) {
        if (o === e || o.dead || Math.hypot(o.x - e.x, o.y - e.y) > d.rallyRadius) continue;
        o.rallyF = d.rally;
        o.rallyT = d.rallyEvery + 0.2;
      }
    }
    // One copy each, and copies can't copy, or a crowd of them would never end.
    if (d.copyEvery && !e.copied) {
      const twin = spawn(s, e.type, Math.max(0, e.d - 0.35), e.path);
      Object.assign(twin, { hp: e.hp, maxHp: e.maxHp, copied: true });
      e.copied = true;
      s.fx.push({ k: 'copy', x: e.x, y: e.y });
    }
    if (d.fine) {
      const amount = Math.min(Math.floor(s.money), d.fine + s.wave);
      if (amount > 0) {
        s.money -= amount;
        e.took += amount;
        s.fx.push({ k: 'fine', x: e.x, y: e.y, amount });
      }
    }
  }

  function stepEnemy(s, e, dt) {
    if (e.slowT > 0 && (e.slowT -= dt) <= 0) e.slowF = 0;
    if (e.cutT > 0 && (e.cutT -= dt) <= 0) e.cutF = 0;
    if (e.paintT > 0) e.paintT -= dt;
    if (e.shieldT > 0) e.shieldT -= dt;
    if (e.excuseT > 0) e.excuseT -= dt;
    if (e.rallyT > 0) e.rallyT -= dt;
    if (e.freezeGuard > 0) e.freezeGuard -= dt;
    if (e.stunGuard > 0) e.stunGuard -= dt;
    if (e.stingT > 0) {
      e.stingT -= dt;
      damage(s, e, e.stingDps * dt, 'compass', true);
    }
    if (e.wrapT > 0) {
      if ((e.wrapT -= dt) <= 0) e.wrapDps = 0;
      damage(s, e, e.wrapDps * dt, 'tape', true);
    }
    if (e.dead) return;
    if (e.stunT > 0) {
      e.stunT -= dt;
      return;
    }
    useAbilities(s, e, dt);
    e.d += paceOf(e) * dt;
    placeEnemy(e);
    if (e.d >= e.path.length) {
      e.dead = true;
      s.lives = Math.max(0, s.lives - e.def.leak);
      s.fx.push({ k: 'leak', amount: e.def.leak });
      if (s.lives === 0 && s.phase !== 'over') {
        s.phase = 'over';
        s.fx.push({ k: 'over' });
      }
    }
  }

  // ---- Firing -------------------------------------------------------------

  function pickTarget(s, t) {
    const range = t.st.range * t.reach;
    let best = null, bestScore = -Infinity;
    for (const e of s.enemies) {
      const gap = Math.hypot(e.x - t.x, e.y - t.y);
      if (e.dead || gap > range + e.def.size * 0.5) continue;
      if (e.def.stealth && gap > e.def.stealth && !t.st.sees && !t.seeing) continue;
      let score = t.st.strongest ? e.hp : -leftOf(e);
      // Nothing hurts excused homework, so anything else comes first.
      if (e.excuseT > 0) score -= 1e9;
      // Slow and wrap are wasted on an enemy already covered in it, or too slick for it.
      if (t.st.slow && (e.slowT > 0.4 || e.def.slick)) score -= 100;
      if (t.st.wrap && e.wrapDps >= t.st.dmg * t.st.wrap * t.st.wrapLayers) score -= 100;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  function fireStroke(s, t, target, st) {
    fireStrokeAt(s, t, Math.atan2(target.y - t.y, target.x - t.x), st);
  }

  // A Prism splits its beam into a fan, each beam its own color and effect.
  function firePrism(s, t, target, st) {
    const aim = Math.atan2(target.y - t.y, target.x - t.x), n = st.beams;
    for (let i = 0; i < n; i++) {
      const beam = st.rainbow ? { ...st, ...PC.RAINBOW[i % PC.RAINBOW.length] } : st;
      fireStrokeAt(s, t, aim + (i - (n - 1) / 2) * st.beamGap, beam);
    }
  }

  function fireStrokeAt(s, t, angle, st) {
    const ux = Math.cos(angle), uy = Math.sin(angle), reach = st.range + 0.4;
    s.fx.push({ k: 'stroke', x: t.x, y: t.y, x2: t.x + ux * reach, y2: t.y + uy * reach, type: st.type, hex: st.hex });
    for (const e of s.enemies) {
      if (e.dead) continue;
      const along = (e.x - t.x) * ux + (e.y - t.y) * uy;
      if (along < 0 || along > reach) continue;
      const off = Math.abs((e.x - t.x) * uy - (e.y - t.y) * ux);
      if (off <= st.strokeWidth + e.def.size * 0.5) strike(s, e, st, 1);
    }
  }

  function fireSnip(s, t, st) {
    const reach = (e) => Math.hypot(e.x - t.x, e.y - t.y);
    const inReach = s.enemies.filter((e) => !e.dead && reach(e) <= st.range + e.def.size * 0.5);
    for (const e of inReach.sort((a, b) => reach(a) - reach(b)).slice(0, st.cuts)) {
      s.fx.push({ k: 'snip', x: e.x, y: e.y, type: st.type });
      strike(s, e, st, 1);
    }
  }

  // Hits everything in a wedge pointing at the target.
  function fireCone(s, t, st) {
    s.fx.push({ k: 'cone', x: t.x, y: t.y, aim: t.aim, width: st.coneWidth, range: st.range, type: st.type });
    for (const e of s.enemies) {
      if (e.dead || Math.hypot(e.x - t.x, e.y - t.y) > st.range + e.def.size * 0.5) continue;
      const turn = Math.atan2(e.y - t.y, e.x - t.x) - t.aim;
      if (Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) <= st.coneWidth) strike(s, e, st, 1);
    }
  }

  // Hits everything in reach at once.
  function fireNova(s, t, st) {
    s.fx.push({ k: 'nova', x: t.x, y: t.y, radius: st.range, type: st.type });
    for (const e of s.enemies) {
      if (!e.dead && Math.hypot(e.x - t.x, e.y - t.y) <= st.range + e.def.size * 0.5) strike(s, e, st, 1);
    }
  }

  // An instant hit with a visible beam, so it can fire fast without a crowd of shots.
  function fireZap(s, t, target, st) {
    s.fx.push({ k: 'zap', x: t.x, y: t.y, x2: target.x, y2: target.y, type: st.type });
    strike(s, target, st, 1);
  }

  // Stops everything on the page that can be stopped. A Snow Day hurts it as well.
  function fireFreeze(s, st) {
    s.fx.push({ k: 'freeze', snow: !!st.dmg });
    for (const e of s.enemies) {
      if (st.dmg) strike(s, e, st, 1);
      if (!e.dead && !e.def.steady) e.stunT = Math.max(e.stunT, st.freeze * (e.def.slowResist || 1));
    }
  }

  // Throws everything back along the path. Each rewind moves the same homework less, or a
  // few Time Machines could hold a wave on the page forever.
  function fireRewind(s, st) {
    s.fx.push({ k: 'rewind' });
    for (const e of s.enemies) {
      if (e.dead) continue;
      strike(s, e, st, 1);
      if (e.dead || e.def.steady) continue;
      e.d = Math.max(0, e.d - st.rewind * (e.def.slowResist || 1) * 0.75 ** e.rewinds);
      e.rewinds++;
      placeEnemy(e);
    }
  }

  // The bus starts at the exit and drives back along the whole path its target is on.
  function fireBus(s, st, target) {
    s.shots.push({ bus: true, type: st.type, st, path: target.path, d: target.path.length, x: 0, y: 0, ang: 0, hits: new Set() });
    s.fx.push({ k: 'bus' });
  }

  // Where to aim a lob so it lands on the target, allowing for how far it walks meanwhile.
  function leadPoint(target, st) {
    return PC.pointAt(target.path, target.d + paceOf(target) * st.flight);
  }

  // A volley lands on the target plus random spots on the path within range.
  function volleySpots(s, t, target, st) {
    const spots = [leadPoint(target, st)];
    const pts = PC.mapOf(s).pts;
    for (let tries = 0; spots.length < st.volley && tries < 40; tries++) {
      const p = pts[(s.rng() * pts.length) | 0];
      if (Math.hypot(p.x - t.x, p.y - t.y) <= st.range) spots.push(p);
    }
    return spots;
  }

  // An instant splash where the target stands, plus more on random spots of the path in
  // range for a volley. There is no flight, so nothing needs leading.
  function fireStamp(s, t, target, st) {
    const spots = [{ x: target.x, y: target.y }];
    const pts = PC.mapOf(s).pts;
    for (let tries = 0; spots.length < (st.volley || 1) && tries < 40; tries++) {
      const p = pts[(s.rng() * pts.length) | 0];
      if (Math.hypot(p.x - t.x, p.y - t.y) <= st.range) spots.push(p);
    }
    for (const p of spots) splashAt(s, p.x, p.y, st, 'stamp');
  }

  // Hits `drops` homework in range at once: random ones, or the ones nearest the stars.
  function fireRain(s, t, st) {
    const pool = s.enemies.filter((e) => !e.dead && Math.hypot(e.x - t.x, e.y - t.y) <= st.range + e.def.size * 0.5);
    if (st.front) pool.sort((a, b) => leftOf(a) - leftOf(b));
    else if (st.strongest) pool.sort((a, b) => b.hp - a.hp);
    for (let i = 0; i < st.drops && pool.length; i++) {
      const e = st.front || st.strongest ? pool.shift() : pool.splice((s.rng() * pool.length) | 0, 1)[0];
      s.fx.push({ k: 'rain', x: e.x, y: e.y, type: st.type });
      if (st.splash) splashAt(s, e.x, e.y, st, 'blast');
      else strike(s, e, st, 1);
    }
  }

  function fireBoomerang(s, t, target, st) {
    const dx = target.x - t.x, dy = target.y - t.y, l = Math.hypot(dx, dy) || 1;
    s.shots.push({ boomerang: true, type: st.type, st, x: t.x, y: t.y, sx: t.x, sy: t.y, ux: dx / l, uy: dy / l, k: 0, back: false, hits: new Set() });
  }

  function fireChain(s, t, target, st) {
    const links = [{ x: t.x, y: t.y }];
    const hit = new Set();
    let at = target, mult = 1;
    for (let i = 0; i < st.chain && at; i++) {
      hit.add(at);
      links.push({ x: at.x, y: at.y });
      strike(s, at, st, mult);
      mult *= st.falloff;
      let next = null, nearest = st.chainHop;
      for (const e of s.enemies) {
        if (e.dead || hit.has(e)) continue;
        const d = Math.hypot(e.x - at.x, e.y - at.y);
        if (d < nearest) {
          nearest = d;
          next = e;
        }
      }
      at = next;
    }
    s.fx.push({ k: 'chain', links, type: st.type });
  }

  // Attacks that hit many targets at once. Carbon copies only come from single shots:
  // copying every hit of an area attack onto every match would multiply it out of control.
  const AREA = new Set(['stroke', 'chain', 'snip', 'cone', 'nova', 'boomerang', 'freeze', 'bus', 'stamp', 'rain', 'prism', 'rewind', 'lob']);

  function fire(s, t, target) {
    let st = boosted(t);
    if (st.carbon && AREA.has(st.attack)) st = { ...st, carbon: 0 };
    if (st.rainbow) st = { ...st, ...PC.RAINBOW[(s.rng() * PC.RAINBOW.length) | 0] };
    if (st.focus) st = { ...st, dmg: st.dmg * (1 + st.ramp * t.heat) };
    t.aim = Math.atan2(target.y - t.y, target.x - t.x);
    t.kick = 1;
    s.fx.push({ k: 'fire', type: st.type, level: st.level });
    if (st.attack === 'stroke') return fireStroke(s, t, target, st);
    if (st.attack === 'chain') return fireChain(s, t, target, st);
    if (st.attack === 'snip') return fireSnip(s, t, st);
    if (st.attack === 'cone') return fireCone(s, t, st);
    if (st.attack === 'nova') return fireNova(s, t, st);
    if (st.attack === 'boomerang') return fireBoomerang(s, t, target, st);
    if (st.attack === 'zap') return fireZap(s, t, target, st);
    if (st.attack === 'freeze') return fireFreeze(s, st);
    if (st.attack === 'bus') return fireBus(s, st, target);
    if (st.attack === 'stamp') return fireStamp(s, t, target, st);
    if (st.attack === 'rain') return fireRain(s, t, st);
    if (st.attack === 'prism') return firePrism(s, t, target, st);
    if (st.attack === 'rewind') return fireRewind(s, st);
    if (st.attack === 'lob') {
      for (const p of st.volley ? volleySpots(s, t, target, st) : [leadPoint(target, st)]) {
        s.shots.push({ lob: true, type: st.type, st, x: t.x, y: t.y, z: 0, sx: t.x, sy: t.y, tx: p.x, ty: p.y, t: 0 });
      }
      return;
    }
    for (const e of st.spread ? nearestTo(s, t, target, st) : [target]) {
      const crit = st.crit && s.rng() < st.crit;
      const mult = (1 + st.stretch * (Math.hypot(e.x - t.x, e.y - t.y) / st.range)) * (crit ? st.critMult : 1);
      s.shots.push({ type: st.type, st, mult, crit, target: e, x: t.x, y: t.y, tx: e.x, ty: e.y });
    }
  }

  // The target plus whichever others in range are closest to it.
  function nearestTo(s, t, target, st) {
    const gap = (e) => Math.hypot(e.x - target.x, e.y - target.y);
    const others = s.enemies.filter((e) => !e.dead && e !== target && Math.hypot(e.x - t.x, e.y - t.y) <= st.range);
    return [target, ...others.sort((a, b) => gap(a) - gap(b)).slice(0, st.spread - 1)];
  }

  function stepShot(s, p, dt) {
    if (p.bus) {
      p.d -= p.st.busSpeed * dt;
      const at = PC.pointAt(p.path, Math.max(0, p.d));
      p.x = at.x;
      p.y = at.y;
      p.ang = Math.atan2(-at.ty, -at.tx);
      for (const e of s.enemies) {
        if (e.dead || p.hits.has(e) || Math.hypot(e.x - p.x, e.y - p.y) > 0.45 + e.def.size * 0.5) continue;
        p.hits.add(e);
        strike(s, e, p.st, 1);
      }
      if (p.d <= 0) p.done = true;
      return;
    }
    if (p.boomerang) {
      // k runs 0 to 1 on the way out and 1 to 2 on the way back. Each leg can hit once.
      p.k += (dt * p.st.shotSpeed) / p.st.range;
      if (p.k >= 1 && !p.back) {
        p.back = true;
        p.hits.clear();
      }
      const along = (p.k <= 1 ? p.k : 2 - p.k) * p.st.range;
      p.x = p.sx + p.ux * along;
      p.y = p.sy + p.uy * along;
      for (const e of s.enemies) {
        if (e.dead || p.hits.has(e) || Math.hypot(e.x - p.x, e.y - p.y) > 0.34 + e.def.size * 0.5) continue;
        p.hits.add(e);
        strike(s, e, p.st, 1);
      }
      if (p.k >= 2) p.done = true;
      return;
    }
    if (p.lob) {
      p.t += dt;
      const k = Math.min(1, p.t / p.st.flight);
      p.x = p.sx + (p.tx - p.sx) * k;
      p.y = p.sy + (p.ty - p.sy) * k;
      p.z = Math.sin(k * Math.PI) * 0.7;
      if (k >= 1) {
        p.done = true;
        if (p.st.puddle) addPuddle(s, p.tx, p.ty, p.st);
        else if (p.st.trapCharges) addTrap(s, p.tx, p.ty, p.st);
        else splashAt(s, p.tx, p.ty, p.st);
      }
      return;
    }
    if (!p.target.dead) {
      p.tx = p.target.x;
      p.ty = p.target.y;
    }
    const dx = p.tx - p.x, dy = p.ty - p.y, dist = Math.hypot(dx, dy), move = p.st.shotSpeed * dt;
    if (dist <= move) {
      p.done = true;
      if (!p.target.dead) {
        strike(s, p.target, p.st, p.mult);
        if (p.crit) s.fx.push({ k: 'crit', x: p.tx, y: p.ty });
      }
      return;
    }
    p.x += (dx / dist) * move;
    p.y += (dy / dist) * move;
  }

  // ---- Waves --------------------------------------------------------------

  PC.sendWave = function (s) {
    if (s.phase !== 'build') return false;
    s.wave++;
    s.phase = 'wave';
    s.waveClock = 0;
    s.queue = [];
    for (const [type, count, gap, delay] of PC.waveFor(s.wave, s.difficulty)) {
      for (let i = 0; i < count; i++) s.queue.push({ at: (delay || 0) + i * gap, type });
    }
    s.queue.sort((a, b) => a.at - b.at);
    s.fx.push({ k: 'waveStart', wave: s.wave });
    return true;
  };

  // A tower's stats with any Sharpener damage boost, Easel range boost and Drying Rack
  // paint applied.
  const boosted = (t) => {
    if (t.boost <= 1 && t.reach <= 1 && t.painting <= t.st.paint) return t.st;
    const st = { ...t.st, dmg: t.st.dmg * t.boost, range: t.st.range * t.reach };
    if (t.painting > st.paint) Object.assign(st, { paint: t.painting, paintR: Math.max(st.paintR, 0.6), paintTime: 4 });
    return st;
  };

  // Sand Timer and friends: everything inside the range keeps being slowed, and with
  // `expose` it also loses its armor and takes extra damage while it stays inside.
  function applyField(s, t) {
    for (const e of s.enemies) {
      if (e.dead || Math.hypot(e.x - t.x, e.y - t.y) > t.st.range) continue;
      slowDown(e, t.st.field, 0.15);
      if (t.st.expose) {
        e.cutF = Math.max(e.cutF, t.st.expose);
        e.cutT = Math.max(e.cutT, 0.15);
      }
    }
  }

  // Globe: moons circle the tower, and each enemy can only be hit so often.
  function stepOrbit(s, t, dt) {
    const st = t.st, radius = st.range * 0.7;
    t.spin += dt * 2.4;
    t.orbs = [];
    for (let i = 0; i < st.orbits; i++) {
      const a = t.spin + (i * TAU) / st.orbits;
      t.orbs.push({ x: t.x + Math.cos(a) * radius, y: t.y + Math.sin(a) * radius });
    }
    if (t.hitAt.size > 200) t.hitAt.clear();
    for (const o of t.orbs) {
      for (const e of s.enemies) {
        if (e.dead || Math.hypot(e.x - o.x, e.y - o.y) > 0.3 + e.def.size * 0.5) continue;
        if ((t.hitAt.get(e) || 0) > s.time) continue;
        t.hitAt.set(e, s.time + 1 / st.rate);
        const hit = { ...boosted(t), carbon: 0 };
        strike(s, e, hit.rainbow ? { ...hit, ...PC.RAINBOW[(s.rng() * PC.RAINBOW.length) | 0] } : hit, 1);
      }
    }
  }

  // Every supply takes the best damage, speed and range boost next to it, and can see
  // Invisible Ink if a Desk Lamp is close.
  function applyAuras(s) {
    for (const t of s.towers) {
      t.boost = 1;
      t.haste = 1;
      t.reach = 1;
      t.seeing = false;
      t.painting = 0;
    }
    for (const a of s.towers) {
      if ((!a.st.aura && !a.st.haste && !a.st.reach && !a.st.reveal && !a.st.paintAura) || a.setup > 0 || a.jam > 0) continue;
      for (const t of s.towers) {
        if (t === a || Math.hypot(t.x - a.x, t.y - a.y) > a.st.auraRange) continue;
        t.boost = Math.max(t.boost, 1 + a.st.aura);
        t.haste = Math.max(t.haste, 1 + a.st.haste);
        t.reach = Math.max(t.reach, 1 + a.st.reach);
        t.painting = Math.max(t.painting, a.st.paintAura);
        if (a.st.reveal) t.seeing = true;
      }
    }
    // A spot on the map helps whatever sits on it, on top of the rest.
    const { spotAt } = PC.mapOf(s);
    if (!spotAt.size) return;
    for (const t of s.towers) {
      const kind = spotAt.get(t.c + ',' + t.r);
      if (!kind) continue;
      const bonus = 1 + PC.SPOTS[kind].bonus;
      if (kind === 'power') t.boost *= bonus;
      else if (kind === 'speed') t.haste *= bonus;
      else t.reach *= bonus;
    }
  }

  // A Photocopier takes on the attack of the strongest attacking supply next to it, at its
  // own level and `copy` times the damage. With nothing to copy it uses its own attack.
  function applyCopies(s) {
    for (const t of s.towers) {
      const own = PC.SUPPLIES[t.type];
      if (!own.copy) continue;
      let best = null, bestScore = 0;
      for (const o of s.towers) {
        if (o === t || PC.SUPPLIES[o.type].copy || !o.st.dmg || !o.st.rate) continue;
        if (Math.hypot(o.x - t.x, o.y - t.y) > 1.6) continue;
        const nb = PC.SUPPLIES[o.type], score = nb.dmg * nb.rate * (nb.mythic ? 8 : nb.legendary ? 4 : nb.from ? 2 : 1);
        if (score > bestScore) {
          bestScore = score;
          best = o;
        }
      }
      const key = best ? best.type : '';
      if (t.copyKey === key) continue;
      t.copyKey = key;
      const base = PC.towerStats(t.type, t.level);
      if (!best) {
        t.st = base;
        continue;
      }
      const copied = PC.towerStats(best.type, t.level);
      // Only the attack is copied, never boosts, slowing fields or money.
      t.st = {
        ...copied, type: t.type, copy: base.copy, carbon: base.carbon || copied.carbon, dmg: copied.dmg * base.copy,
        aura: 0, haste: 0, reach: 0, reveal: false, paintAura: 0, field: 0, expose: 0, payout: 0, interest: 0, spareEvery: 0,
      };
      t.cd = Math.max(t.cd, 0.3);
    }
  }

  PC.step = function (s, dt) {
    if (s.phase === 'over') return;
    s.time += dt;

    if (s.phase === 'wave') {
      s.waveClock += dt;
      while (s.queue.length && s.queue[0].at <= s.waveClock) spawn(s, s.queue.shift().type, 0);
    }

    applyAuras(s);
    applyCopies(s);
    for (const t of s.towers) {
      t.kick = Math.max(0, t.kick - dt * 6);
      if (t.gumGuard > 0) t.gumGuard -= dt;
      if (t.setup > 0) {
        t.setup -= dt;
        continue;
      }
      if (t.jam > 0) {
        t.jam -= dt;
        continue;
      }
      if (t.st.field) applyField(s, t);
      if (t.st.orbits) {
        stepOrbit(s, t, dt * t.haste);
        continue;
      }
      if (!t.st.rate) continue;
      t.cd -= dt * t.haste;
      if (t.cd > 0) continue;
      const target = pickTarget(s, t);
      if (target) {
        // A focused beam starts cool again whenever it switches target.
        if (t.st.focus && target !== t.lastTarget) t.heat = 0;
        t.lastTarget = target;
        fire(s, t, target);
        t.heat = Math.min(t.heat + 1, t.st.rampMax);
        t.cd = 1 / (t.st.rate * (1 + (t.st.focus ? 0 : t.st.ramp) * t.heat));
      } else {
        t.heat = 0;
      }
    }

    // Splits append to the list while it is walked, so go by index.
    for (let i = 0; i < s.enemies.length; i++) {
      if (!s.enemies[i].dead) stepEnemy(s, s.enemies[i], dt);
    }
    for (const p of s.shots) stepShot(s, p, dt);
    stepPuddles(s, dt);
    stepTraps(s, dt);
    s.shots = s.shots.filter((p) => !p.done);
    s.enemies = s.enemies.filter((e) => !e.dead);

    if (s.phase === 'wave' && !s.queue.length && !s.enemies.length) {
      const bonus = Math.round(PC.clearBonus(s.wave) * rules(s).pay);
      s.money += bonus;
      s.phase = 'build';
      const every = rules(s).starEvery;
      if (every && s.wave % every === 0 && s.lives < s.maxLives) {
        s.lives++;
        const [c, r] = PC.mapOf(s).exits[0];
        s.fx.push({ k: 'star', x: c + 0.5, y: r - 0.1 });
      }
      for (const t of s.towers) {
        // Abacus interest is capped by level, so hoarding can't run away with the game.
        if (t.st.interest) {
          const gain = Math.min(Math.floor(s.money * t.st.interest), Math.round(20 * PC.LEVEL.damage ** (t.level - 1)));
          s.money += gain;
          s.fx.push({ k: 'interest', x: t.x, y: t.y, amount: gain });
        }
        if (t.st.spareEvery && s.wave % t.st.spareEvery === 0 && s.lives < s.maxLives) {
          s.lives++;
          s.fx.push({ k: 'star', x: t.x, y: t.y - 0.3 });
        }
      }
      s.fx.push({ k: 'waveClear', wave: s.wave, bonus });
      if (s.wave === PC.FINAL_WAVE) s.fx.push({ k: 'win' });
      else if (s.wave % PC.RECESS.every === 0) s.recess = s.wave;
    }
  };

  // Spends the recess that is waiting and pays for the score, 0 to 1. Returns the prize.
  PC.takeRecess = function (s, score) {
    const prize = Math.round(PC.RECESS.supplies * PC.price(s) * Math.max(0, Math.min(1, score)));
    s.recess = 0;
    s.money += prize;
    return prize;
  };

  // ---- New game and saves -------------------------------------------------

  PC.newGame = function (seed, difficulty = 'normal', map = PC.DEFAULT_MAP) {
    const school = PC.DIFFICULTIES[difficulty];
    const s = {
      time: 0, phase: 'build', wave: 0, waveClock: 0, difficulty, map, spawned: 0, recess: 0,
      lives: school.lives, maxLives: school.lives, money: school.money, bought: 0,
      towers: [], enemies: [], shots: [], puddles: [], traps: [], queue: [], fx: [],
      nextId: 1, rng: makeRng(seed === undefined ? Date.now() : seed),
      stats: { kills: 0, merges: 0, damage: Object.fromEntries(Object.keys(PC.SUPPLIES).map((k) => [k, 0])) },
    };
    for (const [type, c, r] of PC.MAPS[map].start) s.towers.push(makeTower(s, type, 1, c, r, PC.itemPrice(0), 0));
    return s;
  };

  // A save always resumes between waves, so a wave in progress gets replayed.
  PC.save = (s) => ({
    version: PC.SAVE_VERSION,
    difficulty: s.difficulty,
    map: s.map, recess: s.recess,
    wave: s.phase === 'wave' ? s.wave - 1 : s.wave,
    lives: s.lives, money: s.money, bought: s.bought, stats: s.stats,
    towers: s.towers.map(({ type, level, c, r, spent }) => ({ type, level, c, r, spent })),
  });

  PC.load = function (data) {
    // Saves from before there were maps are all on the default one.
    const s = PC.newGame(undefined, data.difficulty, PC.MAPS[data.map] ? data.map : PC.DEFAULT_MAP);
    // Older saves don't list damage for newer supplies, so start from a full set.
    const damage = { ...s.stats.damage, ...data.stats.damage };
    Object.assign(s, { wave: data.wave, lives: data.lives, money: data.money, bought: data.bought, recess: data.recess || 0, stats: { ...data.stats, damage } });
    s.towers = data.towers.map((t) => makeTower(s, t.type, t.level, t.c, t.r, t.spent, 0));
    return s;
  };
})();
