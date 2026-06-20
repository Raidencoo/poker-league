const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadApp() {
  const elements = new Map();
  const context = {
    console,
    Intl,
    document: {
      addEventListener() {},
      querySelector(selector) {
        if (!elements.has(selector)) {
          elements.set(selector, { innerHTML: "", textContent: "" });
        }
        return elements.get(selector);
      }
    }
  };
  const code = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(
    `${code}\n;globalThis.__test = { calculateSeasonSummary, renderSeasonSummary };`,
    context
  );

  return { api: context.__test, elements };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, `../data/${file}.json`), "utf8"));
}

function createGame(players, participantCount) {
  return {
    id: `test-${participantCount}`,
    season: "2026-S2",
    date: "2026-06-20 19:00",
    title: `${participantCount} 人测试局`,
    dinnerCost: 0,
    participants: players.slice(0, participantCount).map((player, index) => ({
      playerId: player.id,
      finalChips: 1000 - index * 100,
      rebuys: 0
    }))
  };
}

test("five players are valid while four players remain invalid", () => {
  const { api, elements } = loadApp();
  const rules = readJson("rules");
  const players = readJson("players");
  const fivePlayerSummary = api.calculateSeasonSummary(
    rules,
    players,
    [createGame(players, 5)],
    "2026-S2"
  );
  const fourPlayerSummary = api.calculateSeasonSummary(
    rules,
    players,
    [createGame(players, 4)],
    "2026-S2"
  );

  assert.equal(rules.money.minimumPlayers, 5);
  assert.equal(fivePlayerSummary.validGames.length, 1);
  assert.equal(fourPlayerSummary.validGames.length, 0);

  api.renderSeasonSummary(fivePlayerSummary);
  assert.match(elements.get("#season-overview").innerHTML, /至少 5 人/);
});
