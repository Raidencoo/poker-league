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

let selectedGameHistoryIndex = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    const data = await loadData();
    const seasonSummary = calculateSeasonSummary(data.rules, data.players, data.games);

    renderSeasonSummary(seasonSummary);
    renderSeasonDynamics(seasonSummary);
    renderHonorWall(seasonSummary);
    renderTopFour(seasonSummary);
    renderStandings(seasonSummary);
    renderLatestGame(seasonSummary);
    renderRules(data.rules);
    setupPlayerProfileInteractions(seasonSummary);
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
      : rawPoints;

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

function getGameDateValue(game) {
  const match = String(game.date).match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  );

  if (!match) {
    return 0;
  }

  const [, year, month, day, hour = 0, minute = 0, second = 0] = match.map((value) =>
    Number(value ?? 0)
  );
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

function compareGamesByDateThenInputOrder(a, b) {
  return (
    getGameDateValue(a) - getGameDateValue(b) ||
    (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0)
  );
}

function getLatestGame(games) {
  return [...games].sort(compareGamesByDateThenInputOrder).at(-1) ?? null;
}

function getGameHistory(games) {
  return [...games].sort(compareGamesByDateThenInputOrder);
}

function clampGameHistoryIndex(index, games) {
  if (games.length === 0) {
    return 0;
  }

  return Math.max(0, Math.min(index, games.length - 1));
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
  const positiveNetChips = Math.max(0, finalChips);
  const bonus = Math.floor(positiveNetChips / rules.chips.chipBonusStep);
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
      venueFee: 0,
      baseDinnerFund: 0,
      dinnerCoveredByFund: 0,
      dinnerShortfall: 0,
      dinnerSurplusToSeasonPool: 0,
      seasonPoolContribution: 0
    };
  }

  const buyInTotal = game.participants.length * rules.money.buyInPerPlayer;
  const venueFee = getGameVenueFee(game, rules);
  const baseDinnerFund =
    buyInTotal -
    venueFee -
    rules.money.nightRewardTotal -
    rules.money.seasonPoolPerGame;
  const dinnerCost = game.dinnerCost ?? 0;
  const dinnerCoveredByFund = Math.min(baseDinnerFund, dinnerCost);
  const dinnerShortfall = Math.max(0, dinnerCost - baseDinnerFund);
  const dinnerSurplusToSeasonPool = Math.max(0, baseDinnerFund - dinnerCost);
  const seasonPoolContribution = rules.money.seasonPoolPerGame + dinnerSurplusToSeasonPool;

  return {
    buyInTotal,
    venueFee,
    baseDinnerFund,
    dinnerCoveredByFund,
    dinnerShortfall,
    dinnerSurplusToSeasonPool,
    seasonPoolContribution
  };
}

function getGameVenueFee(game, rules) {
  return game.venueFee ?? rules.money.venueFee;
}

