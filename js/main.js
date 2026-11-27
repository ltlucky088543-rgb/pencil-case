// Input, HUD, dialogs and the frame loop.
(function () {
  const PC = globalThis.PC;
  const $ = (id) => document.getElementById(id);
  const SAVE_KEY = 'pencil-case-save';
  const BEST_KEY = 'pencil-case-best';
  const LEARNED_KEY = 'pencil-case-learned';
  const FOUND_KEY = 'pencil-case-found';
  const MAP_KEY = 'pencil-case-map';
  const MINI_KEY = 'pencil-case-mini';
  const STEP = 1 / 60;
  const SPEEDS = [1, 2, 3];

  const app = $('app'), stage = $('stage'), sheet = $('sheet'), canvas = $('board');
  const hint = $('hint'), banner = $('banner'), ghost = $('ghost'), modal = $('modal');

  const store = {
    get(key) {
      try {
        return JSON.parse(localStorage.getItem(key));
      } catch (err) {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (err) { /* private windows can refuse storage, and the game runs fine without it */ }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (err) { /* same as above */ }
    },
  };

  const renderer = PC.createRenderer(canvas);
  const audio = PC.createAudio();

  let s = null;
  let lastHud = '', lastFrame = 0, carry = 0, flashTimer = 0;

  const ui = {
    speed: 1, paused: false, muted: false, gallery: false, dialog: null,
    selected: null, hover: null, armed: null, drag: null,
    learned: { merged: false, mixed: false, sent: false },
    found: new Set(PC.BASICS),
  };

  // ---- Layout -------------------------------------------------------------

  // Try each arrangement and keep the one that gives the largest cells. A hidden
  // frame reports a size of zero, so keep the last good layout until it's shown again.
  function fit() {
    if (!app.clientWidth || !app.clientHeight) return;
    const options = [['side', false], ['stack', false], ['stack', true]];
    let best = null;
    for (const [layout, portrait] of options) {
      app.dataset.layout = layout;
      const box = stage.getBoundingClientRect();
      const cols = portrait ? PC.ROWS : PC.COLS, rows = portrait ? PC.COLS : PC.ROWS;
      const cell = Math.floor(Math.min(box.width / cols, box.height / rows));
      if (!best || cell > best.cell) best = { layout, portrait, cell };
    }
    app.dataset.layout = best.layout;
    sheet.style.setProperty('--cell', best.cell + 'px');
    renderer.resize(best.cell, best.portrait);
  }

  // ---- Tray ---------------------------------------------------------------

  function buildShop() {
    for (const type of PC.BASICS) {
      const p = PC.SUPPLIES[type];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'item';
      button.dataset.type = type;
      button.title = `${p.name}. Drag onto the board, or click it and then click a cell.`;
      button.setAttribute('aria-label', `Buy a ${p.name.toLowerCase()}`);
      button.innerHTML = `<img src="${PC.supplyIcon(type, -Math.PI / 2)}" alt="" draggable="false"><b>${p.name}</b><small>${p.detail}</small>`;
      button.addEventListener('pointerdown', (e) => itemDown(e, type));
      button.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          arm(type);
        }
      });
      $('items').append(button);
    }
  }

  const iconHtml = (type) => `<img src="${PC.supplyIcon(type)}" alt="${PC.SUPPLIES[type].name}" draggable="false">`;

  // New things the supplies on the board could turn into right now, best first.
  function possibleMerges() {
    const options = new Map();
    const consider = (a, b) => {
      const made = PC.combine(a, b);
      if (made !== a && made !== b && !options.has(made)) options.set(made, [a, b]);
    };
    s.towers.forEach((t, i) => {
      for (const u of s.towers.slice(i + 1)) if (u.level === t.level) consider(t.type, u.type);
      if (t.level === 1) for (const basic of PC.BASICS) consider(basic, t.type);
    });
    const rank = (made) => (PC.SUPPLIES[made].mythic ? -2 : PC.SUPPLIES[made].legendary ? -1 : PC.SUPPLIES[made].from ? 0 : 1) + (ui.found.has(made) ? 4 : 0);
    return [...options].sort((x, y) => rank(x[0]) - rank(y[0])).slice(0, 5);
  }

  // Legendary and mythic supplies stay hidden until you make one.
  const isSecret = (key) => PC.SUPPLIES[key].legendary && !ui.found.has(key);
  const tierName = (key) => (PC.SUPPLIES[key].mythic ? 'Mythic' : 'Legendary');

  function syncRecipes() {
    const list = possibleMerges();
    const result = (made) => (isSecret(made)
      ? `<img src="${PC.supplyIcon(made, undefined, PC.SECRET_TINT)}" alt="Secret" draggable="false"><b>??? ${tierName(made)}</b>`
      : `${iconHtml(made)}<b>${PC.SUPPLIES[made].name}</b>`);
    $('recipes').innerHTML = list.length
      ? list.map(([made, [a, b]]) => `<li>${iconHtml(a)}+${iconHtml(b)}=${result(made)}</li>`).join('')
      : '<li class="empty">Nothing new yet. Buy more supplies or level them up.</li>';
  }

  function arm(type) {
    if (s.money < PC.price(s)) return denyItem(type);
    ui.armed = ui.armed === type ? null : type;
    ui.selected = null;
    lastHud = '';
  }

  function denyItem(type) {
    audio.play('deny');
    flash(`You need $${PC.price(s)} for another item.`);
    const item = document.querySelector(`.item[data-type="${type}"]`);
    item.classList.remove('shake');
    void item.offsetWidth;
    item.classList.add('shake');
  }

  // ---- Pointer ------------------------------------------------------------

  function cellFromClient(clientX, clientY) {
    const w = renderer.toWorld(clientX, clientY);
    const c = Math.floor(w.x), r = Math.floor(w.y);
    return c >= 0 && r >= 0 && c < PC.COLS && r < PC.ROWS ? { c, r } : null;
  }

  function beginDrag(e, fields) {
    ui.drag = {
      moved: false, startX: e.clientX, startY: e.clientY, c: null, r: null,
      lift: e.pointerType === 'touch' ? 58 : 0, ...fields,
    };
  }

  function itemDown(e, type) {
    e.preventDefault();
    audio.unlock();
    if (e.button) return;
    beginDrag(e, { kind: 'new', type, level: 1, tower: null });
  }

  function boardDown(e) {
    audio.unlock();
    if (e.button || !interactive()) return;
    const cell = cellFromClient(e.clientX, e.clientY);
    if (!cell) return;
    const t = PC.towerAt(s, cell.c, cell.r);

    if (ui.armed) {
      if (PC.buyItem(s, ui.armed, cell.c, cell.r)) {
        ui.selected = null;
        if (s.money < PC.price(s)) ui.armed = null;
        return;
      }
      ui.armed = null;
      lastHud = '';
      if (!t) return;
    }

    if (t) beginDrag(e, { kind: 'tower', type: t.type, level: t.level, tower: t });
    else ui.selected = null;
  }

  function pointerMove(e) {
    if (e.pointerType === 'mouse' && e.target === canvas) ui.hover = cellFromClient(e.clientX, e.clientY);
    else if (e.target !== canvas) ui.hover = null;

    const d = ui.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 7) {
      d.moved = true;
      ui.armed = null;
      if (d.kind === 'new' && s.money < PC.price(s)) {
        denyItem(d.type);
        ui.drag = null;
        return;
      }
      showGhost(d);
      if (d.kind === 'tower') {
        $('sell-value').textContent = '$' + PC.sellValue(s, d.tower);
        $('sell').hidden = false;
      }
    }
    if (!d.moved) return;

    const x = e.clientX, y = e.clientY - d.lift;
    ghost.style.transform = `translate(${x}px, ${y}px)`;
    const cell = cellFromClient(x, y);
    d.c = cell ? cell.c : null;
    d.r = cell ? cell.r : null;
    $('sell').classList.toggle('over', overSell(e));
  }

  function overSell(e) {
    if ($('sell').hidden) return false;
    const box = $('shop').getBoundingClientRect();
    return e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
  }

  function pointerUp(e) {
    const d = ui.drag;
    if (!d) return;
    ui.drag = null;
    ghost.hidden = true;
    const selling = overSell(e);
    $('sell').hidden = true;
    $('sell').classList.remove('over');

    if (!d.moved) {
      if (d.kind === 'new') arm(d.type);
      else ui.selected = ui.selected === d.tower ? null : d.tower;
      lastHud = '';
      return;
    }

    if (d.kind === 'tower' && selling) {
      PC.sell(s, d.tower);
      if (ui.selected === d.tower) ui.selected = null;
      return;
    }
    if (d.c === null) return;

    if (d.kind === 'new') {
      const landed = PC.buyItem(s, d.type, d.c, d.r);
      if (landed) showResult(landed);
      else refuseDrop(d);
      return;
    }
    const moved = PC.moveTower(s, d.tower, d.c, d.r);
    if (moved) showResult(moved.tower);
    else if (d.tower.c !== d.c || d.tower.r !== d.r) refuseDrop(d);
  }

  // Opens the supply's card after a drop, but only where the sidebar has room for it.
  // Without a sidebar the card sits over the board, so it waits for a tap.
  function showResult(t) {
    ui.selected = app.dataset.layout === 'side' && t.level > 1 ? t : null;
  }

  function refuseDrop(d) {
    audio.play('deny');
    const other = PC.towerAt(s, d.c, d.r);
    if (other && other.level !== d.level) flash(`Levels must match. This is level ${d.level}, that one is level ${other.level}.`);
    else if (other) flash('That one is already at the top level.');
    else flash("You can't build on the path.");
  }

  function showGhost(d) {
    ghost.style.backgroundImage = `url(${PC.supplyIcon(d.type)})`;
    ghost.dataset.level = d.level;
    ghost.hidden = false;
  }

  const interactive = () => !ui.paused && !ui.gallery && s.phase !== 'over';

  // ---- Commands -----------------------------------------------------------

  function sendWave() {
    audio.unlock();
    if (!interactive() || !PC.sendWave(s)) return;
    ui.learned.sent = true;
    store.set(LEARNED_KEY, ui.learned);
  }

  function togglePause() {
    if (ui.gallery || s.phase === 'over') return;
    if (ui.dialog) return closeDialog();
    openDialog('pause');
  }

  function cycleSpeed() {
    ui.speed = SPEEDS[(SPEEDS.indexOf(ui.speed) + 1) % SPEEDS.length];
    $('btn-speed').textContent = ui.speed + '×';
  }

  function toggleSound() {
    audio.unlock();
    ui.muted = !ui.muted;
    audio.setMuted(ui.muted);
    const button = $('btn-sound');
    button.setAttribute('aria-pressed', String(!ui.muted));
    button.setAttribute('aria-label', ui.muted ? 'Sound off' : 'Sound on');
    if (ui.dialog === 'pause') renderDialog('pause');
  }

  // A secret school opens once you have won at the school named in its unlockedBy.
  const isOpen = (key) => {
    const by = PC.DIFFICULTIES[key].unlockedBy;
    return !by || (store.get(`${BEST_KEY}-${by}`) || 0) >= PC.FINAL_WAVE;
  };
  const openSchools = () => Object.keys(PC.DIFFICULTIES).filter(isOpen);

  function newGame(difficulty, map) {
    if (!isOpen(difficulty) || !PC.MAPS[map]) return;
    store.remove(SAVE_KEY);
    store.set(MAP_KEY, map);
    s = PC.newGame(undefined, difficulty, map);
    renderer.reset();
    Object.assign(ui, { gallery: false, selected: null, armed: null, drag: null, hover: null, openAtStart: openSchools(), unlocked: [] });
    closeDialog();
    lastHud = '';
  }

  // ---- Dialogs ------------------------------------------------------------

  function letterGrade() {
    const cleared = s.phase === 'over' ? s.wave - 1 : s.wave;
    if (cleared >= PC.FINAL_WAVE && s.difficulty === 'doctorate') return 'PhD';
    if (cleared >= PC.FINAL_WAVE && s.difficulty === 'impossible') return 'A++';
    if (cleared >= PC.FINAL_WAVE && s.lives >= s.maxLives * 0.75) return 'A+';
    // Grades go by the share of the school year you got through.
    const scale = [[1, 'A'], [0.9, 'A-'], [0.8, 'B+'], [0.7, 'B'], [0.6, 'B-'], [0.5, 'C+'], [0.4, 'C'], [0.3, 'C-'], [0.2, 'D'], [0, 'F']];
    return scale.find(([min]) => cleared / PC.FINAL_WAVE >= min)[1];
  }

  function teacherNote(grade) {
    const ranked = Object.entries(s.stats.damage).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return 'Did you even open your pencil case?';
    const star = PC.SUPPLIES[ranked[0][0]].name.toLowerCase();
    if (grade === 'PhD') return `Congratulations, Doctor. The ${star} gets an honorary degree.`;
    if (grade === 'A++') return `You did the impossible. I'm framing this one, and the ${star} too.`;
    if (grade[0] === 'A') return `Outstanding work, especially with the ${star}.`;
    if (grade[0] === 'B') return `Good effort. Your ${star} did the heavy lifting.`;
    if (grade[0] === 'C') return `Fair. Try using more than your ${star}.`;
    return `See me after class. Your ${star} can't do this alone.`;
  }

  function helpHtml() {
    // Homework from a secret school stays hidden until that school is open.
    const shown = Object.keys(PC.ENEMIES).filter((key) => !PC.ENEMIES[key].secret || openSchools().some((k) => PC.DIFFICULTIES[k].unlockedBy));
    const enemies = shown.map((key) => {
      const d = PC.ENEMIES[key];
      return `<div><img src="${PC.enemyIcon(key)}" alt=""><b>${d.name}</b><span>${d.blurb}</span></div>`;
    }).join('');
    return `<div class="dialog">
      <h2>How to play</h2>
      <p>Homework is crawling across your desk. Buy supplies and drag them next to the path, where they attack whatever comes in range. Everything that reaches your sticker chart costs you gold stars. Survive ${PC.FINAL_WAVE} waves.</p>
      <div><h3>Merging</h3>
      <p>Drag a supply onto any other supply of the same level. You get one item, one level higher. Two of the same stay the same, and two different ones combine into a fusion. Merge the right two fusions and you get an advanced fusion with a gold sticker, the right two of those make a secret legendary, and two legendaries can make a mythic. While you drag, every possible merge shows what it would make.</p></div>
      <div><h3>Timing</h3>
      <p>Every merge sends out a shockwave that hits everything nearby for three times the item's damage, so saving a merge for a crowd pays off. New, moved and merged items take a moment to set up before they can fire.</p></div>
      <div><h3>Maps and recess</h3>
      <p>Dashed squares on some maps help whatever sits on them: red for damage, yellow for speed, blue for range. Nothing can go on top of the things left on the desk. After each exam you can play one mini game for a cash prize.</p></div>
      <div><h3>Homework</h3><div class="rows">${enemies}</div></div>
      <div><h3>Keys</h3>
      <p>1 to 9 and 0 pick a supply. Space starts the wave. B opens the recipe book, P pauses, F changes speed, M mutes, Esc cancels.</p></div>
      <div class="actions">
        <button class="primary" data-act="close" type="button">Back to class</button>
        <button data-act="book" type="button">Recipe book</button>
      </div>
    </div>`;
  }

  function bookHtml() {
    const types = Object.keys(PC.SUPPLIES);
    const row = (key) => {
      const p = PC.SUPPLIES[key];
      if (isSecret(key)) {
        return `<div class="unmade"><img src="${PC.supplyIcon(key, undefined, PC.SECRET_TINT)}" alt=""><b>???</b><span><em>${p.mythic ? 'Two legendary fusions.' : 'Two advanced fusions.'}</em> Hint: ${p.hint}</span></div>`;
      }
      const recipe = PC.BASICS.includes(key) ? '' : `<em>${p.detail}.</em> `;
      const mark = ui.found.has(key) ? ' <i title="Made">&#10003;</i>' : '';
      return `<div class="${ui.found.has(key) ? '' : 'unmade'}"><img src="${PC.supplyIcon(key)}" alt=""><b>${p.name}${mark}</b><span>${recipe}${p.blurb}</span></div>`;
    };
    const section = (title, keys) => `<div><h3>${title}</h3><div class="rows">${keys.map(row).join('')}</div></div>`;
    const fusions = types.filter((key) => !PC.BASICS.includes(key) && !PC.SUPPLIES[key].from);
    const advanced = types.filter((key) => PC.SUPPLIES[key].from && !PC.SUPPLIES[key].legendary);
    return `<div class="dialog">
      <h2>Recipe book</h2>
      <p>You have made ${ui.found.size} of ${types.length} supplies. Anything you haven't made yet is faded, and legendary and mythic recipes stay secret until you find them.</p>
      ${section('Basics', PC.BASICS)}
      ${section('Fusions', fusions)}
      ${section('Advanced fusions', advanced)}
      ${section('Legendary fusions', types.filter((key) => PC.SUPPLIES[key].legendary && !PC.SUPPLIES[key].mythic))}
      ${section('Mythic fusions', types.filter((key) => PC.SUPPLIES[key].mythic))}
      <div class="actions"><button class="primary" data-act="close" type="button">Back to class</button></div>
    </div>`;
  }

  // A school's house rules in words, written from its numbers in data.js.
  function schoolRules(key) {
    const d = PC.DIFFICULTIES[key];
    const percent = (n) => `${Math.round(Math.abs(n - 1) * 100)}%`;
    const rules = [`${d.lives} stars and $${d.money} to start.`];
    const homework = [];
    if (d.hp !== 1) homework.push(`has ${percent(d.hp)} ${d.hp > 1 ? 'more' : 'less'} health`);
    if (d.speed !== 1) homework.push(`moves ${percent(d.speed)} ${d.speed > 1 ? 'faster' : 'slower'}`);
    if (homework.length) rules.push(`Homework ${homework.join(' and ')}.`);
    if (d.crowdStart === 1) rules.push(`Classes start normal and fill up fast: ${d.crowd} times as much homework by wave ${d.crowdBy}.`);
    else if (d.crowdStart) rules.push(`Classes keep filling up: ${percent(d.crowdStart)} more homework on wave 1, growing to ${d.crowd} times as much by wave ${d.crowdBy}.`);
    else if (d.crowd >= 2) rules.push(`Packed classes: ${d.crowd} times as much homework each wave.`);
    else if (d.crowd !== 1) rules.push(`Bigger classes: ${percent(d.crowd)} more homework each wave.`);
    rules.push(`Tricky homework from wave ${d.guestsFrom}.`);
    if (d.extraGuests) rules.push(`${d.extraGuests.map(([type]) => PC.ENEMIES[type].plural).join(' and ')} join the tricky homework: they shield their classmates.`);
    if (d.trickyCrowd) rules.push(`Tricky homework grows to ${d.trickyCrowd} times as much at most${d.bossCrowd ? '' : ', and bosses still come one at a time'}.`);
    if (d.bossCrowd === 2) rules.push('Every boss comes in a pair.');
    else if (d.bossCrowd > 2) rules.push(`Every boss comes ${d.bossCrowd} at a time.`);
    if (d.growth) rules.push(`Until wave 30, homework gets ${Math.round((d.growth - 1) * 100)}% tougher every wave, not 13%.`);
    if (d.lateGrowth) rules.push(`After wave 30, homework gets ${Math.round((d.lateGrowth - 1) * 100)}% tougher every wave, not ${Math.round((PC.LATE_GROWTH - 1) * 100)}%.`);
    if (d.quizFrom) rules.push(`A Surprise Quiz or Group Project boss on wave ${d.quizFrom} and every 10 waves after, between the big exams.`);
    if (d.thesisOn) rules.push(`The Dissertation, the biggest boss there is, on waves ${d.thesisOn.join(' and ')}.`);
    if (d.starEvery) rules.push(`Earn a lost star back every ${d.starEvery} waves.`);
    if (d.pay !== 1) rules.push(`You earn ${percent(d.pay)} ${d.pay > 1 ? 'more' : 'less'} lunch money.`);
    rules.push(`Selling gives back ${Math.round(d.refund * 100)}% of the cost.`);
    if (d.priceStep !== 3) rules.push(`Each purchase raises prices by $${d.priceStep}, not $3.`);
    if (d.armor) rules.push(`All homework blocks ${Math.round(d.armor * 100)}% of every direct hit. Piercing, wounds and cuts still get through.`);
    return rules;
  }

  function difficultyHtml() {
    const options = Object.keys(PC.DIFFICULTIES).map((key) => {
      const d = PC.DIFFICULTIES[key];
      if (!isOpen(key)) {
        return `<button type="button" class="locked" data-secret disabled aria-label="A secret school, still locked">
          <b>???</b><small>Secret</small>
          <ul><li>Win at ${PC.DIFFICULTIES[d.unlockedBy].name} to unlock.</li></ul>
        </button>`;
      }
      const best = store.get(`${BEST_KEY}-${key}`);
      const record = best ? `<em>Best: ${best} waves</em>` : '';
      return `<button data-act="pick" data-difficulty="${key}" ${d.unlockedBy ? 'data-secret' : ''} type="button" class="${key === 'normal' ? 'primary' : ''}">
        <b>${d.name}</b><small>${d.level}</small>
        <ul>${schoolRules(key).map((rule) => `<li>${rule}</li>`).join('')}</ul>${record}
      </button>`;
    }).join('');
    return `<div class="dialog small wide">
      <h2>Pick your school</h2>
      <div class="schools">${options}</div>
      <div class="actions"><button data-act="minigames" type="button">Mini games</button></div>
    </div>`;
  }

  // ---- Recess -------------------------------------------------------------
  // The same games two ways: after an exam for a prize, or any time just for fun.

  const miniBest = () => store.get(MINI_KEY) || {};

  function miniCards() {
    const best = miniBest();
    return `<div class="minis">${Object.entries(PC.MINIGAMES).map(([key, game]) => `<button data-act="mini" data-mini="${key}" type="button">
      <img src="${PC.supplyIcon(game.icon)}" alt="" draggable="false">
      <b>${game.name}</b><span>${game.blurb}</span>${key in best ? `<em>Best: ${PC.miniGrade(best[key])}</em>` : ''}
    </button>`).join('')}</div>`;
  }

  function minigamesHtml() {
    return `<div class="dialog small wide">
      <h2>Mini games</h2>
      <p>Just for fun. After every exam in a real game you get one go for a prize.</p>
      ${miniCards()}
      <div class="actions"><button class="primary" data-act="mini-back" type="button">Back</button></div>
    </div>`;
  }

  function recessHtml() {
    return `<div class="dialog small wide">
      <h2>Recess!</h2>
      <p>Wave ${s.recess} is done. Play one mini game for up to <b>$${PC.RECESS.supplies * PC.price(s)}</b>. You only get one try.</p>
      ${miniCards()}
      <div class="actions"><button data-act="skip-recess" type="button">Skip recess</button></div>
    </div>`;
  }

  function stopMini() {
    if (ui.mini && ui.mini.stop) ui.mini.stop();
    ui.mini = null;
  }

  function startMini(key) {
    const game = PC.MINIGAMES[key], forPrize = !!s.recess && ui.dialog === 'recess';
    stopMini();
    audio.unlock();
    if (forPrize) {
      // The one try is spent as soon as it starts, or reloading the page would buy another.
      ui.prizeWave = s.recess;
      s.recess = 0;
      store.set(SAVE_KEY, PC.save(s));
    }
    const mini = (ui.mini = { key, forPrize, stop: null });
    ui.dialog = 'mini';
    ui.paused = true;
    modal.className = '';
    modal.innerHTML = `<div class="dialog small mini"><h2>${game.name}</h2><div class="mini-root"></div>
      <div class="actions"><button data-act="mini-quit" type="button">${forPrize ? 'Give up' : 'Quit'}</button></div></div>`;
    modal.hidden = false;
    const stop = game.play(modal.querySelector('.mini-root'), {
      good: () => audio.play('kill'),
      bad: () => audio.play('deny'),
      tap: () => audio.play('place'),
      note: (i) => audio.play('note', i),
      end: (score, note) => { if (ui.mini === mini) finishMini(score, note); },
    });
    if (ui.mini === mini) mini.stop = stop;
    else stop();
  }

  function finishMini(score, note) {
    const { key, forPrize } = ui.mini;
    stopMini();
    const best = miniBest(), record = score > (best[key] || 0) && key in best;
    store.set(MINI_KEY, { ...best, [key]: Math.max(best[key] || 0, score) });
    let prize = 0;
    if (forPrize) {
      prize = PC.takeRecess(s, score);
      store.set(SAVE_KEY, PC.save(s));
      lastHud = '';
    }
    audio.play(score >= 0.5 ? 'clear' : 'deny');
    ui.dialog = 'mini-result';
    modal.innerHTML = `<div class="dialog small report">
      <div class="grade">${PC.miniGrade(score)}</div>
      <div><h2>${PC.MINIGAMES[key].name}</h2><p class="note">${note}${record ? '. A new best!' : '.'}</p></div>
      ${forPrize ? `<p style="grid-column: 1 / -1">${prize ? `You won <b>$${prize}</b>.` : 'No prize this time.'}</p>` : ''}
      <div class="actions">
        ${forPrize ? '<button class="primary" data-act="close" type="button">Back to class</button>'
    : `<button class="primary" data-act="mini" data-mini="${key}" type="button">Play again</button><button data-act="minigames" type="button">Other games</button>`}
      </div>
    </div>`;
    modal.querySelector('.primary').focus({ preventScroll: true });
  }

  function skipRecess() {
    s.recess = 0;
    store.set(SAVE_KEY, PC.save(s));
    closeDialog();
  }

  // What Escape does: out of a mini game and back to where it was opened from.
  function leaveDialog() {
    if (ui.dialog === 'recess') return skipRecess();
    if ((ui.dialog === 'mini' && ui.mini.forPrize) || (ui.dialog === 'mini-result' && !ui.miniFrom)) return closeDialog();
    if (ui.dialog === 'mini' || ui.dialog === 'mini-result') return openDialog('minigames');
    if (ui.dialog === 'minigames') return openDialog(ui.miniFrom || 'pause');
    return closeDialog();
  }

  const bestOn = (difficulty, map) => store.get(`${BEST_KEY}-${difficulty}-${map}`) || 0;

  function mapHtml() {
    const last = PC.MAPS[store.get(MAP_KEY)] ? store.get(MAP_KEY) : PC.DEFAULT_MAP;
    const card = (key) => {
      const map = PC.MAPS[key], best = bestOn(ui.picked, key);
      const record = best >= PC.FINAL_WAVE ? '<em class="won">&#9733; Won</em>' : best ? `<em>Best: ${best} waves</em>` : '';
      const extras = [...new Set((map.spots || []).map(([kind]) => `${PC.SPOTS[kind].name}: ${PC.SPOTS[kind].blurb}.`))];
      return `<button data-act="start" data-map="${key}" type="button" class="${key === last ? 'primary' : ''}">
        <img src="${PC.mapIcon(key)}" alt="" draggable="false">
        <b>${map.name}</b>
        <span>${map.blurb}${extras.length ? ` <i>${extras.join(' ')}</i>` : ''}</span>${record}
      </button>`;
    };
    return `<div class="dialog small wide">
      <h2>Pick your map</h2>
      <p>${PC.DIFFICULTIES[ui.picked].name}. The maps are tuned to be about as hard as each other.</p>
      <div class="maps">${Object.keys(PC.MAPS).map(card).join('')}</div>
      <div class="actions">
        <button data-act="surprise" type="button">Surprise me</button>
        <button data-act="new" type="button">Back to schools</button>
      </div>
    </div>`;
  }

  function pauseHtml() {
    const d = PC.DIFFICULTIES[s.difficulty];
    return `<div class="dialog small">
      <h2>Paused</h2>
      <p>${d.name} (${d.level}), ${PC.mapOf(s).name}</p>
      <ul class="house-rules">${schoolRules(s.difficulty).map((rule) => `<li>${rule}</li>`).join('')}</ul>
      <div class="actions">
        <button class="primary" data-act="close" type="button">Resume</button>
        <button data-act="sound" type="button">Sound ${ui.muted ? 'off' : 'on'}</button>
        <button data-act="book" type="button">Recipe book</button>
        <button data-act="help" type="button">How to play</button>
        <button data-act="minigames" type="button">Mini games</button>
        <button data-act="confirm-new" type="button">New game</button>
      </div>
    </div>`;
  }

  function confirmHtml() {
    return `<div class="dialog small">
      <h2>Start over?</h2>
      <p>This run ends and your page is wiped clean.</p>
      <div class="actions">
        <button class="primary" data-act="new" type="button">Start over</button>
        <button data-act="pause" type="button">Keep playing</button>
      </div>
    </div>`;
  }

  function reportHtml(won) {
    const best = store.get(`${BEST_KEY}-${s.difficulty}`) || 0;
    const school = PC.DIFFICULTIES[s.difficulty].name;
    const map = PC.mapOf(s).name;
    const grade = letterGrade();
    const line = won
      ? `You survived all ${PC.FINAL_WAVE} waves of ${map} with ${s.lives} ${s.lives === 1 ? 'star' : 'stars'} left.`
      : `The homework got through ${map} on wave ${s.wave}.`;
    return `<div class="dialog report">
      <div class="grade">${grade}</div>
      <div>
        <h2>Report card</h2>
        <p class="note">${teacherNote(grade)}</p>
      </div>
      <p style="grid-column: 1 / -1">${line} ${s.stats.kills} assignments handled, ${s.stats.merges} merges. Most waves cleared at ${school}: ${best}.</p>
      ${(ui.unlocked || []).map((key) => `<p class="unlock">Secret school unlocked: <b>${PC.DIFFICULTIES[key].name}</b>. Pick it from New school year, if you dare.</p>`).join('')}
      <div class="actions">
        ${won ? '<button class="primary" data-act="endless" type="button">Go for extra credit</button>' : ''}
        <button class="${won ? '' : 'primary'}" data-act="new" type="button">New school year</button>
      </div>
    </div>`;
  }

  function renderDialog(name) {
    modal.className = name === 'won' || name === 'lost' ? 'plaque' : '';
    if (name === 'help') modal.innerHTML = helpHtml();
    if (name === 'pause') modal.innerHTML = pauseHtml();
    if (name === 'confirm') modal.innerHTML = confirmHtml();
    if (name === 'book') modal.innerHTML = bookHtml();
    if (name === 'difficulty') modal.innerHTML = difficultyHtml();
    if (name === 'map') modal.innerHTML = mapHtml();
    if (name === 'minigames') modal.innerHTML = minigamesHtml();
    if (name === 'recess') modal.innerHTML = recessHtml();
    if (name === 'won' || name === 'lost') modal.innerHTML = reportHtml(name === 'won');
    modal.hidden = false;
    const primary = modal.querySelector('.primary');
    if (primary) primary.focus({ preventScroll: true });
  }

  function openDialog(name) {
    stopMini();
    ui.dialog = name;
    ui.paused = true;
    ui.drag = null;
    ghost.hidden = true;
    $('sell').hidden = true;
    renderDialog(name);
  }

  function closeDialog() {
    stopMini();
    ui.dialog = null;
    ui.miniFrom = null;
    ui.paused = false;
    modal.hidden = true;
  }

  modal.addEventListener('click', (e) => {
    const button = e.target.closest('[data-act]');
    if (!button) return;
    const act = button.dataset.act;
    if (act === 'close') closeDialog();
    if (act === 'sound') toggleSound();
    if (act === 'help') openDialog('help');
    if (act === 'pause') openDialog('pause');
    if (act === 'confirm-new') openDialog('confirm');
    if (act === 'book') openDialog('book');
    if (act === 'new') openDialog('difficulty');
    if (act === 'pick' && isOpen(button.dataset.difficulty)) {
      ui.picked = button.dataset.difficulty;
      openDialog('map');
    }
    if (act === 'start') newGame(ui.picked, button.dataset.map);
    if (act === 'minigames') {
      if (ui.dialog === 'difficulty' || ui.dialog === 'pause') ui.miniFrom = ui.dialog;
      openDialog('minigames');
    }
    if (act === 'mini') startMini(button.dataset.mini);
    if (act === 'mini-quit' || act === 'mini-back') leaveDialog();
    if (act === 'skip-recess') skipRecess();
    if (act === 'surprise') {
      const maps = Object.keys(PC.MAPS);
      newGame(ui.picked, maps[Math.floor(Math.random() * maps.length)]);
    }
    if (act === 'endless') {
      ui.gallery = false;
      ui.unlocked = [];
      closeDialog();
    }
  });

  // ---- Hints --------------------------------------------------------------

  function flash(text) {
    flashTimer = 2.4;
    hint.textContent = text;
    hint.classList.add('warn');
    hint.hidden = false;
  }

  function coachText() {
    const l = ui.learned;
    if (l.sent) {
      return s.wave === 1 && s.phase === 'wave'
        ? 'Merging during a wave sends out a shockwave that hits everything nearby.'
        : '';
    }
    if (!l.merged) return 'Drag one pencil onto the other. Same level merges, and the new one is a level higher.';
    if (!l.mixed) return 'Now drag the ruler from the shop onto the glue. Ruler and glue combine into tape.';
    return 'Combined supplies get new attacks. Press Start wave when you are ready.';
  }

  function syncHint(dt) {
    if (flashTimer > 0) {
      flashTimer -= dt;
      if (flashTimer > 0) return;
      hint.classList.remove('warn');
    }
    const text = ui.gallery ? '' : coachText();
    if (hint.textContent !== text) hint.textContent = text;
    hint.hidden = !text;
  }

  function announce(text) {
    banner.textContent = text;
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
  }

  // ---- HUD ----------------------------------------------------------------

  // The wave each kind of homework first shows up, which differs by school.
  const firstSeenBySchool = {};
  function firstSeen(difficulty) {
    if (!firstSeenBySchool[difficulty]) {
      const seen = (firstSeenBySchool[difficulty] = {});
      for (let w = 1; w <= PC.FINAL_WAVE; w++) {
        for (const [type] of PC.waveFor(w, difficulty)) if (!(type in seen)) seen[type] = w;
      }
    }
    return firstSeenBySchool[difficulty];
  }

  function describeWave(wave) {
    const counts = {};
    for (const [type, count] of PC.waveFor(wave, s.difficulty)) counts[type] = (counts[type] || 0) + count;
    const parts = Object.entries(counts).map(([type, n]) => {
      const d = PC.ENEMIES[type];
      if (d.erases) return n > 1 ? `${n} ${d.plural}` : PC.bossName(wave);
      return `${n} ${n === 1 ? d.name : d.plural}`;
    });
    const fresh = Object.keys(counts).find((type) => firstSeen(s.difficulty)[type] === wave);
    const note = fresh ? ` <b>New:</b> ${PC.ENEMIES[fresh].blurb}` : '';
    return `<b>Wave ${wave}:</b> ${parts.join(', ')}.${note}`;
  }

  function syncCard() {
    const t = ui.selected;
    $('card').hidden = !t;
    if (app.dataset.layout === 'side') $('chart').hidden = !!t;
    else $('chart').hidden = false;
    if (!t) return;
    const p = PC.SUPPLIES[t.type], st = t.st;
    $('card-icon').src = PC.supplyIcon(t.type);
    $('card-name').textContent = `${p.name} ${t.level}`;
    $('card-detail').textContent = p.detail;
    $('card-blurb').textContent = p.blurb;
    const big = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
    const percent = (n) => `+${Math.round(n * 100)}%`;
    const rows = st.dmg ? [['Damage', big(st.dmg * t.boost)], ['Shots/s', st.rate.toFixed(1)]] : [];
    rows.push(['Range', st.range.toFixed(1)]);
    const spot = PC.mapOf(s).spotAt.get(t.c + ',' + t.r);
    if (spot) rows.push([PC.SPOTS[spot].name, percent(PC.SPOTS[spot].bonus)]);
    if (st.aura) rows.push(['Boost', percent(st.aura)]);
    if (st.haste) rows.push(['Speed', percent(st.haste)]);
    if (st.payout) rows.push(['Pay', percent(st.payout)]);
    if (st.starPay) rows.push(['Star pay', percent(st.starPay)]);
    if (st.paint) rows.push(['Splash', big(st.dmg * t.boost * st.paint)]);
    if (st.paintAura) rows.push(['Paint', big(st.paintAura * 100) + '%']);
    if (st.execute) rows.push(['Fails at', `${Math.round(st.execute * 100)}%`]);
    if (st.drops) rows.push(['Targets', String(st.drops)]);
    if (st.interest) rows.push(['Interest', `${Math.round(st.interest * 100)}%`]);
    if (st.field) rows.push(['Slow', `${Math.round(st.field * 100)}%`]);
    if (st.freeze) rows.push(['Freeze', `${st.freeze.toFixed(1)}s`]);
    if (st.spareEvery) rows.push(['Star every', `${st.spareEvery} waves`]);
    $('card-stats').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('btn-sell').textContent = `Sell for $${PC.sellValue(s, t)}`;
  }

  function syncHud() {
    const t = ui.selected;
    const left = s.enemies.length + s.queue.length;
    const board = s.towers.map((u) => u.type + u.level).join();
    const key = [s.wave, s.lives, Math.floor(s.money), s.phase, left, ui.armed, s.bought, board, ui.found.size,
      t && t.id, t && t.level, t && t.type, t && t.boost, app.dataset.layout].join('|');
    if (key === lastHud) return;
    lastHud = key;
    syncRecipes();
    $('btn-book').textContent = `Recipes ${ui.found.size}/${Object.keys(PC.SUPPLIES).length}`;

    $('stat-wave').textContent = s.wave > PC.FINAL_WAVE ? String(s.wave) : `${s.wave} / ${PC.FINAL_WAVE}`;
    $('stat-lives').textContent = s.lives;
    $('stat-lives').classList.toggle('low', s.lives <= s.maxLives / 4);
    $('stat-money').textContent = '$' + Math.floor(s.money);

    const price = PC.price(s);
    $('price').innerHTML = `Next item <b>$${price}</b>`;
    document.querySelectorAll('.item').forEach((item) => {
      item.classList.toggle('broke', s.money < price);
      item.classList.toggle('armed', ui.armed === item.dataset.type);
    });

    const send = $('btn-send');
    send.disabled = s.phase !== 'build';
    send.textContent = s.phase === 'wave' ? `${left} left` : s.phase === 'over' ? 'Class dismissed' : `Start wave ${s.wave + 1}`;
    $('next-text').innerHTML = describeWave(s.wave + 1);
    syncCard();
  }

  // ---- Game events --------------------------------------------------------

  function drainFx() {
    for (const ev of s.fx) {
      renderer.handle(ev);
      switch (ev.k) {
        case 'place': audio.play('place'); break;
        case 'sell': audio.play('sell'); break;
        case 'jam': audio.play('deny'); break;
        case 'fire': audio.play('fire'); break;
        case 'kill': audio.play('kill'); break;
        case 'leak': audio.play('leak'); break;
        case 'boss':
          audio.play('boss');
          announce(ev.type === 'exam' ? PC.bossName(ev.wave) : PC.ENEMIES[ev.type].name);
          break;
        case 'star': audio.play('clear'); break;
        case 'merge': {
          const mixed = ev.parents[0] !== ev.parents[1];
          audio.play('merge', ev.level, mixed);
          ui.learned.merged = true;
          if (mixed) ui.learned.mixed = true;
          if (!ui.found.has(ev.type)) {
            ui.found.add(ev.type);
            store.set(FOUND_KEY, [...ui.found]);
            const made = PC.SUPPLIES[ev.type];
            announce(made.mythic ? `MYTHIC!! ${made.name}` : made.legendary ? `LEGENDARY! ${made.name}` : made.from ? `Advanced fusion! ${made.name}` : `New: ${made.name}`);
          }
          break;
        }
        case 'waveStart':
          audio.play('wave');
          if (ev.wave % 10) announce(`Wave ${ev.wave}`);
          break;
        case 'waveClear':
          audio.play('clear');
          store.set(SAVE_KEY, PC.save(s));
          store.set(`${BEST_KEY}-${s.difficulty}`, Math.max(store.get(`${BEST_KEY}-${s.difficulty}`) || 0, ev.wave));
          store.set(`${BEST_KEY}-${s.difficulty}-${s.map}`, Math.max(bestOn(s.difficulty, s.map), ev.wave));
          break;
        case 'win':
          audio.play('win');
          ui.gallery = true;
          ui.selected = null;
          // The record was saved on waveClear just before, so a secret school may be open now.
          ui.unlocked = openSchools().filter((key) => !(ui.openAtStart || []).includes(key));
          if (ui.unlocked.length) announce('Secret school unlocked!');
          setTimeout(() => openDialog('won'), 1500);
          break;
        case 'over':
          audio.play('over');
          store.remove(SAVE_KEY);
          ui.gallery = true;
          ui.selected = null;
          setTimeout(() => openDialog('lost'), 1500);
          break;
        default:
      }
    }
    s.fx.length = 0;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!ui.paused) {
      carry += dt * (s.phase === 'wave' ? ui.speed : 1);
      while (carry >= STEP) {
        PC.step(s, STEP);
        carry -= STEP;
      }
    }
    if (ui.selected && !s.towers.includes(ui.selected)) ui.selected = null;
    // Recess opens once the page is quiet after an exam, never in the middle of a wave.
    if (s.recess && s.phase === 'build' && !ui.dialog && !ui.gallery && !ui.drag) {
      ui.recessWait = (ui.recessWait || 0) + dt;
      if (ui.recessWait > 1.2) openDialog('recess');
    } else ui.recessWait = 0;
    drainFx();
    renderer.draw(s, ui, ui.paused && !ui.gallery ? 0 : dt);
    syncHud();
    syncHint(dt);
  }

  // ---- Wiring -------------------------------------------------------------

  function keyDown(e) {
    if (ui.gallery) return;
    if (e.target.closest && e.target.closest('#modal') && e.key !== 'Escape') return;
    const key = e.key.toLowerCase();
    // 1 to 9 pick the first nine basics, and 0 the tenth, like the number row.
    if (key >= '0' && key <= '9') {
      const basic = PC.BASICS[(Number(key) + 9) % 10];
      if (basic) arm(basic);
    }
    else if (key === ' ') {
      e.preventDefault();
      sendWave();
    } else if (key === 'p') togglePause();
    else if (key === 'f') cycleSpeed();
    else if (key === 'm') toggleSound();
    else if (key === 'h') ui.dialog === 'help' ? closeDialog() : openDialog('help');
    else if (key === 'b') ui.dialog === 'book' ? closeDialog() : openDialog('book');
    else if (key === 'escape') {
      if (ui.dialog) leaveDialog();
      ui.armed = null;
      ui.selected = null;
      lastHud = '';
    }
  }

  function wire() {
    canvas.addEventListener('pointerdown', boardDown);
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', () => {
      ui.drag = null;
      ghost.hidden = true;
      $('sell').hidden = true;
    });
    window.addEventListener('keydown', keyDown);
    window.addEventListener('resize', fit);
    $('btn-send').addEventListener('click', sendWave);
    $('btn-speed').addEventListener('click', cycleSpeed);
    $('btn-pause').addEventListener('click', togglePause);
    $('btn-sound').addEventListener('click', toggleSound);
    $('btn-help').addEventListener('click', () => openDialog('help'));
    $('btn-book').addEventListener('click', () => openDialog('book'));
    $('btn-sell').addEventListener('click', () => {
      if (ui.selected && interactive()) PC.sell(s, ui.selected);
      ui.selected = null;
    });
  }

  function boot(data) {
    // Saves from the paint version of the game have no version number and don't load.
    const found = (data && data.save) || store.get(SAVE_KEY);
    const saved = found && found.version === PC.SAVE_VERSION ? found : null;
    s = saved ? PC.load(saved) : PC.newGame();
    ui.openAtStart = openSchools();
    const learned = store.get(LEARNED_KEY);
    if (learned) ui.learned = learned;
    if (saved) ui.learned = { merged: true, mixed: true, sent: true };
    for (const type of store.get(FOUND_KEY) || []) if (PC.SUPPLIES[type]) ui.found.add(type);

    buildShop();
    wire();
    fit();
    if (!saved) openDialog('difficulty');
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    if (window.claude?.hot?.snapshot) window.claude.hot.snapshot(() => ({ save: PC.save(s) }));

    PC.current = () => s; // handy from the browser console
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  if (window.claude?.hot?.ready) window.claude.hot.ready(boot);
  else boot(window.claude?.hot?.data ?? {});
})();
