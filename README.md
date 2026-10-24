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
# 產物：packs/local-dsh-discord-bot-0.4.1.tgz

# 複製 tarball 到目標 DSH 後：
dsh plugin --profile web add /absolute/path/to/packs/local-dsh-discord-bot-0.4.1.tgz
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
| Provider | 從 DSH model catalog 讀取的下拉選單（`deepseek-official`、`dsh-opencode-go` 等） |
| Model | 依 provider 顯示可用 model 的下拉選單 |
| Reasoning Effort | 依目前 model 的 catalog metadata 顯示可選 effort |
| Agent Preset | 預設 `discord-whale` |
| Reply Timeout | 5000–600000 ms |
| Log Level | debug／info／warn／error |

- 不再設定 Guild ID／Channel ID／Owner ID；bot 能看到哪些頻道由 Discord 身份組權限決定。
- 非秘密設定透過 DSH settings 寫回 profile patch；卡片是主要設定方式。
- `DISCORD_TOKEN` 只存 credentials；若 credentials 沒有值，host 仍會 fallback 到 process env。
- 卡片透過 host 的 `GET /discord-bot/models` 讀 `sessionController.modelCatalog()`；provider/model/effort 選單直接使用系統現有 catalog。
- 若 catalog route 失敗（例如舊版 host），卡片 fallback 成手動文字輸入，不會擋住其他設定。
- 模型欄位留空 = 使用 DSH 預設模型；有填 provider + model 時，backend 會在每次 prompt 前呼叫 `sessionController.selectModel`。
- Token 或設定變更後若 DSH 沒有自動 reload plugin，重啟 DSH 讓 Discord 重新連線。
- 不要把 token 放進 `cordis.patch.yml` 或版本庫。

## 讀取權限（per-channel）

每個頻道預設**不讀取**。具管理員權限（Discord `Administrator`）的使用者在該頻道執行：

```text
/deeplook
```

便開啟該頻道的讀取；省略 `mode` 時預設是 `on`。關閉：

```text
/deeplook mode:off
```

Discord slash command 不支援真正的 trailing text，所以 `off` 是 `mode` option；bare `/deeplook` 仍可直接開啟。

- `/deeplook` 只決定 bot 是否看到該 channel，**不決定 bot 是否回應**；回不回由角色提示詞自行判斷。
- 只有 @bot 或被 bot 回覆的訊息是強制回覆；其他訊息模型可以回，也可以輸出 `[SILENT]`。
- 權限狀態存在 `~/.dsh/discord-bot/access.json`，重啟後保留。
- 只有執行指令的那個 channel 會切換；其他 channel 不受影響。
- Discord 身份組／頻道權限仍然決定 bot 是否看得到該頻道。
- 指令會以 ephemeral 訊息回覆成功或權限錯誤。
- bot 的邀請連結必須包含 `bot` 與 `applications.commands` scope，slash command 才會出現。
- 指令的 runtime 檢查要求 `Administrator`；只有 `Manage Server` 不足。
- 註冊結果會寫到 `~/.dsh/discord-bot/commands.json`（`created`／`existing`／`error`／`fetch-error`）。若 Discord 沒顯示命令，先看這個檔與 bot 的邀請 scope。
- Discord 客戶端可能需要重新整理或稍等才會顯示新註冊的 guild command。

進階／fallback 才需要手動覆寫：

```yaml
- id: discord-bot
  config:
    provider: dsh-opencode-go
    model: deepseek-v4.1-flash
    reasoningEffort: low
```

## 運作方式

```text
Discord Gateway
   → channel 讀取開關（/deeplook）
   → @ 或回覆判斷
   → 每頻道一個 local DSH session（discord-whale）
   → sessionController.create / prompt / rename
   → ctx.on('session/event') 收集 assistant/message、turn/end
   → 回覆發回 Discord
```

- session mapping：`~/.dsh/discord-bot/sessions.json`
- access state：`~/.dsh/discord-bot/access.json`
- session cwd：`~/.dsh/discord-bot/agents`
- 新 session 的標題：`[GuildName]ChannelName`。
- 重啟 DSH 後會透過 `SessionController` 的 resume 路徑接回 mapping 的 sessionId；它會重新 compose preset，所以 `discord-whale` persona 會保留。不要直接呼叫 `agents.resume()`，那條路不會 compose persona。
- resume 失敗時才重建 session；`commands.json` 與 `last-message.json` 可用来診斷。
- 非 tag 訊息以 `[可回覆]` 送進 DSH；模型可依角色自行決定回覆，若回覆有文字就發到 Discord，`[SILENT]` 才不送。
- tagged turn 若模型回 `[SILENT]`／空字串，會發 `？`，不會靜默忽略。

## 測試

```bash
npm run typecheck --workspace @local/dsh-discord-bot
npm test --workspace @local/dsh-discord-bot
```

涵蓋：訊息正規化、channel access toggle、slash command 參數、標題格式、session resume、2000 字拆分、allowedMentions、model selection。

## Live 狀態

已驗證：

- Discord tag 回覆
- Settings 卡片寫入
- `GET /discord-bot/models` model catalog

待 live 驗證（需重啟後測）：

- `/deeplook`、`/大肥魚` 的 guild command 註冊與權限檢查
- `[GuildName]ChannelName` 標題
- 重啟後 `agents.resume()` 是否保留舊對話
