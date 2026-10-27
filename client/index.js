window.__ModuleLoader__.load({
  id: '@local/dsh-discord-bot',
  factory: function (require) {
    var React = require('react');
    var module = { exports: {} };
    var exports = module.exports;
    var h = React.createElement;
    var useSyncStore = React.useSyncExternalStore || function (subscribe, getSnapshot) {
      var state = React.useState(getSnapshot());
      React.useEffect(function () {
        return subscribe(function () { state[1](getSnapshot()); });
      }, [subscribe, getSnapshot]);
      return state[0];
    };
    var TOKEN_REF = 'DISCORD_TOKEN';

    var EMPTY = {
      preset: 'discord-whale',
      provider: '',
      model: '',
      reasoningEffort: '',
      replyTimeoutMs: '120000',
      speechCooldownMs: '30000',
      logLevel: 'info',
      videoPackage: ''
    };

    var pageStyle = {
      display: 'grid',
      gap: '14px',
      padding: '4px 0 24px',
      color: 'var(--dsw-alias-label-primary)'
    };
    var cardStyle = {
      display: 'grid',
      gap: '13px',
      padding: '14px 16px',
      border: '1px solid var(--dsw-alias-border-l2)',
      borderRadius: '12px',
      background: 'color-mix(in srgb, var(--dsw-alias-bg-layer-3) 25%, transparent)'
    };
    var titleStyle = {
      margin: '0',
      fontSize: '18px',
      fontWeight: 650,
      lineHeight: 1.35
    };
    var introStyle = {
      margin: '0',
      color: 'var(--dsw-alias-label-secondary)',
      fontSize: '12.5px',
      lineHeight: 1.6
    };
    var sectionTitleStyle = {
      margin: '0',
      fontSize: '13px',
      fontWeight: 650
    };
    var fieldStyle = {
      display: 'grid',
      gap: '6px',
      minWidth: '0',
      color: 'var(--dsw-alias-label-secondary)',
      fontSize: '12.5px'
    };
    var inputStyle = {
      width: '100%',
      boxSizing: 'border-box',
      padding: '8px 10px',
      border: '1px solid var(--dsw-alias-border-l2)',
      borderRadius: '8px',
      background: 'var(--dsw-alias-bg-layer-2, transparent)',
      color: 'var(--dsw-alias-label-primary)',
      font: 'inherit',
      fontSize: '13px'
    };
    var gridStyle = {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: '12px'
    };
    var rowStyle = {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '8px'
    };
    var primaryButtonStyle = {
      padding: '7px 12px',
      border: '0',
      borderRadius: '8px',
      background: 'var(--dsw-alias-brand-primary)',
      color: '#fff',
      font: 'inherit',
      fontSize: '12.5px',
      cursor: 'pointer'
    };
    var secondaryButtonStyle = {
      padding: '7px 12px',
      border: '1px solid var(--dsw-alias-border-l2)',
      borderRadius: '8px',
      background: 'transparent',
      color: 'var(--dsw-alias-label-primary)',
      font: 'inherit',
      fontSize: '12.5px',
      cursor: 'pointer'
    };
    var successButtonStyle = {
      padding: '7px 12px',
      border: '1px solid #2f9e67',
      borderRadius: '8px',
      background: 'rgba(47, 158, 103, 0.16)',
      color: '#2f9e67',
      font: 'inherit',
      fontSize: '12.5px',
      cursor: 'pointer'
    };
    var hintStyle = {
      margin: '0',
      color: 'var(--dsw-alias-label-tertiary)',
      fontSize: '11.5px',
      lineHeight: 1.5
    };
    var statusStyle = {
      margin: '0',
      color: 'var(--dsw-alias-label-secondary)',
      fontSize: '12px',
      lineHeight: 1.5
    };
    var badgeStyle = {
      padding: '2px 7px',
      borderRadius: '99px',
      border: '1px solid var(--dsw-alias-border-l2)',
      color: 'var(--dsw-alias-label-secondary)',
      fontSize: '11px'
    };

    function splitIds(value) {
      return String(value || '')
        .split(/[\s,]+/)
        .map(function (item) { return item.trim(); })
        .filter(Boolean);
    }

    function fromValue(value) {
      var current = value || {};
      return {
        preset: typeof current.preset === 'string' && current.preset ? current.preset : 'discord-whale',
        provider: typeof current.provider === 'string' ? current.provider : '',
        model: typeof current.model === 'string' ? current.model : '',
        reasoningEffort: typeof current.reasoningEffort === 'string' ? current.reasoningEffort : '',
        replyTimeoutMs: String(
          typeof current.replyTimeoutMs === 'number' ? current.replyTimeoutMs : 120000
        ),
        speechCooldownMs: String(
          typeof current.speechCooldownMs === 'number' ? current.speechCooldownMs : 30000
        ),
        logLevel: typeof current.logLevel === 'string' && current.logLevel ? current.logLevel : 'info',
        videoPackage: typeof current.videoPackage === 'string' ? current.videoPackage : ''
      };
    }

    function Field(props) {
      return h(
        'label',
        { style: fieldStyle },
        h('span', null, props.label),
        props.children,
        props.hint ? h('span', { style: hintStyle }, props.hint) : null
      );
    }

    function Notice(props) {
      if (!props.notice || !props.notice.text) return null;
      var palettes = {
        success: {
          border: '1px solid #2f9e67',
          background: 'rgba(47, 158, 103, 0.12)',
          color: '#2f9e67'
        },
        error: {
          border: '1px solid #e5484d',
          background: 'rgba(229, 72, 77, 0.12)',
          color: '#e5484d'
        },
        info: {
          border: '1px solid var(--dsw-alias-border-l2)',
          background: 'color-mix(in srgb, var(--dsw-alias-bg-layer-3) 35%, transparent)',
          color: 'var(--dsw-alias-label-secondary)'
        }
      };
      var palette = palettes[props.notice.kind] || palettes.info;
      return h(
        'div',
        {
          role: 'status',
          'aria-live': 'polite',
          style: {
            padding: '10px 12px',
            borderRadius: '9px',
            border: palette.border,
            background: palette.background,
            color: palette.color,
            fontSize: '12.5px',
            lineHeight: 1.5,
            fontWeight: 550
          }
        },
        props.notice.text
      );
    }

    function DiscordBotSection(props) {
      var form = props.form;
      var credentials = props.credentials;
      var subscribe = React.useCallback(function (listener) {
        return form.subscribe(listener);
      }, [form]);
      var read = React.useCallback(function () {
        return form.getSnapshot();
      }, [form]);
      var snapshot = useSyncStore(subscribe, read);

      var draftState = React.useState(EMPTY);
      var draft = draftState[0];
      var setDraft = draftState[1];

      var tokenState = React.useState('');
      var token = tokenState[0];
      var setToken = tokenState[1];

      var tokenInfoState = React.useState({ configured: false, writable: false, loading: true });
      var tokenInfo = tokenInfoState[0];
      var setTokenInfo = tokenInfoState[1];

      var noticeState = React.useState(null);
      var notice = noticeState[0];
      var setNoticeState = noticeState[1];

      var savedState = React.useState(false);
      var saved = savedState[0];
      var setSaved = savedState[1];

      var tokenSavedState = React.useState(false);
      var tokenSaved = tokenSavedState[0];
      var setTokenSaved = tokenSavedState[1];

      var busyState = React.useState(false);
      var busy = busyState[0];
      var setBusy = busyState[1];

      var catalogState = React.useState({ status: 'loading', groups: [], failures: [], default: null });
      var catalog = catalogState[0];
      var setCatalog = catalogState[1];

      var videoCheckState = React.useState({ status: 'idle', url: '' });
      var videoCheck = videoCheckState[0];
      var setVideoCheck = videoCheckState[1];

      function setNotice(kind, text) {
        setNoticeState({ kind: kind, text: text });
      }

      var cookieState = React.useState('');
      var cookie = cookieState[0];
      var setCookie = cookieState[1];
      var cookieStatusState = React.useState({ kind: 'loading', text: '檢查中' });
      var cookieStatus = cookieStatusState[0];
      var setCookieStatus = cookieStatusState[1];

      function cookieRequest(body) {
        return fetch('/discord-bot/cookies', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(body)
        }).then(function (response) {
          return response.json().catch(function () { return null; }).then(function (payload) {
            if (!response.ok || !payload || payload.ok !== true) {
              throw new Error((payload && payload.error) || ('HTTP ' + response.status));
            }
            return payload;
          });
        });
      }

      React.useEffect(function () {
        var cancelled = false;
        cookieRequest({ action: 'status' })
          .then(function (payload) {
            if (!cancelled) {
              setCookieStatus({ kind: payload.configured ? 'ok' : 'idle', text: payload.configured ? '已儲存' : '未儲存' });
            }
          })
          .catch(function (error) {
            if (!cancelled) {
              setCookieStatus({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
            }
          });
        return function () { cancelled = true; };
      }, []);

      async function saveCookies() {
        var value = cookie.trim();
        if (!value) {
          setCookieStatus({ kind: 'error', text: 'Cookies 不能為空。' });
          return;
        }
        setCookieStatus({ kind: 'info', text: '儲存中…' });
        try {
          await cookieRequest({ action: 'set', content: value });
          setCookie('');
          setCookieStatus({ kind: 'ok', text: '已儲存。下一則影片就會用，不用重開。' });
        } catch (error) {
          setCookieStatus({ kind: 'error', text: '儲存失敗：' + (error instanceof Error ? error.message : String(error)) });
        }
      }

      async function clearCookies() {
        setCookieStatus({ kind: 'info', text: '清除中…' });
        try {
          await cookieRequest({ action: 'clear' });
          setCookieStatus({ kind: 'idle', text: '未儲存' });
        } catch (error) {
          setCookieStatus({ kind: 'error', text: '清除失敗：' + (error instanceof Error ? error.message : String(error)) });
        }
      }

      var ytDlpState = React.useState({ status: 'idle', text: '' });
      var ytDlp = ytDlpState[0];
      var setYtDlp = ytDlpState[1];

      async function installYtDlp() {
        setYtDlp({ status: 'running', text: '下載並驗證 yt-dlp 中…（約 40MB）' });
        try {
          var response = await fetch('/discord-bot/ytdlp-install', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: '{}'
          });
          var body = await response.json().catch(function () { return null; });
          if (!response.ok || !body || body.ok !== true) {
            throw new Error((body && body.error) || ('HTTP ' + response.status));
          }
          setYtDlp({ status: 'ok', text: '已安裝 ' + body.asset + ' → ' + body.path + '（SHA-256 已驗證）' });
        } catch (error) {
          setYtDlp({ status: 'failed', text: '安裝失敗：' + (error instanceof Error ? error.message : String(error)) });
        }
      }

      async function runVideoCheck() {
        setVideoCheck(function (previous) {
          return { status: 'running', url: previous.url };
        });
        try {
          var response = await fetch('/discord-bot/video-check', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ package: draft.videoPackage, url: videoCheck.url })
          });
          var body = await response.json().catch(function () { return null; });
          if (!body || !Array.isArray(body.steps)) {
            throw new Error((body && body.error) || ('HTTP ' + response.status));
          }
          setVideoCheck({ status: body.ok ? 'ok' : 'failed', url: videoCheck.url, result: body });
        } catch (error) {
          setVideoCheck({
            status: 'failed',
            url: videoCheck.url,
            result: { steps: [{ name: '驗證', ok: false, detail: error instanceof Error ? error.message : String(error) }] }
          });
        }
      }

      React.useEffect(function () {
        if (snapshot.status === 'ready') setDraft(fromValue(snapshot.value));
      }, [snapshot.status, snapshot.revision]);

      var refreshToken = React.useCallback(function () {
        return credentials
          .describe([TOKEN_REF])
          .then(function (result) {
            var info = result && result[TOKEN_REF];
            setTokenInfo({
              configured: Boolean(info && info.configured),
              writable: Boolean(info && info.writable),
              loading: false
            });
          })
          .catch(function () {
            setTokenInfo({ configured: false, writable: false, loading: false });
          });
      }, [credentials]);

      React.useEffect(function () {
        void refreshToken();
      }, [refreshToken]);

      var loadCatalog = React.useCallback(async function () {
        setCatalog({ status: 'loading', groups: [], failures: [], default: null });
        try {
          var response = await fetch('/discord-bot/models', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { accept: 'application/json' }
          });
          var body = await response.json().catch(function () { return null; });
          if (!response.ok || !body || body.ok !== true) {
            throw new Error((body && (body.message || body.error)) || ('HTTP ' + response.status));
          }
          var groups = Array.isArray(body.catalog && body.catalog.groups)
            ? body.catalog.groups.filter(function (group) {
                return group && typeof group.id === 'string' && Array.isArray(group.models);
              })
            : [];
          setCatalog({
            status: 'ready',
            groups: groups,
            failures: Array.isArray(body.catalog && body.catalog.failures)
              ? body.catalog.failures
              : [],
            default: body.catalog && body.catalog.default ? body.catalog.default : null
          });
        } catch (error) {
          setCatalog({
            status: 'error',
            groups: [],
            failures: [],
            default: null,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }, []);

      React.useEffect(function () {
        void loadCatalog();
      }, [loadCatalog]);

      function setField(field, value) {
        setSaved(false);
        setNotice(null, '');
        setDraft(function (previous) {
          var next = Object.assign({}, previous);
          next[field] = value;
          return next;
        });
      }

      async function saveSettings() {
        if (snapshot.writable === false) {
          setNotice('error', '此 DSH profile 是唯讀，無法儲存設定。');
          return;
        }
        setBusy(true);
        setSaved(false);
        setNotice('info', '儲存中…');
        try {
          var timeout = Number(draft.replyTimeoutMs);
          if (!Number.isSafeInteger(timeout) || timeout < 5000 || timeout > 600000) {
            throw new Error('Reply timeout 必須是 5000–600000 的整數');
          }
          var cooldown = Number(draft.speechCooldownMs);
          if (!Number.isSafeInteger(cooldown) || cooldown < 0 || cooldown > 600000) {
            throw new Error('Speech cooldown 必須是 0–600000 的整數');
          }

          var values = [
            ['preset', draft.preset.trim() || 'discord-whale'],
            ['provider', draft.provider.trim()],
            ['model', draft.model.trim()],
            ['reasoningEffort', draft.reasoningEffort || ''],
            ['replyTimeoutMs', timeout],
            ['speechCooldownMs', cooldown],
            ['logLevel', draft.logLevel || 'info'],
            ['videoPackage', draft.videoPackage.trim()]
          ];

          for (var index = 0; index < values.length; index += 1) {
            var field = values[index][0];
            var accepted = await form.set(field, values[index][1]);
            if (!accepted) throw new Error('Host 拒絕寫入 ' + field);
          }

          setSaved(true);
          setNotice('success', '設定已儲存到 DSH profile。重啟 DSH 後由 host plugin 套用。');
        } catch (error) {
          setNotice('error', '儲存失敗：' + (error instanceof Error ? error.message : String(error)));
        } finally {
          setBusy(false);
        }
      }

      async function saveToken() {
        var value = token.trim();
        if (!value) {
          setNotice('error', 'Token 不能為空。');
          return;
        }
        setBusy(true);
        setTokenSaved(false);
        setNotice('info', 'Token 儲存中…');
        try {
          await credentials.set(TOKEN_REF, value);
          setToken('');
          setTokenSaved(true);
          await refreshToken();
          setNotice('success', 'Token 已儲存到 DSH credentials。重啟 DSH 後才會重新連線。');
        } catch (error) {
          setNotice('error', 'Token 儲存失敗：' + (error instanceof Error ? error.message : String(error)));
        } finally {
          setBusy(false);
        }
      }

      async function clearToken() {
        setBusy(true);
        setTokenSaved(false);
        setNotice('info', '清除 Token 中…');
        try {
          await credentials.unset(TOKEN_REF);
          await refreshToken();
          setNotice('success', 'Token 已清除。');
        } catch (error) {
          setNotice('error', 'Token 清除失敗：' + (error instanceof Error ? error.message : String(error)));
        } finally {
          setBusy(false);
        }
      }

      var providerGroups = catalog.status === 'ready' ? catalog.groups : [];
      var selectedGroup = providerGroups.find(function (group) {
        return group.id === draft.provider;
      });
      var modelOptions = selectedGroup && Array.isArray(selectedGroup.models)
        ? selectedGroup.models
        : [];
      var selectedModel = modelOptions.find(function (model) {
        return model.id === draft.model;
      });
      var catalogEfforts = selectedModel && selectedModel.reasoning && Array.isArray(selectedModel.reasoning.efforts)
        ? selectedModel.reasoning.efforts
        : [];
      var effortChoices = catalogEfforts.length > 0
        ? catalogEfforts
        : [
            { id: 'off', name: 'off' },
            { id: 'low', name: 'low' },
            { id: 'high', name: 'high' },
            { id: 'max', name: 'max' }
          ];

      if (snapshot.status === 'unavailable') {
        return h(
          'div',
          { style: pageStyle },
          h('h2', { style: titleStyle }, 'Discord Bot'),
          h('p', { style: introStyle }, '這個 DSH 沒有提供 discord-bot 設定 namespace。請確認 plugin 已載入。')
        );
      }

      if (snapshot.status !== 'ready') {
        return h(
          'div',
          { style: pageStyle },
          h('h2', { style: titleStyle }, 'Discord Bot'),
          h('p', { style: introStyle }, '正在載入 Discord Bot 設定…')
        );
      }

      return h(
        'div',
        { style: pageStyle },
        h('div', null,
          h('h2', { style: titleStyle }, 'Discord Bot'),
          h('p', { style: introStyle },
            '連線 Discord 到這台 DSH 的 local session。Token 存在 DSH credentials，其餘設定存在 profile。'
          )
        ),
        h(Notice, {
          notice: notice || (snapshot.writable === false
            ? { kind: 'error', text: '此 DSH profile 目前是唯讀，無法儲存設定。' }
            : null)
        }),
        h('section', { style: cardStyle },
          h('h3', { style: sectionTitleStyle }, 'Discord 連線'),
          h('div', { style: rowStyle },
            h('input', {
              type: 'password',
              value: token,
              autoComplete: 'new-password',
              placeholder: tokenInfo.configured ? '已設定；輸入新 token 可覆蓋' : 'Discord bot token',
              onChange: function (event) {
                setToken(event.target.value);
                setTokenSaved(false);
                setNotice(null, '');
              },
              style: Object.assign({}, inputStyle, { flex: '1 1 260px' })
            }),
            h('button', {
              type: 'button',
              disabled: busy || token.trim() === '' || tokenInfo.loading || tokenInfo.writable === false,
              onClick: saveToken,
              style: tokenSaved ? successButtonStyle : primaryButtonStyle
            }, tokenSaved ? 'Token 已儲存 ✓' : '儲存 Token'),
            h('button', {
              type: 'button',
              disabled: busy || !tokenInfo.configured,
              onClick: clearToken,
              style: secondaryButtonStyle
            }, '清除'),
            h('span', { style: badgeStyle },
              tokenInfo.loading
                ? '檢查中'
                : tokenInfo.configured
                  ? '已設定'
                  : tokenInfo.writable === false
                    ? 'credentials 唯讀'
                    : '未設定'
            )
          ),
          h('p', { style: hintStyle },
            'Token 由 DSH credentials 管理，不會寫入 cordis.patch.yml。儲存後需重啟 DSH 才會重新連線。'
          ),
          h('p', { style: hintStyle },
            '讀取預設關閉。具管理員權限的使用者在頻道輸入 /deeplook 開啟；/deeplook mode:off 關閉。Discord 身份組權限決定 bot 能看到哪些頻道。'
          )
        ),
        h('section', { style: cardStyle },
          h('h3', { style: sectionTitleStyle }, '模型'),
          h('p', { style: hintStyle },
            '留空則使用 DSH 的預設模型。設定會在每次回覆前套用到該頻道 session。'
          ),
          h('div', { style: gridStyle },
            h(Field, {
              label: 'Provider',
              hint: catalog.status === 'ready'
                ? '從 DSH model catalog 讀取'
                : catalog.status === 'loading'
                  ? '讀取模型目錄中…'
                  : '讀取失敗，使用手動輸入'
            },
              catalog.status === 'ready'
                ? h('select', {
                    value: draft.provider,
                    onChange: function (event) {
                      setField('provider', event.target.value);
                      setField('model', '');
                      setField('reasoningEffort', '');
                    },
                    style: inputStyle
                  },
                    h('option', { value: '' }, 'DSH 預設'),
                    draft.provider && !providerGroups.some(function (group) { return group.id === draft.provider; })
                      ? h('option', { value: draft.provider }, draft.provider + '（目前設定）')
                      : null,
                    providerGroups.map(function (group) {
                      return h('option', { key: group.id, value: group.id }, group.name || group.id);
                    })
                  )
                : h('input', {
                    value: draft.provider,
                    placeholder: 'dsh-opencode-go',
                    onChange: function (event) { setField('provider', event.target.value); },
                    style: inputStyle
                  })
            ),
            h(Field, {
              label: 'Model',
              hint: draft.provider === ''
                ? '先選 provider；留空用 DSH 預設'
                : '從該 provider 的 catalog 讀取'
            },
              catalog.status === 'ready' && draft.provider !== ''
                ? h('select', {
                    value: draft.model,
                    onChange: function (event) {
                      setField('model', event.target.value);
                      setField('reasoningEffort', '');
                    },
                    style: inputStyle
                  },
                    h('option', { value: '' }, 'Provider 預設'),
                    draft.model && !modelOptions.some(function (model) { return model.id === draft.model; })
                      ? h('option', { value: draft.model }, draft.model + '（目前設定）')
                      : null,
                    modelOptions.map(function (model) {
                      return h('option', { key: model.id, value: model.id }, model.name || model.id);
                    })
                  )
                : h('input', {
                    value: draft.model,
                    placeholder: draft.provider === '' ? '先選 provider' : 'deepseek-v4.1-flash',
                    disabled: catalog.status === 'ready' && draft.provider === '',
                    onChange: function (event) { setField('model', event.target.value); },
                    style: inputStyle
                  })
            ),
            h(Field, {
              label: 'Reasoning Effort',
              hint: catalogEfforts.length > 0 ? '由目前 model 的 catalog 提供' : '此 model 沒有 effort metadata；使用通用選項'
            },
              h('select', {
                value: draft.reasoningEffort,
                onChange: function (event) { setField('reasoningEffort', event.target.value); },
                style: inputStyle
              },
                h('option', { value: '' }, '預設'),
                draft.reasoningEffort && !effortChoices.some(function (effort) { return effort.id === draft.reasoningEffort; })
                  ? h('option', { value: draft.reasoningEffort }, draft.reasoningEffort + '（目前設定）')
                  : null,
                effortChoices.map(function (effort) {
                  return h('option', { key: effort.id, value: effort.id }, effort.name || effort.id);
                })
              )
            )
          ),
          h('div', { style: rowStyle },
            h('p', { style: hintStyle },
              catalog.status === 'loading'
                ? '正在讀取 DSH 模型目錄…'
                : catalog.status === 'error'
                  ? '模型目錄讀取失敗：' + (catalog.message || 'unknown') + '；目前使用手動輸入。'
                  : '模型目錄：' + providerGroups.length + ' providers' +
                    (catalog.failures.length > 0 ? '，' + catalog.failures.length + ' 個 provider 讀取失敗' : '') +
                    (catalog.default
                      ? '；系統預設：' + [catalog.default.provider, catalog.default.model, catalog.default.reasoningEffort].filter(Boolean).join(' / ')
                      : '')
            ),
            h('button', {
              type: 'button',
              disabled: catalog.status === 'loading',
              onClick: loadCatalog,
              style: secondaryButtonStyle
            }, '重新讀取模型')
          ),
          h(Field, { label: 'Agent Preset' },
            h('input', {
              value: draft.preset,
              placeholder: 'discord-whale',
              onChange: function (event) { setField('preset', event.target.value); },
              style: inputStyle
            })
          )
        ),
        h('section', { style: cardStyle },
          h('h3', { style: sectionTitleStyle }, '影片分析'),
          h('p', { style: hintStyle },
            '留空 = 關閉。填入後，頻道裡的影片連結或上傳影片會在背景分析，完成後以「回應訊息」回覆原訊息，不會卡住一般對話。' +
            '套件以 npx 執行、不修改原始碼。沒有 yt-dlp 時，按「安裝／更新 yt-dlp」下載官方執行檔。'
          ),
          h('div', { style: gridStyle },
            h(Field, {
              label: '影片分析 MCP 套件',
              hint: 'npm 套件名稱或 skills id，例如 guimatheus92/mcp-video-analyzer 或 mcp-video-analyzer@0.11.0'
            },
              h('input', {
                value: draft.videoPackage,
                placeholder: 'guimatheus92/mcp-video-analyzer',
                onChange: function (event) {
                  setField('videoPackage', event.target.value);
                  setVideoCheck(function (previous) { return { status: 'idle', url: previous.url }; });
                },
                style: inputStyle
              })
            ),
            h(Field, { label: '驗證用影片網址（選填）', hint: '留空使用 19 秒的公開 YouTube 影片' },
              h('input', {
                value: videoCheck.url,
                placeholder: 'https://www.youtube.com/watch?v=…',
                onChange: function (event) {
                  var url = event.target.value;
                  setVideoCheck(function (previous) { return Object.assign({}, previous, { url: url }); });
                },
                style: inputStyle
              })
            )
          ),
          h(Field, {
            label: 'YouTube cookies（選填）',
            hint: '貼上瀏覽器匯出的 Netscape cookies.txt。只存在這台機器的 youtube-cookies.txt，不會寫進設定檔。用來降低 YouTube 429。'
          },
            h('textarea', {
              value: cookie,
              rows: 4,
              placeholder: cookieStatus.kind === 'ok' ? '已儲存；貼上新內容可覆蓋' : '# Netscape HTTP Cookie File',
              onChange: function (event) {
                setCookie(event.target.value);
                setCookieSaved(false);
              },
              style: Object.assign({}, inputStyle, { fontFamily: 'ui-monospace, monospace', resize: 'vertical' })
            })
          ),
          h('div', { style: rowStyle },
            h('button', {
              type: 'button',
              disabled: cookieStatus.text === '儲存中…' || cookie.trim() === '',
              onClick: saveCookies,
              style: Object.assign({}, cookieStatus.kind === 'ok' ? successButtonStyle : primaryButtonStyle, cookie.trim() === '' ? { opacity: 0.55 } : {})
            }, cookieStatus.kind === 'ok' && cookie.trim() === '' ? 'Cookies 已儲存 ✓' : '儲存 Cookies'),
            h('button', {
              type: 'button',
              disabled: cookieStatus.kind !== 'ok',
              onClick: clearCookies,
              style: secondaryButtonStyle
            }, '清除 Cookies'),
            h('span', { style: Object.assign({}, badgeStyle, { color: cookieStatus.kind === 'error' ? '#e5484d' : cookieStatus.kind === 'ok' ? '#2f9e67' : undefined }) },
              cookieStatus.text
            )
          ),
          h('div', { style: rowStyle },
            h('button', {
              type: 'button',
              disabled: ytDlp.status === 'running',
              onClick: installYtDlp,
              style: ytDlp.status === 'ok' ? successButtonStyle : secondaryButtonStyle
            }, ytDlp.status === 'running' ? '安裝中…' : ytDlp.status === 'ok' ? 'yt-dlp 已安裝 ✓' : '安裝／更新 yt-dlp'),
            h('button', {
              type: 'button',
              disabled: videoCheck.status === 'running' || draft.videoPackage.trim() === '',
              onClick: runVideoCheck,
              style: videoCheck.status === 'ok' ? successButtonStyle : secondaryButtonStyle
            }, videoCheck.status === 'running'
              ? '驗證中…（首次需下載套件，約 1–3 分鐘）'
              : videoCheck.status === 'ok' ? '驗證通過 ✓' : '驗證 yt-dlp → 分析流程')
          ),
          ytDlp.text
            ? h('p', { style: Object.assign({}, statusStyle, { color: ytDlp.status === 'failed' ? '#e5484d' : ytDlp.status === 'ok' ? '#2f9e67' : undefined }) }, ytDlp.text)
            : null,
          videoCheck.result
            ? h('ul', { style: Object.assign({}, statusStyle, { paddingLeft: '18px' }) },
                videoCheck.result.steps.map(function (step, index) {
                  return h('li', { key: index, style: { color: step.ok ? '#2f9e67' : '#e5484d' } },
                    (step.ok ? '✓ ' : '✗ ') + step.name + '：' + step.detail);
                })
              )
            : null
        ),
        h('section', { style: cardStyle },
          h('h3', { style: sectionTitleStyle }, '進階'),
          h('div', { style: gridStyle },
            h(Field, { label: 'Reply Timeout (ms)' },
              h('input', {
                type: 'number',
                min: 5000,
                max: 600000,
                value: draft.replyTimeoutMs,
                onChange: function (event) { setField('replyTimeoutMs', event.target.value); },
                style: inputStyle
              })
            ),
            h(Field, { label: 'Speech Cooldown (ms)' },
              h('input', {
                type: 'number',
                min: 0,
                max: 600000,
                step: 1000,
                value: draft.speechCooldownMs,
                onChange: function (event) { setField('speechCooldownMs', event.target.value); },
                style: inputStyle
              }),
              h('span', { style: hintStyle }, '0 = 關閉；預設 30000。只抑制非 @／非回覆的可選發言。')
            ),
            h(Field, { label: 'Log Level' },
              h('select', {
                value: draft.logLevel,
                onChange: function (event) { setField('logLevel', event.target.value); },
                style: inputStyle
              },
                h('option', { value: 'debug' }, 'debug'),
                h('option', { value: 'info' }, 'info'),
                h('option', { value: 'warn' }, 'warn'),
                h('option', { value: 'error' }, 'error')
              )
            )
          )
        ),
        h('div', { style: rowStyle },
          h('button', {
            type: 'button',
            disabled: busy || snapshot.writable === false,
            onClick: saveSettings,
            style: saved ? successButtonStyle : primaryButtonStyle
          }, saved ? '已儲存 ✓' : busy ? '儲存中…' : '儲存設定'),
          h('span', { style: statusStyle },
            snapshot.writable === false
              ? 'profile 唯讀'
              : snapshot.revision === undefined
                ? '等待 DSH settings 同步'
                : 'settings revision ' + snapshot.revision
          )
        )
      );
    }

    var inject = ['slots', 'remote', 'remote.credentials', 'configForms'];

    function apply(ctx) {
      ctx.slots.inject('settings.section', function () {
        var form = ctx.configForms.get('discord-bot');
        var credentials = ctx.remote.credentials;
        return ctx.slots.register({
          name: 'settings.section',
          id: 'discord-bot',
          order: 30,
          label: function () { return 'Discord Bot'; },
          inject: function () {
            return { form: form, credentials: credentials };
          }
        }, DiscordBotSection);
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