function calculateSeasonSummary(rules, players, games) {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const season = rules.season.current;
  const seasonGames = games
    .map((game, sourceIndex) => ({ game, sourceIndex }))
    .filter(({ game }) => game.season === season)
    .map(({ game, sourceIndex }) => ({
      ...calculateGameResult(game, playersById, rules),
      sourceIndex
    }))
    .sort(compareGamesByDateThenInputOrder);
  const validGames = seasonGames.filter((game) => game.isValid);
  const standings = calculateStandingsForGames(players, validGames);

  const seasonPool = validGames.reduce(
    (total, game) => total + game.finance.seasonPoolContribution,
    0
  );
  const hasValidGames = validGames.length > 0;
  const topPrizeStandings = hasValidGames ? standings.slice(0, 4) : [];
  const weakPlayerCandidate = calculateWeakPlayerCandidate(standings, rules);
  const seasonRewards = calculateSeasonRewards(topPrizeStandings, seasonPool, rules, weakPlayerCandidate);

  for (const stats of standings) {
    stats.projectedSeasonReward = seasonRewards.get(stats.playerId) ?? 0;
  }

  const dinner = validGames.reduce(
    (totals, game) => {
      totals.venueFee += game.finance.venueFee;
      totals.baseFund += game.finance.baseDinnerFund;
      totals.covered += game.finance.dinnerCoveredByFund;
      totals.shortfall += game.finance.dinnerShortfall;
      totals.surplusToSeasonPool += game.finance.dinnerSurplusToSeasonPool;
      return totals;
    },
    { venueFee: 0, baseFund: 0, covered: 0, shortfall: 0, surplusToSeasonPool: 0 }
  );
  const latestGame = getLatestGame(validGames);
  const previousStandings = validGames.length > 1
    ? calculateStandingsForGames(players, validGames.slice(0, -1))
    : [];
  const rankMovements = calculateRankMovements(standings, previousStandings, latestGame);
  const latestHighlights = calculateLatestGameHighlights(latestGame, rankMovements);
  const weakDangerZone = calculateWeakDangerZone(standings, rules);
  const playerProfiles = calculatePlayerProfiles(standings, validGames);
  const seasonHonors = calculateSeasonHonors(standings, validGames, playerProfiles);
  const latestGameStory = calculateGameStory(latestGame);

  return {
    rules,
    season,
    games: seasonGames,
    validGames,
    standings,
    topPrizeStandings,
    seasonPool,
    dinner,
    rankMovements,
    latestHighlights,
    weakDangerZone,
    playerProfiles,
    seasonHonors,
    latestGameStory,
    weakPlayerCandidate,
    currentLeader: hasValidGames ? standings[0] : null
  };
}

function calculateStandingsForGames(players, games) {
  const playerStats = initializePlayerStats(players);

  for (const game of games) {
    applyGameRowsToPlayerStats(playerStats, game);
  }

  return rankStandings(playerStats);
}

function applyGameRowsToPlayerStats(playerStats, game) {
  for (const row of game.rows) {
    const stats = playerStats.get(row.playerId);

    if (!stats) continue;

    stats.totalPoints += row.nightPoints;
    stats.attendance += 1;
    stats.totalRebuys += row.rebuys;
    stats.totalNightRewards += row.nightReward;
    stats.latestRank = row.rank;
  }
}

function rankStandings(playerStats) {
  const standings = [...playerStats.values()].sort(compareStandings);
  standings.forEach((stats, index) => {
    stats.rank = index + 1;
  });
  return standings;
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
  return getWeakEligibleStandings(standings, rules)[0] ?? null;
}

function getWeakEligibleStandings(standings, rules) {
  return standings
    .filter(
      (stats) =>
        stats.rank > 4 &&
        stats.attendance >= rules.season.weakPrizeMinimumAttendance
    )
    .sort(compareWeakRisk);
}

