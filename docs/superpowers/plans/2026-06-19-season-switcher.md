# Season Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shareable season selector that switches every data-driven dashboard section between current and historical seasons.

**Architecture:** Derive season options from `games.json`, resolve one selected season from the URL and current-season fallback, then pass that season into the existing summary calculator. Keep one active summary for profile interactions and reuse all current render functions after each selection.

**Tech Stack:** HTML, CSS, native JavaScript, Node.js built-in test runner and VM APIs.

---

### Task 1: Season Discovery and Summary Selection

**Files:**
- Create: `tests/seasons.test.js`
- Modify: `app.js`

- [ ] **Step 1: Write failing tests**

Test that `getAvailableSeasons()` returns the current season first, that `resolveSelectedSeason()` accepts only known URL selections, and that `calculateSeasonSummary()` can explicitly calculate both S1 and S2.

- [ ] **Step 2: Verify RED**

Run `/Users/raiden/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/seasons.test.js` and confirm failure because season discovery and explicit summary selection are missing.

- [ ] **Step 3: Implement minimal pure helpers**

Add `getAvailableSeasons(games, currentSeason)`, `resolveSelectedSeason(seasons, currentSeason, requestedSeason)`, and an optional `selectedSeason` argument to `calculateSeasonSummary()`.

- [ ] **Step 4: Verify GREEN**

Run the Task 1 command and confirm all season selection tests pass.

### Task 2: Full Dashboard Switching

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `tests/seasons.test.js`

- [ ] **Step 1: Write a failing selector render test**

Assert that the selector renders S2 as “当前赛季”, S1 as “已结束”, and selects the requested season.

- [ ] **Step 2: Verify RED**

Run the Task 1 command and confirm failure because selector rendering is missing.

- [ ] **Step 3: Implement selector and rerender flow**

Add the header control, URL synchronization, active summary state, full dashboard rerender function, pagination reset, and current-season-aware labels. Register profile interactions once and have them read the active summary.

- [ ] **Step 4: Verify GREEN**

Run both `tests/seasons.test.js` and `tests/honors.test.js` and confirm all tests pass.

### Task 3: Documentation and Final Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document historical season viewing**

Explain automatic season discovery, URL sharing, full-page switching, and the fact that historical seasons use current rules.

- [ ] **Step 2: Run complete verification**

Run Node syntax checks, both test files, JSON parsing, S1/S2 summary assertions, and `git diff --check`.

- [ ] **Step 3: Inspect responsive layout**

Verify the selector and switched dashboard at desktop and mobile widths through the available browser workflow; if local browser access is blocked, report that limitation explicitly.
