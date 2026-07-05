# Clean Warrior Prize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the weak-player cash prize and promote “无复活战神” to a fourth mutually exclusive 20-yuan official season honor.

**Architecture:** Keep weak-player calculations as display-only season analytics. Move all cash-prize ownership into `calculateSeasonHonors()`, then let `calculateSeasonRewards()` deduct only the official honors actually awarded before allocating the remainder to TOP 4. Reuse the existing `isPrizeHonor` render path so no new card component or CSS variant is needed.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, JSON data, Node.js built-in test runner and VM-based unit tests.

---

### Task 1: Lock The New Reward Contract With Failing Tests

**Files:**
- Modify: `tests/honors.test.js`

- [ ] **Step 1: Export the weak-danger renderer in the test harness**

Extend the VM export to include `renderWeakDangerZone`:

```js
globalThis.__test = {
  calculateStandingsForGames,
  calculatePlayerProfiles,
  calculateSeasonHonors,
  calculateSeasonRewards,
  renderHonorWall,
  renderWeakDangerZone
};
```

- [ ] **Step 2: Change the official-honor test to require four unique winners**

Update the expected labels and winners:

```js
assert.deepEqual(
  Array.from(prizeHonors, (honor) => honor.label),
  ["赛季筹码王", "单局 MVP", "单局逆袭王", "无复活战神"]
);
assert.deepEqual(
  Array.from(prizeHonors, (honor) => honor.player.playerId),
  ["a", "d", "c", "b"]
);
assert.equal(new Set(prizeHonors.map((honor) => honor.player.playerId)).size, 4);
assert.ok(prizeHonors.every((honor) => honor.prize === 20));
```

- [ ] **Step 3: Change reward tests so weak candidates receive no money**

Call `calculateSeasonRewards(topFour, seasonPool, rules, honors)` without a weak candidate. For the 1419-yuan case, use four official honors and assert:

```js
const rewards = api.calculateSeasonRewards(topFour, 1419, rules, honors);
const paidTotal = [...rewards.values()].reduce(
  (total, amount) => total + amount,
  0
) + 80;

assert.deepEqual(
  Array.from(topFour, (stats) => rewards.get(stats.playerId)),
  [670, 335, 201, 133]
);
assert.equal(rewards.has("weak"), false);
assert.equal(paidTotal, 1419);
```

- [ ] **Step 4: Add a rendering test that removes weak-prize text**

Render a candidate and verify the display remains but no cash language remains:

```js
api.renderWeakDangerZone({
  weakDangerZone: {
    candidate: {
      playerId: "a",
      playerName: "A",
      avatar: "a.svg",
      totalPoints: 5,
      attendance: 3,
      totalRebuys: 2,
      rank: 5
    },
    watchList: [],
    closestPending: [],
    minimumAttendance: 3,
    escapePointsNeeded: null
  }
});

const html = elements.get("#weak-danger-zone").innerHTML;
assert.match(html, /当前危险人物/);
assert.doesNotMatch(html, /奖金|¥20/);
```

- [ ] **Step 5: Run the focused tests and verify RED**

Run:

```bash
/Users/raiden/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/honors.test.js
```

Expected: failures show only three official honors, a weak-player payment still exists, and the weak-danger card still contains prize text.

### Task 2: Move The 20 Yuan Into The Official Honor Pipeline

**Files:**
- Modify: `app.js`
- Test: `tests/honors.test.js`

- [ ] **Step 1: Stop passing weak candidates into reward allocation**

In `calculateSeasonSummary()`, call:

```js
const seasonRewards = calculateSeasonRewards(
  topPrizeStandings,
  seasonPool,
  rules,
  seasonHonors
);
```

Change the function signature to:

```js
function calculateSeasonRewards(
  topPrizeStandings,
  seasonPool,
  rules,
  seasonHonors = []
) {
```

- [ ] **Step 2: Remove the weak-prize deduction and payment**

Calculate the TOP 4 pool only from actual official honors:

```js
const topFourPool = Math.max(0, seasonPool - honorPrizeTotal);
```

Delete the block that writes `rules.season.weakPrize` into the rewards map. Keep the existing integer-tail allocation so all paid prizes equal the pool.

- [ ] **Step 3: Make the comeback winner unavailable to later official honors**

After creating the comeback prize, add:

```js
awardedPlayerIds.add(comebackWinner.playerId);
```

- [ ] **Step 4: Promote the lowest-rebuy player to a formal prize honor**

Select only attended players who have not received an earlier official honor:

