# dsh-discord-bot

DSH Host plugin：把 Discord 接上**安裝它的那台 DSH** 的 local chat session。

- 不使用遠端 DSH、不需要 `DSH_COOKIE`。
- 要讓 bot 跑在遠端 DSH，就把這個 plugin 裝在那台遠端 DSH。
- 內含 `discord-whale` 受限 preset（persona + compaction，沒有 shell／檔案工具）。
- 遠端 DSH 連線是另一個獨立 plugin `dsh-remote`，不是這個 plugin 的依賴。

## 安裝

```bash
# 在 repo 根目錄先建置
npm run build --workspace @local/dsh-discord-bot
npm run build:preset --workspace @local/dsh-discord-bot

# 安裝到 DSH web profile（開發時用 link: 可直接反映原始碼變更）
dsh plugin --profile web add /absolute/path/to/plugins/discord-bot
# 或
dsh plugin --profile web add link:/absolute/path/to/plugins/discord-bot
```

安裝後 DSH profile 會多出：

- host row `discord-bot`
- `discord-whale` agent preset
- `@local/dsh-discord-bot` dependency

> 如果之前裝過舊的外部 bridge preset bundle（`discord-bot-on-dsh-preset`），先把它從 profile 的 `dsh.profile.bundles` 移除，避免兩個 bundle 同時宣告 `discord-whale`。

## 設定

非秘密設定在 plugin row 的 `config`。安裝後可在
`~/.dsh/profiles/web/cordis.patch.yml` 覆寫：

```yaml
- id: discord-bot
  config:
    guildIds: ['111111111111111111']
    channelIds: ['222222222222222222']
    ownerUserId: '333333333333333333'
    preset: discord-whale
    replyTimeoutMs: 120000
    logLevel: info
```

- `guildIds`／`channelIds` 空值會 **fail closed**，plugin 不會連 Discord。
- `preset` 預設 `discord-whale`；建立 session 前會用 `ctx.agentPresets.resolve` 確認，找不到就拒絕建立。
- `DISCORD_TOKEN` 優先用 DSH credentials；沒有時 fallback 到 DSH process 的 `DISCORD_TOKEN` 環境變數。
- 不要把 Discord token 放進 `cordis.patch.yml` 或版本庫。

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

涵蓋：訊息正規化、白名單／觸發、2000 字拆分、allowedMentions、local session backend（建立、佇列、timeout、not-found 重建）。

## 尚未 live 驗證

- `ctx.sessionController` 從 Host plugin row 直接建立 preset session
- `ctx.on('session/event')` 的 turn 配對
- DSH credentials 的 `DISCORD_TOKEN`
- `dsh plugin add` 後的 profile 載入與重啟
