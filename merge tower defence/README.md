# Pencil Case

A tower defense game where the towers are school supplies. Merge them to level up, fuse
them into 158 different supplies, and finish every run with a marked-up page and a report card.

## Play

Open `index.html` in a browser. There is nothing to install or build.

## The rules in short

- Pick your school: Elementary (easy), Middle School (normal), High School (hard), College (expert)
  or Graduate School (impossible: classes grow to ten times the size, and after wave 30 homework toughens
  fast enough that it takes a strong board of legendaries or a mythic to get through wave 50).
  Each has its own house rules, like slower homework, bigger classes, surprise quizzes or pricier supplies.
- Win at Graduate School to unlock a secret sixth school, the Doctorate: bosses come in pairs,
  Peer Reviews shield the homework around them, The Dissertation turns up twice, and it takes mythics
  to survive. Winning it earns a PhD on your report card.
- Then pick one of ten maps. Some have two paths, a path that crosses itself, things in the way, or
  spots that help whatever sits on them. They are tuned to be about as hard as each other.
- Buy a pencil, ruler, glue, eraser, crayon, thumbtack, paper clip, chalk, paintbrush or rubber stamp
  and drag it next to the path. Keys 1 to 9 and 0 pick them.
- Drag a supply onto any supply of the same level. You get one item, one level higher.
- Different supplies fuse into something new: 10 basics, 45 two-part fusions and 5 bigger ones.
- Merge the right two fusions for one of 69 advanced fusions. Merge two advanced fusions for one of
  19 secret legendary fusions, and two legendaries for one of 10 mythics. The recipe book shows a hint
  for each secret.
- Paint splashes: if painted homework is wiped out while the paint is wet, it splashes onto its neighbors.
- Every merge sends out a shockwave that hits everything nearby, so a merge held for a crowd pays off.
- Supplies that were just placed, moved or merged take a moment to set up before they can fire.
- Drag a supply onto the shop to sell it for part of its cost (how much depends on the school).
- After every exam there is a recess: one mini game, for a prize worth up to two supplies. All six
  can also be played for fun from the school picker or the pause menu.
- Survive 50 waves, then go for extra credit for as long as you can.

## Files

| File | What it holds |
| --- | --- |
| `js/data.js` | Every tunable number: supplies, recipes, homework, waves, prices, schools, maps |
| `js/sim.js` | The game rules, with no drawing, so they can run headless |
| `js/render.js` | Everything drawn on the board, including the art for each supply |
| `js/audio.js` | Synthesized sound effects |
| `js/minigames.js` | The recess mini games, which never touch the tower defense |
| `js/main.js` | Input, HUD, dialogs and the frame loop |
| `tools/balance.html` | Bots and console checks for how strong each supply and strategy is |
| `tools/serve.ps1` | Small local web server for testing |

## Changing the balance

Edit `js/data.js`, then check the effect in the balance page. It needs a local server:

```bash
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

Then open <http://localhost:8123/tools/balance.html>. From its console:

- `powerTest()` compares the advanced fusions: three copies at level 5 with no money, ranked by
  how many stars leak by wave 50. `powerTest((p) => p.legendary && p.dmg, 3)` does the same for
  legendaries at level 3. Supplies of one tier should land in the same rough band.
- `stage(k, 50, 42, school)` checks the late game of the hardest schools, which is beyond every bot. It
  places the board a player could afford by wave 50, built around supply `k`, at wave 42 and returns the
  wave it falls on. At High School about 10 of the 16 damage-dealing legendaries should get past 50, at
  College about 5, and at Graduate School (`impossible`) only one or two. At the
  `doctorate` only mythics should get past it. `stage(k, 20, 15, school)` and so on check earlier waves.
  `holdOut(ELITE)` uses a board far bigger than anyone can afford, so do not tune to it.
- `setMap('spiral')` switches every check to another map, and `mapParity()` compares how many stars
  leak on each. A map's `hp`, `open` and `speed` in `js/data.js` keep it in line with Homeroom. Check a
  new map at Graduate School too: short or double paths can be lost by wave 3 without a low `open`.
- Opening the page as `balance.html?run` plays full games with every bot, which takes minutes.
  A healthy result: no merging dies around wave 10, a single basic supply by wave 20, and only
  committed strategies reach wave 30.
