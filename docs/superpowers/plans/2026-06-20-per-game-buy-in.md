# Per-Game Buy-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow each game to override the default per-player buy-in and expose the applied rate in the finance statement.

**Architecture:** Resolve a game-level `buyInPerPlayer` with nullish fallback to the global rule, then carry the resolved rate through the existing finance result. Keep dinner handling independent so zero dinner cost does not implicitly alter admission pricing.

**Tech Stack:** HTML, native JavaScript, JSON, Node.js built-in test runner.

---

### Task 1: Per-Game Finance Calculation

**Files:**
- Create: `tests/game-finance.test.js`
- Modify: `app.js`

- [ ] **Step 1: Write failing finance tests**

Assert that a five-player game with `buyInPerPlayer: 100` produces 500 yuan of income, while an otherwise identical game without the field uses the 150-yuan default and produces 750 yuan.

- [ ] **Step 2: Verify RED**

Run `/Users/raiden/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/game-finance.test.js` and confirm the override case fails at 750 versus 500.

- [ ] **Step 3: Implement the resolver**

Add `getGameBuyInPerPlayer(game, rules)`, use it in `calculateGameFinance()`, and include the resolved `buyInPerPlayer` in the finance result.

- [ ] **Step 4: Verify GREEN**

Run the Task 1 command and confirm both override and fallback calculations pass.

### Task 2: Finance Statement and Documentation

**Files:**
- Modify: `app.js`
- Modify: `README.md`
- Modify: `tests/game-finance.test.js`

- [ ] **Step 1: Write a failing render assertion**

Assert that the finance statement includes the applied rate and participant count next to “参赛缴费”.

- [ ] **Step 2: Verify RED**

Run the Task 1 command and confirm the statement lacks the rate detail.

- [ ] **Step 3: Render and document the override**

Add the rate detail to the single-game statement and rules area, then document `buyInPerPlayer: 100` with `dinnerCost: 0` in README.

- [ ] **Step 4: Run complete verification**

Run all Node tests, JavaScript syntax checking, JSON parsing, stale-rule text search, and `git diff --check`.
