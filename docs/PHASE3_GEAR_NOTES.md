# Phase 3: gear notes

`data/gear.json` holds Tom's real room (list given and details confirmed Nov 16 2026). Changing a number in `gear.json` changes the app: no code involved. Anything still marked `"estimate": true` is a best guess.

## Confirmed

- **All gear is available to use.** There's no split by station: Room mode means "the gear in the room".
- **Neewer CB60 RGB** (maker's spec): 18,000 lux at 1 m with the standard reflector, 2700–6500 K, RGB, Bowens mount, umbrella hole.
- **Switti S45 RGB** (maker's listing, from Tom): 50 W, 552 LEDs, 7,000 lux at 0.5 m and 2,050 lux at 1 m, 2600–10,000 K, RGB, stepless dimming.
- **Halogen Fresnels (650 W and 300 W):**
  - They have barn doors and no dimmer.
  - A focus dial moves the bulb toward or away from the lens, which is the app's spot ↔ flood control.
  - In Room mode their power is fixed at full.
- **Modifiers and flags** use standard sizes:
  - CB60 softbox: 60 cm
  - S45 softbox: 40 cm
  - Umbrellas: 33 in
  - Flags: 24×36 in
- **Gobos:** Tom's stock set of 25, matched to his photo of the set (Nov 17 2026): arched window, rain (broken lines), sun rays, starburst, crescent moon, fan blinds, horizontal slot, broken rays, angled window, palm leaves, blinds, slanted blinds, butterflies, stars, two hearts, dot swirl, triangle, vertical slit, leaves, music notes, dot grid, halftone dots, four-pane window, heart, circle. Plus the underwater gobo (its pattern is a guess).

  They're drawn in `src/render/gobos.js` to match the photo, not copied from it. Older setup files with the earlier guessed names (small-pane window, wide blinds, diagonal bars) open with the closest real gobo.

## Still estimates

| Gear | What I used | Why |
|---|---|---|
| Dazzne D50 | 45 W, 3000–8000 K, 1,150 lux at 1 m, about 35 cm panel | Seller listings only |
| Torjim 85 W can | 600 lux at 1 m in its 16 in softbox, 3000–7500 K | No lux figure published anywhere |
| Fresnel output | ARRI 650 Plus and 300 Plus photometrics | Your brand is unknown |
| How much light each modifier loses | Softbox, umbrella, snoot, gobo factors | Not published |
| Gels, flag reflectance, chroma green colour | Typical values | Not published |

## Simplifications (the app's note covers these)

- Reflectors are aimed automatically, halfway between their brightest light and the subject.
- A chroma green backdrop doesn't spill green onto the subject. Real bounce light isn't simulated.
- The simple 2D view leaves out gobos.
