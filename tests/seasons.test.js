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
      calculateSeasonedGameResults: typeof calculateSeasonedGameResults === "function" ? calculateSeasonedGameResults : null,
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

test("available seasons put the automatic current season first", () => {
  const { api } = loadApp();
  const { rules, games } = loadData();

  assert.equal(typeof api.getAvailableSeasons, "function");

  const seasons = api.getAvailableSeasons(games, rules);

  assert.deepEqual(
    Array.from(seasons, (season) => ({ id: season.id, isCurrent: season.isCurrent })),
    [
      { id: "2026-S3", isCurrent: true },
      { id: "2026-S2", isCurrent: false },
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
  const seasonThree = api.calculateSeasonSummary(rules, players, games, "2026-S3");

  assert.equal(seasonOne.season, "2026-S1");
  assert.equal(seasonOne.validGames.length, 4);
  assert.equal(seasonOne.validGames.at(-1).id, "game-004");
  assert.equal(seasonTwo.season, "2026-S2");
  assert.equal(seasonTwo.validGames.length, 4);
  assert.equal(seasonTwo.validGames.at(-1).id, "game-008");
  assert.equal(seasonThree.season, "2026-S3");
  assert.equal(seasonThree.currentSeason, "2026-S3");
  assert.equal(seasonThree.validGames.length, 1);
  assert.equal(seasonThree.validGames.at(-1).id, "game-009");
});

test("season summary defaults to the latest automatic four-game block", () => {
  const { api } = loadApp();
  const { rules, players, games } = loadData();

  const summary = api.calculateSeasonSummary(rules, players, games);

  assert.equal(summary.season, "2026-S3");
  assert.equal(summary.validGames.length, 1);
  assert.equal(summary.validGames[0].id, "game-009");
});

test("automatic season blocks ignore stale per-game season labels", () => {
  const { api } = loadApp();
  const { rules, players, games } = loadData();
  const staleGames = games.slice(0, 5).map((game) => ({
    ...game,
    season: "2026-S1"
  }));

  const seasons = api.getAvailableSeasons(staleGames, rules);
  const seasonTwo = api.calculateSeasonSummary(rules, players, staleGames, "2026-S2");

  assert.deepEqual(
    Array.from(seasons, (season) => ({ id: season.id, isCurrent: season.isCurrent })),
    [
      { id: "2026-S2", isCurrent: true },
      { id: "2026-S1", isCurrent: false }
    ]
  );
  assert.equal(seasonTwo.validGames.length, 1);
  assert.equal(seasonTwo.validGames[0].id, "game-005");
  assert.equal(seasonTwo.validGames[0].configuredSeason, "2026-S1");
});

test("season selector labels current and archived seasons", () => {
  const { api, elements } = loadApp();
  const seasons = [
    { id: "2026-S3", isCurrent: true },
    { id: "2026-S2", isCurrent: false },
    { id: "2026-S1", isCurrent: false }
  ];

  assert.equal(typeof api.renderSeasonSelector, "function");

  api.renderSeasonSelector(seasons, "2026-S1");

  const select = elements.get("#season-select");
  assert.equal(select.value, "2026-S1");
  assert.match(select.innerHTML, /2026-S3 · 当前赛季/);
  assert.match(select.innerHTML, /2026-S2 · 已结束/);
  assert.match(select.innerHTML, /2026-S1 · 已结束/);
});

test("switching seasons rerenders the complete dashboard on each season's latest game", () => {
  const { api, elements } = loadApp();
  const data = loadData();
  const seasons = api.getAvailableSeasons(data.games, data.rules);
  const selector = elements.get("#season-select") ?? { innerHTML: "", value: "" };
  elements.set("#season-select", selector);

  api.renderSeasonSelector(seasons, "2026-S3");
  api.setupSeasonSelectorInteractions(data, seasons);

  selector.value = "2026-S1";
  selector.onchange();
  assert.equal(elements.get("#overview-title").textContent, "2026-S1 赛季总览");
  assert.match(elements.get("#latest-game-meta").textContent, /第4局/);
  assert.equal(elements.get("#latest-game-position").textContent, "4 / 4");
  assert.equal(elements.get("#finance-position").textContent, "4 / 4");

  selector.value = "2026-S3";
  selector.onchange();
  assert.equal(elements.get("#overview-title").textContent, "当前赛季总览");
  assert.match(elements.get("#latest-game-meta").textContent, /2026-07-11 20:00/);
  assert.equal(elements.get("#latest-game-position").textContent, "1 / 1");
  assert.equal(elements.get("#finance-position").textContent, "1 / 1");
});
