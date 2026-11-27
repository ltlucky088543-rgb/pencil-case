// Every tunable number in the game lives in this file.
(function () {
  const PC = (globalThis.PC = globalThis.PC || {});

  PC.COLS = 12;
  PC.ROWS = 8;
  PC.FINAL_WAVE = 50;
  PC.MAX_LEVEL = 9;
  PC.SAVE_VERSION = 2;

  // Maps. Each route is the cells a path runs through, corner to corner, starting off the
  // sheet and ending on the cell with a star chart. Homework takes the routes in turn.
  //   paper    the page it's drawn on, from PAPERS in render.js
  //   start    the supplies already on the page
  //   hp       evens maps out: a long path gives supplies more time, so homework is tougher.
  //            Tuned with mapParity() in tools/balance.html so no map is the easy one.
  //   open     the same for wave 1, easing to `hp` by wave 10, for maps that would be lost
  //            before anyone could build anything
  //   speed    how fast homework walks, for maps with two paths to watch at once
  //   props    things on the desk that nothing can be placed on, as [kind, column, row]
  //   spots    cells that help whatever sits on them, as [kind, column, row]
  PC.MAPS = {
    homeroom: {
      name: 'Homeroom', paper: 'graph', hp: 1,
      blurb: 'The classic page. Two long bends with room on both sides.',
      routes: [[[-1, 1], [3, 1], [3, 6], [5, 6], [5, 1], [8, 1], [8, 6], [11, 6]]],
      start: [['pencil', 4, 2], ['pencil', 4, 4], ['glue', 6, 3]],
    },
    hallway: {
      name: 'Long Hallway', paper: 'legal', hp: 0.87,
      blurb: 'Three straight corridors. Supplies between them cover two at once.',
      routes: [[[-1, 0], [10, 0], [10, 3], [1, 3], [1, 6], [11, 6]]],
      start: [['pencil', 5, 1], ['pencil', 5, 2], ['glue', 7, 4]],
    },
    spiral: {
      name: 'Spiral Notebook', paper: 'mint', hp: 1.3,
      blurb: 'The longest walk there is, winding in to stars in the middle of the page.',
      routes: [[[-1, 0], [11, 0], [11, 7], [0, 7], [0, 2], [9, 2], [9, 5], [2, 5]]],
      start: [['pencil', 5, 1], ['pencil', 7, 1], ['glue', 5, 3]],
      spots: [['reach', 5, 4]],
    },
    fireexit: {
      name: 'Fire Exit', paper: 'pink', hp: 0.89, open: 0.75,
      blurb: 'Hardly any path at all. Homework is weaker here, and gone before you know it.',
      routes: [[[-1, 4], [4, 4], [4, 2], [8, 2], [8, 4], [11, 4]]],
      start: [['pencil', 5, 3], ['pencil', 7, 3], ['glue', 3, 3]],
      spots: [['power', 6, 3], ['speed', 6, 1]],
    },
    twodoors: {
      name: 'Two Doors', paper: 'sky', hp: 1, open: 0.5, speed: 0.66,
      blurb: 'Two ways in and one way out. Hold them where the paths meet.',
      routes: [
        [[-1, 1], [2, 1], [2, 3], [5, 3], [5, 1], [9, 1], [9, 5], [11, 5]],
        [[-1, 6], [2, 6], [2, 3], [5, 3], [5, 1], [9, 1], [9, 5], [11, 5]],
      ],
      start: [['pencil', 4, 2], ['pencil', 4, 4], ['glue', 6, 2]],
    },
    crossroads: {
      name: 'Crossroads', paper: 'dots', hp: 1.08,
      blurb: 'The path crosses itself, so a supply by the crossing gets two tries.',
      routes: [[[-1, 4], [8, 4], [8, 1], [4, 1], [4, 7], [11, 7]]],
      start: [['pencil', 5, 3], ['pencil', 3, 5], ['glue', 5, 5]],
      props: [['mug', 10, 2]],
    },
    splitclass: {
      name: 'Split Class', paper: 'news', hp: 0.75, open: 0.4, speed: 0.6,
      blurb: 'Two separate paths with a star chart each. Only the middle row reaches both.',
      routes: [
        [[-1, 0], [2, 0], [2, 3], [9, 3], [9, 0], [11, 0]],
        [[-1, 7], [2, 7], [2, 5], [9, 5], [9, 7], [11, 7]],
      ],
      start: [['pencil', 4, 4], ['pencil', 6, 4], ['glue', 5, 4]],
      spots: [['reach', 7, 4]],
    },
    stairwell: {
      name: 'Stairwell', paper: 'kraft', hp: 0.97, open: 0.65,
      blurb: 'One step at a time, corner after corner, with a few good spots to fight over.',
      routes: [[[-1, 0], [2, 0], [2, 2], [4, 2], [4, 4], [6, 4], [6, 6], [8, 6], [8, 3], [11, 3]]],
      start: [['pencil', 3, 3], ['pencil', 5, 5], ['glue', 5, 3]],
      props: [['book', 10, 6], ['ink', 1, 5]],
      spots: [['power', 7, 5], ['speed', 3, 1]],
    },
    playground: {
      name: 'Playground', paper: 'lawn', hp: 0.86, open: 0.7,
      blurb: 'In from the top, with things in the way and prize spots beside them.',
      routes: [[[2, -1], [2, 6], [5, 6], [5, 1], [9, 1], [9, 6]]],
      start: [['pencil', 4, 4], ['pencil', 4, 2], ['glue', 6, 4]],
      props: [['apple', 3, 3], ['ball', 7, 3], ['ball', 7, 4], ['apple', 11, 2]],
      spots: [['power', 3, 5], ['speed', 6, 2], ['reach', 8, 4]],
    },
    cafeteria: {
      name: 'Cafeteria', paper: 'check', hp: 0.93, open: 0.8,
      blurb: 'Up and down between the tables, which take the best seats.',
      routes: [[[-1, 6], [2, 6], [2, 1], [5, 1], [5, 6], [8, 6], [8, 1], [11, 1]]],
      start: [['pencil', 3, 4], ['pencil', 4, 2], ['glue', 6, 3]],
      props: [['tray', 3, 3], ['tray', 4, 4], ['tray', 6, 4], ['tray', 7, 3], ['mug', 10, 4]],
    },
  };
  PC.DEFAULT_MAP = 'homeroom';
  // What a spot does for the supply on it, on top of any boosts from its neighbors.
  PC.SPOTS = {
    power: { name: 'Power spot', bonus: 0.25, blurb: '25% more damage', hex: '#d3262f' },
    speed: { name: 'Speed spot', bonus: 0.25, blurb: 'fires 25% faster', hex: '#e0a400' },
    reach: { name: 'Reach spot', bonus: 0.25, blurb: '25% more range', hex: '#2a7de1' },
  };

  // Economy
  PC.itemPrice = (bought, step = 3) => 20 + step * bought;
  PC.clearBonus = (wave) => 10 + 3 * wave;
  // Recess: after each exam the player can play one mini game. A perfect score is worth this
  // many supplies at the current price, which is under a tenth of what a school pays.
  PC.RECESS = { every: 10, supplies: 2 };

  // What one level is worth, and the shockwave a merge sets off.
  PC.LEVEL = { damage: 2.5, range: 0.16, rate: 0.04 };
  PC.BURST = { damage: 3, radius: 1.35, radiusPerLevel: 0.12 };

  // A supply that was just placed, moved or merged can't fire until it has set up.
  PC.SETUP_SECONDS = 1;

  // `mask` holds which basic supplies are in an item. Combining is a bitwise OR,
  // so anything containing all four basics comes out as the pencil case.
  PC.SUPPLIES = {
    pencil: {
      mask: 1, name: 'Pencil', detail: 'No. 2, HB', hex: '#d9a20a', deep: '#8a6500',
      dmg: 7, rate: 2.2, range: 2.3, attack: 'dart', shotSpeed: 10,
      blurb: 'Fires sharp darts at one target. The best plain damage for its level.',
    },
    ruler: {
      mask: 2, name: 'Ruler', detail: '30 cm', hex: '#b5782a', deep: '#74490f',
      dmg: 8, rate: 0.9, range: 2.5, attack: 'lob', flight: 0.5, splash: 0.85,
      blurb: 'Flicks paper clips in a high arc. They scatter and hit a whole area.',
    },
    glue: {
      mask: 4, name: 'Glue', detail: '4 fl oz', hex: '#2a7de1', deep: '#175bb0',
      dmg: 3.5, rate: 1.3, range: 2.5, attack: 'squirt', shotSpeed: 8,
      slow: 0.35, slowTime: 1.6,
      blurb: 'Squirts glue that slows whatever it hits. Gets stickier each level.',
    },
    eraser: {
      mask: 8, name: 'Eraser', detail: 'Rubber', hex: '#e8627f', deep: '#a8324f',
      dmg: 3, rate: 1.1, range: 2.2, attack: 'rub', shotSpeed: 9, push: 0.5,
      blurb: 'Rubs targets back along the path. Each shove on the same target is weaker than the last.',
    },
    crayon: {
      mask: 16, name: 'Crayon', detail: 'Wax', hex: '#e0562a', deep: '#9c3312',
      dmg: 5, rate: 1.4, range: 2.4, attack: 'scrawl', shotSpeed: 9, rainbow: true,
      blurb: 'Every shot is a random color with its own effect: a sting, a slow, a squeeze or a shove.',
    },
    tack: {
      mask: 32, name: 'Thumbtack', detail: 'Steel pin', hex: '#d9403a', deep: '#94211c',
      dmg: 9, rate: 0.8, range: 2.4, attack: 'lob', flight: 0.4, trapCharges: 3, trapLife: 10, trapRadius: 0.32,
      blurb: 'Drops tacks on the path. Each pile hits the next 3 enemies that walk over it.',
    },
    clip: {
      mask: 64, name: 'Paper Clip', detail: 'Steel wire', hex: '#7c8a99', deep: '#4f5c6b',
      dmg: 6, rate: 1.2, range: 2.4, attack: 'chain', chain: 2, chainHop: 1.5, falloff: 0.7,
      blurb: 'Pings off its target and bounces into a second one.',
    },
    chalk: {
      mask: 128, name: 'Chalk', detail: 'Box of 12', hex: '#b9b3a0', deep: '#7a7564',
      dmg: 5, rate: 0.9, range: 2.5, attack: 'lob', flight: 0.45, splash: 0.65, cut: 0.15, cutTime: 3,
      blurb: 'Throws clouds of chalk dust. Dusty homework loses its armor and takes 15% more damage for 3 seconds.',
    },
    // Paint lasts 4 seconds. If painted homework is wiped out while it is still wet, the paint
    // splashes `paint` times the hit's damage onto everything within `paintR`, armor or not.
    brush: {
      mask: 256, name: 'Paintbrush', detail: 'Size 6', hex: '#8e44c9', deep: '#5b2387',
      dmg: 5, rate: 1.1, range: 2.4, attack: 'flick', shotSpeed: 9, paint: 1.4, paintR: 0.6, paintTime: 4,
      blurb: 'Flicks paint at one target. If painted homework is wiped out, the wet paint splashes onto everything near it.',
    },
    stamp: {
      mask: 512, name: 'Rubber Stamp', detail: 'Red ink', hex: '#c42f45', deep: '#7e1626', still: true,
      dmg: 8, rate: 0.8, range: 2.3, attack: 'stamp', splash: 0.42,
      blurb: 'Stamps the page right where homework is standing: an instant hit on everything in a small circle.',
    },
    compass: {
      mask: 3, name: 'Compass', detail: 'Pencil + Ruler', hex: '#d3262f', deep: '#8f1420',
      dmg: 8, rate: 1, range: 2.4, attack: 'lob', flight: 0.4, splash: 0.75,
      sting: 0.45, stingTime: 2,
      blurb: 'Draws a circle around the target. Everything inside gets stabbed and keeps hurting for 2 seconds.',
    },
    tape: {
      mask: 6, name: 'Tape', detail: 'Ruler + Glue', hex: '#1f8a86', deep: '#115c59',
      dmg: 6, rate: 1.5, range: 2.6, attack: 'strip', shotSpeed: 8,
      wrap: 0.9, wrapLayers: 6, wrapTime: 3,
      blurb: 'Wraps targets in up to 6 layers that keep squeezing, even through Textbooks. Best on big targets.',
    },
    highlighter: {
      mask: 5, name: 'Highlighter', detail: 'Pencil + Glue', hex: '#ff4fa3', deep: '#c21f73',
      dmg: 18, rate: 0.55, range: 3.6, attack: 'stroke', strokeWidth: 0.3, pierce: true,
      blurb: 'Long strokes that hit everything in a line and go straight through Textbooks.',
    },
    mechanical: {
      mask: 9, name: 'Mechanical Pencil', detail: 'Pencil + Eraser', hex: '#2f5fb3', deep: '#1c3d7a',
      dmg: 5, rate: 2.4, range: 2.3, attack: 'dart', shotSpeed: 12, ramp: 0.25, rampMax: 6,
      blurb: 'Clicks out lead faster the longer it keeps firing, up to 2.5 times as fast.',
    },
    rubber: {
      mask: 10, name: 'Rubber Band', detail: 'Ruler + Eraser', hex: '#c9702a', deep: '#8a4714',
      dmg: 26, rate: 1, range: 4.2, attack: 'snap', shotSpeed: 16, strongest: true, stretch: 1,
      blurb: 'Snaps at the toughest target in reach. The longest range of any supply, and the further the shot, the harder it hits.',
    },
    whiteout: {
      mask: 12, name: 'White-Out', detail: 'Glue + Eraser', hex: '#7c8a99', deep: '#4f5c6b',
      dmg: 6, rate: 0.5, range: 2.6, attack: 'lob', flight: 0.5, puddle: 0.7, puddleTime: 4, puddleSlow: 0.2,
      blurb: 'Leaves puddles on the path that hurt and slow everything crossing them.',
    },
    stapler: {
      mask: 7, name: 'Stapler', detail: 'Pencil + Ruler + Glue', hex: '#c0303a', deep: '#7f1a22',
      dmg: 14, rate: 0.9, range: 2.5, attack: 'staple', shotSpeed: 12, stun: 0.6, spread: 3,
      blurb: 'Fires at three targets at once and staples them to the page, stopping them dead for a moment.',
    },
    calculator: {
      mask: 11, name: 'Calculator', detail: 'Pencil + Ruler + Eraser', hex: '#4c5a6a', deep: '#2d3743',
      dmg: 9, rate: 1, range: 2.6, attack: 'digit', shotSpeed: 9, payout: 0.5, still: true,
      blurb: 'Does the sums. Every kill in its range pays extra money, whoever lands it.',
    },
    sharpener: {
      mask: 13, name: 'Sharpener', detail: 'Pencil + Glue + Eraser', hex: '#6f7c8b', deep: '#46515e',
      dmg: 0, rate: 0, range: 1.6, attack: 'aura', aura: 0.65, still: true,
      blurb: "Doesn't attack. Sharpens every supply next to it so they all deal more damage.",
    },
    scissors: {
      mask: 14, name: 'Scissors', detail: 'Ruler + Glue + Eraser', hex: '#1d8f4e', deep: '#0f5c30',
      dmg: 13, rate: 1.1, range: 1.7, attack: 'snip', cut: 0.25, cutTime: 3, cuts: 2,
      blurb: 'Short reach, big snips at two targets. Cut targets lose their armor and take extra damage from everything.',
    },
    case: {
      mask: 15, name: 'Pencil Case', detail: 'Pencil + Ruler + Glue + Eraser', hex: '#5a3fb8', deep: '#3a2680', still: true,
      dmg: 11, rate: 1.3, range: 2.8, attack: 'chain', chain: 3, chainHop: 1.8, falloff: 0.6,
      blurb: 'Zips between targets, one more jump each level.',
    },
    coloredpencil: {
      mask: 17, name: 'Colored Pencil', detail: 'Pencil + Crayon', hex: '#2fa8a0', deep: '#16706a',
      dmg: 6, rate: 2.6, range: 2.4, attack: 'dart', shotSpeed: 11, rainbow: true,
      blurb: 'Rapid darts, and every one is a random color with its own effect.',
    },
    protractor: {
      mask: 18, name: 'Protractor', detail: 'Ruler + Crayon', hex: '#3aa6c9', deep: '#1f6f8a',
      dmg: 9, rate: 0.9, range: 2.6, attack: 'cone', coneWidth: 1.05,
      blurb: 'Sweeps a wide arc and hits everything in front of it.',
    },
    glitter: {
      mask: 20, name: 'Glitter Glue', detail: 'Glue + Crayon', hex: '#b455d6', deep: '#7a2f96',
      dmg: 6, rate: 0.9, range: 2.6, attack: 'lob', flight: 0.5, splash: 0.8, slow: 0.3, slowTime: 1.6,
      blurb: 'Lobs sparkly blobs that slow a whole area at once.',
    },
    marker: {
      mask: 24, name: 'Dry-Erase Marker', detail: 'Eraser + Crayon', hex: '#2b2f36', deep: '#14161a',
      dmg: 8, rate: 1, range: 3.4, attack: 'circle', shotSpeed: 12, cut: 0.3, cutTime: 3,
      blurb: 'Circles targets from far away. Circled targets lose their armor and take extra damage.',
    },
    pen: {
      mask: 33, name: 'Ballpoint Pen', detail: 'Pencil + Thumbtack', hex: '#2b3d91', deep: '#18245e',
      dmg: 11, rate: 1.8, range: 2.5, attack: 'dart', shotSpeed: 12, crit: 0.25, critMult: 3,
      blurb: 'One shot in four leaves a big blot for triple damage.',
    },
    setsquare: {
      mask: 34, name: 'Set Square', detail: 'Ruler + Thumbtack', hex: '#d98a1f', deep: '#935808',
      dmg: 9, rate: 0.7, range: 2.8, attack: 'boomerang', shotSpeed: 5.5,
      blurb: 'Spins out like a boomerang and hits everything on the way there and back.',
    },
    sticky: {
      mask: 36, name: 'Sticky Note', detail: 'Glue + Thumbtack', hex: '#c9a800', deep: '#7f6a00',
      dmg: 10, rate: 0.7, range: 2.6, attack: 'lob', flight: 0.4, trapCharges: 3, trapLife: 10, trapRadius: 0.34, stun: 0.7,
      blurb: 'Sticks notes on the path. The next 3 enemies to step on one get stuck for a moment.',
    },
    holepunch: {
      mask: 40, name: 'Hole Punch', detail: 'Eraser + Thumbtack', hex: '#566f8c', deep: '#35475c',
      dmg: 14, rate: 1.1, range: 2.4, attack: 'punch', shotSpeed: 12, bite: 0.08,
      blurb: 'Also takes a bite out of the target\'s current health, so big enemies hurt the most.',
    },
    board: {
      mask: 48, name: 'Bulletin Board', detail: 'Crayon + Thumbtack', hex: '#a9743a', deep: '#6d4a20',
      dmg: 0, rate: 0, range: 1.6, attack: 'aura', haste: 0.35, still: true,
      blurb: "Doesn't attack. Everything next to it fires faster.",
    },
    clipboard: {
      mask: 65, name: 'Clipboard', detail: 'Pencil + Paper Clip', hex: '#a3662a', deep: '#6b3f12',
      dmg: 6, rate: 1.6, range: 2.6, attack: 'dart', shotSpeed: 11, spread: 3,
      blurb: 'Takes notes on three targets at once.',
    },
    binderclip: {
      mask: 66, name: 'Binder Clip', detail: 'Ruler + Paper Clip', hex: '#2b2f36', deep: '#14161a',
      dmg: 22, rate: 0.8, range: 2.8, attack: 'dart', shotSpeed: 12, spread: 2, stun: 1,
      blurb: 'Clamps two pieces of homework at once and holds them still for a second.',
    },
    paperchain: {
      mask: 68, name: 'Paper Chain', detail: 'Glue + Paper Clip', hex: '#e8562a', deep: '#a3330e',
      dmg: 6, rate: 1, range: 2.6, attack: 'chain', chain: 4, chainHop: 1.6, falloff: 0.8, slow: 0.25, slowTime: 1.5,
      blurb: 'A chain of links that jumps through four targets and slows each one.',
    },
    bookmark: {
      mask: 72, name: 'Bookmark', detail: 'Eraser + Paper Clip', hex: '#d3262f', deep: '#8f1420',
      dmg: 18, rate: 0.9, range: 2.6, attack: 'dart', shotSpeed: 12, spread: 2, push: 1,
      blurb: 'Sends two pieces of homework back a whole cell at a time, losing their place.',
    },
    lanyard: {
      mask: 80, name: 'Lanyard', detail: 'Crayon + Paper Clip', hex: '#1d8f4e', deep: '#0f5c30',
      dmg: 6, rate: 1.4, range: 2.6, attack: 'dart', shotSpeed: 11, spread: 2, rainbow: true,
      blurb: 'Swings at two targets at once, every hit a random color with its own effect.',
    },
    remover: {
      mask: 96, name: 'Staple Remover', detail: 'Thumbtack + Paper Clip', hex: '#566f8c', deep: '#35475c',
      dmg: 15, rate: 1.1, range: 1.8, attack: 'snip', cuts: 2, bite: 0.05,
      blurb: 'Short reach. Bites into two targets at once, pulling out a chunk of their health.',
    },
    pastel: {
      mask: 129, name: 'Chalk Pastel', detail: 'Pencil + Chalk', hex: '#e88fb4', deep: '#a3557a',
      dmg: 7, rate: 0.9, range: 2.6, attack: 'lob', flight: 0.45, splash: 0.75, rainbow: true,
      blurb: 'Lobs soft colored clouds. Everything in a cloud gets the same random effect.',
    },
    pointer: {
      mask: 130, name: 'Pointer Stick', detail: 'Ruler + Chalk', hex: '#8a5a32', deep: '#5a3a1e',
      dmg: 26, rate: 1, range: 3.6, attack: 'zap', sees: true,
      blurb: 'The teacher points it out: an instant hit from far away. It can see Invisible Ink.',
    },
    papiermache: {
      mask: 132, name: 'Papier-Mache', detail: 'Glue + Chalk', hex: '#c9b28a', deep: '#7f6a45',
      dmg: 5, rate: 0.5, range: 2.6, attack: 'lob', flight: 0.5, puddle: 0.7, puddleTime: 5, puddleSlow: 0.35,
      blurb: 'Drops gloopy patches on the path that hurt and slow everything wading through.',
    },
    duster: {
      mask: 136, name: 'Board Eraser', detail: 'Eraser + Chalk', hex: '#5a4632', deep: '#33261a',
      dmg: 8, rate: 0.7, range: 1.9, attack: 'nova', push: 0.4,
      blurb: 'Wipes everything in reach at once and shoves it back a little.',
    },
    sidewalk: {
      mask: 144, name: 'Sidewalk Chalk', detail: 'Crayon + Chalk', hex: '#3aa6c9', deep: '#1f6f8a',
      dmg: 8, rate: 0.9, range: 2.5, attack: 'cone', coneWidth: 0.9, rainbow: true,
      blurb: 'Sprays a wide arc of colored dust. Everything in it gets the same random effect.',
    },
    easel: {
      mask: 160, name: 'Easel', detail: 'Thumbtack + Chalk', hex: '#b9834a', deep: '#7a4f22', still: true,
      dmg: 0, rate: 0, range: 1.6, attack: 'aura', reach: 0.25,
      blurb: "Doesn't attack. Props up everything next to it, giving them 25% more range.",
    },
    lamp: {
      mask: 192, name: 'Desk Lamp', detail: 'Paper Clip + Chalk', hex: '#e3a21c', deep: '#8a6000', still: true,
      dmg: 0, rate: 0, range: 1.6, attack: 'aura', aura: 0.2, reveal: true,
      blurb: "Doesn't attack. Everything next to it can see Invisible Ink and deals 20% more damage.",
    },
    watercolor: {
      mask: 257, name: 'Watercolor Pencil', detail: 'Pencil + Paintbrush', hex: '#3b8fd9', deep: '#1f5a96',
      dmg: 6, rate: 2.2, range: 2.4, attack: 'flick', shotSpeed: 11, paint: 1.2, paintR: 0.6, paintTime: 4,
      blurb: 'Rapid darts of wet color. Painted homework splashes paint on its neighbors when it goes.',
    },
    roller: {
      mask: 258, name: 'Paint Roller', detail: 'Ruler + Paintbrush', hex: '#4fb3a9', deep: '#2a7a72',
      dmg: 14, rate: 0.6, range: 3, attack: 'stroke', strokeWidth: 0.3, paint: 1, paintR: 0.6, paintTime: 4,
      blurb: 'Rolls a wide stripe of paint down a line, painting everything it covers.',
    },
    poster: {
      mask: 260, name: 'Poster Paint', detail: 'Glue + Paintbrush', hex: '#f08a24', deep: '#a85a0a', still: true,
      dmg: 6, rate: 0.9, range: 2.6, attack: 'lob', flight: 0.5, splash: 0.75, slow: 0.3, slowTime: 1.5, paint: 1, paintR: 0.6, paintTime: 4,
      blurb: 'Lobs thick globs of paint that slow and paint a whole area.',
    },
    sponge: {
      mask: 264, name: 'Sponge', detail: 'Eraser + Paintbrush', hex: '#f2c94c', deep: '#a3801a', still: true,
      dmg: 8, rate: 0.8, range: 1.9, attack: 'nova', push: 0.2, paint: 1.2, paintR: 0.6, paintTime: 4,
      blurb: 'Dabs everything in reach at once, painting it and nudging it back.',
    },
    fingerpaint: {
      mask: 272, name: 'Finger Paints', detail: 'Crayon + Paintbrush', hex: '#e0569a', deep: '#9c2a66', still: true,
      dmg: 6, rate: 1.5, range: 2.5, attack: 'flick', shotSpeed: 9, spread: 2, rainbow: true, paint: 1, paintR: 0.6, paintTime: 4,
      blurb: 'Smears two targets at once, each in a random color with its own effect, and paints them.',
    },
    palette: {
      mask: 288, name: 'Paint Palette', detail: 'Thumbtack + Paintbrush', hex: '#c98f52', deep: '#87592a', still: true,
      dmg: 10, rate: 0.8, range: 2.5, attack: 'lob', flight: 0.4, trapCharges: 3, trapLife: 10, trapRadius: 0.34, paint: 1.5, paintR: 0.65, paintTime: 4,
      blurb: 'Leaves wet paint on the path. The next 3 enemies to step in it get hit and painted.',
    },
    clothespin: {
      mask: 320, name: 'Clothespin', detail: 'Paper Clip + Paintbrush', hex: '#c9a06a', deep: '#87653a',
      dmg: 7, rate: 1.1, range: 2.6, attack: 'chain', chain: 3, chainHop: 1.6, falloff: 0.8, paint: 1, paintR: 0.6, paintTime: 4,
      blurb: 'Pegs paint on one target, then two more nearby, one more each level from 4.',
    },
    fixative: {
      mask: 384, name: 'Fixative Spray', detail: 'Chalk + Paintbrush', hex: '#6f8fa8', deep: '#45627a',
      dmg: 8, rate: 0.9, range: 2.4, attack: 'cone', coneWidth: 0.8, cut: 0.15, cutTime: 2, paint: 1, paintR: 0.6, paintTime: 4,
      blurb: 'Sprays a wide mist that paints everything in front of it and strips its armor.',
    },
    redpen: {
      mask: 513, name: 'Red Pen', detail: 'Pencil + Rubber Stamp', hex: '#e02a2a', deep: '#951212',
      dmg: 8, rate: 2, range: 2.5, attack: 'dart', shotSpeed: 12, cut: 0.2, cutTime: 2,
      blurb: 'Quick marks that grade homework wrong: it loses its armor and takes 20% more damage.',
    },
    embosser: {
      mask: 514, name: 'Embosser', detail: 'Ruler + Rubber Stamp', hex: '#5a6470', deep: '#363d45', still: true,
      dmg: 22, rate: 0.6, range: 2.6, attack: 'stamp', splash: 0.45, pierce: true,
      blurb: 'Presses down hard on a small circle. Goes straight through Textbooks.',
    },
    inkpad: {
      mask: 516, name: 'Ink Pad', detail: 'Glue + Rubber Stamp', hex: '#3a3f8f', deep: '#22265e', still: true,
      dmg: 8, rate: 0.9, range: 2.4, attack: 'stamp', splash: 0.5, slow: 0.35, slowTime: 1.8,
      blurb: 'Stamps with thick ink that slows everything in the circle.',
    },
    eraserstamp: {
      mask: 520, name: 'Eraser Stamp', detail: 'Eraser + Rubber Stamp', hex: '#f08fa6', deep: '#a8506a', still: true,
      dmg: 10, rate: 0.7, range: 2.3, attack: 'stamp', splash: 0.45, stun: 0.6,
      blurb: 'A carved eraser stamp. Everything it lands on stops dead for a moment.',
    },
    waxseal: {
      mask: 528, name: 'Wax Seal', detail: 'Crayon + Rubber Stamp', hex: '#a3202f', deep: '#66101a', still: true,
      dmg: 10, rate: 0.8, range: 2.4, attack: 'stamp', splash: 0.45, sting: 0.6, stingTime: 3,
      blurb: 'Seals homework with hot wax that keeps burning for 3 seconds.',
    },
    sticker: {
      mask: 544, name: 'Sticker Sheet', detail: 'Thumbtack + Rubber Stamp', hex: '#f2b705', deep: '#9a7300', still: true,
      dmg: 6, rate: 1.3, range: 2.6, attack: 'dart', shotSpeed: 10, spread: 3, starPay: 0.5,
      blurb: 'Sticks gold stars on three targets. Starred homework pays 50% more when it is wiped out, more each level.',
    },
    envelope: {
      mask: 576, name: 'Envelope', detail: 'Paper Clip + Rubber Stamp', hex: '#d9c29a', deep: '#8f7a52', still: true,
      dmg: 10, rate: 0.7, range: 2.4, attack: 'stamp', splash: 0.45, push: 0.6,
      blurb: 'Return to sender: stamps a small circle and sends everything in it back down the path.',
    },
    stencil: {
      mask: 640, name: 'Stencil', detail: 'Chalk + Rubber Stamp', hex: '#6fae7f', deep: '#3f7a50', still: true,
      dmg: 8, rate: 0.8, range: 2.4, attack: 'stamp', splash: 0.55, cut: 0.25, cutTime: 3,
      blurb: 'Dusts a stencil shape onto the page. Everything inside loses its armor and takes 25% more damage.',
    },
    potato: {
      mask: 768, name: 'Potato Stamp', detail: 'Paintbrush + Rubber Stamp', hex: '#c9a45c', deep: '#86692e', still: true,
      dmg: 10, rate: 0.8, range: 2.4, attack: 'stamp', splash: 0.5, paint: 1.2, paintR: 0.6, paintTime: 4,
      blurb: 'Stamps a circle of wet paint. Painted homework splashes paint on its neighbors when it goes.',
    },

    // Advanced fusions are made from two fusions, named in `from`.
    laser: {
      mask: 15, from: ['highlighter', 'rubber'], name: 'Laser Pointer', hex: '#e0201f', deep: '#99100f',
      dmg: 34, rate: 0.7, range: 5.2, attack: 'stroke', strokeWidth: 0.28, pierce: true,
      blurb: 'A beam across half the page. Hits everything in the line and goes straight through Textbooks.',
    },
    gluegun: {
      mask: 23, from: ['glitter', 'stapler'], name: 'Hot Glue Gun', hex: '#e8862a', deep: '#a3560e',
      dmg: 17, rate: 2.2, range: 2.7, attack: 'dart', shotSpeed: 11, spread: 3, slow: 0.4, slowTime: 1.6, sting: 0.3, stingTime: 2,
      blurb: 'Rapid blobs at three targets that slow them and keep burning.',
    },
    shredder: {
      mask: 46, from: ['scissors', 'holepunch'], name: 'Paper Shredder', hex: '#3a4656', deep: '#20282f',
      dmg: 8, rate: 1.2, range: 1.9, attack: 'nova', cut: 0.3, cutTime: 3, bite: 0.02,
      blurb: 'Tears into everything in reach at once, stripping armor and biting off health.',
    },
    graphing: {
      mask: 27, from: ['calculator', 'protractor'], name: 'Graphing Calculator', hex: '#3b6f9e', deep: '#234866', still: true,
      dmg: 15, rate: 1, range: 3, attack: 'cone', coneWidth: 1.2, payout: 1,
      blurb: 'Plots a wide arc of damage, and every kill in its range pays double or more.',
    },
    electric: {
      mask: 13, from: ['sharpener', 'mechanical'], name: 'Electric Sharpener', hex: '#d9a20a', deep: '#8a6500', still: true,
      dmg: 12, rate: 2.6, range: 2.5, attack: 'dart', shotSpeed: 12, ramp: 0.25, rampMax: 6, aura: 0.8, auraRange: 1.6,
      blurb: 'Fires faster the longer it runs, and sharpens everything next to it too.',
    },
    whiteboard: {
      mask: 28, from: ['marker', 'whiteout'], name: 'Whiteboard', hex: '#5f7fa8', deep: '#3a5473', still: true,
      dmg: 12, rate: 0.5, range: 2.4, attack: 'nova', push: 0.9, slow: 0.35, slowTime: 1.5,
      blurb: 'Wipes the board clean: everything in reach gets hit, slowed and shoved back.',
    },
    geometry: {
      mask: 35, from: ['compass', 'setsquare'], name: 'Geometry Set', hex: '#a3662a', deep: '#6b3f12',
      dmg: 15, rate: 0.8, range: 3.2, attack: 'boomerang', shotSpeed: 6.5, sting: 0.5, stingTime: 2,
      blurb: 'A spinning boomerang that hits everything twice and leaves it hurting.',
    },
    label: {
      mask: 39, from: ['tape', 'pen'], name: 'Label Maker', hex: '#2f8f5b', deep: '#175c38',
      dmg: 12, rate: 1.7, range: 2.8, attack: 'strip', shotSpeed: 10, spread: 3, wrap: 0.5, wrapLayers: 6, wrapTime: 3, crit: 0.25, critMult: 3,
      blurb: 'Sticks labels on three targets at once. They squeeze like tape and sometimes hit for triple.',
    },
    artkit: {
      mask: 21, from: ['coloredpencil', 'glitter'], name: 'Art Kit', hex: '#d64f9a', deep: '#94286a', still: true,
      dmg: 14, rate: 1.4, range: 3, attack: 'chain', chain: 5, chainHop: 2, falloff: 0.65, rainbow: true,
      blurb: 'Colors jump from target to target, each jump adding a random effect.',
    },
    backpack: {
      mask: 63, from: ['case', 'board'], name: 'Backpack', hex: '#c0303a', deep: '#7f1a22', still: true,
      dmg: 15, rate: 1.4, range: 3, attack: 'chain', chain: 6, chainHop: 2.2, falloff: 0.65, aura: 0.35, haste: 0.2, auraRange: 1.6,
      blurb: 'A long chain attack, and everything next to it hits harder and fires faster.',
    },
    magnifier: {
      mask: 23, from: ['highlighter', 'protractor'], name: 'Magnifying Glass', hex: '#3aa6c9', deep: '#1f6f8a',
      dmg: 18, rate: 5, range: 3, attack: 'zap', ramp: 0.3, rampMax: 10, focus: true,
      blurb: 'Focuses a beam on one target. It gets hotter the longer it stays on the same one, up to 4 times the damage.',
    },
    bell: {
      mask: 47, from: ['stapler', 'holepunch'], name: 'School Bell', hex: '#e3b23c', deep: '#8a6400', still: true,
      dmg: 16, rate: 0.4, range: 2.6, attack: 'nova', stun: 1,
      blurb: 'Rings every few seconds. Everything in reach gets hit and stops dead for a second.',
    },
    sandtimer: {
      mask: 28, from: ['glitter', 'whiteout'], name: 'Sand Timer', hex: '#c9973e', deep: '#7f5d1d', still: true,
      dmg: 0, rate: 0, range: 2.2, attack: 'field', field: 0.35,
      blurb: "Doesn't attack. Everything inside its range moves 35% slower, more each level.",
    },
    globe: {
      mask: 19, from: ['compass', 'protractor'], name: 'Globe', hex: '#3a8fd9', deep: '#1d5a96', still: true,
      dmg: 30, rate: 2, range: 1.8, attack: 'orbit', orbits: 3,
      blurb: 'Three moons orbit it and hit everything they pass through. A fourth joins at level 5.',
    },
    abacus: {
      mask: 27, from: ['calculator', 'coloredpencil'], name: 'Abacus', hex: '#b9834a', deep: '#7a4f22', still: true,
      dmg: 28, rate: 1.3, range: 2.6, attack: 'digit', shotSpeed: 9, spread: 3, interest: 0.06,
      blurb: 'Counts beads at three targets, and pays interest: after every wave you earn 6% of the money you saved, more each level.',
    },
    telescope: {
      mask: 42, from: ['rubber', 'setsquare'], name: 'Telescope', hex: '#2f4a8a', deep: '#1a2b55',
      dmg: 60, rate: 1, range: 9, attack: 'snap', shotSpeed: 22, sees: true, pierce: true, spread: 2,
      blurb: 'Reaches the whole page and shoots whatever is closest to your stars, plus the one next to it, straight through armor. It can see Invisible Ink.',
    },
    lunchbox: {
      mask: 38, from: ['tape', 'sticky'], name: 'Lunchbox', hex: '#2fa8a0', deep: '#16706a', still: true,
      dmg: 0, rate: 0, range: 1.6, attack: 'pack', spareEvery: 3,
      blurb: "Doesn't attack. Packs a spare star every 3 waves, or every 2 from level 5.",
    },
    megaphone: {
      mask: 26, from: ['rubber', 'marker'], name: 'Megaphone', hex: '#e8562a', deep: '#a3330e',
      dmg: 22, rate: 0.7, range: 2.8, attack: 'cone', coneWidth: 0.95, push: 0.6,
      blurb: 'Shouts across a wide arc, hitting everything in front of it and blowing it back down the path.',
    },
    projector: {
      mask: 194, from: ['pointer', 'lamp'], name: 'Projector', hex: '#3a4656', deep: '#20282f',
      dmg: 26, rate: 0.9, range: 5, attack: 'stroke', strokeWidth: 0.3, pierce: true, sees: true,
      blurb: 'Throws a wide beam across the page that hits everything in its path, Invisible Ink included.',
    },
    chalkboard: {
      mask: 152, from: ['duster', 'sidewalk'], name: 'Chalkboard', hex: '#2b3f38', deep: '#17251f', still: true,
      dmg: 14, rate: 0.6, range: 2.6, attack: 'nova', field: 0.3, push: 0.3,
      blurb: 'Everything near it moves slower, and every so often it wipes the whole area.',
    },
    trophy: {
      mask: 81, from: ['clipboard', 'lanyard'], name: 'Trophy', hex: '#e3b23c', deep: '#8a6400', still: true,
      dmg: 24, rate: 1.8, range: 2.8, attack: 'dart', shotSpeed: 11, spread: 3, payout: 1,
      blurb: 'Fires at three targets, and every kill in its range pays double or more.',
    },
    staplegun: {
      mask: 98, from: ['remover', 'binderclip'], name: 'Staple Gun', hex: '#c0303a', deep: '#7f1a22',
      dmg: 20, rate: 2.4, range: 2.6, attack: 'dart', shotSpeed: 14, spread: 3, stun: 0.4,
      blurb: 'Rapid staples at three targets, each one pinning them in place for a moment.',
    },
    watercolorset: {
      from: ['watercolor', 'pastel'], name: 'Watercolor Set', hex: '#3b8fd9', deep: '#1f5a96', still: true,
      dmg: 12, rate: 1, range: 2.8, attack: 'lob', flight: 0.5, splash: 0.8, rainbow: true, paint: 1.4, paintR: 0.7, paintTime: 4,
      blurb: 'Lobs washes of random color. Everything in the wash gets the same effect and gets painted.',
    },
    airbrush: {
      from: ['fixative', 'coloredpencil'], name: 'Airbrush', hex: '#d64f9a', deep: '#94286a',
      dmg: 7, rate: 1.6, range: 2.8, attack: 'cone', coneWidth: 0.7, rainbow: true, paint: 1, paintR: 0.6, paintTime: 4,
      blurb: 'Sprays fast bursts of random color across an arc, painting everything in front of it.',
    },
    pottery: {
      from: ['papiermache', 'sponge'], name: 'Pottery Wheel', hex: '#b5652e', deep: '#73390f', still: true,
      dmg: 16, rate: 2, range: 1.9, attack: 'orbit', orbits: 3, paint: 1.2, paintR: 0.6, paintTime: 4,
      blurb: 'Three lumps of wet clay spin around it, painting everything they pass through.',
    },
    paletteknife: {
      from: ['palette', 'scissors'], name: 'Palette Knife', hex: '#7c8a99', deep: '#4f5c6b',
      dmg: 18, rate: 1.2, range: 1.9, attack: 'snip', cuts: 3, cut: 0.3, cutTime: 3, paint: 1, paintR: 0.6, paintTime: 4,
      blurb: 'Short reach. Scrapes three targets at once, cutting them open and painting them.',
    },
    fountainpen: {
      from: ['pen', 'inkpad'], name: 'Fountain Pen', hex: '#22265e', deep: '#11143a',
      dmg: 16, rate: 1.8, range: 2.6, attack: 'flick', shotSpeed: 12, spread: 2, crit: 0.3, critMult: 3, paint: 1.2, paintR: 0.6, paintTime: 4,
      blurb: 'Inky darts at two targets that paint them, and nearly one in three leaves a big blot for triple damage.',
    },
    letterpress: {
      from: ['embosser', 'roller'], name: 'Letterpress', hex: '#5a6470', deep: '#363d45', still: true,
      dmg: 30, rate: 0.6, range: 3.2, attack: 'stroke', strokeWidth: 0.35, pierce: true, stun: 0.5,
      blurb: 'Presses a whole line of type onto the page. Goes through Textbooks and stops everything it hits.',
    },
    postmark: {
      from: ['envelope', 'waxseal'], name: 'Postmark', hex: '#a3202f', deep: '#66101a', still: true,
      dmg: 18, rate: 0.8, range: 2.6, attack: 'stamp', splash: 0.55, push: 0.6, sting: 0.6, stingTime: 3,
      blurb: 'Franks a circle of homework: it burns for 3 seconds and gets sent back down the path.',
    },
    mailbox: {
      from: ['envelope', 'sticky'], name: 'Mailbox', hex: '#2f5fb3', deep: '#1c3d7a', still: true,
      dmg: 26, rate: 0.9, range: 2.6, attack: 'lob', flight: 0.4, trapCharges: 6, trapLife: 10, trapRadius: 0.36, push: 1.2,
      blurb: 'Drops letters on the path. The next 6 enemies to step on one are sent back over a cell.',
    },
    reportcard: {
      from: ['redpen', 'calculator'], name: 'Report Card', hex: '#e02a2a', deep: '#951212', still: true,
      dmg: 22, rate: 1.6, range: 2.6, attack: 'dart', shotSpeed: 12, spread: 2, cut: 0.25, cutTime: 2, execute: 0.12,
      blurb: 'Grades two pieces of homework at a time. Anything it hits below 12% health fails on the spot, except bosses.',
    },
    starchart: {
      from: ['sticker', 'board'], name: 'Star Chart', hex: '#f2b705', deep: '#9a7300', still: true,
      dmg: 16, rate: 1.7, range: 2.6, attack: 'dart', shotSpeed: 10, spread: 4, starPay: 0.6, haste: 0.25, auraRange: 1.6,
      blurb: 'Gold stars on four targets, worth 60% more money, and everything next to it fires faster.',
    },
    notary: {
      from: ['waxseal', 'embosser'], name: 'Notary Seal', hex: '#b88a1c', deep: '#755406', still: true,
      dmg: 40, rate: 0.5, range: 2.6, attack: 'stamp', splash: 0.5, pierce: true, stun: 0.6, sting: 0.5, stingTime: 3,
      blurb: 'The official seal. A huge stamp through armor that stops homework dead and leaves it burning.',
    },
    stampkit: {
      from: ['inkpad', 'eraserstamp'], name: 'Stamp Kit', hex: '#3a3f8f', deep: '#22265e', still: true,
      dmg: 14, rate: 0.8, range: 2.8, attack: 'stamp', splash: 0.45, volley: 3, slow: 0.3, slowTime: 1.5, stun: 0.3,
      blurb: 'Stamps three spots on the path at once, one more every two levels. Each stamp slows and stuns.',
    },
    spirograph: {
      from: ['compass', 'paperchain'], name: 'Spirograph', hex: '#e8562a', deep: '#a3330e', still: true,
      dmg: 12, rate: 2.5, range: 2, attack: 'orbit', orbits: 4, sting: 0.4, stingTime: 2,
      blurb: 'Four looping gears spin around it and leave everything they touch hurting.',
    },
    tsquare: {
      from: ['setsquare', 'pointer'], name: 'T-Square', hex: '#d98a1f', deep: '#935808',
      dmg: 14, rate: 0.8, range: 3.6, attack: 'boomerang', shotSpeed: 7, cut: 0.25, cutTime: 3,
      blurb: 'Spins out a long way and back, hitting everything twice and cutting it open.',
    },
    bunsen: {
      from: ['lamp', 'waxseal'], name: 'Bunsen Burner', hex: '#2a7de1', deep: '#175bb0', still: true,
      dmg: 10, rate: 3, range: 2.2, attack: 'cone', coneWidth: 0.45, sting: 0.8, stingTime: 3,
      blurb: 'A short, roaring flame that sets everything in front of it burning.',
    },
    testtubes: {
      from: ['poster', 'glitter'], name: 'Test Tubes', hex: '#1d9a54', deep: '#0f6a37', still: true,
      dmg: 10, rate: 0.9, range: 2.8, attack: 'lob', flight: 0.5, splash: 0.65, volley: 2, sting: 0.5, stingTime: 3, slow: 0.3, slowTime: 1.5,
      blurb: 'Throws two bubbling mixtures at once. Whatever they splash burns and slows down.',
    },
    hallpass: {
      from: ['lanyard', 'bookmark'], name: 'Hall Pass', hex: '#1d8f4e', deep: '#0f5c30', still: true,
      dmg: 0, rate: 0, range: 1.6, attack: 'aura', reach: 0.35, reveal: true,
      blurb: "Doesn't attack. Everything next to it gets 35% more range and can see Invisible Ink.",
    },
    ringbinder: {
      from: ['binderclip', 'holepunch'], name: 'Ring Binder', hex: '#2f8f5b', deep: '#175c38', still: true,
      dmg: 30, rate: 1.2, range: 2.6, attack: 'punch', shotSpeed: 12, spread: 3, stun: 0.5, bite: 0.04,
      blurb: 'Punches three pieces of homework at once, clamping them still and biting off health.',
    },
    correction: {
      from: ['whiteout', 'tape'], name: 'Correction Tape', hex: '#9aa3ab', deep: '#5c656e',
      dmg: 11, rate: 1.6, range: 2.7, attack: 'strip', shotSpeed: 9, spread: 3, wrap: 0.6, wrapLayers: 6, wrapTime: 3, slow: 0.35, slowTime: 1.5,
      blurb: 'Covers three targets at once in tape that squeezes and slows them.',
    },
    laminator: {
      from: ['tape', 'duster'], name: 'Laminator', hex: '#4c5a6a', deep: '#2d3743', still: true,
      dmg: 8, rate: 0.9, range: 2, attack: 'nova', wrap: 0.6, wrapLayers: 5, wrapTime: 3,
      blurb: 'Seals everything in reach in plastic that keeps squeezing, even through Textbooks.',
    },
    crayonbox: {
      from: ['coloredpencil', 'sidewalk'], name: 'Crayon Box', hex: '#e0562a', deep: '#9c3312', still: true,
      dmg: 11, rate: 2.6, range: 2.6, attack: 'scrawl', shotSpeed: 10, spread: 3, rainbow: true,
      blurb: 'Rapid crayons at three targets, every one a random color with its own effect.',
    },
    popper: {
      from: ['pastel', 'paperchain'], name: 'Confetti Popper', hex: '#e88fb4', deep: '#a3557a',
      dmg: 12, rate: 0.9, range: 2.6, attack: 'cone', coneWidth: 1.1, rainbow: true, slow: 0.25, slowTime: 1.5,
      blurb: 'Pops a wide cloud of confetti that slows everything in front of it, plus a random effect.',
    },
    chalkline: {
      from: ['pointer', 'paperchain'], name: 'Chalk Line', hex: '#3aa6c9', deep: '#1f6f8a',
      dmg: 16, rate: 0.8, range: 4, attack: 'stroke', strokeWidth: 0.25, slow: 0.3, slowTime: 1.5, cut: 0.2, cutTime: 2,
      blurb: 'Snaps a long chalk line that slows everything on it and strips its armor.',
    },
    metronome: {
      from: ['mechanical', 'board'], name: 'Metronome', hex: '#7a4a20', deep: '#4a2a0e', still: true,
      dmg: 13, rate: 3, range: 2.6, attack: 'zap', ramp: 0.2, rampMax: 8, haste: 0.35, auraRange: 1.6,
      blurb: 'Ticks faster the longer it fires, and keeps everything next to it firing faster too.',
    },
    tuningfork: {
      from: ['rubber', 'bookmark'], name: 'Tuning Fork', hex: '#9aa3ab', deep: '#5c656e',
      dmg: 24, rate: 1, range: 2.8, attack: 'chain', chain: 5, chainHop: 2, falloff: 0.9, stun: 0.35,
      blurb: 'A ringing note that jumps through five targets, one more each level from 4, and stuns each one.',
    },
    mural: {
      from: ['roller', 'fixative'], name: 'Mural', hex: '#4fb3a9', deep: '#2a7a72', still: true,
      dmg: 16, rate: 0.7, range: 3.4, attack: 'stroke', strokeWidth: 0.45, rainbow: true, paint: 1.2, paintR: 0.6, paintTime: 4,
      blurb: 'Paints a broad stripe of random color down a line. Everything on it gets the effect and gets painted.',
    },
    paintbucket: {
      from: ['poster', 'sponge'], name: 'Paint Bucket', hex: '#f08a24', deep: '#a85a0a', still: true,
      dmg: 12, rate: 0.6, range: 2.8, attack: 'lob', flight: 0.55, splash: 1, slow: 0.3, slowTime: 1.5, paint: 1.5, paintR: 0.7, paintTime: 4,
      blurb: 'Tips a whole bucket over a wide area, slowing and painting everything in it.',
    },
    dryingrack: {
      from: ['clothespin', 'easel'], name: 'Drying Rack', hex: '#c9a06a', deep: '#87653a', still: true,
      dmg: 0, rate: 0, range: 1.6, attack: 'aura', aura: 0.2, paintAura: 1.2,
      blurb: "Doesn't attack. Everything next to it deals 20% more damage and its hits paint homework.",
    },
    blockprint: {
      from: ['potato', 'stencil'], name: 'Block Print', hex: '#6fae7f', deep: '#3f7a50', still: true,
      dmg: 14, rate: 0.8, range: 2.6, attack: 'stamp', splash: 0.5, volley: 2, cut: 0.2, cutTime: 2, paint: 1.2, paintR: 0.6, paintTime: 4,
      blurb: 'Prints two blocks of paint at once, more as it levels. Each one paints and strips armor.',
    },
    tiedye: {
      from: ['fingerpaint', 'lanyard'], name: 'Tie-Dye Kit', hex: '#b455d6', deep: '#7a2f96', still: true,
      dmg: 9, rate: 1.8, range: 2.6, attack: 'flick', shotSpeed: 10, spread: 3, rainbow: true, paint: 1, paintR: 0.6, paintTime: 4,
      blurb: 'Swirls of dye at three targets, each a random color with its own effect, and all of them paint.',
    },
    // `carbon` copies each hit onto every other piece of the same homework on the page.
    carbonpaper: {
      from: ['clipboard', 'pen'], name: 'Carbon Paper', hex: '#2b2f36', deep: '#14161a', still: true,
      dmg: 20, rate: 1.4, range: 2.6, attack: 'dart', shotSpeed: 11, spread: 2, carbon: 0.3,
      blurb: 'Darts at two targets, and every dart is copied: all other homework of the same kind on the page takes 30% of it too.',
    },
    // `copy` takes on the attack of the strongest supply next to it. See applyCopies in sim.js.
    photocopier: {
      from: ['clipboard', 'lamp'], name: 'Photocopier', hex: '#9aa3ab', deep: '#5c656e', still: true,
      dmg: 14, rate: 1, range: 2.6, attack: 'dart', shotSpeed: 11, copy: 0.8,
      blurb: 'Copies the attack of the strongest supply next to it, at its own level and 80% of the damage. Alone, it just fires paper.',
    },
    rubberball: {
      from: ['rubber', 'paperchain'], name: 'Rubber Band Ball', hex: '#c9702a', deep: '#8a4714', still: true,
      dmg: 26, rate: 0.9, range: 3, attack: 'chain', chain: 6, chainHop: 2.4, falloff: 0.85,
      blurb: 'Bounces from homework to homework, six in a row and one more each level from 4, barely slowing down.',
    },
    gluetrap: {
      from: ['papiermache', 'sticky'], name: 'Glue Trap', hex: '#e6c84a', deep: '#9a8018', still: true,
      dmg: 10, rate: 0.5, range: 2.6, attack: 'lob', flight: 0.5, puddle: 0.75, puddleTime: 5, puddleSlow: 0.6,
      blurb: 'Spreads patches of extra-strong glue. Anything wading through slows to a crawl.',
    },
    yardstick: {
      from: ['rubber', 'pointer'], name: 'Yardstick', hex: '#d9a85a', deep: '#94692a',
      dmg: 75, rate: 0.8, range: 4.5, attack: 'snap', shotSpeed: 16, strongest: true, stretch: 1, push: 0.8, spread: 2,
      blurb: 'Whacks the toughest homework in its long reach and the one beside it, harder the further away, and knocks them back.',
    },
    glowstick: {
      from: ['highlighter', 'lamp'], name: 'Glow Stick', hex: '#7be04a', deep: '#3f8f1a',
      dmg: 22, rate: 0.6, range: 3.8, attack: 'stroke', strokeWidth: 0.3, pierce: true, sees: true, slow: 0.3, slowTime: 1.5,
      blurb: 'A glowing streak that slows everything in its line, goes through Textbooks and lights up Invisible Ink.',
    },
    gelpen: {
      from: ['pen', 'glitter'], name: 'Gel Pen', hex: '#b455d6', deep: '#7a2f96',
      dmg: 20, rate: 2, range: 2.6, attack: 'dart', shotSpeed: 12, spread: 2, slow: 0.3, slowTime: 1.4, crit: 0.25, critMult: 3,
      blurb: 'Sparkly ink at two targets that slows them, and one shot in four blots for triple damage.',
    },
    pinwheel: {
      from: ['protractor', 'sidewalk'], name: 'Pinwheel', hex: '#3aa6c9', deep: '#1f6f8a', still: true,
      dmg: 14, rate: 2.5, range: 1.7, attack: 'orbit', orbits: 5, rainbow: true,
      blurb: 'Five colored blades spin around it, each hit adding a random effect. A sixth joins at level 5.',
    },
    stopwatch: {
      from: ['mechanical', 'calculator'], name: 'Stopwatch', hex: '#c7ced6', deep: '#7c8a99', still: true,
      dmg: 16, rate: 3, range: 2.6, attack: 'zap', ramp: 0.2, rampMax: 8, stun: 0.25,
      blurb: 'Ticks faster the longer it runs, and every tick can stop homework in its tracks.',
    },
    microscope: {
      from: ['remover', 'lamp'], name: 'Microscope', hex: '#566f8c', deep: '#35475c', still: true,
      dmg: 20, rate: 4, range: 2.8, attack: 'zap', ramp: 0.35, rampMax: 10, focus: true, bite: 0.03, sees: true,
      blurb: 'Studies one target closely: the longer it stays on it, the hotter the beam, and every look bites off health.',
    },
    prism: {
      from: ['highlighter', 'glitter'], name: 'Prism', hex: '#9fd8f0', deep: '#4f8fae', still: true,
      dmg: 14, rate: 0.7, range: 3.4, attack: 'prism', beams: 3, beamGap: 0.3, strokeWidth: 0.2, pierce: true, rainbow: true,
      blurb: 'Splits its beam into three, each its own color with its own effect, all going through Textbooks.',
    },
    magnet: {
      from: ['paperchain', 'binderclip'], name: 'Horseshoe Magnet', hex: '#d3262f', deep: '#8f1420', still: true,
      dmg: 12, rate: 0.6, range: 2, attack: 'nova', push: 0.5, field: 0.3,
      blurb: 'Holds everything near it back: homework in range moves 30% slower, and every so often it gets yanked back.',
    },
    xylophone: {
      from: ['protractor', 'bookmark'], name: 'Xylophone', hex: '#e3b23c', deep: '#8a6400', still: true,
      dmg: 20, rate: 0.8, range: 2.6, attack: 'cone', coneWidth: 0.95, stun: 0.3,
      blurb: 'Plays a chord across a wide arc. Everything in front of it gets hit and stunned for a moment.',
    },
    indexcards: {
      from: ['clipboard', 'sticky'], name: 'Index Cards', hex: '#9fd0f7', deep: '#3b78b0', still: true,
      dmg: 20, rate: 0.8, range: 2.6, attack: 'lob', flight: 0.4, trapCharges: 5, trapLife: 10, trapRadius: 0.34, cut: 0.25, cutTime: 3,
      blurb: 'Scatters cards on the path. The next 5 enemies to step on one get hit and lose their armor.',
    },
    beaker: {
      from: ['papiermache', 'glitter'], name: 'Beaker', hex: '#3fbf8a', deep: '#1d7a52', still: true,
      dmg: 14, rate: 0.5, range: 2.6, attack: 'lob', flight: 0.5, puddle: 0.8, puddleTime: 6, puddleSlow: 0.2,
      blurb: 'Spills fizzing puddles that eat through anything crossing them for 6 seconds.',
    },
    paperfan: {
      from: ['bookmark', 'duster'], name: 'Paper Fan', hex: '#e88fb4', deep: '#a3557a',
      dmg: 16, rate: 1.2, range: 2.4, attack: 'cone', coneWidth: 1.2, push: 0.5,
      blurb: 'Fans a wide gust that hits everything in front of it and blows it back down the path.',
    },
    bigcompass: {
      from: ['compass', 'sidewalk'], name: 'Chalkboard Compass', hex: '#b9b3a0', deep: '#7a7564',
      dmg: 12, rate: 0.8, range: 2.8, attack: 'lob', flight: 0.45, splash: 1, sting: 0.5, stingTime: 2, cut: 0.2, cutTime: 2,
      blurb: 'Draws a huge chalk circle. Everything inside keeps hurting and loses its armor for a moment.',
    },

    // Legendary fusions are made from two advanced fusions. The recipe book keeps them
    // secret, showing only the hint, until you make one.
    bus: {
      mask: 63, from: ['backpack', 'lunchbox'], legendary: true, name: 'School Bus', hex: '#f6c21c', deep: '#8a6500', still: true,
      dmg: 45, rate: 0.2, range: 99, attack: 'bus', busSpeed: 6, stun: 0.5, sees: true,
      hint: 'Everything you carry to school, plus your lunch.',
      blurb: 'Every few seconds a bus drives backwards down the whole path, flattening everything it meets.',
    },
    lasercutter: {
      mask: 47, from: ['laser', 'shredder'], legendary: true, name: 'Laser Cutter', hex: '#e0201f', deep: '#99100f',
      dmg: 26, rate: 0.8, range: 6, attack: 'stroke', strokeWidth: 0.26, pierce: true, cut: 0.35, cutTime: 3, bite: 0.02,
      hint: 'A beam of light, and a machine that eats paper.',
      blurb: 'A cutting beam across the page. It goes through armor, cuts targets open and bites off health.',
    },
    clock: {
      mask: 63, from: ['sandtimer', 'geometry'], legendary: true, name: 'Class Clock', hex: '#7a4a20', deep: '#4a2a0e', still: true,
      dmg: 0, rate: 0.16, range: 99, attack: 'freeze', freeze: 1.4, sees: true,
      hint: 'Something that measures time, and something that measures angles.',
      blurb: 'When the clock strikes, all homework on the page freezes in place. Dictionaries keep walking.',
    },
    desk: {
      mask: 29, from: ['electric', 'whiteboard'], legendary: true, name: "Teacher's Desk", hex: '#a3662a', deep: '#6b3f12', still: true,
      dmg: 28, rate: 0.6, range: 2.4, attack: 'nova', aura: 0.3, auraRange: 99,
      hint: 'Where the teacher keeps the electric sharpener and the board.',
      blurb: 'Every supply on the page deals 30% more damage, more each level. It also grades anything close by.',
    },
    volcano: {
      mask: 23, from: ['gluegun', 'artkit'], legendary: true, name: 'Science Fair Volcano', hex: '#e8562a', deep: '#9c2a0e', still: true,
      dmg: 16, rate: 0.6, range: 3.2, attack: 'lob', flight: 0.7, splash: 0.7, sting: 0.6, stingTime: 3, volley: 3,
      hint: 'Hot glue, and every color in the art kit.',
      blurb: 'Erupts three burning blobs at a time across the path, one more every two levels.',
    },
    principal: {
      mask: 217, from: ['chalkboard', 'trophy'], legendary: true, name: "Principal's Office", hex: '#5a3fb8', deep: '#3a2680', still: true,
      dmg: 0, rate: 0, range: 99, attack: 'field', field: 0.2, expose: 0.2,
      hint: 'The board where the rules are written, and the prize for following them.',
      blurb: 'Runs the whole page: every piece of homework moves 20% slower, loses its armor and takes 20% more damage.',
    },
    // 'rain' hits `drops` homework anywhere in range at once: random ones, or with `front`,
    // the ones closest to your stars. One more drop every two levels.
    artroom: {
      from: ['watercolorset', 'airbrush'], legendary: true, name: 'Art Room', hex: '#8e44c9', deep: '#5b2387', still: true,
      dmg: 30, rate: 0.8, range: 99, attack: 'rain', drops: 3, sees: true, rainbow: true, paint: 1, paintR: 0.6, paintTime: 4,
      hint: 'Paint in every color, from the brush and from the can.',
      blurb: 'Rains paint on three pieces of homework anywhere on the page, one more every two levels, painting every one.',
    },
    postoffice: {
      from: ['postmark', 'mailbox'], legendary: true, name: 'Post Office', hex: '#2f5fb3', deep: '#1c3d7a', still: true,
      dmg: 50, rate: 0.5, range: 99, attack: 'rain', drops: 6, front: true, sees: true, push: 1.5, stun: 0.5,
      hint: 'Where every stamped letter and every mailbox ends up.',
      blurb: 'Every few seconds it returns the six pieces of homework closest to your stars to sender, wherever they are.',
    },
    honorroll: {
      from: ['starchart', 'reportcard'], legendary: true, name: 'Honor Roll', hex: '#e3b23c', deep: '#8a6400', still: true,
      dmg: 30, rate: 1.2, range: 99, attack: 'dart', shotSpeed: 14, spread: 4, sees: true, execute: 0.15, payout: 0.5,
      hint: 'Gold stars, and grades good enough to be named for them.',
      blurb: 'Grades four targets anywhere on the page. Below 15% health they fail on the spot, and every kill pays 50% more.',
    },
    sciencelab: {
      from: ['bunsen', 'testtubes'], legendary: true, name: 'Science Lab', hex: '#1d9a54', deep: '#0f6a37', still: true,
      dmg: 18, rate: 0.6, range: 3.4, attack: 'lob', flight: 0.6, splash: 0.7, volley: 4, sting: 0.8, stingTime: 3, slow: 0.3, slowTime: 1.5,
      hint: 'A flame, and the tubes you hold over it.',
      blurb: 'Hurls four bubbling experiments at a time, one more every two levels. Everything splashed burns and slows.',
    },
    band: {
      from: ['metronome', 'tuningfork'], legendary: true, name: 'Marching Band', hex: '#d3262f', deep: '#8f1420', still: true,
      dmg: 20, rate: 0.5, range: 2.2, attack: 'nova', stun: 0.6, haste: 0.25, auraRange: 99,
      hint: 'Something that keeps the beat, and something that keeps the note.',
      blurb: 'Every supply on the page fires 25% faster, more each level. Its drumbeat also stuns anything close by.',
    },
    library: {
      from: ['hallpass', 'correction'], legendary: true, name: 'Library', hex: '#7a4a20', deep: '#4a2a0e', still: true,
      dmg: 0, rate: 0, range: 3, attack: 'field', field: 0.3, reach: 0.15, reveal: true, auraRange: 99,
      hint: 'You need a pass to get in, and you must not write in the books.',
      blurb: 'Quiet, please. Every supply on the page gets 15% more range and can see Invisible Ink, and homework near it moves 30% slower.',
    },
    planetarium: {
      from: ['spirograph', 'globe'], legendary: true, name: 'Planetarium', hex: '#2f4a8a', deep: '#1a2b55', still: true,
      dmg: 30, rate: 2, range: 3.2, attack: 'orbit', orbits: 6, sees: true,
      hint: 'Loops drawn with gears, and the world they circle.',
      blurb: 'Six planets orbit far out around it, a seventh from level 5, hitting everything they pass.',
    },
    printingpress: {
      from: ['letterpress', 'stampkit'], legendary: true, name: 'Printing Press', hex: '#39414d', deep: '#1f242b', still: true,
      dmg: 26, rate: 0.6, range: 3.2, attack: 'stamp', splash: 0.5, volley: 5, stun: 0.5, pierce: true,
      hint: 'Movable type, and every stamp in the kit.',
      blurb: 'Prints five stamps on the path at once, one more every two levels. Each goes through armor and stuns.',
    },
    copyroom: {
      from: ['photocopier', 'carbonpaper'], legendary: true, name: 'Copy Room', hex: '#5c656e', deep: '#363d45', still: true,
      dmg: 30, rate: 1.2, range: 3, attack: 'dart', shotSpeed: 12, spread: 3, copy: 1.2, carbon: 0.2,
      hint: 'A machine that copies, and paper that copies by itself.',
      blurb: 'Copies the attack of the strongest supply next to it at 120% damage. Its single shots are carbon-copied onto all homework of the same kind.',
    },
    gymclass: {
      from: ['rubberball', 'yardstick'], legendary: true, name: 'Gym Class', hex: '#d3262f', deep: '#8f1420', still: true,
      dmg: 40, rate: 0.8, range: 3.4, attack: 'chain', chain: 10, chainHop: 3, falloff: 0.92, stun: 0.3,
      hint: 'Something to bounce, and something to measure how far it went.',
      blurb: 'Dodgeball! A ball bounces through ten pieces of homework, one more each level from 4, stunning every one.',
    },
    observatory: {
      from: ['telescope', 'prism'], legendary: true, name: 'Observatory', hex: '#2f4a8a', deep: '#1a2b55', still: true,
      dmg: 18, rate: 0.6, range: 6, attack: 'prism', beams: 5, beamGap: 0.22, strokeWidth: 0.25, pierce: true, sees: true, rainbow: true,
      hint: 'Something to see far away, and something that splits the light.',
      blurb: 'Five long beams of starlight fan across the page, each with its own effect, through armor and Invisible Ink.',
    },
    foodfight: {
      from: ['lunchbox', 'gluetrap'], legendary: true, name: 'Food Fight', hex: '#e8862a', deep: '#a3560e', still: true,
      dmg: 18, rate: 0.7, range: 3.4, attack: 'lob', flight: 0.6, splash: 0.6, volley: 6, rainbow: true,
      hint: 'Your lunch, and something sticky to throw it with.',
      blurb: 'Six handfuls of lunch fly at once, one more every two levels. Each splat has its own random effect.',
    },
    detentionhall: {
      from: ['stopwatch', 'magnet'], legendary: true, name: 'Detention Hall', hex: '#f7b3c6', deep: '#a8506a', still: true,
      dmg: 80, rate: 0.5, range: 99, attack: 'rain', drops: 5, strongest: true, stun: 2, sees: true,
      hint: 'A clock that counts the minutes, and something you cannot pull away from.',
      blurb: 'Every couple of seconds the five toughest pieces of homework on the page get detention and stop for 2 seconds. Dictionaries refuse to go.',
    },

    // Mythics are made from two legendaries, and every legendary leads to at least one.
    // They count as legendary too, so anything that hides or ranks legendaries covers them.
    timemachine: {
      from: ['clock', 'bus'], legendary: true, mythic: true, name: 'Time Machine', hex: '#3aa6c9', deep: '#14506a', still: true,
      dmg: 130, rate: 0.18, range: 99, attack: 'rewind', rewind: 3, sees: true,
      hint: 'Something that stops time, and something that drives backwards.',
      blurb: 'Every so often it turns back the clock: all homework on the page is hit and thrown back along the path. Each rewind moves it less.',
    },
    blackhole: {
      from: ['observatory', 'planetarium'], legendary: true, mythic: true, name: 'Black Hole', hex: '#3b1f6b', deep: '#1a0c36', still: true,
      dmg: 60, rate: 0.3, range: 99, attack: 'lob', flight: 0.4, puddle: 1.2, puddleTime: 2.5, puddleSlow: 0.7, grabs: true, sees: true,
      hint: 'A long look at the stars, and the planets that circle them.',
      blurb: 'Opens black holes on the path, anywhere on the page. Anything caught in one, even a Paper Crane, barely moves and is torn apart, armor and all.',
    },
    graduation: {
      from: ['honorroll', 'principal'], legendary: true, mythic: true, name: 'Graduation Day', hex: '#1f2a5c', deep: '#0e1536', still: true,
      dmg: 40, rate: 1, range: 99, attack: 'rain', drops: 5, splash: 0.3, execute: 0.15, payout: 1, sees: true,
      hint: 'The best students, and the one who hands out the diplomas.',
      blurb: 'Caps rain down on five pieces of homework anywhere on the page, one more every two levels. Below 15% health they are done for good, and every kill pays double.',
    },
    supercomputer: {
      from: ['copyroom', 'desk'], legendary: true, mythic: true, name: 'Supercomputer', hex: '#1d9a7a', deep: '#0c4f3e', still: true,
      dmg: 45, rate: 2, range: 4, attack: 'chain', chain: 8, chainHop: 2.6, falloff: 0.9, aura: 0.5, haste: 0.2, auraRange: 99, sees: true,
      hint: 'Where everything is copied, and where everything is graded.',
      blurb: 'Runs the whole page: every supply deals 50% more damage and fires 20% faster, more each level. Its sparks also jump through eight targets, more each level from 4.',
    },
    dragon: {
      from: ['volcano', 'artroom'], legendary: true, mythic: true, name: 'Paper Dragon', hex: '#d3262f', deep: '#7a0f16', still: true,
      dmg: 65, rate: 0.3, range: 99, attack: 'bus', busArt: 'dragon', busSpeed: 8, sting: 0.5, stingTime: 3, sees: true,
      hint: 'Fire from the science fair, and paint to give it scales.',
      blurb: 'A dragon flies down the whole path from your stars to the start, burning everything it meets.',
    },
    chainreaction: {
      from: ['sciencelab', 'foodfight'], legendary: true, mythic: true, name: 'Chain Reaction', hex: '#7be04a', deep: '#2f7a12', still: true,
      dmg: 32, rate: 0.7, range: 4, attack: 'lob', flight: 0.5, splash: 0.8, volley: 8, sting: 0.6, stingTime: 3, slow: 0.35, slowTime: 1.5,
      hint: 'An experiment, and a lunch that gets thrown.',
      blurb: 'Eight unstable mixtures at once, one more every two levels. Everything they splash burns and slows down.',
    },
    satellite: {
      from: ['lasercutter', 'postoffice'], legendary: true, mythic: true, name: 'Satellite Laser', hex: '#e0201f', deep: '#7a0f0e', still: true,
      dmg: 55, rate: 0.5, range: 99, attack: 'rain', drops: 3, strongest: true, splash: 0.7, pierce: true, cut: 0.35, cutTime: 3, bite: 0.02, sees: true,
      hint: 'A beam that cuts, and something that delivers anywhere.',
      blurb: 'Burns the three toughest pieces of homework on the page from above, along with everything around them, armor or not.',
    },
    encyclopedia: {
      from: ['library', 'printingpress'], legendary: true, mythic: true, name: 'Encyclopedia', hex: '#7a4a20', deep: '#3f240c', still: true,
      dmg: 55, rate: 0.6, range: 99, attack: 'stamp', splash: 0.6, volley: 10, pierce: true, stun: 0.4, reach: 0.2, reveal: true, auraRange: 99,
      hint: 'Every book there is, and the machine that printed them.',
      blurb: 'Slams ten pages onto the path at once, anywhere, through armor. Every supply gets 20% more range and sees Invisible Ink.',
    },
    peprally: {
      from: ['gymclass', 'band'], legendary: true, mythic: true, name: 'Pep Rally', hex: '#f08a24', deep: '#9c5206', still: true,
      dmg: 70, rate: 0.8, range: 4, attack: 'chain', chain: 16, chainHop: 3.5, falloff: 0.95, stun: 0.4, haste: 0.35, auraRange: 99,
      hint: 'A team, and the drums that cheer it on.',
      blurb: 'Every supply on the page fires 35% faster, more each level, and the team bounces through sixteen pieces of homework at a time.',
    },
    snowday: {
      from: ['detentionhall', 'clock'], legendary: true, mythic: true, name: 'Snow Day', hex: '#7fb5ea', deep: '#2c5f94', still: true,
      dmg: 60, rate: 0.16, range: 99, attack: 'freeze', freeze: 1.8, cut: 0.3, cutTime: 3, sees: true,
      hint: 'Nobody can leave, and the hands on the clock have stopped.',
      blurb: 'A blizzard hits the whole page, freezes it in place and leaves everything taking 30% more damage.',
    },
  };

  for (const type of Object.values(PC.SUPPLIES)) {
    if (!type.from) continue;
    type.detail = type.from.map((part) => PC.SUPPLIES[part].name).join(' + ');
    // Newer advanced fusions leave the mask out: it is everything in both parts.
    if (type.mask === undefined) type.mask = type.from.reduce((m, part) => m | PC.SUPPLIES[part].mask, 0);
  }

  PC.BASICS = ['pencil', 'ruler', 'glue', 'eraser', 'crayon', 'tack', 'clip', 'chalk', 'brush', 'stamp'];

  // A random effect for each shot from anything with `rainbow`.
  PC.RAINBOW = [
    { hex: '#d3262f', sting: 0.6, stingTime: 2 },
    { hex: '#2a7de1', slow: 0.35, slowTime: 1.4 },
    { hex: '#1d8f4e', wrap: 0.6, wrapLayers: 4, wrapTime: 2.5 },
    { hex: '#e6a800', push: 0.3 },
  ];

  const isAdvanced = (key) => !!PC.SUPPLIES[key].from;
  const pairKey = (a, b) => [a, b].sort().join('+');
  const parts = (key) => PC.SUPPLIES[key].mask.toString(2).replace(/0/g, '').length;

  const ADVANCED = {};
  const MASK_TO_SUPPLY = {};
  for (const key of Object.keys(PC.SUPPLIES)) {
    if (isAdvanced(key)) ADVANCED[pairKey(...PC.SUPPLIES[key].from)] = key;
    else MASK_TO_SUPPLY[PC.SUPPLIES[key].mask] = key;
  }

  // What dropping `a` onto `b` makes. Same supplies stay the same, advanced recipes come
  // first, and anything else mixes by the basics inside it. If nothing matches, the more
  // advanced of the two levels up, so any two supplies of the same level can always merge.
  PC.combine = function (a, b) {
    if (a === b) return a;
    const advanced = ADVANCED[pairKey(a, b)];
    if (advanced) return advanced;
    // Merging into a higher tier never drops it down. Two of the same tier keep the target.
    const tier = (key) => (PC.SUPPLIES[key].mythic ? 3 : PC.SUPPLIES[key].legendary ? 2 : isAdvanced(key) ? 1 : 0);
    if (tier(a) || tier(b)) return tier(a) > tier(b) ? a : b;
    const mixed = MASK_TO_SUPPLY[PC.SUPPLIES[a].mask | PC.SUPPLIES[b].mask];
    if (mixed) return mixed;
    return parts(a) > parts(b) ? a : b;
  };

  // Each school has its own house rules. main.js turns these numbers into the text on the
  // school picker, so the description can never drift from what the game does.
  //   hp, speed   homework health and walking speed, 1 = normal
  //   crowd       how much homework each wave brings
  //   crowdStart  if set, classes start at this size on wave 1 and grow evenly to `crowd` by wave crowdBy
  //   trickyCrowd the most tricky homework grows to, however big the class gets
  //   growth      how fast homework toughens up to wave 30, instead of 1.13
  //   lateGrowth  how fast homework toughens after wave 30, instead of PC.LATE_GROWTH
  //   guestsFrom  the wave the tricky homework starts turning up
  //   quizFrom    a Surprise Quiz boss joins this wave, then every 10 waves, halfway between the exams
  //   starEvery   earn a lost star back every so many waves
  //   refund      share of the cost you get back when you sell
  //   priceStep   how much each purchase adds to the price of the next
  //   armor       share of every direct hit that all homework blocks, on top of its own armor
  //   bossCrowd   how many of each boss come at once
  //   extraGuests tricky homework only this school sends, as [type, count, gap]
  //   thesisOn    the waves The Dissertation joins, on top of that wave's other bosses
  //   unlockedBy  a secret school, hidden on the picker until you win at this one
  PC.DIFFICULTIES = {
    easy: {
      name: 'Elementary School', level: 'Easy', lives: 30, money: 100, pay: 1.2,
      hp: 0.65, speed: 0.9, crowd: 1, guestsFrom: 10, starEvery: 4, refund: 0.75, priceStep: 3,
    },
    normal: {
      name: 'Middle School', level: 'Normal', lives: 20, money: 60, pay: 1,
      hp: 1.1, speed: 1, crowd: 1, guestsFrom: 8, refund: 0.5, priceStep: 3,
    },
    // High School and College get harder after wave 30, not before: average bots already fall
    // around wave 23. They pay for about 110 and 92 supplies by wave 50, and stage() uses
    // boards of 100 and 84. Two Geometry Sets used to win both without losing a star. At
    // these numbers the best bot falls on 44-50 here and on 43-48 at College. Of the 16
    // legendaries that deal damage, 10 clear High School and 5 clear College.
    hard: {
      name: 'High School', level: 'Hard', lives: 15, money: 55, pay: 0.95,
      hp: 1.2, speed: 1, crowd: 1.15, lateGrowth: 1.08, guestsFrom: 6, quizFrom: 25, refund: 0.35, priceStep: 3,
    },
    expert: {
      name: 'College', level: 'Expert', lives: 12, money: 70, pay: 0.9,
      hp: 1, speed: 1.1, crowd: 1.1, lateGrowth: 1.1, guestsFrom: 4, quizFrom: 15, refund: 0.35, priceStep: 4,
    },
    // Classes grow to ten times the size by wave 20, at the player's request. A player still
    // won at lateGrowth 1.055 without losing a star, far better than any bot here, so waves
    // 31-50 are tuned with stage() in tools/balance.html: the boards a player could afford by
    // each wave (about 220 supplies by 50), not one bigger than all the money in the game.
    // At 1.18 Art Room or the best mix of legendaries gets past the wave 50 exams. Most other
    // legendary boards fall on 50 itself, Laser Cutters on 43, and most mythics get through.
    impossible: {
      name: 'Graduate School', level: 'Impossible', lives: 6, money: 40, pay: 0.85,
      hp: 1.3, speed: 1.15, crowd: 10, crowdStart: 1.15, crowdBy: 20, trickyCrowd: 3, lateGrowth: 1.18,
      guestsFrom: 5, quizFrom: 15, refund: 0.2, priceStep: 5, armor: 0.1,
    },
    // The secret school, for whoever beats Graduate School. Bosses come in pairs, Peer Reviews
    // shield the homework around them, classes reach twelve times the size by wave 15, and
    // supplies cost more while paying less. The opening is gentle on purpose, since the bots
    // died on wave 2 at anything tougher, and `growth` makes up for it by wave 30. The best
    // bot falls on 18-28 here and on 23-40 at Graduate School. Late game, by stage() on an
    // affordable board at lateGrowth 1.14: every legendary board falls by wave 50, most
    // mythics fall on 50 itself, and Encyclopedia, Satellite Laser or a mythic mix gets by.
    doctorate: {
      name: 'Doctorate', level: 'Secret', unlockedBy: 'impossible', lives: 5, money: 60, pay: 0.8,
      hp: 1.2, speed: 1.2, crowd: 12, crowdStart: 1, crowdBy: 15, trickyCrowd: 4, growth: 1.18, lateGrowth: 1.14,
      guestsFrom: 3, quizFrom: 5, bossCrowd: 2, extraGuests: [['review', 3, 1.4]], thesisOn: [30, 50],
      refund: 0.15, priceStep: 6, armor: 0.15,
    },
  };

  // `hp` is a multiple of PC.enemyHp(wave). `armor` is the share of direct damage blocked.
  PC.ENEMIES = {
    scribble: {
      name: 'Scribble', plural: 'Scribbles', hp: 1, speed: 1.05, size: 0.24, bounty: 2, leak: 1,
      blurb: 'A plain ballpoint scribble. Nothing special.',
    },
    plane: {
      name: 'Paper Plane', plural: 'Paper Planes', hp: 0.55, speed: 2, size: 0.19, bounty: 2, leak: 1,
      blurb: 'Flies twice as fast. Glue slows it down.',
    },
    spitball: {
      name: 'Spitball', plural: 'Spitballs', hp: 0.3, speed: 1.35, size: 0.13, bounty: 1, leak: 1,
      blurb: 'Small and comes in swarms. Area attacks clear them.',
    },
    textbook: {
      name: 'Textbook', plural: 'Textbooks', hp: 1.4, speed: 0.8, size: 0.27, armor: 0.6, bounty: 4, leak: 2,
      blurb: 'Blocks 60% of direct hits. Highlighter goes through it, damage over time gets past it, and Scissors cut it open.',
    },
    crumple: {
      name: 'Crumpled Worksheet', plural: 'Crumpled Worksheets', hp: 2.4, speed: 0.85, size: 0.3, splits: 3, bounty: 4, leak: 2,
      blurb: 'Bursts into three Spitballs when it dies.',
    },
    flash: {
      name: 'Flash Card', plural: 'Flash Cards', hp: 0.7, speed: 1.1, size: 0.2, bounty: 2, leak: 1,
      blink: 1.6, blinkEvery: 3.5,
      blurb: 'Flips ahead along the path every few seconds, skipping past your defenses.',
    },
    ink: {
      name: 'Invisible Ink', plural: 'Invisible Inks', hp: 0.9, speed: 1.05, size: 0.22, bounty: 3, leak: 1,
      stealth: 1.4,
      blurb: 'Supplies can only aim at it from 1.4 cells away. Area attacks and traps still hit it.',
    },
    cheat: {
      name: 'Cheat Sheet', plural: 'Cheat Sheets', hp: 1.2, speed: 0.9, size: 0.24, bounty: 4, leak: 1,
      heal: 0.12, healEvery: 2.5, healRadius: 1.6,
      blurb: 'Heals nearby homework every few seconds. Take it out first.',
    },
    rough: {
      name: 'Rough Draft', plural: 'Rough Drafts', hp: 1.6, speed: 0.85, size: 0.26, bounty: 3, leak: 2,
      regen: 0.12, regenDelay: 2,
      blurb: 'Repairs itself quickly if nothing hits it for 2 seconds.',
    },
    detention: {
      name: 'Detention Slip', plural: 'Detention Slips', hp: 1.1, speed: 0.95, size: 0.22, bounty: 4, leak: 1,
      jam: 2.5, jamEvery: 4, jamRange: 2.2,
      blurb: 'Every few seconds it sends the nearest supply to detention, which stops it firing for a while.',
    },
    review: {
      name: 'Peer Review', plural: 'Peer Reviews', hp: 1.3, speed: 0.9, size: 0.24, bounty: 4, leak: 1, secret: true,
      shield: 0.5, shieldEvery: 3, shieldRadius: 1.6, shieldTime: 2,
      blurb: 'Only at the Doctorate. Every few seconds it shields the homework around it, which then blocks half of every direct hit for 2 seconds. Piercing and wounds get through.',
    },
    folder: {
      name: 'Homework Folder', plural: 'Homework Folders', hp: 2, speed: 0.7, size: 0.28, bounty: 5, leak: 2,
      drops: 'scribble', dropEvery: 3.5,
      blurb: 'Drops fresh Scribbles as it walks.',
    },
    dictionary: {
      name: 'Dictionary', plural: 'Dictionaries', hp: 3.4, speed: 0.55, size: 0.31, armor: 0.75, steady: true, bounty: 6, leak: 3,
      blurb: "Slow and enormous. Blocks 75% of direct hits and can't be shoved or stunned.",
    },
    laminated: {
      name: 'Laminated Sheet', plural: 'Laminated Sheets', hp: 1, speed: 1, size: 0.23, bounty: 3, leak: 1,
      slick: true,
      blurb: "Too slick to slow down. Glue, puddles and slowing fields slide right off, but stuns and shoves still work.",
    },
    essay: {
      name: 'Last-Minute Essay', plural: 'Last-Minute Essays', hp: 1.5, speed: 0.75, size: 0.25, bounty: 3, leak: 2,
      rush: 1.3,
      blurb: 'Panics as it gets marked. The less health it has left, the faster it runs.',
    },
    gum: {
      name: 'Chewing Gum', plural: 'Chewing Gums', hp: 0.6, speed: 1, size: 0.2, bounty: 2, leak: 1,
      gums: 2, gumRange: 2.4,
      blurb: 'Pops when it dies and gums up the closest supply, which stops firing for 2 seconds.',
    },
    crane: {
      name: 'Paper Crane', plural: 'Paper Cranes', hp: 0.8, speed: 1.25, size: 0.22, bounty: 3, leak: 1,
      flies: true,
      blurb: 'Flies over traps and puddles without touching them.',
    },
    makeup: {
      name: 'Makeup Test', plural: 'Makeup Tests', hp: 1, speed: 0.85, size: 0.24, bounty: 4, leak: 2,
      revive: 0.5,
      blurb: 'Comes back once with half its health, good as new.',
    },
    monitor: {
      name: 'Hall Monitor', plural: 'Hall Monitors', hp: 1.3, speed: 0.9, size: 0.24, bounty: 4, leak: 1,
      rally: 0.35, rallyEvery: 0.5, rallyRadius: 1.6,
      blurb: 'Hurries everyone along: homework near it walks 35% faster.',
    },
    excuse: {
      name: 'Excuse Note', plural: 'Excuse Notes', hp: 0.8, speed: 0.95, size: 0.22, bounty: 3, leak: 1,
      excuse: 1.2, excuseEvery: 4,
      blurb: 'Gets excused every few seconds. For a moment nothing can hurt it at all.',
    },
    stack: {
      name: 'Worksheet Stack', plural: 'Worksheet Stacks', hp: 1.8, speed: 0.7, size: 0.28, bounty: 5, leak: 2,
      cap: 0.2,
      blurb: 'Five sheets thick. One hit takes off a fifth of its health at most, however hard it lands.',
    },
    copycat: {
      name: 'Copycat', plural: 'Copycats', hp: 0.8, speed: 0.95, size: 0.22, bounty: 2, leak: 1,
      copyEvery: 3.5,
      blurb: 'Copies itself once if you leave it alone too long. Copies can\'t copy.',
    },
    fine: {
      name: 'Overdue Book', plural: 'Overdue Books', hp: 1.6, speed: 0.7, size: 0.26, bounty: 4, leak: 2,
      fine: 3, fineEvery: 3,
      blurb: 'Fines you every few seconds it stays on the page. Wipe it out to get every dollar back.',
    },
    member: {
      name: 'Group Member', plural: 'Group Members', hp: 1.6, speed: 1.1, size: 0.25, bounty: 5, leak: 2,
      blurb: 'One of the three left over when a Group Project falls apart.',
    },
    quiz: {
      name: 'Surprise Quiz', plural: 'Surprise Quizzes', hp: 6, speed: 0.6, size: 0.38, armor: 0.25,
      bounty: 25, leak: 5, slowResist: 0.5, letter: '?',
      blurb: 'A smaller boss that turns up between the big ones at the hardest schools. Shrugs off half of any slowing, stunning or shoving.',
    },
    project: {
      name: 'Group Project', plural: 'Group Projects', hp: 7, speed: 0.55, size: 0.4, armor: 0.2,
      bounty: 25, leak: 5, slowResist: 0.5, splits: 3, splitsInto: 'member', letter: 'G',
      blurb: 'A boss that falls apart into three Group Members, who run the rest of the way on their own.',
    },
    dissertation: {
      name: 'The Dissertation', plural: 'Dissertations', hp: 24, speed: 0.42, size: 0.5, armor: 0.4, secret: true,
      bounty: 90, leak: 10, slowResist: 0.4, letter: 'D', drops: 'scribble', dropEvery: 3,
      shield: 0.5, shieldRadius: 2, shieldTime: 2,
      blurb: 'Only at the Doctorate. The biggest boss there is. It sheds Scribbles and shields everything around it.',
    },
    exam: {
      name: 'The Final Exam', plural: 'Final Exams', hp: 18, speed: 0.5, size: 0.46, armor: 0.35,
      bounty: 60, leak: 10, slowResist: 0.5, erases: true, letter: 'F',
      blurb: 'The boss every 10 waves. Huge, shrugs off half of any slowing, stunning or shoving, and wipes the page clean as it passes.',
    },
  };

  const BOSS_NAMES = { 10: 'Pop Quiz', 20: 'The Midterm', 30: 'The End-of-Term Exam', 40: 'The Entrance Exam', 50: 'The Final Exam' };
  PC.bossName = (wave) => BOSS_NAMES[wave] || 'Another Final Exam';

  // A high start and gentle growth. Steeper curves made the first 20 waves a
  // walkover and the last 5 a wall. After wave 30 growth slows down, because supplies
  // stop getting much stronger once the best ones are near the top level.
  // tools/balance.html shows the effect of changes.
  PC.LATE_GROWTH = 1.02;
  PC.enemyHp = function (wave, school = {}) {
    const growth = school.growth || 1.13;
    if (wave <= 30) return 80 * growth ** (wave - 1);
    return 80 * growth ** 29 * (school.lateGrowth || PC.LATE_GROWTH) ** (wave - 30);
  };
  PC.bounty = (def, wave) => Math.round(def.bounty * (1 + wave * 0.04));

  // A wave is a list of groups. Each group spawns `count` enemies `gap` seconds
  // apart, starting `delay` seconds into the wave.
  const OPENING = {
    1: [['scribble', 6, 1.1]],
    2: [['scribble', 9, 0.95]],
    3: [['plane', 6, 0.8], ['scribble', 4, 1, 3]],
    4: [['spitball', 18, 0.35]],
    5: [['scribble', 10, 0.8], ['plane', 6, 0.9, 4]],
    6: [['textbook', 4, 1.6], ['scribble', 6, 0.9, 2]],
    7: [['spitball', 24, 0.3], ['plane', 6, 0.8, 3]],
    8: [['crumple', 4, 1.8], ['scribble', 6, 0.9, 3]],
    9: [['textbook', 6, 1.4], ['plane', 8, 0.7, 3]],
    10: [['exam', 1, 1], ['scribble', 8, 0.9, 2]],
  };

  // The trickier homework joins in from the school's guestsFrom wave. The first few kinds
  // come one a wave, then each new kind brings an old one with it, and after that any two
  // turn up together.
  const GUESTS = [['flash', 5, 0.9], ['ink', 5, 0.9], ['cheat', 2, 2], ['rough', 4, 1.2], ['detention', 2, 2.2], ['folder', 1, 3], ['dictionary', 1, 3]];
  const LATER_GUESTS = [['laminated', 4, 1], ['gum', 5, 0.8], ['essay', 4, 1.2], ['crane', 6, 0.7], ['monitor', 2, 2],
    ['makeup', 3, 1.4], ['excuse', 4, 1], ['copycat', 3, 1.4], ['fine', 2, 2.2], ['stack', 2, 2.4]];

  function guestGroups(wave, school) {
    const i = wave - school.guestsFrom;
    if (i < 0) return [];
    const guests = [...GUESTS, ...(school.extraGuests || []), ...LATER_GUESTS];
    const scale = 1 + Math.max(0, wave - 8) * 0.05;
    const pick = (n) => {
      const [type, count, gap] = guests[n % guests.length];
      return [type, Math.round(count * scale), gap, 3];
    };
    if (i < GUESTS.length) return [pick(i)];
    if (i < guests.length) return [pick(i), pick((i + 3) % GUESTS.length)];
    return [pick(i), pick(i + 3)];
  }

  PC.waveFor = function (wave, difficulty = 'normal') {
    const school = PC.DIFFICULTIES[difficulty];
    // A bigger class means more homework, sent a little closer together. Bosses don't
    // multiply, and tricky homework only grows up to trickyCrowd: ten Midterms or thirty
    // Detention Slips at once would be a wall rather than a fight.
    const crowd = PC.crowdAt(wave, school);
    const tricky = Math.min(crowd, school.trickyCrowd || crowd);
    const bosses = school.bossCrowd || 1;
    const scale = (k) => ([type, count, gap, delay]) => (PC.ENEMIES[type].letter
      ? [type, count * bosses, gap, delay]
      : [type, Math.max(1, Math.round(count * k)), gap / k, delay]);
    const groups = [...mainGroups(wave).map(scale(crowd)), ...guestGroups(wave, school).map(scale(tricky))];
    // The boss halfway between two exams is a Group Project on waves 25, 45 and so on.
    if (school.quizFrom && wave >= school.quizFrom && wave % 10 === 5) {
      groups.push([wave > 5 && wave % 20 === 5 ? 'project' : 'quiz', bosses, 2, 4]);
    }
    if (school.thesisOn && school.thesisOn.includes(wave)) groups.push(['dissertation', 1, 1, 8]);
    return groups;
  };

  PC.crowdAt = function (wave, school) {
    if (!school.crowdStart) return school.crowd;
    const k = Math.min(1, Math.max(0, (wave - 1) / (school.crowdBy - 1)));
    return school.crowdStart + (school.crowd - school.crowdStart) * k;
  };

  function mainGroups(wave) {
    if (OPENING[wave]) return OPENING[wave];
    const n = (base) => Math.round(base * (1 + (wave - 10) * 0.05));
    if (wave % 10 === 0) {
      return [['exam', Math.ceil(wave / 30), 6], ['textbook', n(4), 1.3, 2], ['plane', n(8), 0.6, 5]];
    }
    switch (wave % 5) {
      case 1: return [['scribble', n(14), 0.6], ['plane', n(8), 0.55, 4]];
      case 2: return [['spitball', n(28), 0.24], ['textbook', n(4), 1.3, 3]];
      case 3: return [['crumple', n(6), 1.2], ['plane', n(8), 0.55, 3]];
      case 4: return [['textbook', n(7), 1], ['crumple', n(3), 1.5, 3]];
      default: return [['scribble', n(8), 0.6], ['spitball', n(12), 0.25, 2], ['textbook', n(3), 1.1, 4], ['crumple', n(2), 1.4, 6]];
    }
  }
})();
