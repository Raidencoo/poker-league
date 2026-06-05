const DATA_PATHS = {
  rules: "data/rules.json",
  players: "data/players.json",
  games: "data/games.json"
};

const yuan = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  maximumFractionDigits: 0
});

document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    const data = await loadData();
    const seasonSummary = calculateSeasonSummary(data.rules, data.players, data.games);

    renderSeasonSummary(seasonSummary);
    renderTopFour(seasonSummary);
    renderWeakPlayerCandidate(seasonSummary);
    renderStandings(seasonSummary);
    renderLatestGame(seasonSummary);
    renderRules(data.rules);
  } catch (error) {
    renderError(error);
  }
}

async function loadData() {
  const [rules, players, games] = await Promise.all(
    Object.values(DATA_PATHS).map((path) => fetch(path).then(assertJsonResponse))
  );

  return { rules, players, games };
}

async function assertJsonResponse(response) {
  if (!response.ok) {
    throw new Error(`无法读取 ${response.url}，状态码 ${response.status}`);
  }

  return response.json();
}

function calculateGameResult(game, playersById, rules) {
  const isValid = game.participants.length >= rules.money.minimumPlayers;
  const sortedParticipants = [...game.participants].sort((a, b) => b.finalChips - a.finalChips);
  const nightRewards = calculateNightRewards(sortedParticipants, rules);

  const rows = sortedParticipants.map((entry, index) => {
    const rank = index + 1;
    const player = playersById.get(entry.playerId);
    const basePoints = calculateBasePoints(rank, entry.leftEarly, rules);
    const chipBonusPoints = calculateChipBonusPoints(entry.finalChips, rules);
    const rebuyPenaltyPoints = calculateRebuyPenalty(entry.rebuys, rules);
    const rawPoints = basePoints + chipBonusPoints + rebuyPenaltyPoints;
    const nightPoints = entry.leftEarly
      ? rules.points.leftEarlyPoint
      : Math.max(rules.points.minimumFullParticipationPoint, rawPoints);

    return {
      playerId: entry.playerId,
      playerName: player?.name ?? entry.playerId,
      avatar: player?.avatar ?? "avatars/default.svg",
      rank,
      finalChips: entry.finalChips,
      rebuys: entry.rebuys,
      leftEarly: Boolean(entry.leftEarly),
      basePoints,
      chipBonusPoints,
      rebuyPenaltyPoints,
      nightPoints,
      nightReward: nightRewards.get(entry.playerId) ?? 0
    };
  });

  const finance = calculateGameFinance(game, rules, isValid);

  return {
    id: game.id,
    season: game.season,
    date: game.date,
    title: game.title,
    isValid,
    participantCount: game.participants.length,
    rows,
    finance
  };
}

function calculateNightRewards(sortedParticipants, rules) {
  const rewards = new Map();
  const prizeAmounts = rules.money.nightRewardPrizes;
  const firstPrizeWinner = sortedParticipants.find((entry) => entry.rebuys === 0);
  const awardedPlayerIds = new Set();

  if (firstPrizeWinner) {
    rewards.set(firstPrizeWinner.playerId, prizeAmounts[0]);
    awardedPlayerIds.add(firstPrizeWinner.playerId);
  }

  sortedParticipants
    .filter((entry) => !awardedPlayerIds.has(entry.playerId))
    .slice(0, prizeAmounts.length - 1)
    .forEach((entry, index) => {
      rewards.set(entry.playerId, prizeAmounts[index + 1]);
    });

  return rewards;
}

function calculateBasePoints(rank, leftEarly, rules) {
  if (leftEarly) return rules.points.leftEarlyPoint;
  return rules.points.rankBasePoints[rank - 1] ?? rules.points.rankBasePointAfterSeventh;
}

function calculateChipBonusPoints(finalChips, rules) {
  const chipsAboveStart = Math.max(0, finalChips - rules.chips.startingChips);
  const bonus = Math.floor(chipsAboveStart / rules.chips.chipBonusStep);
  return Math.min(bonus, rules.chips.maxChipBonus);
}

function calculateRebuyPenalty(rebuys, rules) {
  let penalty = 0;

  for (let index = 0; index < rebuys; index += 1) {
    penalty += rules.chips.rebuyPenalties[index] ?? rules.chips.rebuyPenaltyAfterThird;
  }

  return penalty;
}

