# dsh-discord-bot

DSH Host plugin：把 Discord 接上**安裝它的那台 DSH** 的 local chat session。

- 不使用遠端 DSH、不需要 `DSH_COOKIE`。
- 要讓 bot 跑在遠端 DSH，就把這個 plugin 裝在那台遠端 DSH。
- 內含 `discord-whale` 受限 preset（persona + compaction，沒有 shell／檔案工具）。
- 遠端 DSH 連線是另一個獨立 plugin `dsh-remote`，不是這個 plugin 的依賴。

## 目前狀態

重構中：先把與 DSH 無關的純模組搬進來並保留測試。

已完成：

- `src/normalize.ts`：Discord 訊息正規化
- `src/policy.ts`：白名單與觸發判斷
- `src/split.ts`：2000 字拆分
- `src/sender.ts`：typing、allowedMentions、429 重試
- 對應單元測試

待完成：

- DSH Host plugin 入口與 `cordis.patch.yml`
- local session backend（`ctx.sessionController` / `ctx.on('session/event')`）
- `discord-whale` preset bundle
- Discord token／白名單的 DSH settings 或 credentials 介面
