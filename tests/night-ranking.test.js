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
    `${code}\n;globalThis.__test = { calculateGameResult };`,
    context
  );

  return context.__test;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, `../data/${file}.json`), "utf8"));
}

test("rebuying chip leader is ranked after the highest non-rebuy player for base points", () => {
  const api = loadApp();
  const rules = readJson("rules");
  const players = readJson("players");
  const games = readJson("games");
  const playersById = new Map(players.map((player) => [player.id, player]));
  const result = api.calculateGameResult(
    games.find((game) => game.id === "game-007"),
    playersById,
    rules
  );
  const rowsById = new Map(result.rows.map((row) => [row.playerId, row]));

  assert.equal(
    result.rows.slice(0, 3).map((row) => row.playerId).join(","),
    "anafkh,gou,kai"
  );

  assert.equal(rowsById.get("anafkh").rank, 1);
  assert.equal(rowsById.get("anafkh").basePoints, 12);
  assert.equal(rowsById.get("anafkh").nightReward, 170);

  assert.equal(rowsById.get("gou").rank, 2);
  assert.equal(rowsById.get("gou").basePoints, 10);
  assert.equal(rowsById.get("gou").chipBonusPoints, 8);
  assert.equal(rowsById.get("gou").rebuyPenaltyPoints, -2);
  assert.equal(rowsById.get("gou").nightPoints, 16);
  assert.equal(rowsById.get("gou").nightReward, 80);
});