function calculateGameFinance(game, rules, isValid) {
  if (!isValid) {
    return {
      buyInTotal: 0,
      baseDinnerFund: 0,
      dinnerCoveredByFund: 0,
      dinnerShortfall: 0,
      dinnerSurplusToSeasonPool: 0,
      seasonPoolContribution: 0
    };
  }

  const buyInTotal = game.participants.length * rules.money.buyInPerPlayer;
  const baseDinnerFund =
    buyInTotal -
    rules.money.venueFee -
    rules.money.nightRewardTotal -
    rules.money.seasonPoolPerGame;
  const dinnerCost = game.dinnerCost ?? 0;
  const dinnerCoveredByFund = Math.min(baseDinnerFund, dinnerCost);
  const dinnerShortfall = Math.max(0, dinnerCost - baseDinnerFund);
  const dinnerSurplusToSeasonPool = Math.max(0, baseDinnerFund - dinnerCost);
  const seasonPoolContribution = rules.money.seasonPoolPerGame + dinnerSurplusToSeasonPool;

  return {
    buyInTotal,
    baseDinnerFund,
    dinnerCoveredByFund,
    dinnerShortfall,
    dinnerSurplusToSeasonPool,
    seasonPoolContribution
  };
}

function calculateSeasonSummary(rules, players, games) {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const season = rules.season.current;
  const seasonGames = games
    .filter((game) => game.season === season)
    .map((game) => calculateGameResult(game, playersById, rules))
    .sort((a, b) => a.date.localeCompare(b.date));
  const validGames = seasonGames.filter((game) => game.isValid);
  const playerStats = initializePlayerStats(players);

  for (const game of validGames) {
    for (const row of game.rows) {
      const stats = playerStats.get(row.playerId);
      stats.totalPoints += row.nightPoints;
      stats.attendance += 1;
      stats.totalRebuys += row.rebuys;
      stats.totalNightRewards += row.nightReward;
      stats.latestRank = row.rank;
    }
  }

  const standings = [...playerStats.values()].sort(compareStandings);
  standings.forEach((stats, index) => {
    stats.rank = index + 1;
  });

  const seasonPool = validGames.reduce(
    (total, game) => total + game.finance.seasonPoolContribution,
    0
  );
  const seasonHasPoints = standings.some((stats) => stats.totalPoints > 0);
  const topPrizeStandings = seasonHasPoints ? standings.slice(0, 4) : [];
  const weakPlayerCandidate = calculateWeakPlayerCandidate(standings, rules);
  const seasonRewards = calculateSeasonRewards(topPrizeStandings, seasonPool, rules, weakPlayerCandidate);

  for (const stats of standings) {
    stats.projectedSeasonReward = seasonRewards.get(stats.playerId) ?? 0;
  }

  const dinner = validGames.reduce(
    (totals, game) => {
      totals.baseFund += game.finance.baseDinnerFund;
      totals.covered += game.finance.dinnerCoveredByFund;
      totals.shortfall += game.finance.dinnerShortfall;
      totals.surplusToSeasonPool += game.finance.dinnerSurplusToSeasonPool;
      return totals;
    },
    { baseFund: 0, covered: 0, shortfall: 0, surplusToSeasonPool: 0 }
  );

  return {
    rules,
    season,
    games: seasonGames,
    validGames,
    standings,
    topPrizeStandings,
    seasonPool,
    dinner,
    weakPlayerCandidate,
    currentLeader: seasonHasPoints ? standings[0] : null
  };
}

function initializePlayerStats(players) {
  return new Map(
    players.map((player) => [
      player.id,
      {
        playerId: player.id,
        playerName: player.name,
        avatar: player.avatar,
        totalPoints: 0,
        attendance: 0,
        totalRebuys: 0,
        totalNightRewards: 0,
        projectedSeasonReward: 0,
        latestRank: null
      }
    ])
  );
}

function compareStandings(a, b) {
  return (
    b.totalPoints - a.totalPoints ||
    a.totalRebuys - b.totalRebuys ||
    b.attendance - a.attendance ||
    a.playerName.localeCompare(b.playerName, "zh-CN")
  );
}

