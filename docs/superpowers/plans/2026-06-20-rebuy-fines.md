# Rebuy Fines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record manual player-level rebuy fines and route valid-game fines directly into the season prize pool.

**Architecture:** Normalize `rebuyFine` on each calculated game row, aggregate it once in game finance, and add the same total to both funding and season-pool allocation to preserve balance. Invalid games return zero financial fine totals, matching their existing zeroed league finances.

**Tech Stack:** HTML, native JavaScript, JSON, Node.js built-in test runner.

---

### Task 1: Fine Calculation and Accounting

**Files:**
- Create: `tests/rebuy-fines.test.js`
- Modify: `app.js`

- [ ] **Step 1: Write failing calculation tests**

Create a valid five-player game with 80 and 20 yuan fines and assert a 100-yuan fine total, a 100-yuan season-pool increase, balanced funding, unchanged points, and zero default fines for omitted fields. Add an invalid four-player case that must report zero league fines.

- [ ] **Step 2: Verify RED**

Run `/Users/raiden/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/rebuy-fines.test.js` and confirm failure because rows and finance do not expose rebuy fines.

- [ ] **Step 3: Implement fine accounting**

Normalize `entry.rebuyFine ?? 0` into calculated rows. Sum valid-game fines in `calculateGameFinance()`, add them to `fundingTotal` and `seasonPoolContribution`, and include `rebuyFineTotal` in game and season finance totals.

- [ ] **Step 4: Verify GREEN**

Run the Task 1 command and confirm all calculation and invalid-game tests pass.

### Task 2: Battle Report and Finance Presentation

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `tests/rebuy-fines.test.js`

- [ ] **Step 1: Write failing render tests**

Assert that the battle report row exposes a player's fine and the finance statement shows both “复活罚款” as income and the fine component inside season-pool contribution details.

- [ ] **Step 2: Verify RED**

Run the Task 1 command and confirm the expected fine labels are absent.

- [ ] **Step 3: Render fine details**

Add the battle-report column, season finance metric, per-game income row, and composed season-pool note without changing existing layouts beyond their data-driven grid and scroll behavior.

- [ ] **Step 4: Verify GREEN**

Run the Task 1 command and confirm all render tests pass.

### Task 3: Rules and Final Verification

**Files:**
- Modify: `app.js`
- Modify: `README.md`

- [ ] **Step 1: Document the field**

Add `rebuyFine` to the sample participant data and explain that it is a manually entered total, defaults to zero, applies only to valid games, and enters the season pool directly.

- [ ] **Step 2: Run complete verification**

Run all Node tests, JavaScript syntax checking, JSON parsing, fine-field reference checks, and `git diff --check`.
