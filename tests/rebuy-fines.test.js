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
          elements.set(selector, { innerHTML: "", textContent: "", disabled: false });
        }
        return elements.get(selector);
      }
    }
  };

  vm.createContext(context);
  vm.runInContext(
    `${code}\n;globalThis.__test = { calculateGameResult, calculateSeasonFinanceReport, renderGameFinanceStatement, renderLatestGame };`,
    context
  );

  return { api: context.__test, elements };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, `../data/${file}.json`), "utf8"));
}

function createGame(players, participantCount = 5, includeFines = true) {
  return {
    id: `fine-test-${participantCount}`,
    season: "2026-S2",
    date: "2026-06-20 20:00",
    title: "复活罚款测试局",
    buyInPerPlayer: 100,
    venueFee: 100,
    dinnerCost: 0,
    participants: players.slice(0, participantCount).map((player, index) => ({
      playerId: player.id,
      finalChips: 1200 - index * 200,
      rebuys: index < 2 ? index + 1 : 0,
      ...(includeFines && index === 0 ? { rebuyFine: 80 } : {}),
      ...(includeFines && index === 1 ? { rebuyFine: 20 } : {})
    }))
  };
}

function calculate(api, rules, players, game) {
  return api.calculateGameResult(
    game,
    new Map(players.map((player) => [player.id, player])),
    rules
  );
}

test("valid-game rebuy fines go directly into the season pool without changing points", () => {
  const { api } = loadApp();
  const rules = readJson("rules");
  const players = readJson("players");
  const finedResult = calculate(api, rules, players, createGame(players));
  const noFineResult = calculate(api, rules, players, createGame(players, 5, false));

  const finedRowsById = new Map(finedResult.rows.map((row) => [row.playerId, row]));

  assert.equal(finedRowsById.get(players[0].id).rebuyFine, 80);
  assert.equal(finedRowsById.get(players[1].id).rebuyFine, 20);
  assert.equal(finedRowsById.get(players[2].id).rebuyFine, 0);
  assert.equal(
    Array.from(finedResult.rows, (row) => row.nightPoints).join(","),
    Array.from(noFineResult.rows, (row) => row.nightPoints).join(",")
  );
  assert.equal(finedResult.finance.rebuyFineTotal, 100);
  assert.equal(finedResult.finance.buyInTotal, 500);
  assert.equal(finedResult.finance.fundingTotal, 600);
  assert.equal(finedResult.finance.seasonPoolContribution, 200);
  assert.equal(finedResult.finance.allocatedTotal, 600);
  assert.equal(finedResult.finance.isBalanced, true);
});

test("invalid-game rebuy fines do not enter league finance", () => {
  const { api } = loadApp();
  const rules = readJson("rules");
  const players = readJson("players");
  const invalidResult = calculate(api, rules, players, createGame(players, 4));

  assert.equal(invalidResult.isValid, false);
  assert.equal(invalidResult.finance.rebuyFineTotal, 0);
  assert.equal(invalidResult.finance.fundingTotal, 0);
  assert.equal(invalidResult.finance.seasonPoolContribution, 0);
});

test("battle report and finance statement display rebuy fines", () => {
  const { api, elements } = loadApp();
  const rules = readJson("rules");
  const players = readJson("players");
  const result = calculate(api, rules, players, createGame(players));

  const financeHtml = api.renderGameFinanceStatement(result, true);
  assert.match(financeHtml, /<span>复活罚款<\/span>/);
  assert.match(financeHtml, /<small>[^<]*复活罚款 ¥100/);

  api.renderLatestGame({ validGames: [result] });
  assert.match(elements.get("#latest-game-body").innerHTML, /<td>¥80<\/td>/);
});
