# Setup classifier: proposed thresholds (needs Tom's approval)

The classifier names a portrait **high-key**, **low-key** or **balanced three-point** (brief section 5.3). It decides mainly on **shadows**. Backdrop and overall brightness only support a high-key call: the backdrop is a clue, not the answer. Thresholds live in `src/metrics/classify.js`.

## Proposed thresholds

| Call | Rule |
|---|---|
| **Low-key** | Shadow side **2.5 stops or more** darker than the lit side (about 6:1 or more), on any backdrop. On a bright backdrop it adds: "Dramatic, one-sided light on a bright backdrop." |
| **High-key** | Shadow side within **0.4 stop** of the lit side, **and** backdrop brightness 0.6 or more, **and** overall brightness 0.6 or more |
| **Balanced three-point** | Everything else |

Compared with your starting estimates (0.7 for high-key, 2.5 for low-key):
- **Low-key** stays at 2.5.
- **High-key** tightens from 0.7 to 0.4. Your own p3 three-point reference measures 0.48 stops, and at 0.7 a three-point on white paper would be called high-key. At 0.4 the shadows have to be nearly flat, which matches your definition: "fill nearly matches the key".

## How the numbers come out

**Stops** = how much darker the shadow half of the face is than the lit half, split at the nose line. **Backdrop** and **overall** are brightness as shown on screen (0 = black, 1 = white).

| Image | Stops | Backdrop | Overall | Call | Required |
|---|---|---|---|---|---|
| p1 key only (reference) | 1.25 | 0.27 | 0.36 | balanced | – |
| p2 key + fill (reference) | 0.53 | 0.28 | 0.43 | balanced | – |
| p3 three-point (reference) | 0.48 | 0.28 | 0.44 | balanced | balanced ✓ |
| p4 high-key (reference) | 0.07 | 0.92 | 0.91 | high-key | high-key ✓ |
| p5 low-key (reference) | 4.54 | 0.03 | 0.13 | low-key | low-key ✓ |
| p6 trap: black backdrop (reference) | 0.36 | 0.03 | 0.31 | balanced | balanced, not low-key ✓ |
| p7 trap: white backdrop (reference) | 3.80 | 0.92 | 0.67 | low-key, on a bright backdrop | low-key, with that label ✓ |
| Three-point preset (3D view) | 0.60 | 0.29 | 0.45 | balanced | ✓ |
| High-key preset (3D view) | 0.15 | 1.00 | 0.96 | high-key | ✓ |
| Low-key preset (3D view) | 5.81 | 0.00 | 0.13 | low-key | ✓ |
| Three-point on black paper (3D view) | 0.60 | 0.01 | 0.28 | balanced | ✓ |
| Low-key on lit white paper (3D view) | 5.81 | 0.98 | 0.72 | low-key, on a bright backdrop | ✓ |
| Key only (3D view) | 1.91 | 0.22 | 0.31 | balanced | – |

The simple 2D view gives the same calls, and its numbers are within about 0.4 stop of the 3D view's.

## Known limits

- **Overhead key ("butterfly"):** both halves of the face are lit equally, so the stops read low even with deep shadows under the chin and nose. A dramatic butterfly setup could be called balanced instead of low-key. A later "under-shadow" check would fix this if it matters for your lessons.
- **Rim light:** the rim score is measured (it rises clearly when the back light is on) but isn't used in the call. A very bright backdrop blurs into the edge of the subject and makes it unreliable.
- **Key-only light** with a mid-grey backdrop (1.3–1.9 stops) lands in "balanced". If you'd rather have a separate "dramatic but not low-key" call for that middle range, it's a small change.
