/**
 * dsh-vision-api-localorweb — Client half.
 *
 * Registers a `settings.section` page "可接入识图模型 API" with three fields
 * (接口地址 / 模型名 / API Key). It reads and writes the Host-side `vision-api`
 * settings namespace through the client settings scope, so the Host `local_vision`
 * tool and this page share one durable source of truth.
 *
 * Built to the `__ModuleLoader__.load({ id, factory })` contract: the factory
 * returns `{ name, inject, apply }`, and the client kernel calls `apply(ctx)`
 * on mount. React and the slots/settingsScope services arrive via `require`
 * and the cordis inject face respectively.
 */

// --- Cordis service names required by this client plugin --------------------
const inject = ['slots', 'settingsScope']

// --- Settings namespace this page edits (mirrors Host) ----------------------
const NAMESPACE = 'vision-api'

// --- Locale copy (kept inline; a feature owns its own settings page) --------
const COPY = {
  title: '可接入识图模型 API',
  intro: '配置本地识图模型接口后，助手识别图片时会调用它。接口地址留空则不使用识图模型。',
  baseUrlLabel: '接口地址',
  baseUrlHint: 'OpenAI 兼容接口的 base URL，留空表示不启用识图模型。',
  baseUrlPlaceholder: 'http://localhost:1234/v1',
  modelLabel: '模型名',
  modelHint: '如 LM Studio 里加载的模型 ID。',
  modelPlaceholder: 'gemma-4-e4b',
  apiKeyLabel: 'API Key（可选）',
  apiKeyHint: '本地服务通常无需填写；留空则不发送鉴权头。',
  apiKeyPlaceholder: '留空则不发送鉴权头',
  save: '保存',
  saving: '保存中…',
  saved: '已保存',
  saveFailed: '保存失败',
}

interface VisionSettingsValue {
  baseUrl: string
  model: string
  apiKey: string
}

function normalizeValue(value: unknown): VisionSettingsValue {
  if (typeof value !== 'object' || value === null) return { baseUrl: '', model: '', apiKey: '' }
  const v = value as Record<string, unknown>
  return {
    baseUrl: typeof v.baseUrl === 'string' ? v.baseUrl : '',
    model: typeof v.model === 'string' ? v.model : '',
    apiKey: typeof v.apiKey === 'string' ? v.apiKey : '',
  }
}

/** Read the current settings snapshot with useSyncExternalStore. */
function useSettingsValue(scope: any): VisionSettingsValue {
  const React = require('react')
  const snapshot = React.useSyncExternalStore(
    (cb: () => void) => scope.subscribe(cb),
    () => scope.getSnapshot(),
  )
  return normalizeValue(snapshot && snapshot.value)
}

/** The settings page component. */
function VisionSettingsPage(props: any): any {
  const React = require('react')
  const scope = props.scope

  const current = useSettingsValue(scope)
  const [baseUrl, setBaseUrl] = React.useState(current.baseUrl)
  const [model, setModel] = React.useState(current.model)
  const [apiKey, setApiKey] = React.useState(current.apiKey)
  const [status, setStatus] = React.useState('')
  const [loaded, setLoaded] = React.useState(false)

  // Once the scope reports a ready value, seed the editable fields from it.
  React.useEffect(() => {
    if (loaded) return
    if (scope.getSnapshot().status === 'ready') {
      const v = normalizeValue(scope.getSnapshot().value)
      setBaseUrl(v.baseUrl)
      setModel(v.model)
      setApiKey(v.apiKey)
      setLoaded(true)
    }
  }, [scope, loaded])

  const save = () => {
    setStatus(COPY.saving)
    Promise.all([
      scope.set('baseUrl', baseUrl.trim()),
      scope.set('model', model.trim()),
      scope.set('apiKey', apiKey.trim()),
    ])
      .then(() => setStatus(COPY.saved))
      .catch(() => setStatus(COPY.saveFailed))
  }

  const field = (id: string, label: string, hint: string, placeholder: string, value: string, onChange: (v: string) => void, secret: boolean) =>
    React.createElement('label', { key: id, style: fieldStyle },
      React.createElement('div', { style: labelStyle }, label),
      React.createElement('input', {
        type: secret ? 'password' : 'text',
        value,
        placeholder,
        autoComplete: 'off',
        spellCheck: false,
        onChange: (e: any) => onChange(e.target.value),
        style: inputStyle,
      }),
      React.createElement('div', { style: hintStyle }, hint),
    )

  return React.createElement('div', { style: pageStyle },
    React.createElement('h2', { style: headingStyle }, COPY.title),
    React.createElement('p', { style: introStyle }, COPY.intro),
    field('baseUrl', COPY.baseUrlLabel, COPY.baseUrlHint, COPY.baseUrlPlaceholder, baseUrl, setBaseUrl, false),
    field('model', COPY.modelLabel, COPY.modelHint, COPY.modelPlaceholder, model, setModel, false),
    field('apiKey', COPY.apiKeyLabel, COPY.apiKeyHint, COPY.apiKeyPlaceholder, apiKey, setApiKey, true),
    React.createElement('div', { style: rowStyle },
      React.createElement('button', { onClick: save, style: buttonStyle }, COPY.save),
      React.createElement('span', { style: statusStyle }, status),
    ),
  )
}

// --- Inline styles (theme CSS variables keep the page on-theme) -------------
const pageStyle: React.CSSProperties = { padding: '16px 4px', maxWidth: '560px' }
const headingStyle: React.CSSProperties = { fontSize: '18px', margin: '0 0 4px' }
const introStyle: React.CSSProperties = { fontSize: '13px', color: 'var(--dsw-alias-label-tertiary, rgba(128,128,128,0.95))', margin: '0 0 16px', lineHeight: 1.6 }
const fieldStyle: React.CSSProperties = { display: 'block', marginBottom: '14px' }
const labelStyle: React.CSSProperties = { fontSize: '13px', fontWeight: 600, marginBottom: '6px' }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.4))', background: 'var(--dsw-alias-bg-layer-3, transparent)', color: 'var(--dsw-alias-label-primary, inherit)', fontSize: '14px' }
const hintStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary, rgba(128,128,128,0.9))', marginTop: '4px' }
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', marginTop: '20px' }
const buttonStyle: React.CSSProperties = { padding: '8px 18px', borderRadius: '6px', border: 'none', background: 'var(--dsw-alias-brand-primary, #4f46e5)', color: '#ffffff', cursor: 'pointer', fontSize: '14px' }
const statusStyle: React.CSSProperties = { marginLeft: '12px', fontSize: '13px', color: 'var(--dsw-alias-label-tertiary, rgba(128,128,128,0.95))' }

/** Bind the settings scope once and register the section. */
function apply(ctx: any): void {
  const scope = ctx.settingsScope.bind({ namespace: NAMESPACE })

  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      { name: 'settings.section', id: 'vision-api', order: 30, label: COPY.title },
      (props: any) => {
        const React = require('react')
        return React.createElement(VisionSettingsPage, { ...props, scope })
      },
    ),
  )
}

export { apply, inject }