function calculateWeakPlayerCandidate(standings, rules) {
  return (
    standings
      .filter(
        (stats) =>
          stats.rank > 4 &&
          stats.attendance >= rules.season.weakPrizeMinimumAttendance
      )
      .sort(
        (a, b) =>
          a.totalPoints - b.totalPoints ||
          b.attendance - a.attendance ||
          b.totalRebuys - a.totalRebuys
      )[0] ?? null
  );
}

function calculateSeasonRewards(topPrizeStandings, seasonPool, rules, weakPlayerCandidate) {
  const rewards = new Map();
  const topFourPool = Math.max(0, seasonPool - rules.season.weakPrize);

  topPrizeStandings.forEach((stats, index) => {
    const amount = topFourPool * rules.season.topFourPrizePercentages[index];
    rewards.set(stats.playerId, Math.round(amount));
  });

  if (weakPlayerCandidate) {
    rewards.set(weakPlayerCandidate.playerId, rules.season.weakPrize);
  }

  return rewards;
}

function renderSeasonSummary(summary) {
  const overview = document.querySelector("#season-overview");
  const progress = document.querySelector("#season-progress");
  const leader = summary.currentLeader;
  const weak = summary.weakPlayerCandidate;

  progress.textContent = `每 ${summary.rules.season.gamesPerSeason} 次有效牌局结算；当前已完成 ${summary.validGames.length} 次。`;
  overview.innerHTML = [
    summaryCard("当前赛季", summary.season, "---弱鸡脱离战"),
    summaryCard("已完成局数/赛季结算局数", `${summary.validGames.length}/${summary.rules.season.gamesPerSeason}`, "只统计至少 6 人的有效牌局"),
    summaryCard("赛季奖励池", yuan.format(summary.seasonPool), `含聚餐基金剩余 ${yuan.format(summary.dinner.surplusToSeasonPool)}`),
    summaryCard("聚餐基金", yuan.format(summary.dinner.covered), `AA 超出 ${yuan.format(summary.dinner.shortfall)}`),
    summaryCard("当前第一", leader ? leader.playerName : "暂无", leader ? `${leader.totalPoints} 分` : "暂无有效积分"),
    summaryCard("弱鸡奖候选", weak ? weak.playerName : "暂无", weak ? `${weak.totalPoints} 分 · 出勤 ${weak.attendance}` : "需满足出勤和排名条件")
  ].join("");
}

function summaryCard(label, value, note) {
  return `
    <article class="summary-card">
      <div class="summary-label">${label}</div>
      <div class="summary-value">${value}</div>
      <div class="summary-note">${note}</div>
    </article>
  `;
}

