# DSH Discord Bot

本插件把 Discord 頻道接到安裝它的 DSH。每個啟用頻道有獨立的對話、容器工作空間與工具權限。

## 核心功能

- 每個 Discord 頻道使用獨立 workspace。
- 每個頻道使用獨立 container，容器只掛載該頻道的 workspace。
- 提供 container 內的 Bash 與檔案工具。
- 提供 DSH 的 `web_fetch` 與 `web_search`。
- 管理員用 `/deeplook` 開啟頻道讀取，用 `/deeplook mode:off` 關閉。
- 模型依角色提示詞決定是否回覆一般訊息。
- 可選發言冷卻，預設 30 秒。
- @bot 或回覆 bot 的訊息必須回覆。
- session 標題格式為 `[GuildName]ChannelName`。
- 重啟 DSH 後接回原 session 與歷史對話。
- Settings 卡片可選 provider、model、reasoning effort、preset、timeout、發言冷卻與 log level。

## 先備環境

| 項目 | 要求 |
|---|---|
| DSH | `>=0.2.1-rc.2 <0.3.0` |
| Node.js | `^22.19.0` 或 `>=24.0.0` |
| Discord Bot | 需要 bot token |
| Discord 權限 | 需要 `applications.commands` scope |
| Discord intent | 需要 Message Content intent |
| 管理指令 | 執行者需要 `Administrator` |
| Container engine | rootless Podman 或 Docker |
| 網路 | 第一次建立 image 時需要 |

插件優先使用 rootless Podman。沒有 rootless Podman 時，插件使用 Docker。Docker 為 rootful 時，插件會寫入警告。

## 安裝

安裝來源是 GitHub Release 的 tarball。tarball 已包含 build 後的 `lib/`。

1. 下載 release asset：

   ```text
   local-dsh-discord-bot-0.6.0.tgz
   ```

2. 用 DSH 安裝 tarball：

   ```bash
   dsh plugin --profile web add \
     "https://github.com/kazma258/discordbot-on-dsh/releases/download/v0.6.0/local-dsh-discord-bot-0.6.0.tgz"
   ```

   本機檔案也可以直接安裝：

   ```bash
   dsh plugin --profile web add \
     /absolute/path/to/local-dsh-discord-bot-0.6.0.tgz
   ```

3. 重啟 DSH：

   ```text
   Ctrl+C
   dsh web
   ```

4. 開啟 DSH Settings，選擇「Discord Bot」，填入 Bot Token、provider、model 與 reasoning effort。

5. 第一次使用 container 工具時，插件會建立 sandbox image。這個步驟需要網路。

不要用 GitHub source URL 安裝。`lib/` 是 build 產物，沒有提交到 repository。

## 設定檔

插件只有兩個 runtime 設定檔。

| 檔案 | 用途 | 是否提交 |
|---|---|---|
| `cordis.patch.yml` | 公開的 plugin 預設設定 | 是 |
| `.env` | 私人 token 與本機覆寫 | 否 |

`.env` 已在 `.gitignore` 中。不要把 token 寫入 `cordis.patch.yml` 或 Git。

DSH 的 credentials 是 token 的主要儲存位置。`.env` 只提供 process environment fallback。使用 `.env` 時，必須在啟動 DSH 前載入它。

```bash
set -a
. ./.env
set +a
```

## 使用方法

### 開啟頻道

在 Discord 頻道輸入：

```text
/deeplook
```

`/deeplook` 只開啟該頻道的讀取，不決定 bot 是否回覆。

別名：

```text
/大肥魚
```

關閉：

```text
/deeplook mode:off
```

Discord 不支援 `/deeplook off` 這種 trailing text。`off` 是 `mode` 選項。

### 對話

- 一般訊息以 `[可回覆]` 送進 DSH。模型可以回覆，也可以輸出 `[SILENT]`。
- @bot 或回覆 bot 的訊息以 `[需回覆]` 送進 DSH。模型不得輸出 `[SILENT]`。
- 模型在必須回覆時仍沉默，插件送出 `？`。
- 未開啟的頻道不會送到 DSH。

### 發言冷卻

`Speech Cooldown (ms)` 控制可選回覆的最短間隔。預設是 `30000`。

- 冷卻以 channel 為單位。
- 冷卻只抑制非 @／非回覆 bot 的可選回覆。
- @bot 或回覆 bot 的訊息不受冷卻限制。
- 設 `0` 關閉冷卻。
- 冷卻期訊息以 `[冷卻]` 送進 DSH。模型只記錄上下文，不回覆。
- 冷卻只阻止回覆送到 Discord。訊息仍會進入 DSH session。
- 冷卻狀態存在記憶體。重啟 DSH 後重置。

### 工具

模型可以使用以下工具：

```text
container_bash
container_read
container_write
container_edit
container_list
container_glob
container_grep
web_fetch
web_search
```

容器內工作目錄是 `/workspace`。host 上的對應路徑是：

```text
~/.dsh/discord-bot/workspaces/<channelId>
```

### 診斷

| 檔案 | 內容 |
|---|---|
| `~/.dsh/discord-bot/status.json` | plugin 啟動狀態 |
| `~/.dsh/discord-bot/container.json` | engine、image、工具可用狀態 |
| `~/.dsh/discord-bot/commands.json` | Discord command 註冊結果 |
| `~/.dsh/discord-bot/last-message.json` | 最近訊息的處理結果 |

## 安全設計

- `discord-whale` preset 只掛載 container 工具與 web 工具。
- 不掛載 host 的 `tool-bash`、`tool-fs` 或 `tool-fs-search`。
- 工具呼叫受 allowlist guard 限制。未預期工具會被拒絕。
- 找不到 container engine 時，container 工具停用。插件不降級到 host shell。
- 容器使用 `--network none`。
- 容器使用非 root UID。
- 容器使用 read-only root filesystem。
- 容器使用 `cap-drop ALL` 與 `no-new-privileges`。
- 容器有 memory、pids、CPU、file descriptor 與 tmpfs 限制。
- 容器只 bind 該頻道 workspace。
- `container_write` 與 `container_edit` 有 workspace 容量檢查。
- `container_bash` 沒有硬性容量限制。
- `web_fetch` 只接受 HTTP 與 HTTPS。私有位址、loopback、link-local 與 cloud metadata 會被拒絕。
- 不把 Docker socket 掛進容器。
- 容器工具透過 plugin 內的窄 service 呼叫 engine。模型不能直接使用 Docker API。
- `.env` 不進 Git，也不進 release tarball。

已知限制：

- v1 在主要 DSH process 內執行。plugin host 與 dev agent 使用同一 OS user。
- Rootful Docker 的 broker 仍有 host root 風險。長期建議使用 rootless Podman。
- 舊 session 會保留原本的 DSH cwd。container 工具會改綁 per-channel workspace。
- 沒有常駐 shell 與背景 job。
- 發言冷卻在模型產生回覆後才抑制。它不節省模型 token。

## 解除安裝

```bash
dsh plugin --profile web remove @local/dsh-discord-bot
```

重啟 DSH。

刪除執行資料：

這個命令會刪除 session、access 與 workspace 資料。先備份再執行。

```bash
rm -rf ~/.dsh/discord-bot
```

刪除 container 與 image：

```bash
docker ps -aq --filter 'name=dsh-discord-' | xargs -r docker rm -f
docker rmi local/dsh-discord-sandbox:0.6.0
```

使用 Podman 時，把 `docker` 改成 `podman`。

## 授權

本專案使用 MIT License。詳見 [LICENSE](LICENSE)。
