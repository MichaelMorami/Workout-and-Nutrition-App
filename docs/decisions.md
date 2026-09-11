# Decisions

Client decisions and the reasoning behind them, recorded at the checkpoint where they were made.
A decision here is binding on every agent until the client changes it.

Read this before designing or building anything it touches. The reasoning matters as much as the
decision — it is what tells you whether a new situation falls inside or outside the ruling.

---

## Checkpoint 1 — the design canvas (Sprint 0)

Canvas: <https://claude.ai/code/artifact/1f3fe5f1-e823-4e1b-bb7b-1f6e1ee70b18> · issue #4 · PR #13

### 1. Six quick-add tiles, not nine

Six keeps the food name at 16.5 pt, the size that stays readable at arm's length on a gym floor in
bad light. Nine covers more of the day without a search, but shrinks names past the point where the
tile reads at a glance — which is the tile's entire purpose.

**Revisit at Checkpoint 2**, once there is real usage data on how often the client reaches past the
six.

### 2. Portions — all three mechanisms

They do not conflict. One tap stays the pure fast path; the rest cost something only when needed.

| Gesture | Behaviour |
| --- | --- |
| Tap | Log one serving. Haptic confirm. No dialog, no save button. |
| Long-press | Portion sheet with normalised presets (100 g, 1 tbsp, 1 pot) |
| **"Exact" control inside that sheet** | Swaps preset steps for a slider, for an arbitrary amount |
| Double-tap | Second tap within a few seconds adds another full portion |

**The exact control is not optional.** The client's reasoning: presets are normalised, real
consumption is not, and being trapped on 0.5 increments is precisely the problem. Do not ship the
portion sheet without it.

**Undo is required.** There is no save button anywhere, so the haptic is the only confirmation the
user gets — which makes a mistaken tap silent unless undo catches it. Currently designed as a
4-second toast above the tab bar. *Open question raised with the client: 4 s may be too short when
the phone is on the bench mid-set.*

### 3. kg and cm only — no unit switch

No lb/in in v1. That removes a settings section and a class of conversion bugs.

**But storage is canonical from day one:** weight in kg, lengths in cm, food in grams. Never store
the number as typed alongside a unit tag.

This is what keeps lb/in cheap to add later, and it costs nothing now because it is the right design
regardless. With canonical storage, adding a unit switch converts nothing — it *renders* the same
rows differently, so all history is instantly correct with no migration and nothing to get wrong.
The mixed-unit alternative would need a migration over every historical row and would make every
query unit-aware.

**The discipline that keeps it cheap, and the part that is expensive to retrofit:** every weight and
length renders through a formatter from the very first screen, even while that formatter does
nothing but append `" kg"`. If raw numbers get interpolated directly into thirty components, then
"add lb" later means finding all thirty and missing several. One function now; one function's body
later.

Client's own framing: *"it's not worth the extra hassle if it adds complexity"* — so the option is
preserved at zero cost rather than either built now or designed out.

---

## Sprint 1 dispatch — finding a food that isn't in the six

Raised by the client on 2026-09-11, before any screen was coded · issues #16, #17, #18, #23, #24

The question: *"Say I had boiled eggs and it's not in the top 6 — how do I find it?"* The approved
canvas had no answer. A 44 × 44 search button sat in the Today header but opened nothing, and no
artboard showed a search. Left alone, Checkpoint 2 could only ever log six foods.

### 4. One search bar, under the grid

A full-width **"Search foods"** bar directly under the quick-add grid. The header search button is
removed — there is one way in.

It sits in the thumb zone, so it works one-handed, and the six tiles keep their size — decision 1 is
untouched. Rejected: the header button (a stretch to reach one-handed on a large phone) and search as
the sixth tile (costs a quick-add food every day to save a tap on the rare one).

**How the sheet behaves — the same rules as a tile, so there is nothing new to learn:**

| Situation | Behaviour |
| --- | --- |
| Before typing | **Recent**: foods and meals logged in the last 14 days that are not already in the six |
| Typing | Filters the whole library, meals included; ignores case and accents; word-prefix matches first |
| Tap a row | Log one serving — haptic, undo toast, sheet closes |
| Long-press a row | The portion sheet, exact control included |
| Not in the library | Last row is always **Create "‹query›"**. Save stores the food *and* logs one serving. Undo removes the log but keeps the food |

**Tap budget**, enforced by the tap-count test (#23): a recent food in **2** taps · a known food in
**2** taps plus a few letters · a brand-new food in **3** taps plus its name and numbers.

No full-text-search index: a `LIKE` over a library of a few hundred foods is instant. Add one only
with a measurement that says otherwise.

### 5. It ships in Sprint 1

Checkpoint 2 is the client logging their real food for two or three days. Real eating does not stay
inside six foods, so a checkpoint without search would test the grid and nothing else.
