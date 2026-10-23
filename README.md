# dsh-discord-bot

DSH Host plugin + Web client Settings 卡片：把 Discord 接上**安裝它的那台 DSH** 的 local chat session。

- 不使用遠端 DSH、不需要 `DSH_COOKIE`。
- 要讓 bot 跑在遠端 DSH，就把這個 plugin 裝在那台遠端 DSH。
- 內含 `discord-whale` 受限 preset（persona + compaction，沒有 shell／檔案工具）。
- 遠端 DSH 連線是另一個獨立 plugin `dsh-remote`，不是這個 plugin 的依賴。

## 為什麼不能直接 `dsh plugin add` 原始碼？

DSH 載入的是 package 的 `main`（`./lib/index.js`）與 `dsh.bundle.patch` 指到的檔案。
這個 repo 的 `lib/` 是 TypeScript 編譯產物且被 gitignore；DSH 不會幫 plugin 執行 `tsc`，所以直接安裝 source checkout 會缺少入口檔。

`npm run pack:discord-bot` 會在 `prepack` 自動做：

- `tsc` → `lib/`
- 從 `persona/character.md` 重新產生 `presets/discord-whale.patch.yml`

tarball 內已含 `lib/`、`client/`、`cordis.patch.yml`、`presets/`，所以目標 DSH 不需要 Node build。

## 安裝（建議：打包後安裝）

```bash
# 在 repo 根目錄
npm run pack:discord-bot
# 產物：packs/local-dsh-discord-bot-0.2.4.tgz

# 複製 tarball 到目標 DSH 後：
dsh plugin --profile web add /absolute/path/to/packs/local-dsh-discord-bot-0.2.4.tgz
```

安裝後 DSH profile 會多出：

- host row `discord-bot`
- `discord-whale` agent preset
- `@local/dsh-discord-bot` dependency

## 開發模式（從 source 直接 link）

只有開發時才需要：

```bash
npm run build --workspace @local/dsh-discord-bot
npm run build:preset --workspace @local/dsh-discord-bot
dsh plugin --profile web add link:/absolute/path/to/plugins/discord-bot
```

`link:` 會直接使用 source 目錄的 `lib/`；改程式後要重跑 `npm run build`。`build:preset` 只在改 `persona/character.md` 後需要。

> 如果之前裝過舊的外部 bridge preset bundle（`discord-bot-on-dsh-preset`），先把它從 profile 的 `dsh.profile.bundles` 移除，避免兩個 bundle 同時宣告 `discord-whale`。

## 設定

安裝並重啟 DSH 後，Settings 會多一個 **Discord Bot** section，不需要手改 profile YAML。

卡片欄位：

| 欄位 | 說明 |
|---|---|
| Bot Token | 存進 DSH credentials 的 `DISCORD_TOKEN`，不會寫入 profile |
| Guild IDs | 每行一個或逗號分隔；空值 fail closed |
| Channel IDs | 允許回覆的頻道 |
| Owner User ID | 保留給 owner-only 功能，可留空 |
| Provider | 例如 `dsh-opencode-go`、`deepseek-official` |
| Model | 例如 `deepseek-v4.1-flash` |
| Reasoning Effort | 預設／off／low／high／max |
| Agent Preset | 預設 `discord-whale` |
| Reply Timeout | 5000–600000 ms |
| Log Level | debug／info／warn／error |

- 非秘密設定透過 DSH settings 寫回 profile patch；卡片是主要設定方式。
- `DISCORD_TOKEN` 只存 credentials；若 credentials 沒有值，host 仍會 fallback 到 process env。
- 模型欄位留空 = 使用 DSH 預設模型；有填 provider + model 時，backend 會在每次 prompt 前呼叫 `sessionController.selectModel`。
- Token 或設定變更後若 DSH 沒有自動 reload plugin，重啟 DSH 讓 Discord 重新連線。
- 不要把 token 放進 `cordis.patch.yml` 或版本庫。

進階／fallback 才需要手動覆寫：

```yaml
- id: discord-bot
  config:
    guildIds: ['111111111111111111']
    channelIds: ['222222222222222222']
    provider: dsh-opencode-go
    model: deepseek-v4.1-flash
    reasoningEffort: low
```

## 運作方式

```text
Discord Gateway
   → 白名單／@ 或回覆判斷
   → 每頻道一個 local DSH session（discord-whale）
   → sessionController.prompt()
   → ctx.on('session/event') 收集 assistant/message、turn/end
   → 回覆發回 Discord
```

- session mapping：`~/.dsh/discord-bot/sessions.json`
- session cwd：`~/.dsh/discord-bot/agents`
- 非 tag 訊息仍送進 DSH（`[僅記錄]`），但回覆在階段一丟棄。
- `DSH session not-found` 會重建一次；逾時會 `sessionController.cancel`。

## 測試

```bash
npm run typecheck --workspace @local/dsh-discord-bot
npm test --workspace @local/dsh-discord-bot
```

涵蓋：訊息正規化、白名單／觸發、2000 字拆分、allowedMentions、local session backend（建立、佇列、timeout、not-found 重建、model selection）。

## 尚未 live 驗證

- `ctx.sessionController` 從 Host plugin row 直接建立 preset session
- `ctx.on('session/event')` 的 turn 配對
- `ctx.configForms` 卡片與 volatile Config 的即時寫入
- DSH credentials 的 `DISCORD_TOKEN`
- `dsh plugin add` 後的 profile 載入與重啟
