# Inter-round minigames implementation plan

**Goal:** Three short concentration games with server-owned penalties on the next round.
**Architecture:** One persisted attempt per battle/next-round; prepare/start/finish RPCs
serialize through the battle row. Existing submit_round_atomic deducts the saved
penalty before deciding winners. React displays the saved game and server result.
**Tech Stack:** Existing React/Vite, Framer Motion, Supabase Edge Functions/Postgres.
**Spec:** User specification and approved next-round/server choices; docs/api.md.

## Constraints
- No success rewards, new health system or changes to existing card scoring.
- Preserve unrelated working-tree edits and existing API request shapes.
- Server chooses game, checks action/time, persists result; no client score claims.
- Add only the requested animation dependency; PGlite is test-only.

## Tasks
- [x] Add real PostgreSQL tests for ownership, retries, deadlines, skipped games,
  penalty floor and changed round winner/rewards. Run red before migration exists.
- [x] Add migration and start-mini-game/finish-mini-game endpoints. Update config,
  common errors, schema pointer and deployment notes. Run SQL tests green.
- [x] Add InterRoundMiniGame.jsx/CSS, API functions and mock parity; insert phase
  before rounds 2/3 in Battle.jsx. Server result controls callback and penalty UI.
- [x] Run backend/frontend tests, build, diff checks, and browser mobile viewport
  checks for each game, timeout/retry/recovery and double click.

## Review focus
Reloads must retain the attempt; duplicate finish/submit cannot change the result;
QTE answers cannot leak before start; a failed attempt must affect the winner;
hidden tabs and network failure must never silently bypass the server result.

## Verification record
2026-11-02: 10 PGlite integration tests plus the existing rhyme test passed;
3 existing frontend tests and Vite build passed; Deno checked both new endpoints
and submit-round. Browser checks exercised all three components at 390px and
320px, callback, timeout, identical action retry, saved-result reload, and stale
battle recovery with controlled API responses. Independent code review found one
stale-state recovery issue; fixed and checked in browser. git diff --check passed.

No live Supabase deployment or physical Telegram/mobile-network timing test.
No automatic commit: preserve the user's unrelated pending edits.
