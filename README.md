# RiversOfRust

A post-apocalyptic vehicle-combat game by **DeclAIre Studios**: build a war machine from scrap in the garage, then take it out on the sand. PC only. This is the first playable slice.

**Play the prototype:** https://gabrielamidon8-sys.github.io/RiversOfRust/
**Website:** https://riversofrust.wordpress.com

## What's in 0.1.0

- **The garage.** A rusted workshop with a scissor lift in the middle and an orbit camera on the bay. Drag to look around, scroll to zoom.
- **Build mode.** Press **Build** (or pick a part on the right). Every spot the part can bolt onto glows; move near one and the part snaps there in green; click to bolt it on. Click a part on the car to take it off again (anything bolted to it goes back on the shelf). Right-click or Esc puts the part you're holding back. In build mode the lift raises the car so the wheels hang clear of the floor.
- **The parts** (one grid unit is 0.35 m):
  | Part | Size | Bolts to |
  |---|---|---|
  | Frame | 4 × 12 × 2 ladder frame | the lift; everything else bolts to it |
  | Half body | 4 × 6 cabin, no hood, 1.05 m tall | the frame's deck (three positions); its 4 × 2 roof takes parts on top only |
  | Engine | supercharged V8, 420 hp | the engine well at the front of the frame |
  | Steering wheel × 2 | 0.84 m tyre | a 1 × 2 mount; steers (at the back they steer the other way) and is driven |
  | Drive wheel × 2 | 0.84 m tyre | a 1 × 2 mount; accelerates |
  | Turret | machine gun on a 2 × 2 base | the roof |
- **Test drive.** Unlocks when every part is on. A desert course with ramps, a barrier chicane, containers, crates, drums and a tyre wall. 4WD with steering on the steering wheels, raycast-vehicle physics (cannon-es), 0-100 km/h in about 7 s, about 115 km/h flat out. The turret follows your aim and fires.
  - `W`/`S` drive and brake (hold `S` when stopped to reverse) · `A`/`D` steer · `Space` handbrake · mouse aims (click to lock the mouse, `Esc` to let it go) · click fires · `R` flips you back upright · `Tab` back to the garage.
- Your car is saved in the browser and comes back next time.
- Everything is made in code: models, textures, sounds. No asset files apart from the fonts.

## Shared with Zombie City

- **Engines.** RiversOfRust is built from engines on the same CORE hub contract as Zombie City (`coreAdd`, `coreOn`/`coreEmit`, `coreCost`, `coreHurt`, `coreTick`, the watchdog), so an engine can move between the games. See `js/core.js`. Engines so far: GARAGE, BUILDER, DRIVE, TEXEL, SFX.
- **Accounts.** One DeclAIre account for every game, run from the DeclAIre Studios account hub on Wix. When you're signed in to Zombie City in the same browser (GitHub Pages), the garage shows your name. Signing in from inside RiversOfRust comes next.
- **Fonts.** Chakra Petch, Saira Stencil One and Share Tech Mono, as in Zombie City (SIL Open Font License, in `fonts/`).

## Layout

```
index.html        the page, the HUD and the import map
css/style.css     the HUD
js/config.js      sizes, masses and the parts list
js/parts.js       the parts, modelled in code
js/assembly.js    which part bolts where (pure logic, tested on its own)
js/builder.js     build mode: picking, snapping, placing, taking off
js/garage.js      the workshop
js/vehicle.js     the physics vehicle (pure logic, tested on its own)
js/drive.js       the test drive
js/materials.js   procedural textures
js/audio.js       synthesised sound
js/core.js        the CORE engine hub
vendor/           three.js r186 and cannon-es 0.20.0 (MIT)
tests/            physics.test.mjs (node) and browser_check.py (Playwright)
```

## Run it locally

Any static server works: `python3 -m http.server` in this folder, then open http://localhost:8000.

Tests: `node tests/physics.test.mjs` (driving behaviour, no screen) and `python3 tests/browser_check.py` (builds the car through the UI in a headless browser and drives it).

---
Made with Claude. © 2026 DeclAIre Studios.