function compareWeakRisk(a, b) {
  return (
    a.totalPoints - b.totalPoints ||
    b.attendance - a.attendance ||
    b.totalRebuys - a.totalRebuys ||
    a.playerName.localeCompare(b.playerName, "zh-CN")
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

function calculateRankMovements(currentStandings, previousStandings, latestGame) {
  if (!latestGame) {
    return [];
  }

  const previousById = new Map(previousStandings.map((stats) => [stats.playerId, stats]));
  const latestRowsById = new Map(latestGame.rows.map((row) => [row.playerId, row]));

  return currentStandings
    .map((stats) => {
      const previous = previousById.get(stats.playerId);
      const latestRow = latestRowsById.get(stats.playerId);
      const previousRank = previous?.rank ?? null;
      const rankChange = previousRank === null ? null : previousRank - stats.rank;

      return {
        ...stats,
        previousRank,
        rankChange,
        playedLatest: Boolean(latestRow),
        latestGamePoints: latestRow?.nightPoints ?? 0,
        latestGameRank: latestRow?.rank ?? null,
        latestGameRebuys: latestRow?.rebuys ?? 0
      };
    })
    .sort(compareRankMovement);
}

function compareRankMovement(a, b) {
  return (
    Number(b.playedLatest) - Number(a.playedLatest) ||
    Math.abs(b.rankChange ?? 0) - Math.abs(a.rankChange ?? 0) ||
    (b.latestGamePoints ?? 0) - (a.latestGamePoints ?? 0) ||
    a.rank - b.rank
  );
}

function calculateLatestGameHighlights(latestGame, rankMovements) {
  if (!latestGame) {
    return [];
  }

  const rows = [...latestGame.rows];
  const highestScore = rows.sort(
    (a, b) => b.nightPoints - a.nightPoints || a.rank - b.rank
  )[0];
  const biggestClimb = rankMovements
    .filter((movement) => movement.playedLatest && movement.rankChange > 0)
    .sort((a, b) => b.rankChange - a.rankChange || a.rank - b.rank)[0];
  const mostRebuys = [...latestGame.rows].sort(
    (a, b) => b.rebuys - a.rebuys || a.rank - b.rank
  )[0];
  const topReward = [...latestGame.rows].sort(
    (a, b) => b.nightReward - a.nightReward || a.rank - b.rank
  )[0];

  return [
    {
      label: "最大上升",
      value: biggestClimb ? `${biggestClimb.playerName} ↑${biggestClimb.rankChange}` : "暂无上升",
      note: biggestClimb ? `当前第 ${biggestClimb.rank} · 本局 ${formatSignedNumber(biggestClimb.latestGamePoints)} 分` : "这一局排名很稳"
    },
    {
      label: "单局最高分",
      value: highestScore ? `${highestScore.playerName} ${formatSignedNumber(highestScore.nightPoints)}` : "暂无",
      note: highestScore ? `筹码净值 ${highestScore.finalChips} · 第 ${highestScore.rank} 名` : "等待有效牌局"
    },
    {
      label: "复活最多",
      value: mostRebuys ? `${mostRebuys.playerName} ${mostRebuys.rebuys} 次` : "暂无",
      note: mostRebuys?.rebuys > 0 ? `本局积分 ${formatSignedNumber(mostRebuys.nightPoints)}` : "本局没人复活"
    },
    {
      label: "奖金收割",
      value: topReward && topReward.nightReward > 0 ? `${topReward.playerName} ${yuan.format(topReward.nightReward)}` : "暂无奖金",
      note: topReward && topReward.nightReward > 0 ? `当晚奖励最高` : "等待有效奖励"
    }
  ];
}

function calculateWeakDangerZone(standings, rules) {
  const minimumAttendance = rules.season.weakPrizeMinimumAttendance;
  const eligible = getWeakEligibleStandings(standings, rules);
  const candidate = eligible[0] ?? null;
  const nextCandidate = eligible[1] ?? null;
  const closestPending = standings
    .filter((stats) => stats.rank > 4 && stats.attendance < minimumAttendance)
    .sort(
      (a, b) =>
        b.attendance - a.attendance ||
        a.totalPoints - b.totalPoints ||
        b.totalRebuys - a.totalRebuys ||
        a.playerName.localeCompare(b.playerName, "zh-CN")
    )
    .slice(0, 3);
  const escapePointsNeeded = candidate && nextCandidate
    ? Math.max(1, nextCandidate.totalPoints - candidate.totalPoints + 1)
    : null;

  return {
    candidate,
    watchList: eligible.slice(0, 3),
    closestPending,
    minimumAttendance,
    escapePointsNeeded,
    prize: rules.season.weakPrize
  };
}

function calculatePlayerProfiles(standings, validGames) {
  const profiles = new Map(
    standings.map((stats) => [
      stats.playerId,
      {
        ...stats,
        games: [],
        bestGame: null,
        worstGame: null,
        bestRank: null,
        averagePoints: 0,
        noRebuyGames: 0,
        rewardGames: 0
      }
    ])
  );

  for (const game of validGames) {
    for (const row of game.rows) {
      const profile = profiles.get(row.playerId);

      if (!profile) continue;

      const gameEntry = {
        gameId: game.id,
        gameTitle: game.title,
        gameDate: game.date,
        rank: row.rank,
        nightPoints: row.nightPoints,
        finalChips: row.finalChips,
        rebuys: row.rebuys,
        nightReward: row.nightReward
      };

      profile.games.push(gameEntry);
      profile.noRebuyGames += row.rebuys === 0 ? 1 : 0;
      profile.rewardGames += row.nightReward > 0 ? 1 : 0;
      profile.bestRank = profile.bestRank === null ? row.rank : Math.min(profile.bestRank, row.rank);
      profile.bestGame = chooseBetterGame(profile.bestGame, gameEntry);
      profile.worstGame = chooseWorseGame(profile.worstGame, gameEntry);
    }
  }

  for (const profile of profiles.values()) {
    profile.averagePoints = profile.attendance > 0
      ? profile.totalPoints / profile.attendance
      : 0;
  }

  return profiles;
}

function chooseBetterGame(current, next) {
  if (!current) return next;
  return next.nightPoints > current.nightPoints ||
    (next.nightPoints === current.nightPoints && next.rank < current.rank)
    ? next
    : current;
}

function chooseWorseGame(current, next) {
  if (!current) return next;
  return next.nightPoints < current.nightPoints ||
    (next.nightPoints === current.nightPoints && next.rank > current.rank)
    ? next
    : current;
}

function calculateSeasonHonors(standings, validGames, playerProfiles) {
  if (validGames.length === 0) {
    return [];
  }

  const allRows = validGames.flatMap((game) =>
    game.rows.map((row) => ({ ...row, gameTitle: game.title, gameDate: game.date }))
  );
  const bestScore = [...allRows].sort(
    (a, b) => b.nightPoints - a.nightPoints || a.rank - b.rank
  )[0];
  const biggestStack = [...allRows].sort(
    (a, b) => b.finalChips - a.finalChips || a.rank - b.rank
  )[0];
  const rebuyKing = [...standings].filter((stats) => stats.attendance > 0).sort(
    (a, b) => b.totalRebuys - a.totalRebuys || a.rank - b.rank
  )[0];
  const attendanceKing = [...standings].filter((stats) => stats.attendance > 0).sort(
    (a, b) => b.attendance - a.attendance || a.rank - b.rank
  )[0];
  const prizeCollector = [...standings].filter((stats) => stats.attendance > 0).sort(
    (a, b) => b.totalNightRewards - a.totalNightRewards || a.rank - b.rank
  )[0];
  const cleanPlayer = [...playerProfiles.values()].filter((profile) => profile.attendance > 0).sort(
    (a, b) => a.totalRebuys - b.totalRebuys || b.totalPoints - a.totalPoints || a.rank - b.rank
  )[0];

  return [
    createHonor("单局最高分", bestScore, `${formatSignedNumber(bestScore.nightPoints)} 分`, `${bestScore.gameTitle} · 第 ${bestScore.rank} 名`),
    createHonor("最大筹码净值", biggestStack, `${formatSignedNumber(biggestStack.finalChips)}`, `${biggestStack.gameTitle} · 筹码净值`),
    createHonor("复活王", rebuyKing, `${rebuyKing.totalRebuys} 次`, `出勤 ${rebuyKing.attendance} 次`),
    createHonor("全勤担当", attendanceKing, `${attendanceKing.attendance}/${validGames.length}`, "人可以输，局不能缺"),
    createHonor("奖金收割机", prizeCollector, yuan.format(prizeCollector.totalNightRewards), `领奖 ${playerProfiles.get(prizeCollector.playerId)?.rewardGames ?? 0} 次`),
    createHonor("无复活战神", cleanPlayer, `${cleanPlayer.totalRebuys} 次复活`, `总积分 ${cleanPlayer.totalPoints}`)
  ];
}

function createHonor(label, playerLike, value, note) {
  return {
    label,
    player: playerLike,
    value,
    note
  };
}

function calculateGameStory(game) {
  if (!game) {
    return null;
  }

  const chipLeader = game.rows[0] ?? null;
  const topScorer = [...game.rows].sort(
    (a, b) => b.nightPoints - a.nightPoints || a.rank - b.rank
  )[0] ?? null;
  const rebuyLeader = [...game.rows].sort(
    (a, b) => b.rebuys - a.rebuys || a.rank - b.rank
  )[0] ?? null;
  const topReward = [...game.rows].sort(
    (a, b) => b.nightReward - a.nightReward || a.rank - b.rank
  )[0] ?? null;
  const firstRewardShifted = Boolean(
    chipLeader &&
    topReward &&
    chipLeader.playerId !== topReward.playerId &&
    chipLeader.rebuys > 0 &&
    topReward.nightReward > 0
  );

  return {
    game,
    chipLeader,
    topScorer,
    rebuyLeader,
    topReward,
    firstRewardShifted,
    seasonPoolContribution: game.finance.seasonPoolContribution,
    dinnerShortfall: game.finance.dinnerShortfall,
    dinnerSurplusToSeasonPool: game.finance.dinnerSurplusToSeasonPool
  };
}

function renderSeasonSummary(summary) {
  const overview = document.querySelector("#season-overview");
  const progress = document.querySelector("#season-progress");
  const leader = summary.currentLeader;
  const weak = summary.weakPlayerCandidate;
  const completedGames = summary.validGames.length;
  const gamesPerSeason = summary.rules.season.gamesPerSeason;
  const seasonProgress = gamesPerSeason > 0
    ? Math.min(100, Math.round((completedGames / gamesPerSeason) * 100))
    : 0;

  progress.textContent = `每 ${gamesPerSeason} 次有效牌局结算；当前已完成 ${completedGames} 次。`;
  overview.innerHTML = [
    summaryCard("当前赛季", summary.season, "弱鸡脱离战", {
      icon: "icons/calendar-days.svg",
      variant: "season"
    }),
    summaryCard("已完成局数", `${completedGames}/${gamesPerSeason}`, "只统计至少 6 人的有效牌局", {
      icon: "icons/flag.svg",
      variant: "progress",
      progress: seasonProgress,
      progressLabel: `赛季进度 ${seasonProgress}%`
    }),
    summaryCard("赛季奖励池", yuan.format(summary.seasonPool), `含聚餐基金剩余 ${yuan.format(summary.dinner.surplusToSeasonPool)}`, {
      icon: "icons/circle-dollar-sign.svg",
      variant: "reward"
    }),
    summaryCard("已用聚餐基金", yuan.format(summary.dinner.covered), `场地费 ${yuan.format(summary.dinner.venueFee)} · AA 超出 ${yuan.format(summary.dinner.shortfall)}`, {
      icon: "icons/utensils.svg",
      variant: "dinner"
    }),
    summaryCard("当前第一", leader ? leader.playerName : "暂无", leader ? `${leader.totalPoints} 分` : "暂无有效积分", {
      icon: "icons/crown.svg",
      variant: "leader"
    }),
    summaryCard("弱鸡奖候选", weak ? weak.playerName : "暂无", weak ? `${weak.totalPoints} 分 · 出勤 ${weak.attendance}` : "需满足出勤和排名条件", {
      icon: "icons/triangle-alert.svg",
      variant: "risk"
    })
  ].join("");
}

function summaryCard(label, value, note, options = {}) {
  const progress = Number.isFinite(options.progress)
    ? Math.max(0, Math.min(100, options.progress))
    : null;
  const progressHtml = progress === null
    ? ""
    : `
      <div class="summary-progress" aria-hidden="true">
        <span style="width: ${progress}%"></span>
      </div>
      <div class="summary-progress-label">${escapeHtml(options.progressLabel ?? `${progress}%`)}</div>
    `;

  return `
    <article class="summary-card summary-card-${options.variant ?? "default"}">
      <div class="summary-head">
        <img class="summary-icon" src="${options.icon ?? "icons/flag.svg"}" alt="">
        <div class="summary-label">${escapeHtml(label)}</div>
      </div>
      <div class="summary-value">${escapeHtml(value)}</div>
      <div class="summary-note">${escapeHtml(note)}</div>
      ${progressHtml}
    </article>
  `;
}

function renderSeasonDynamics(summary) {
  renderRankMovements(summary);
  renderLatestHighlights(summary);
  renderWeakDangerZone(summary);
}

function renderRankMovements(summary) {
  const meta = document.querySelector("#rank-movement-meta");
  const container = document.querySelector("#rank-movements");
  const latestGame = getLatestGame(summary.validGames);

  if (!latestGame) {
    meta.textContent = "暂无有效牌局";
    container.innerHTML = '<p class="empty-state">打完第一局，这里就开始记仇。</p>';
    return;
  }

  meta.textContent = `${latestGame.title} 后的排名变化`;
  container.innerHTML = summary.rankMovements
    .slice(0, 6)
    .map((movement) => {
      const direction = getRankMovementDirection(movement);
      return `
        <div class="movement-row ${direction}">
          <span class="movement-badge">${formatRankMovement(movement)}</span>
          <div class="movement-player">
            ${playerLine(movement)}
            <span>本局 ${formatSignedNumber(movement.latestGamePoints)} 分 · 当前第 ${movement.rank}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderLatestHighlights(summary) {
  const container = document.querySelector("#latest-highlights");

  if (summary.latestHighlights.length === 0) {
    container.innerHTML = '<p class="empty-state">暂无本局高光。</p>';
    return;
  }

  container.innerHTML = summary.latestHighlights
    .map(
      (item) => `
        <div class="highlight-row">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
          <small>${item.note}</small>
        </div>
      `
    )
    .join("");
}

function renderWeakDangerZone(summary) {
  const container = document.querySelector("#weak-danger-zone");
  const danger = summary.weakDangerZone;

  if (!danger?.candidate) {
    container.innerHTML = `
      <p class="empty-state">暂无符合条件的候选人。</p>
      ${renderPendingDangerPlayers(danger)}
    `;
    return;
  }

  const candidate = danger.candidate;
  const escapeText = danger.escapePointsNeeded
    ? `还差 ${danger.escapePointsNeeded} 分脱离危险`
    : "暂时无人垫背，先稳住";

  container.innerHTML = `
    <div class="danger-hero">
      <span class="meta-label">当前危险人物</span>
      ${playerLine(candidate)}
      <strong>${candidate.totalPoints} 分</strong>
      <p>${escapeText} · 奖金 ${yuan.format(danger.prize)}</p>
    </div>
    <div class="danger-metrics">
      <div><span>出勤</span><strong>${candidate.attendance}/${danger.minimumAttendance}</strong></div>
      <div><span>复活</span><strong>${candidate.totalRebuys}</strong></div>
      <div><span>排名</span><strong>#${candidate.rank}</strong></div>
    </div>
    ${renderWeakWatchList(danger.watchList)}
  `;
}

function renderPendingDangerPlayers(danger) {
  if (!danger?.closestPending?.length) {
    return "";
  }

  return `
    <div class="watch-list">
      <span class="meta-label">差出勤的观察名单</span>
      ${danger.closestPending
        .map(
          (stats) => `
            <div class="watch-row">
              <span>${stats.playerName}</span>
              <strong>${stats.attendance}/${danger.minimumAttendance}</strong>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderWeakWatchList(watchList) {
  if (!watchList.length) {
    return "";
  }

  return `
    <div class="watch-list">
      <span class="meta-label">危险观察</span>
      ${watchList
        .map(
          (stats) => `
            <div class="watch-row">
              <span>${stats.playerName}</span>
              <strong>${stats.totalPoints} 分</strong>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderHonorWall(summary) {
  const container = document.querySelector("#honor-wall");

  if (summary.seasonHonors.length === 0) {
    container.innerHTML = '<p class="podium-empty">暂无赛季荣誉，先开一局。</p>';
    return;
  }

  container.innerHTML = summary.seasonHonors
    .map(
      (honor) => `
        <article class="honor-card">
          <span class="meta-label">${honor.label}</span>
          ${playerLine(honor.player)}
          <strong>${honor.value}</strong>
          <p>${honor.note}</p>
        </article>
      `
    )
    .join("");
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
  const games = getGameHistory(summary.validGames);
  const meta = document.querySelector("#latest-game-meta");
  const tbody = document.querySelector("#latest-game-body");
  const previousButton = document.querySelector("#previous-game");
  const nextButton = document.querySelector("#next-game");
  const position = document.querySelector("#latest-game-position");

  if (games.length === 0) {
    meta.textContent = "暂无有效牌局";
    position.textContent = "0 / 0";
    previousButton.disabled = true;
    nextButton.disabled = true;
    renderGameStory(null);
    tbody.innerHTML = "";
    return;
  }

  if (selectedGameHistoryIndex === null || selectedGameHistoryIndex >= games.length) {
    selectedGameHistoryIndex = games.length - 1;
  }

  selectedGameHistoryIndex = clampGameHistoryIndex(selectedGameHistoryIndex, games);

  const selectedGame = games[selectedGameHistoryIndex];
  const canGoPrevious = selectedGameHistoryIndex > 0;
  const canGoNext = selectedGameHistoryIndex < games.length - 1;

  meta.textContent = `${selectedGame.title} · ${selectedGame.date} · ${selectedGame.participantCount} 人 · 场地 ${yuan.format(selectedGame.finance.venueFee)}`;
  position.textContent = `${selectedGameHistoryIndex + 1} / ${games.length}`;
  previousButton.disabled = !canGoPrevious;
  nextButton.disabled = !canGoNext;
  previousButton.onclick = () => {
    selectedGameHistoryIndex = clampGameHistoryIndex(selectedGameHistoryIndex - 1, games);
    renderLatestGame(summary);
  };
  nextButton.onclick = () => {
    selectedGameHistoryIndex = clampGameHistoryIndex(selectedGameHistoryIndex + 1, games);
    renderLatestGame(summary);
  };
  renderGameStory(calculateGameStory(selectedGame));

  tbody.innerHTML = selectedGame.rows
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

function renderGameStory(story) {
  const container = document.querySelector("#game-story");

  if (!story) {
    container.innerHTML = '<p class="empty-state">暂无单局故事。</p>';
    return;
  }

  const shiftedText = story.firstRewardShifted
    ? `筹码第一 ${story.chipLeader.playerName} 复活过，第一奖励顺延给 ${story.topReward.playerName}。`
    : `${story.topReward.playerName} 收下本局最高奖励 ${yuan.format(story.topReward.nightReward)}。`;
  const dinnerText = story.dinnerShortfall > 0
    ? `聚餐基金不够，AA 超出 ${yuan.format(story.dinnerShortfall)}。`
    : `聚餐剩余 ${yuan.format(story.dinnerSurplusToSeasonPool)} 汇入赛季池。`;

  container.innerHTML = `
    <article class="story-card">
      <div class="story-main">
        <span class="meta-label">单局战报故事卡</span>
        <h3>${story.game.title}</h3>
        <p>
          ${story.chipLeader.playerName} 以 ${formatSignedNumber(story.chipLeader.finalChips)} 筹码净值拿下筹码第一；
          ${story.topScorer.playerName} 本局最高 ${formatSignedNumber(story.topScorer.nightPoints)} 分。
        </p>
      </div>
      <div class="story-facts">
        <div><span>奖金线</span><strong>${shiftedText}</strong></div>
        <div><span>赛季池</span><strong>本局增加 ${yuan.format(story.seasonPoolContribution)}</strong></div>
        <div><span>聚餐账</span><strong>${dinnerText}</strong></div>
        <div><span>复活镜头</span><strong>${story.rebuyLeader.playerName} ${story.rebuyLeader.rebuys} 次</strong></div>
      </div>
    </article>
  `;
}

function renderNightReward(row) {
  if (row.nightReward <= 0) {
    return row.rank === 1 && row.rebuys > 0
      ? '<span class="tag warning">第一奖励顺延</span>'
      : yuan.format(0);
  }

  return `<span class="tag success">${yuan.format(row.nightReward)}</span>`;
}

function getRankMovementDirection(movement) {
  if (movement.previousRank === null) return "new";
  if (movement.rankChange > 0) return "up";
  if (movement.rankChange < 0) return "down";
  return "same";
}

function formatRankMovement(movement) {
  if (movement.previousRank === null) return "初";
  if (movement.rankChange > 0) return `↑${movement.rankChange}`;
  if (movement.rankChange < 0) return `↓${Math.abs(movement.rankChange)}`;
  return "→";
}

function formatSignedNumber(value) {
  return value > 0 ? `+${value}` : String(value);
}

function renderRules(rules) {
  const container = document.querySelector("#rules-list");

  container.innerHTML = `
    <article class="rule-card">
      <h3>牌局资金</h3>
      <ul>
        <li>每人每次缴纳 ${yuan.format(rules.money.buyInPerPlayer)}，至少 ${rules.money.minimumPlayers} 人有效。</li>
        <li>默认场地费 ${yuan.format(rules.money.venueFee)}，可在每局记录中覆盖；当晚奖励 ${yuan.format(rules.money.nightRewardTotal)}。</li>
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
        <li>筹码净值为正时，每满 ${rules.chips.chipBonusStep} 加 1 分，最高 ${rules.chips.maxChipBonus} 分。</li>
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
    <button class="player-line player-button" type="button" data-player-id="${escapeHtml(playerLike.playerId)}">
      <img class="avatar" src="${playerLike.avatar}" alt="">
      <span class="player-name">${escapeHtml(playerLike.playerName)}</span>
    </button>
  `;
}

function setupPlayerProfileInteractions(summary) {
  const shell = document.querySelector("#player-profile");
  const content = document.querySelector("#profile-content");

  document.addEventListener("click", (event) => {
    const closeTarget = event.target.closest?.("[data-profile-close]");

    if (closeTarget) {
      closePlayerProfile(shell);
      return;
    }

    const trigger = event.target.closest?.("[data-player-id]");

    if (!trigger) return;

    const profile = summary.playerProfiles.get(trigger.dataset.playerId);

    if (!profile) return;

    content.innerHTML = renderPlayerProfile(profile);
    shell.hidden = false;
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !shell.hidden) {
      closePlayerProfile(shell);
    }
  });
}

function closePlayerProfile(shell) {
  shell.hidden = true;
}

function renderPlayerProfile(profile) {
  const recentGames = [...profile.games].slice(-4).reverse();
  const bestGameText = profile.bestGame
    ? `${profile.bestGame.gameTitle} · ${formatSignedNumber(profile.bestGame.nightPoints)} 分`
    : "暂无";
  const worstGameText = profile.worstGame
    ? `${profile.worstGame.gameTitle} · ${formatSignedNumber(profile.worstGame.nightPoints)} 分`
    : "暂无";

  return `
    <div class="profile-hero">
      <img class="profile-avatar" src="${profile.avatar}" alt="">
      <div>
        <span class="meta-label">玩家档案卡</span>
        <h2 id="profile-title">${escapeHtml(profile.playerName)}</h2>
        <p>#${profile.rank} · ${profile.totalPoints} 分 · 预计奖励 ${yuan.format(profile.projectedSeasonReward)}</p>
      </div>
    </div>
    <div class="profile-stats">
      <div><span>出勤</span><strong>${profile.attendance}</strong></div>
      <div><span>累计复活</span><strong>${profile.totalRebuys}</strong></div>
      <div><span>平均积分</span><strong>${formatDecimal(profile.averagePoints)}</strong></div>
      <div><span>领奖次数</span><strong>${profile.rewardGames}</strong></div>
    </div>
    <div class="profile-splits">
      <div>
        <span class="meta-label">代表作</span>
        <strong>${bestGameText}</strong>
      </div>
      <div>
        <span class="meta-label">低谷局</span>
        <strong>${worstGameText}</strong>
      </div>
      <div>
        <span class="meta-label">无复活局</span>
        <strong>${profile.noRebuyGames} 次</strong>
      </div>
    </div>
    <div class="profile-games">
      <span class="meta-label">最近记录</span>
      ${
        recentGames.length
          ? recentGames
              .map(
                (game) => `
                  <div class="profile-game-row">
                    <span>${game.gameTitle}</span>
                    <strong>${formatSignedNumber(game.nightPoints)} 分</strong>
                    <small>#${game.rank} · 复活 ${game.rebuys}</small>
                  </div>
                `
              )
              .join("")
          : '<p class="empty-state">还没有有效出勤。</p>'
      }
    </div>
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDecimal(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
