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
      guildIds: '',
      channelIds: '',
      ownerUserId: '',
      preset: 'discord-whale',
      provider: '',
      model: '',
      reasoningEffort: '',
      replyTimeoutMs: '120000',
      logLevel: 'info'
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
        guildIds: Array.isArray(current.guildIds) ? current.guildIds.join('\n') : '',
        channelIds: Array.isArray(current.channelIds) ? current.channelIds.join('\n') : '',
        ownerUserId: typeof current.ownerUserId === 'string' ? current.ownerUserId : '',
        preset: typeof current.preset === 'string' && current.preset ? current.preset : 'discord-whale',
        provider: typeof current.provider === 'string' ? current.provider : '',
        model: typeof current.model === 'string' ? current.model : '',
        reasoningEffort: typeof current.reasoningEffort === 'string' ? current.reasoningEffort : '',
        replyTimeoutMs: String(
          typeof current.replyTimeoutMs === 'number' ? current.replyTimeoutMs : 120000
        ),
        logLevel: typeof current.logLevel === 'string' && current.logLevel ? current.logLevel : 'info'
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

      var messageState = React.useState('');
      var message = messageState[0];
      var setMessage = messageState[1];

      var busyState = React.useState(false);
      var busy = busyState[0];
      var setBusy = busyState[1];

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

      function setField(field, value) {
        setDraft(function (previous) {
          var next = Object.assign({}, previous);
          next[field] = value;
          return next;
        });
      }

      async function saveSettings() {
        setBusy(true);
        setMessage('');
        try {
          var timeout = Number(draft.replyTimeoutMs);
          if (!Number.isSafeInteger(timeout) || timeout < 5000 || timeout > 600000) {
            throw new Error('Reply timeout 必須是 5000–600000 的整數');
          }

          var values = [
            ['guildIds', splitIds(draft.guildIds)],
            ['channelIds', splitIds(draft.channelIds)],
            ['ownerUserId', draft.ownerUserId.trim()],
            ['preset', draft.preset.trim() || 'discord-whale'],
            ['provider', draft.provider.trim()],
            ['model', draft.model.trim()],
            ['reasoningEffort', draft.reasoningEffort || ''],
            ['replyTimeoutMs', timeout],
            ['logLevel', draft.logLevel || 'info']
          ];

          for (var index = 0; index < values.length; index += 1) {
            var field = values[index][0];
            var accepted = await form.set(field, values[index][1]);
            if (!accepted) throw new Error('Host 拒絕寫入 ' + field);
          }

          var listsEmpty = splitIds(draft.guildIds).length === 0 || splitIds(draft.channelIds).length === 0;
          setMessage(
            listsEmpty
              ? '已儲存；但 guildIds / channelIds 空值時 bot 不會連線。'
              : '設定已儲存。DSH 重新載入 plugin 後生效。'
          );
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error));
        } finally {
          setBusy(false);
        }
      }

      async function saveToken() {
        var value = token.trim();
        if (!value) {
          setMessage('Token 不能為空');
          return;
        }
        setBusy(true);
        setMessage('');
        try {
          await credentials.set(TOKEN_REF, value);
          setToken('');
          await refreshToken();
          setMessage('Token 已儲存到 DSH credentials。重啟 DSH 後套用。');
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error));
        } finally {
          setBusy(false);
        }
      }

      async function clearToken() {
        setBusy(true);
        setMessage('');
        try {
          await credentials.unset(TOKEN_REF);
          await refreshToken();
          setMessage('Token 已清除。');
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error));
        } finally {
          setBusy(false);
        }
      }

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
        h('section', { style: cardStyle },
          h('h3', { style: sectionTitleStyle }, 'Discord 連線'),
          h('div', { style: rowStyle },
            h('input', {
              type: 'password',
              value: token,
              autoComplete: 'new-password',
              placeholder: tokenInfo.configured ? '已設定；輸入新 token 可覆蓋' : 'Discord bot token',
              onChange: function (event) { setToken(event.target.value); },
              style: Object.assign({}, inputStyle, { flex: '1 1 260px' })
            }),
            h('button', {
              type: 'button',
              disabled: busy || token.trim() === '',
              onClick: saveToken,
              style: primaryButtonStyle
            }, '儲存 Token'),
            h('button', {
              type: 'button',
              disabled: busy || !tokenInfo.configured,
              onClick: clearToken,
              style: secondaryButtonStyle
            }, '清除'),
            h('span', { style: badgeStyle },
              tokenInfo.loading ? '檢查中' : tokenInfo.configured ? '已設定' : '未設定'
            )
          ),
          h('p', { style: hintStyle },
            'Token 由 DSH credentials 管理，不會寫入 cordis.patch.yml。儲存後需重啟 DSH 才會重新連線。'
          ),
          h('div', { style: gridStyle },
            h(Field, { label: 'Guild IDs', hint: '每行一個，或逗號分隔。' },
              h('textarea', {
                value: draft.guildIds,
                rows: 3,
                placeholder: '111111111111111111',
                onChange: function (event) { setField('guildIds', event.target.value); },
                style: inputStyle
              })
            ),
            h(Field, { label: 'Channel IDs', hint: '只回覆這些頻道。' },
              h('textarea', {
                value: draft.channelIds,
                rows: 3,
                placeholder: '222222222222222222',
                onChange: function (event) { setField('channelIds', event.target.value); },
                style: inputStyle
              })
            )
          ),
          h(Field, { label: 'Owner User ID', hint: '保留給 owner-only 功能；可留空。' },
            h('input', {
              value: draft.ownerUserId,
              placeholder: '333333333333333333',
              onChange: function (event) { setField('ownerUserId', event.target.value); },
              style: inputStyle
            })
          )
        ),
        h('section', { style: cardStyle },
          h('h3', { style: sectionTitleStyle }, '模型'),
          h('p', { style: hintStyle },
            '留空則使用 DSH 的預設模型。設定會在每次回覆前套用到該頻道 session。'
          ),
          h('div', { style: gridStyle },
            h(Field, { label: 'Provider', hint: '例如 dsh-opencode-go / deepseek-official' },
              h('input', {
                value: draft.provider,
                placeholder: 'dsh-opencode-go',
                onChange: function (event) { setField('provider', event.target.value); },
                style: inputStyle
              })
            ),
            h(Field, { label: 'Model', hint: '例如 deepseek-v4.1-flash' },
              h('input', {
                value: draft.model,
                placeholder: 'deepseek-v4.1-flash',
                onChange: function (event) { setField('model', event.target.value); },
                style: inputStyle
              })
            ),
            h(Field, { label: 'Reasoning Effort' },
              h('select', {
                value: draft.reasoningEffort,
                onChange: function (event) { setField('reasoningEffort', event.target.value); },
                style: inputStyle
              },
                h('option', { value: '' }, '預設'),
                h('option', { value: 'off' }, 'off'),
                h('option', { value: 'low' }, 'low'),
                h('option', { value: 'high' }, 'high'),
                h('option', { value: 'max' }, 'max')
              )
            )
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
            disabled: busy,
            onClick: saveSettings,
            style: primaryButtonStyle
          }, busy ? '儲存中…' : '儲存設定'),
          h('span', { style: statusStyle, role: 'status', 'aria-live': 'polite' }, message)
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
