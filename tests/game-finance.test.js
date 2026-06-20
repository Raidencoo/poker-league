const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadApp() {
  const code = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  const context = {
    console,
    Intl,
    document: { addEventListener() {} }
  };

  vm.createContext(context);
  vm.runInContext(
    `${code}\n;globalThis.__test = { calculateGameResult, renderGameFinanceStatement };`,
    context
  );

  return context.__test;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, `../data/${file}.json`), "utf8"));
}

function createGame(players, overrides = {}) {
  return {
    id: "no-dinner-game",
    season: "2026-S2",
    date: "2026-06-20 19:00",
    title: "无聚餐测试局",
    venueFee: 100,
    dinnerCost: 0,
    participants: players.slice(0, 5).map((player, index) => ({
      playerId: player.id,
      finalChips: 1000 - index * 100,
      rebuys: 0
    })),
    ...overrides
  };
}

test("a game can override the per-player buy-in to 100 yuan", () => {
  const api = loadApp();
  const rules = readJson("rules");
  const players = readJson("players");
  const playersById = new Map(players.map((player) => [player.id, player]));
  const result = api.calculateGameResult(
    createGame(players, { buyInPerPlayer: 100 }),
    playersById,
    rules
  );

  assert.equal(result.finance.buyInPerPlayer, 100);
  assert.equal(result.finance.buyInTotal, 500);
  assert.equal(result.finance.dinnerCost, 0);
  assert.equal(result.finance.dinnerSurplusToSeasonPool, 0);
  assert.equal(result.finance.seasonPoolContribution, 100);
  assert.equal(result.finance.isBalanced, true);
});

test("a game without an override keeps the 150-yuan default", () => {
  const api = loadApp();
  const rules = readJson("rules");
  const players = readJson("players");
  const playersById = new Map(players.map((player) => [player.id, player]));
  const result = api.calculateGameResult(createGame(players), playersById, rules);

  assert.equal(result.finance.buyInPerPlayer, 150);
  assert.equal(result.finance.buyInTotal, 750);
  assert.equal(result.finance.dinnerSurplusToSeasonPool, 250);
  assert.equal(result.finance.seasonPoolContribution, 350);
  assert.equal(result.finance.isBalanced, true);
});

test("the finance statement shows the applied rate and player count", () => {
  const api = loadApp();
  const rules = readJson("rules");
  const players = readJson("players");
  const playersById = new Map(players.map((player) => [player.id, player]));
  const result = api.calculateGameResult(
    createGame(players, { buyInPerPlayer: 100 }),
    playersById,
    rules
  );

  const html = api.renderGameFinanceStatement(result, true);

  assert.match(html, /参赛缴费/);
  assert.match(html, /100.*× 5 人/);
});