```js
const cleanPlayer = [...playerProfiles.values()]
  .filter(
    (profile) =>
      profile.attendance > 0 && !awardedPlayerIds.has(profile.playerId)
  )
  .sort(
    (a, b) =>
      a.totalRebuys - b.totalRebuys ||
      b.totalPoints - a.totalPoints ||
      a.rank - b.rank
  )[0];

if (cleanPlayer) {
  prizeHonors.push(
    createPrizeHonor(
      "无复活战神",
      cleanPlayer,
      `${cleanPlayer.totalRebuys} 次复活`,
      `总积分 ${cleanPlayer.totalPoints} · 出勤 ${cleanPlayer.attendance} 次`,
      honorPrize
    )
  );
}
```

Remove the old no-prize `createHonor("无复活战神", ...)` item from the returned array. Keep only “复活王” and “奖金收割机” as hobby titles.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
/Users/raiden/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/honors.test.js
```

Expected: all honor and reward tests pass, including four unique official winners and exact 1419-yuan conservation.

### Task 3: Remove Weak-Prize Configuration And Cash Language

**Files:**
- Modify: `data/rules.json`
- Modify: `app.js`
- Modify: `index.html`
- Modify: `README.md`

- [ ] **Step 1: Remove the obsolete JSON amount**

Delete this property from `data/rules.json`:

```json
"weakPrize": 20,
```

Keep `weakPrizeMinimumAttendance` because the danger-zone candidate still uses it.

- [ ] **Step 2: Remove prize data and wording from weak-player rendering**

In `calculateWeakDangerZone()`, remove:

```js
prize: rules.season.weakPrize
```

In `renderWeakDangerZone()`, replace the candidate note with:

```js
<p>${escapeText}</p>
```

In `renderSeasonSummary()`, rename the summary label:

```js
summaryCard("弱鸡候选", ...)
```

- [ ] **Step 3: Update page-level honor and danger copy**

In `index.html`, change the danger-zone description to:

```html
<p>参与不少于 3 次、未进前四、累计积分最低；笑归笑，榜照排。</p>
```

Change the honor-wall description to:

```html
<p>四项奖金荣誉加两项趣味称号，全部按有效牌局自动评选。</p>
```

- [ ] **Step 4: Update the generated rules section**

Remove the weak-prize sentence from `renderRules()`. Replace the official-honor sentence with:

```js
<li>赛季筹码王、单局 MVP、单局逆袭王、无复活战神各奖励 ${yuan.format(rules.season.honorPrize)}，同一玩家不可重复领取。</li>
```

- [ ] **Step 5: Make README match the final rules**

In the season-reward section:

- remove the weak-prize deduction and weak-prize eligibility subsection;
- state that four official honors each pay 20 yuan;
- add “无复活战神” as item 4, selected by lowest cumulative rebuys, then higher total points, then better season rank;
- state that weak-player rankings are display-only and have no cash prize;
- update the conservation sentence to say TOP 4 plus official honors equals the season pool;
- list only “复活王” and “奖金收割机” as no-prize hobby titles.

- [ ] **Step 6: Validate JSON and scan for obsolete cash references**

Run:

```bash
/Users/raiden/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node -e 'JSON.parse(require("fs").readFileSync("data/rules.json", "utf8")); console.log("rules.json valid")'
rg -n 'weakPrize\b|弱鸡鼓励奖|弱鸡奖候选|钱照发|三项奖金荣誉|三项趣味称号' app.js index.html README.md data tests
```

Expected: JSON is valid and the text scan returns no obsolete weak-prize references. `weakPrizeMinimumAttendance` may remain.

### Task 4: Verify Current-Season Accounting And The Whole Project

**Files:**
- Verify: `app.js`
- Verify: `data/rules.json`
- Verify: `data/players.json`
- Verify: `data/games.json`
- Verify: `tests/*.test.js`

- [ ] **Step 1: Inspect the actual S2 calculation**

Load `calculateSeasonSummary()` in a Node VM and print official honors, TOP 4 rewards, and totals. Expected current S2 behavior:

```text
official honor count: 4
official honor total: 80
weak candidate projected reward: 0
TOP 4 total: 1339
season payout total: 1419
```

- [ ] **Step 2: Run the full test suite**

Run:

```bash
/Users/raiden/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/*.test.js
```

Expected: all tests pass with zero failures.

- [ ] **Step 3: Check JavaScript syntax**

Run:

```bash
/Users/raiden/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check app.js
```

Expected: exit code 0 with no output.

- [ ] **Step 4: Check patch formatting**

Run:

```bash
git diff --check
```

Expected: exit code 0 with no output.

- [ ] **Step 5: Review the final diff without reverting pre-existing changes**

Run:

```bash
git diff -- app.js index.html README.md data/rules.json tests/honors.test.js
```

Confirm the diff contains only the prior pending fixes plus this approved reward-rule change. Do not modify or revert unrelated user data.
