# Phase 3: gear notes and what to confirm

`data/gear.json` holds Tom's real room (list given Nov 16 2026). Each number has a source; anything I couldn't verify is marked `"estimate": true`. Changing a number in `gear.json` changes the app: no code involved.

## Verified from the maker

- **Neewer CB60 RGB:** 18,000 lux at 1 m with the standard reflector, 2700–6500 K, full RGB, Bowens mount, umbrella hole.

## From seller listings or a similar product (estimates, please confirm)

| Gear | What I used | Why it's an estimate |
|---|---|---|
| Dazzne D50 | 45 W, 3000–8000 K, 1,150 lux at 1 m, about 35 cm panel | Seller listings only |
| Switti S45 RGB | 5,000 lux at 1 m, 3000–8000 K, RGB, about 25 cm panel | No S45 RGB spec exists online. Numbers come from the S45C bi-colour kit |
| Torjim 85 W can | 600 lux at 1 m in its 16 in softbox, 3000–7500 K | No lux figure published anywhere |
| 650 W Fresnel | 13–54° spot to flood; 52,750 / 10,750 lux at 1 m; 3200 K | ARRI 650 Plus figures; your brand is unknown |
| 300 W Fresnel | 14–53°; 16,600 / 4,880 lux at 1 m; 3200 K | ARRI 300 Plus and a similar Panavision unit |
| Softboxes, umbrellas | CB60 softbox 60 cm; S45 softbox 40 cm; umbrellas 33 in | Sizes not given |
| Snoot, gobo holder | 18° and 28° beams | Estimated |
| Gels | Red, blue, yellow, green: approximate colours | Exact gels unknown |
| Flags | 24×36 in; white bounces 75%, silver 85%, gold 70% | Sizes and reflectance estimated |
| Chroma green backdrop | A typical chroma green | Estimated |

## Assumptions to check in the room

1. **Fresnels have barn doors.** The app gives both Fresnel sizes barn doors.
2. **Fresnels have no dimmer.** In Room mode their power is fixed at full. Students control them by distance, spot/flood and barn doors. (Open studio lets them dim anything.)
3. **Umbrellas fit only the CB60s**, the only lights listed with an umbrella hole.
4. **The snoot, its gels, and the gobo holders fit only the CB60s** (Bowens mount).
5. **CB60 modifiers:** two standard reflectors and two softboxes (one each per light).
6. **Which stock gobos you have.** The app offers window, blinds, dots and diagonal bars as placeholders.
7. **How the gear is split across the three stations.** My guess, also in `gear.json` under `stations`:
   - **Three-Point:** 2 CB60 RGB, 2 D50, the CB60 reflectors and softboxes, 2 white umbrellas, snoot and gels, 2 gobo holders, black/white flag. Backdrops: green, white, black.
   - **High-Key:** 2 Torjim cans in softboxes, 2 S45 RGB with softboxes, gold/silver flag. Backdrop: white.
   - **Low-Key:** 2 × 650 W and 2 × 300 W Fresnels, silver and gold bounce umbrellas. Backdrop: black.

   The bounce umbrellas only fit the CB60s, so at the Low-Key station they can't be used as the split stands. That probably means the split is wrong.

## Things the app simulates simply (said in the app's note)

- Reflectors are aimed automatically halfway between their brightest light and the subject.
- A chroma green backdrop doesn't spill green onto the subject. Real bounce light isn't simulated.
- The simple 2D view leaves out gobos.
