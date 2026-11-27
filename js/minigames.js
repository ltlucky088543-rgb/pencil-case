// Recess: short games to play between exams, or any time just for fun.
//
// Each game's play(root, api) fills `root` and calls api.end(score, note) once, with a score
// from 0 to 1. It returns a function that stops everything, for when the player quits.
// Nothing in here touches the tower defense. main.js hands out grades and prizes.
(function () {
  const PC = globalThis.PC;

  const random = (n) => Math.floor(Math.random() * n);
  const pick = (list) => list[random(list.length)];
  const clamp = (n) => Math.max(0, Math.min(1, n));

  function shuffle(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = random(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function el(tag, cls, html = '') {
    const node = document.createElement(tag);
    node.className = cls;
    node.innerHTML = html;
    if (tag === 'button') node.type = 'button';
    return node;
  }

  // Timers that all stop together, so a game that is quit leaves nothing running.
  function clock() {
    const stops = new Set();
    return {
      after(ms, fn) {
        const id = setTimeout(fn, ms);
        stops.add(() => clearTimeout(id));
      },
      every(ms, fn) {
        const id = setInterval(fn, ms);
        stops.add(() => clearInterval(id));
      },
      frames(fn) {
        let id, last = performance.now();
        const loop = (now) => {
          id = requestAnimationFrame(loop);
          fn(Math.min(0.05, (now - last) / 1000));
          last = now;
        };
        id = requestAnimationFrame(loop);
        stops.add(() => cancelAnimationFrame(id));
      },
      stop() {
        for (const fn of stops) fn();
        stops.clear();
      },
    };
  }

  // Counts down in tenths of a second, showing the time in `node`, and calls done() at zero.
  function countdown(time, seconds, node, done) {
    let left = seconds;
    const show = () => { node.textContent = `${Math.max(0, left).toFixed(1)}s`; };
    show();
    time.every(100, () => {
      left -= 0.1;
      show();
      if (left <= 0) done();
    });
    return { take(s) { left -= s; show(); } };
  }

  const supplyImg = (key) => `<img src="${PC.supplyIcon(key)}" alt="${PC.SUPPLIES[key].name}" draggable="false">`;
  const isPair = (p) => !p.from && p.mask.toString(2).replace(/0/g, '').length === 2;
  const pairKeys = () => Object.keys(PC.SUPPLIES).filter((k) => isPair(PC.SUPPLIES[k]));

  // ---- Flash Cards: find the matching pairs -------------------------------

  function flashCards(root, api) {
    const time = clock(), PAIRS = 8;
    const faces = shuffle([...PC.BASICS, ...pairKeys()]).slice(0, PAIRS);
    const bar = el('p', 'mini-bar', '<span>Tries: <b>0</b></span><span>Find all eight pairs.</span>');
    const grid = el('div', 'mini-cards');
    let open = [], found = 0, tries = 0, busy = false;
    shuffle([...faces, ...faces]).forEach((key) => {
      const card = el('button', 'mini-card', `<span class="front">${supplyImg(key)}</span><span class="back"></span>`);
      card.setAttribute('aria-label', 'Face-down card');
      card.addEventListener('click', () => {
        if (busy || card.classList.contains('up')) return;
        card.classList.add('up');
        card.setAttribute('aria-label', PC.SUPPLIES[key].name);
        open.push({ card, key });
        if (open.length < 2) return;
        bar.querySelector('b').textContent = ++tries;
        const [a, b] = open;
        open = [];
        if (a.key === b.key) {
          api.good();
          a.card.classList.add('matched');
          b.card.classList.add('matched');
          if (++found === PAIRS) time.after(600, () => api.end(clamp(1 - (tries - 12) / 18), `${tries} tries`));
          return;
        }
        busy = true;
        time.after(750, () => {
          for (const x of [a, b]) {
            x.card.classList.remove('up');
            x.card.setAttribute('aria-label', 'Face-down card');
          }
          busy = false;
        });
      });
      grid.append(card);
    });
    root.append(bar, grid);
    return time.stop;
  }

  // ---- Eraser Rush: rub out the mess, leave the stars ---------------------

  function eraserRush(root, api) {
    const time = clock(), HOLES = 12, MESS = ['scribble', 'plane', 'spitball', 'gum', 'copycat'], GOAL = 20;
    const bar = el('p', 'mini-bar', '<span>Erased: <b>0</b></span><span class="time"></span>');
    const grid = el('div', 'mini-desk');
    let score = 0, over = false;
    const holes = Array.from({ length: HOLES }, () => {
      const hole = { node: el('button', 'mini-hole'), kind: null, until: 0 };
      hole.node.setAttribute('aria-label', 'Empty spot');
      hole.node.addEventListener('pointerdown', () => {
        if (over || !hole.kind) return;
        if (hole.kind === 'star') {
          score = Math.max(0, score - 2);
          api.bad();
        } else {
          score++;
          api.good();
        }
        clear(hole, hole.kind === 'star' ? 'oops' : 'pop');
        bar.querySelector('b').textContent = score;
      });
      grid.append(hole.node);
      return hole;
    });
    function clear(hole, cls = '') {
      hole.kind = null;
      hole.node.innerHTML = '';
      hole.node.className = `mini-hole ${cls}`;
      hole.node.setAttribute('aria-label', 'Empty spot');
    }
    let elapsed = 0, next = 0.3;
    countdown(time, 20, bar.querySelector('.time'), () => {
      if (over) return;
      over = true;
      time.stop();
      api.end(clamp(score / GOAL), `${score} erased`);
    });
    time.every(50, () => {
      elapsed += 0.05;
      for (const hole of holes) if (hole.kind && elapsed > hole.until) clear(hole);
      if (elapsed < next) return;
      // It gets quicker as it goes.
      next = elapsed + 0.62 - elapsed * 0.012;
      const free = holes.filter((hole) => !hole.kind);
      if (!free.length) return;
      const hole = pick(free);
      hole.kind = Math.random() < 0.22 ? 'star' : 'mess';
      hole.until = elapsed + 1.25 - elapsed * 0.02;
      hole.node.className = 'mini-hole up';
      const type = pick(MESS);
      hole.node.innerHTML = hole.kind === 'star' ? '<span class="gold">&#9733;</span>' : `<img src="${PC.enemyIcon(type)}" alt="" draggable="false">`;
      hole.node.setAttribute('aria-label', hole.kind === 'star' ? 'Gold star' : PC.ENEMIES[type].name);
    });
    root.append(bar, grid);
    return time.stop;
  }

  // ---- Paper Toss: stop the meter, allowing for the fan -------------------

  function paperToss(root, api) {
    const time = clock(), THROWS = 6, W = 480, H = 230;
    const bar = el('p', 'mini-bar', '<span>Throw <b>1</b> of 6</span><span class="note"></span>');
    const canvas = el('canvas', 'mini-canvas');
    const button = el('button', 'primary mini-wide', 'Throw');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const c = canvas.getContext('2d');
    c.scale(dpr, dpr);
    let throwNo = 0, score = 0, t = 0, bin, half, wind, shot = null, done = false;
    const toX = (n) => 50 + n * 4;

    function setUp() {
      bin = 45 + random(45);
      half = 8 - throwNo * 0.5;
      wind = (random(2) ? 1 : -1) * (4 + random(6 + throwNo * 2));
      if (bin - wind < 8 || bin - wind > 97) wind = -wind;
      shot = null;
      bar.querySelector('b').textContent = throwNo + 1;
      bar.querySelector('.note').textContent = `Fan blowing ${wind > 0 ? 'right' : 'left'}: ${Math.abs(wind)}`;
    }
    const power = () => 50 + 50 * Math.sin(t * (2 + throwNo * 0.18) - Math.PI / 2);

    function toss() {
      if (shot || done) return;
      shot = { land: power() + wind, k: 0 };
      api.tap();
    }
    button.addEventListener('click', toss);
    canvas.addEventListener('pointerdown', toss);

    function finish() {
      const miss = Math.abs(shot.land - bin);
      const points = miss <= half ? 1 : miss <= half + 5 ? 0.5 : 0;
      score += points;
      if (points) api.good();
      else api.bad();
      shot.said = points === 1 ? 'Swish!' : points ? 'Off the rim' : shot.land < bin ? 'Short' : 'Long';
      time.after(850, () => {
        if (++throwNo < THROWS) return setUp();
        done = true;
        time.stop();
        api.end(clamp(score / THROWS), `${score} of ${THROWS}`);
      });
    }

    function draw() {
      c.clearRect(0, 0, W, H);
      const floor = 165;
      c.strokeStyle = '#2e3036';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(10, floor);
      c.lineTo(W - 10, floor);
      c.stroke();
      // The bin
      const bx = toX(bin), w = half * 4;
      c.fillStyle = '#9fb3c8';
      c.beginPath();
      c.moveTo(bx - w, floor - 46);
      c.lineTo(bx + w, floor - 46);
      c.lineTo(bx + w * 0.75, floor);
      c.lineTo(bx - w * 0.75, floor);
      c.closePath();
      c.fill();
      c.stroke();
      // The fan, as arrows of wind
      c.strokeStyle = '#2a7de1';
      for (let i = 0; i < Math.ceil(Math.abs(wind) / 4); i++) {
        const x = W / 2 + i * 22 - 30, y = 22, dir = Math.sign(wind);
        c.beginPath();
        c.moveTo(x - 8 * dir, y);
        c.lineTo(x + 8 * dir, y);
        c.lineTo(x + 2 * dir, y - 5);
        c.moveTo(x + 8 * dir, y);
        c.lineTo(x + 2 * dir, y + 5);
        c.stroke();
      }
      // The ball
      const k = shot ? Math.min(1, shot.k) : 0;
      const x = shot ? 30 + (toX(shot.land) - 30) * k : 30;
      const y = floor - 14 - Math.sin(k * Math.PI) * 110 - (shot ? k * 24 : 0);
      c.fillStyle = '#fdfdfb';
      c.strokeStyle = '#2e3036';
      c.beginPath();
      c.arc(x, y, 9, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(x - 5, y - 2);
      c.lineTo(x + 2, y + 1);
      c.lineTo(x + 5, y - 4);
      c.stroke();
      // The meter: where the throw would land with no fan
      c.fillStyle = '#e9ecef';
      c.fillRect(toX(0), 190, 400, 16);
      c.fillStyle = 'rgba(29, 143, 78, 0.35)';
      c.fillRect(toX(bin - half), 190, half * 8, 16);
      c.strokeRect(toX(0), 190, 400, 16);
      c.fillStyle = '#d3262f';
      c.fillRect(toX(shot ? shot.land - wind : power()) - 3, 185, 6, 26);
      c.fillStyle = '#4c5058';
      c.font = '13px "Patrick Hand", cursive';
      c.textAlign = 'center';
      c.fillText('Green is the bin. The fan moves every throw, so aim off.', W / 2, 225);
      if (shot && shot.said) {
        c.font = '24px "Patrick Hand", cursive';
        c.fillStyle = shot.said === 'Swish!' ? '#1d8f4e' : '#d3262f';
        c.fillText(shot.said, bx, floor - 60);
      }
    }
    time.frames((dt) => {
      if (shot && shot.k < 1) {
        shot.k += dt / 0.7;
        if (shot.k >= 1) finish();
      } else if (!shot) t += dt;
      draw();
    });
    setUp();
    root.append(bar, canvas, button);
    return time.stop;
  }

  // ---- Crayon Echo: repeat the colors -------------------------------------

  function crayonEcho(root, api) {
    const time = clock(), ROUNDS = 7;
    const colors = [['#d3262f', 'Red'], ['#2a7de1', 'Blue'], ['#f6c21c', 'Yellow'], ['#1d8f4e', 'Green']];
    const bar = el('p', 'mini-bar', '<span>Round <b>1</b> of 7</span><span class="note">Watch...</span>');
    const grid = el('div', 'mini-crayons');
    const pads = colors.map(([hex, name], i) => {
      const pad = el('button', 'mini-crayon');
      pad.style.setProperty('--wax', hex);
      pad.setAttribute('aria-label', name);
      pad.addEventListener('pointerdown', () => press(i));
      pad.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') press(i);
      });
      grid.append(pad);
      return pad;
    });
    const say = (text) => { bar.querySelector('.note').textContent = text; };
    const order = [random(4)];
    let round = 1, at = 0, listening = false, over = false;

    function light(i, ms) {
      pads[i].classList.add('lit');
      api.note(i);
      time.after(ms, () => pads[i].classList.remove('lit'));
    }
    function show() {
      listening = false;
      say('Watch...');
      order.push(random(4));
      bar.querySelector('b').textContent = round;
      const gap = Math.max(340, 620 - round * 40);
      order.forEach((i, n) => time.after(600 + n * gap, () => light(i, gap * 0.6)));
      time.after(650 + order.length * gap, () => {
        listening = true;
        at = 0;
        say('Your turn');
      });
    }
    function press(i) {
      if (!listening || over) return;
      light(i, 180);
      if (i !== order[at]) {
        over = true;
        api.bad();
        say('That was the wrong one');
        pads[order[at]].classList.add('lit');
        time.after(900, () => api.end(clamp((round - 1) / ROUNDS), `${round - 1} of ${ROUNDS} rounds`));
        return;
      }
      if (++at < order.length) return;
      listening = false;
      if (round++ === ROUNDS) {
        over = true;
        say('Perfect!');
        time.after(600, () => api.end(1, `all ${ROUNDS} rounds`));
        return;
      }
      api.good();
      time.after(500, show);
    }
    root.append(bar, grid);
    show();
    return time.stop;
  }

  // ---- Math Sprint --------------------------------------------------------

  function mathSprint(root, api) {
    const time = clock(), GOAL = 14;
    const bar = el('p', 'mini-bar', '<span>Right: <b>0</b></span><span class="time"></span>');
    const question = el('p', 'mini-question');
    const row = el('div', 'mini-answers');
    let score = 0, over = false;
    const left = countdown(time, 30, bar.querySelector('.time'), () => {
      if (over) return;
      over = true;
      time.stop();
      api.end(clamp(score / GOAL), `${score} right`);
    });
    function ask() {
      const kind = random(3);
      let a = 6 + random(40), b = 4 + random(38), answer, sign;
      if (kind === 0) [answer, sign] = [a + b, '+'];
      else if (kind === 1) {
        if (b > a) [a, b] = [b, a];
        [answer, sign] = [a - b, '&minus;'];
      } else {
        a = 2 + random(11);
        b = 2 + random(11);
        [answer, sign] = [a * b, '&times;'];
      }
      question.innerHTML = `${a} ${sign} ${b} = ?`;
      const wrong = new Set();
      while (wrong.size < 3) {
        const off = answer + pick([-10, -3, -2, -1, 1, 2, 3, 10, kind === 2 ? a : 5]);
        if (off !== answer && off >= 0) wrong.add(off);
      }
      row.replaceChildren(...shuffle([answer, ...wrong]).map((n) => {
        const button = el('button', 'mini-answer', String(n));
        button.addEventListener('click', () => {
          if (over) return;
          if (n === answer) {
            bar.querySelector('b').textContent = ++score;
            api.good();
          } else {
            left.take(2);
            api.bad();
          }
          ask();
        });
        return button;
      }));
    }
    ask();
    root.append(bar, question, row, el('p', 'mini-tip', 'A wrong answer costs two seconds.'));
    return time.stop;
  }

  // ---- Fusion Quiz: know your recipes -------------------------------------

  function fusionQuiz(root, api) {
    const time = clock(), ASK = 8;
    const keys = shuffle(pairKeys()).slice(0, ASK);
    const basicsOf = (key) => PC.BASICS.filter((b) => PC.SUPPLIES[b].mask & PC.SUPPLIES[key].mask);
    const bar = el('p', 'mini-bar', '<span>Question <b>1</b> of 8</span><span class="note"></span>');
    const question = el('p', 'mini-question fusion');
    const row = el('div', 'mini-answers');
    let n = 0, score = 0;
    function ask() {
      const key = keys[n], [a, b] = basicsOf(key);
      bar.querySelector('b').textContent = n + 1;
      question.innerHTML = `${supplyImg(a)} + ${supplyImg(b)} = ?`;
      // Wrong answers share a part with the right one where they can, so it takes knowing.
      const near = shuffle(pairKeys().filter((k) => k !== key && PC.SUPPLIES[k].mask & PC.SUPPLIES[key].mask));
      row.replaceChildren(...shuffle([key, ...near.slice(0, 3)]).map((k) => {
        const button = el('button', 'mini-answer', `${supplyImg(k)}<span>${PC.SUPPLIES[k].name}</span>`);
        button.addEventListener('click', () => {
          if (row.dataset.done) return;
          row.dataset.done = '1';
          button.classList.add(k === key ? 'right' : 'wrong');
          if (k === key) {
            score++;
            api.good();
          } else {
            api.bad();
            for (const other of row.children) if (other.textContent === PC.SUPPLIES[key].name) other.classList.add('right');
          }
          time.after(k === key ? 450 : 1300, () => {
            delete row.dataset.done;
            if (++n < ASK) ask();
            else api.end(score / ASK, `${score} of ${ASK}`);
          });
        });
        return button;
      }));
    }
    ask();
    root.append(bar, question, row);
    return time.stop;
  }

  PC.MINIGAMES = {
    flash: { name: 'Flash Cards', icon: 'indexcards', blurb: 'Find the matching pairs of supplies.', play: flashCards },
    eraser: { name: 'Eraser Rush', icon: 'eraser', blurb: 'Rub out the mess. Leave the gold stars.', play: eraserRush },
    toss: { name: 'Paper Toss', icon: 'carbonpaper', blurb: 'Six throws at the bin, with a fan in the way.', play: paperToss },
    echo: { name: 'Crayon Echo', icon: 'crayonbox', blurb: 'Watch the crayons light up, then repeat it.', play: crayonEcho },
    math: { name: 'Math Sprint', icon: 'calculator', blurb: 'As many sums as you can in 30 seconds.', play: mathSprint },
    fusion: { name: 'Fusion Quiz', icon: 'beaker', blurb: 'What do these two supplies make?', play: fusionQuiz },
  };

  PC.miniGrade = function (score) {
    const scale = [[0.97, 'A+'], [0.85, 'A'], [0.7, 'B'], [0.5, 'C'], [0.3, 'D'], [0, 'F']];
    return scale.find(([min]) => score >= min)[1];
  };
})();
