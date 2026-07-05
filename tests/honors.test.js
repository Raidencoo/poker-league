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
          elements.set(selector, { innerHTML: "", textContent: "" });
        }
        return elements.get(selector);
      }
    }
  };

  vm.createContext(context);
  vm.runInContext(
    `${code}\n;globalThis.__test = { calculateStandingsForGames, calculatePlayerProfiles, calculateSeasonHonors, calculateSeasonRewards, renderHonorWall, renderWeakDangerZone };`,
    context
  );

  return { api: context.__test, elements };
}

const players = [
  { id: "a", name: "A", avatar: "a.svg" },
  { id: "b", name: "B", avatar: "b.svg" },
  { id: "c", name: "C", avatar: "c.svg" },
  { id: "d", name: "D", avatar: "d.svg" }
];

const rules = {
  season: {
    honorPrize: 20,
    topFourPrizePercentages: [0.5, 0.25, 0.15, 0.1]
  }
};

function row(playerId, nightPoints, finalChips, rebuys, rank) {
  return {
    playerId,
    playerName: playerId.toUpperCase(),
    avatar: `${playerId}.svg`,
    nightPoints,
    finalChips,
    rebuys,
    rank,
    nightReward: 0
  };
}

function game(id, rows) {
  return {
    id,
    title: id,
    date: `2026-06-0${id.at(-1)}`,
    rows
  };
}

function calculateHonors(api, validGames) {
  const standings = api.calculateStandingsForGames(players, validGames);
  const profiles = api.calculatePlayerProfiles(standings, validGames);
  return api.calculateSeasonHonors(standings, validGames, profiles, rules);
}

test("official prize honors select four different players", () => {
  const { api } = loadApp();
  const games = [
    game("game-1", [
      row("a", 10, 5000, 0, 1),
      row("b", 8, 500, 0, 2),
      row("c", 6, 0, 0, 3),
      row("d", 4, -500, 0, 4)
    ]),
    game("game-2", [
      row("d", 20, 1000, 0, 1),
      row("c", 12, 800, 0, 2),
      row("b", 5, -300, 0, 3),
      row("a", 0, -1000, 1, 4)
    ])
  ];

  const prizeHonors = calculateHonors(api, games).filter((honor) => honor.isPrizeHonor);

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
});

test("season chip king uses the highest single-game chip result", () => {
  const { api } = loadApp();
  const games = [
    game("game-1", [
      row("a", 10, 3000, 0, 1),
      row("b", 8, 2000, 0, 2),
      row("c", 6, 0, 0, 3),
      row("d", 4, -500, 0, 4)
    ]),
    game("game-2", [
      row("b", 12, 1800, 0, 1),
      row("c", 8, 500, 0, 2),
      row("d", 6, 0, 0, 3),
      row("a", 0, -2500, 1, 4)
    ])
  ];

  const chipKing = calculateHonors(api, games).find(
    (honor) => honor.label === "赛季筹码王"
  );

  assert.equal(chipKing.player.playerId, "a");
  assert.match(chipKing.value, /3,?000/);
  assert.match(chipKing.note, /game-1/);
});

test("the first game cannot award a comeback honor", () => {
  const { api } = loadApp();
  const games = [
    game("game-1", [
      row("a", 10, 1000, 0, 1),
      row("b", 8, 500, 0, 2),
      row("c", 6, 0, 0, 3)
    ])
  ];

  const honors = calculateHonors(api, games);

  assert.equal(honors.some((honor) => honor.label === "单局逆袭王"), false);
});

test("a player's first appearance cannot count as a comeback", () => {
  const { api } = loadApp();
  const games = [
    game("game-1", [
      row("a", 10, 1000, 0, 1),
      row("b", 8, 500, 0, 2),
      row("c", 6, 0, 0, 3)
    ]),
    game("game-2", [row("d", 20, 2000, 0, 1)])
  ];

  const honors = calculateHonors(api, games);

  assert.equal(honors.some((honor) => honor.label === "单局逆袭王"), false);
});

test("TOP 4 pool deducts only awarded official honor prizes", () => {
  const { api } = loadApp();
  const topFour = players.map((player) => ({ playerId: player.id }));
  const honors = [
    { isPrizeHonor: true, prize: 20 },
    { isPrizeHonor: true, prize: 20 },
    { isPrizeHonor: false, prize: 100 }
  ];

  const rewards = api.calculateSeasonRewards(topFour, 400, rules, honors);

  assert.deepEqual(
    Array.from(topFour, (stats) => rewards.get(stats.playerId)),
    [180, 90, 54, 36]
  );
});

test("season payouts stay equal to an odd-valued season pool after rounding", () => {
  const { api } = loadApp();
  const topFour = players.map((player) => ({ playerId: player.id }));
  const honors = [
    { isPrizeHonor: true, prize: 20 },
    { isPrizeHonor: true, prize: 20 },
    { isPrizeHonor: true, prize: 20 },
    { isPrizeHonor: true, prize: 20 }
  ];

  const rewards = api.calculateSeasonRewards(
    topFour,
    1419,
    rules,
    honors
  );
  const paidTotal = [...rewards.values()].reduce((total, amount) => total + amount, 0) + 80;

  assert.deepEqual(
    Array.from(topFour, (stats) => rewards.get(stats.playerId)),
    [670, 335, 201, 133]
  );
  assert.equal(rewards.has("weak"), false);
  assert.equal(paidTotal, 1419);
});

test("weak danger zone keeps the candidate but removes prize text", () => {
  const { api, elements } = loadApp();

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
});

test("only official honor cards render a prize badge", () => {
  const { api, elements } = loadApp();

  api.renderHonorWall({
    seasonHonors: [
      {
        label: "无复活战神",
        player: { playerName: "A", avatar: "a.svg" },
        value: "1 次复活",
        note: "总积分 20 · 出勤 4 次",
        isPrizeHonor: true,
        prize: 20
      },
      {
        label: "复活王",
        player: { playerName: "B", avatar: "b.svg" },
        value: "3 次",
        note: "出勤 4 次"
      }
    ]
  });

  const html = elements.get("#honor-wall").innerHTML;

  assert.match(html, /prize-honor/);
  assert.match(html, /honor-prize[^>]*>[^<]*20/);
  assert.equal((html.match(/honor-prize/g) ?? []).length, 1);
});
