# Season Honor Prizes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three non-duplicating 20-yuan season honor prizes, deduct only awarded prizes from the TOP 4 pool, and show prize badges in the honor wall.

**Architecture:** Keep all calculations in `app.js`, with a dedicated honor-selection pipeline that receives standings, valid games, players, and rules. Store only the per-award amount in `data/rules.json`; derived winners, total honor payout, and adjusted TOP 4 rewards remain runtime values.

**Tech Stack:** HTML, CSS, native JavaScript, Node.js built-in test runner and VM APIs.

---

### Task 1: Honor Selection Logic

**Files:**
- Create: `tests/honors.test.js`
- Modify: `app.js`

- [ ] **Step 1: Write failing tests for official honor selection**

Create VM-based tests that load `app.js` and assert that the honor selector returns “赛季筹码王”, “单局 MVP”, and “单局逆袭王”; excludes the first game and first appearances from comeback evaluation; and does not repeat an official winner.

- [ ] **Step 2: Run the test to verify RED**

Run: `/Users/raiden/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/honors.test.js`

Expected: FAIL because prize metadata and official honor selection do not exist.

- [ ] **Step 3: Implement minimal honor selection**

Add small comparison and selection helpers in `app.js`. Build standings before and after each eligible game for comeback ranking, and attach `prize`, `isPrizeHonor`, and game context to official honors.

- [ ] **Step 4: Run tests to verify GREEN**

Run the Task 1 test command.

Expected: all honor selection tests pass.

### Task 2: Reward Pool Integration

**Files:**
- Modify: `data/rules.json`
- Modify: `app.js`
- Modify: `tests/honors.test.js`

- [ ] **Step 1: Write a failing reward-pool test**

Assert that only the sum of actually awarded official honors is removed from the TOP 4 pool, in addition to the weak prize.

- [ ] **Step 2: Run the test to verify RED**

Run the Task 1 test command.

Expected: FAIL because `calculateSeasonRewards` does not account for honor prizes.

- [ ] **Step 3: Add configurable prize and pool deduction**

Add `season.honorPrize: 20` to `data/rules.json`, calculate honors before projected season rewards, and pass the actual honor payout into `calculateSeasonRewards`.

- [ ] **Step 4: Run tests to verify GREEN**

Run the Task 1 test command.

Expected: all reward and honor tests pass.

### Task 3: Honor Wall Presentation and Documentation

**Files:**
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `README.md`
- Modify: `tests/honors.test.js`

- [ ] **Step 1: Write a failing render test**

Assert that official honor cards render a configured yuan prize badge and趣味称号 cards do not.

- [ ] **Step 2: Run the test to verify RED**

Run the Task 1 test command.

Expected: FAIL because honor prize badges are not rendered.

- [ ] **Step 3: Render and style the prize badge**

Add an honor card header and right-aligned `.honor-prize` badge, visually highlight `.prize-honor`, and document all three award rules and pool deductions in `README.md`.

- [ ] **Step 4: Run complete verification**

Run:

```bash
/Users/raiden/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/honors.test.js
/Users/raiden/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check app.js
git diff --check
```

Expected: all tests pass, syntax check exits 0, and diff check reports no whitespace errors.
