# 德州朋友局 · 赛季积分榜

纯静态 GitHub Pages 项目，用 HTML、CSS 和原生 JavaScript 展示朋友德州扑克赛季积分榜。

## 文件结构

```text
poker-league/
├── index.html
├── styles.css
├── app.js
├── data/
│   ├── rules.json
│   ├── players.json
│   └── games.json
├── avatars/
│   └── default.svg
└── README.md
```

## 本地预览

因为页面通过 `fetch()` 读取 `data/*.json`，不建议直接双击打开 `index.html`。可以在项目目录启动一个静态服务器：

```bash
cd poker-league
python3 -m http.server 8080
```

然后打开：

```text
http://localhost:8080
```

## 如何记录新一局

打开 `data/games.json`，在数组末尾追加一个牌局对象：

```json
{
  "id": "game-005",
  "season": "2026-S1",
  "date": "2026-06-12",
  "title": "第五局",
  "dinnerCost": 380,
  "participants": [
    { "playerId": "alex", "finalChips": 2600, "rebuys": 0 },
    { "playerId": "ben", "finalChips": 2100, "rebuys": 1 },
    { "playerId": "chen", "finalChips": 1500, "rebuys": 0 },
    { "playerId": "david", "finalChips": 900, "rebuys": 2 },
    { "playerId": "eric", "finalChips": 600, "rebuys": 1 },
    { "playerId": "frank", "finalChips": 400, "rebuys": 0 }
  ]
}
```

字段说明：

- `id`：牌局唯一编号。
- `season`：所属赛季，要和 `data/rules.json` 里的 `season.current` 一致才会计入当前页面。
- `date`：牌局日期，格式建议为 `YYYY-MM-DD`。
- `title`：页面显示用标题。
- `dinnerCost`：本局实际聚餐费用。饮品费不计入。
- `participants`：本局参与者，至少 6 人才算有效牌局。
- `playerId`：对应 `data/players.json` 中的玩家 `id`。
- `finalChips`：本局最终筹码。
- `rebuys`：本局复活次数。
- `leftEarly`：可选；如果中途无故离场，写 `"leftEarly": true`，当晚积分记 0。

保存后刷新页面，排名、积分、当晚奖励、赛季奖励池、聚餐基金和弱鸡候选都会自动重算。

## 如何添加玩家

打开 `data/players.json`，追加：

```json
{
  "id": "new-player",
  "name": "新朋友",
  "avatar": "avatars/default.svg"
}
```

`id` 不要重复。之后在 `games.json` 里用这个 `id` 记录牌局即可。

## 计算口径

- 每人每次缴纳 150 元。
- 有效牌局至少 6 人。
- 每局先扣场地费 80 元、当晚奖励 300 元、固定赛季奖励池 100 元。
- 剩余金额作为本局聚餐基金。
- 如果聚餐基金不够，差额记录为 AA 超出金额。
- 如果聚餐基金有剩余，剩余金额汇入赛季奖励池。
- 当晚第一名奖励只给未复活玩家；如果真实筹码第一复活过，第一名奖励顺延给筹码排名最高的未复活玩家。
- 积分仍按真实筹码排名计算，不受奖励顺延影响。
- 赛季奖励池先拿出 20 元作为弱鸡鼓励奖，剩余金额按前四名 50%、25%、15%、10% 分配。
- 弱鸡奖候选：本赛季出勤不少于 3 次、未进前四、累计积分最低的玩家。

## 部署到 GitHub Pages

1. 把 `poker-league/` 目录提交到 GitHub 仓库。
2. 如果这个仓库只放这个页面，可以把 `poker-league/` 内的文件放到仓库根目录。
3. 在 GitHub 仓库进入 `Settings` → `Pages`。
4. `Build and deployment` 选择 `Deploy from a branch`。
5. 选择要部署的分支，例如 `main`，目录选择 `/root`。
6. 保存后等待 GitHub Pages 发布。

如果你想保留 `poker-league/` 子目录，也可以在仓库根目录放置这个目录，并在 Pages 设置中选择支持的发布目录；更常见的做法是把本项目文件直接放在仓库根目录。

## 后续视觉升级建议

第一阶段的结构有意把职责分开：

- `index.html`：页面区域和语义容器。
- `styles.css`：所有视觉样式。
- `app.js`：数据加载、计算、渲染逻辑。
- `data/*.json`：规则、玩家和牌局数据。

后续使用 Hallmark 做视觉升级时，优先只改 `index.html` 和 `styles.css`。如果不改变展示字段和元素 `id`，通常不需要动 `app.js` 的核心计算逻辑。
