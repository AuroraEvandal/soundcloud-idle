# SoundWave iOS visual refresh

**Goal:** Implement the eight approved mockups with the user's corrections from this chat.
**Architecture:** Reuse existing React screens, data and handlers. Update shared visual primitives and CSS, then screen composition. No dependency, API, persistence or game-rule changes.
**Tech stack:** React 19, Vite, existing SVG icons, original PNG assets, system fonts.

## Approved design

- Black/charcoal surfaces, SoundCloud orange `#ff5500`, rounded panels, SF-style system typography.
- Home: equal-size app tiles slightly smaller than the mockup, subtle sound-wave wallpaper, larger dock, real resource values.
- SoundWave: original opponent art and display names; keep all opponents, locks and battle actions.
- Studio: circular microphone, real hype/energy, original companion; retain Beat Lab, beats, equipment and release dialog.
- Deck: two-column collection with full real text/rarity/uses. Packs remain exclusively in their existing tab.
- Telegram: conversation list first; click opens the existing conversation. No fabricated replies or combined list/conversation view.
- Profile: original player and pet sprites, real statistics/progression, all existing actions.
- Store: original clothing images, catalog gallery and existing wardrobe/equip/buy behavior.
- Cases: original case/pet PNGs, existing chances, payment/recovery/error states.

## Execution

User explicitly requested implementation. Execute inline without another approval pause. Keep changes reviewable on `codex/orange-ui` in the primary project checkout; do not deploy or merge.

### 1. Shared shell and home
- [x] Regression checks: Home renders supplied player resources and all seven apps; navigation supports long titles.
- [x] Update Home, ResourceBar, Dock, Icon, AppBar and shared CSS, preserving callers.
- [x] Run frontend tests and build.

### 2. Screens
- [x] Update opponent list and collection layouts; preserve server IDs, image sources and action handlers.
- [x] Restyle studio, chats, profile, clothing catalog, cases and secondary screens.
- [x] Verify with rendered regression tests that opponents, player and companions use original art; chats have only the conversation list until opened.

### 3. Verification
- [x] Run `node --test tests/*.test.mjs`, `npm run build`, `git diff --check`.
- [x] Browser smoke with fixture responses: all apps/tabs, chat open/back, battle selection, store/wardrobe, original images; screenshots at 390px and 320px.
- [x] Independent final review of the diff; correct meaningful regressions.

## Review focus

Long Cyrillic names/card text, 320px/short screens, preserving original image calibration and animation, correct empty/error/locked states, retaining all game controls and payment retry protections.

## Evidence

Baseline: 36 frontend tests pass; production build passes. Vite test servers report an existing HMR-port warning without test failures.

Final evidence: 40/40 frontend tests and Vite production build pass. Full fixture UI smoke passes all seven apps, inner tabs, intro replay, conversation open/back, duplicate-pack result and battle card selection at 390×844 and 320×568. Original image paths load. The pet/case fixture passes equip, free rewards and paid-callback/server-confirmation separation. No API, game-rule, asset or dependency manifests changed.

Independent review found a clipped next-pack button after a duplicate drop at 320×568. Added a failing bounds assertion, then made Packs a bounded scroller; the full browser smoke passes. Also fixed the existing chat effect returning the browser scroll Promise; the same navigation smoke reproduced the crash before the fix and passes afterwards.

Workspace ruling: the original project folder was on an old backend branch and the full linked checkout belonged to another chat. Native worktree creation did not return, so reused the primary checkout on a new branch based on existing main (8a1e2de), transferred/verified the exact patch and restored the other checkout. Its preexisting empty npm lockfile is backed up under the Codex task scratch directory. No deployment, merge, push or commit performed.
