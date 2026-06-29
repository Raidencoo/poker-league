const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadApp() {
  const code = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  const elements = new Map();
  const context = {
    console,
    Intl,
    document: {
      addEventListener() {},
      querySelector(selector) {
        if (!elements.has(selector)) {
          elements.set(selector, { innerHTML: "", textContent: "", value: "" });
        }
        return elements.get(selector);
      }
    }
  };

  vm.createContext(context);
  vm.runInContext(
    `${code}\n;globalThis.__test = {
      getAvailableSeasons: typeof getAvailableSeasons === "function" ? getAvailableSeasons : null,
      resolveSelectedSeason: typeof resolveSelectedSeason === "function" ? resolveSelectedSeason : null,
      renderSeasonSelector: typeof renderSeasonSelector === "function" ? renderSeasonSelector : null,
      setupSeasonSelectorInteractions: typeof setupSeasonSelectorInteractions === "function" ? setupSeasonSelectorInteractions : null,
      calculateSeasonSummary
    };`,
    context
  );

  return { api: context.__test, elements };
}

function loadData() {
  const readJson = (file) =>
    JSON.parse(fs.readFileSync(path.join(__dirname, `../data/${file}.json`), "utf8"));

  return {
    rules: readJson("rules"),
    players: readJson("players"),
    games: readJson("games")
  };
}

test("available seasons put the configured current season first", () => {
  const { api } = loadApp();
  const { rules, games } = loadData();

  assert.equal(typeof api.getAvailableSeasons, "function");

  const seasons = api.getAvailableSeasons(games, rules.season.current);

  assert.deepEqual(
    Array.from(seasons, (season) => ({ id: season.id, isCurrent: season.isCurrent })),
    [
      { id: "2026-S2", isCurrent: true },
      { id: "2026-S1", isCurrent: false }
    ]
  );
});

test("requested season must exist or selection falls back to current", () => {
  const { api } = loadApp();
  const seasons = [
    { id: "2026-S2", isCurrent: true },
    { id: "2026-S1", isCurrent: false }
  ];

  assert.equal(typeof api.resolveSelectedSeason, "function");
  assert.equal(api.resolveSelectedSeason(seasons, "2026-S2", "2026-S1"), "2026-S1");
  assert.equal(api.resolveSelectedSeason(seasons, "2026-S2", "missing"), "2026-S2");
  assert.equal(api.resolveSelectedSeason(seasons, "2026-S2", null), "2026-S2");
});

test("season summary can calculate historical and current seasons independently", () => {
  const { api } = loadApp();
  const { rules, players, games } = loadData();

  const seasonOne = api.calculateSeasonSummary(rules, players, games, "2026-S1");
  const seasonTwo = api.calculateSeasonSummary(rules, players, games, "2026-S2");

  assert.equal(seasonOne.season, "2026-S1");
  assert.equal(seasonOne.validGames.length, 4);
  assert.equal(seasonOne.validGames.at(-1).id, "game-004");
  assert.equal(seasonTwo.season, "2026-S2");
  assert.equal(seasonTwo.validGames.length, 3);
  assert.equal(seasonTwo.validGames.at(-1).id, "game-006");
});

test("season selector labels current and archived seasons", () => {
  const { api, elements } = loadApp();
  const seasons = [
    { id: "2026-S2", isCurrent: true },
    { id: "2026-S1", isCurrent: false }
  ];

  assert.equal(typeof api.renderSeasonSelector, "function");

  api.renderSeasonSelector(seasons, "2026-S1");

  const select = elements.get("#season-select");
  assert.equal(select.value, "2026-S1");
  assert.match(select.innerHTML, /2026-S2 · 当前赛季/);
  assert.match(select.innerHTML, /2026-S1 · 已结束/);
});

test("switching seasons rerenders the complete dashboard on each season's latest game", () => {
  const { api, elements } = loadApp();
  const data = loadData();
  const seasons = api.getAvailableSeasons(data.games, data.rules.season.current);
  const selector = elements.get("#season-select") ?? { innerHTML: "", value: "" };
  elements.set("#season-select", selector);

  api.renderSeasonSelector(seasons, "2026-S2");
  api.setupSeasonSelectorInteractions(data, seasons);

  selector.value = "2026-S1";
  selector.onchange();
  assert.equal(elements.get("#overview-title").textContent, "2026-S1 赛季总览");
  assert.match(elements.get("#latest-game-meta").textContent, /第4局/);
  assert.equal(elements.get("#latest-game-position").textContent, "4 / 4");
  assert.equal(elements.get("#finance-position").textContent, "4 / 4");

  selector.value = "2026-S2";
  selector.onchange();
  assert.equal(elements.get("#overview-title").textContent, "当前赛季总览");
  assert.match(elements.get("#latest-game-meta").textContent, /2026-06-19 20:00/);
  assert.equal(elements.get("#latest-game-position").textContent, "3 / 3");
  assert.equal(elements.get("#finance-position").textContent, "3 / 3");
});