function renderTopFour(summary) {
  const container = document.querySelector("#top-four");
  const topFour = summary.topPrizeStandings ?? [];

  if (topFour.length === 0) {
    container.innerHTML = '<p class="podium-empty">暂无领奖排名</p>';
    return;
  }

  container.innerHTML = topFour
    .map(
      (stats, index) => `
        <article class="top-card">
          <div class="top-rank">${index + 1}</div>
          ${playerLine(stats)}
          <div class="top-stats">
            <span>积分：<strong>${stats.totalPoints}</strong></span>
            <span>出勤：${stats.attendance} 次</span>
            <span>预计奖励：<span class="money">${yuan.format(stats.projectedSeasonReward)}</span></span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderWeakPlayerCandidate(summary) {
  const container = document.querySelector("#weak-player");
  const weak = summary.weakPlayerCandidate;

  if (!weak) {
    container.innerHTML = "<p>暂无符合条件的候选人。</p>";
    return;
  }

  container.innerHTML = `
    <div>
      <span class="meta-label">当前候选人</span>
      <strong>${weak.playerName}</strong>
    </div>
    <div><span class="meta-label">积分</span><strong>${weak.totalPoints}</strong></div>
    <div><span class="meta-label">出勤</span><strong>${weak.attendance}</strong></div>
    <div><span class="meta-label">累计复活</span><strong>${weak.totalRebuys}</strong></div>
  `;
}

function renderStandings(summary) {
  const tbody = document.querySelector("#standings-body");

  tbody.innerHTML = summary.standings
    .map(
      (stats) => `
        <tr>
          <td class="rank">#${stats.rank}</td>
          <td>${playerLine(stats)}</td>
          <td><strong>${stats.totalPoints}</strong></td>
          <td>${stats.attendance}</td>
          <td>${stats.totalRebuys}</td>
          <td>${yuan.format(stats.totalNightRewards)}</td>
          <td><span class="money">${yuan.format(stats.projectedSeasonReward)}</span></td>
        </tr>
      `
    )
    .join("");
}

function renderLatestGame(summary) {
  const latestGame = [...summary.validGames].sort((a, b) => b.date.localeCompare(a.date))[0];
  const meta = document.querySelector("#latest-game-meta");
  const tbody = document.querySelector("#latest-game-body");

  if (!latestGame) {
    meta.textContent = "暂无有效牌局";
    tbody.innerHTML = "";
    return;
  }

  meta.textContent = `${latestGame.title} · ${latestGame.date} · ${latestGame.participantCount} 人`;
  tbody.innerHTML = latestGame.rows
    .map(
      (row) => `
        <tr>
          <td class="rank">#${row.rank}</td>
          <td>${playerLine(row)}</td>
          <td>${row.finalChips}</td>
          <td>${row.rebuys}</td>
          <td>${row.basePoints}</td>
          <td>${row.chipBonusPoints}</td>
          <td>${row.rebuyPenaltyPoints}</td>
          <td><strong>${row.nightPoints}</strong></td>
          <td>${renderNightReward(row)}</td>
        </tr>
      `
    )
    .join("");
}

function renderNightReward(row) {
  if (row.nightReward <= 0) {
    return row.rank === 1 && row.rebuys > 0
      ? '<span class="tag warning">第一奖励顺延</span>'
      : yuan.format(0);
  }

  return `<span class="tag success">${yuan.format(row.nightReward)}</span>`;
}

function renderRules(rules) {
  const container = document.querySelector("#rules-list");

  container.innerHTML = `
    <article class="rule-card">
      <h3>牌局资金</h3>
      <ul>
        <li>每人每次缴纳 ${yuan.format(rules.money.buyInPerPlayer)}，至少 ${rules.money.minimumPlayers} 人有效。</li>
        <li>场地费 ${yuan.format(rules.money.venueFee)}，当晚奖励 ${yuan.format(rules.money.nightRewardTotal)}。</li>
        <li>每局固定 ${yuan.format(rules.money.seasonPoolPerGame)} 进入赛季奖励池。</li>
      </ul>
    </article>
    <article class="rule-card">
      <h3>当晚奖励</h3>
      <ul>
        <li>奖金为 ${rules.money.nightRewardPrizes.map((amount) => yuan.format(amount)).join(" / ")}。</li>
        <li>复活过的玩家不能领取当晚第一名奖励。</li>
        <li>第一名奖励顺延给筹码排名最高的未复活玩家。</li>
      </ul>
    </article>
    <article class="rule-card">
      <h3>积分</h3>
      <ul>
        <li>基础分：${rules.points.rankBasePoints.join(" / ")}，第 8 名及以后 ${rules.points.rankBasePointAfterSeventh} 分。</li>
        <li>超过 ${rules.chips.startingChips} 筹码后，每满 ${rules.chips.chipBonusStep} 加 1 分，最高 ${rules.chips.maxChipBonus} 分。</li>
        <li>复活扣分依次为 ${rules.chips.rebuyPenalties.join(" / ")}，第 4 次起每次 ${rules.chips.rebuyPenaltyAfterThird}。</li>
      </ul>
    </article>
    <article class="rule-card">
      <h3>赛季</h3>
      <ul>
        <li>每 ${rules.season.gamesPerSeason} 次有效牌局结算一个赛季。</li>
        <li>先拿出 ${yuan.format(rules.season.weakPrize)} 作为弱鸡鼓励奖。</li>
        <li>剩余按 ${rules.season.topFourPrizePercentages.map((value) => `${value * 100}%`).join(" / ")} 分给前四。</li>
      </ul>
    </article>
  `;
}

function playerLine(playerLike) {
  return `
    <span class="player-line">
      <img class="avatar" src="${playerLike.avatar}" alt="">
      <span class="player-name">${playerLike.playerName}</span>
    </span>
  `;
}

function renderError(error) {
  document.querySelector("main").innerHTML = `
    <section class="section">
      <div class="error">
        <strong>页面数据加载失败。</strong>
        <div>${error.message}</div>
        <div>如果直接双击打开 index.html，浏览器可能会拦截 fetch；请用本地静态服务器或部署到 GitHub Pages 查看。</div>
      </div>
    </section>
  `;
}
