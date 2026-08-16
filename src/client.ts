/**
 * dsh-vision-api-localorweb — Client half.
 *
 * Registers a `settings.section` page "可接入识图模型 API" with three fields
 * (接口地址 / 模型名 / API Key). It reads and persists the config through the
 * Host's `GET/POST /api/vision-config` route (a JSON file under the DSH home),
 * NOT through the settings namespace — the rc.6 api-proxy only exposes a
 * hard-coded namespace allowlist to the browser, so a third-party settings
 * namespace's save would silently no-op.
 *
 * Built to the `__ModuleLoader__.load({ id, factory })` contract: the factory
 * returns `{ name, inject, apply }`, and the client kernel calls `apply(ctx)`
 * on mount.
 */

// --- Cordis service names required by this client plugin --------------------
const inject = ['slots']

// --- HTTP route shared with the Host half -----------------------------------
const CONFIG_ROUTE = '/api/vision-config'

// --- Locale copy ------------------------------------------------------------
const COPY = {
  title: '可接入识图模型 API',
  intro: '配置本地识图模型接口后，助手识别图片时会调用它。接口地址留空则不使用识图模型。',
  baseUrlLabel: '接口地址',
  baseUrlHint: 'OpenAI 兼容接口的 base URL，留空表示不启用识图模型。',
  baseUrlPlaceholder: '留空则不启用识图模型',
  modelLabel: '模型名',
  modelHint: '如 LM Studio 里加载的模型 ID。',
  modelPlaceholder: '留空则用默认模型',
  apiKeyLabel: 'API Key（可选）',
  apiKeyHint: '本地服务通常无需填写；留空则不发送鉴权头。',
  apiKeyPlaceholder: '留空则不发送鉴权头',
  save: '保存',
  saving: '保存中…',
  saved: '已保存',
  saveFailed: '保存失败',
  loadFailed: '加载失败',
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

/** Fetch the current config from the Host route. */
async function fetchConfig(): Promise<VisionSettingsValue> {
  const res = await fetch(CONFIG_ROUTE, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return normalizeValue(await res.json())
}

/** Persist the config through the Host route. */
async function postConfig(value: VisionSettingsValue): Promise<void> {
  const res = await fetch(CONFIG_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body && typeof body.error === 'string') message = body.error
    } catch {}
    throw new Error(message)
  }
}

/** The settings page component. */
function VisionSettingsPage(props: any): any {
  const React = require('react')

  const [baseUrl, setBaseUrl] = React.useState('')
  const [model, setModel] = React.useState('')
  const [apiKey, setApiKey] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    fetchConfig()
      .then((v) => {
        if (cancelled) return
        setBaseUrl(v.baseUrl)
        setModel(v.model)
        setApiKey(v.apiKey)
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setStatus(COPY.loadFailed)
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [])

  const save = () => {
    setStatus(COPY.saving)
    postConfig({
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      apiKey: apiKey.trim(),
    })
      .then(() => setStatus(COPY.saved))
      .catch((e: any) => setStatus(`${COPY.saveFailed}：${e && e.message ? e.message : e}`))
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
      React.createElement('button', { onClick: save, disabled: !loaded, style: buttonStyle }, COPY.save),
      React.createElement('span', { style: statusStyle }, status),
    ),
  )
}

// --- Inline styles (theme CSS variables keep the page on-theme) -------------
const pageStyle: any = { padding: '16px 4px', maxWidth: '560px' }
const headingStyle: any = { fontSize: '18px', margin: '0 0 4px' }
const introStyle: any = { fontSize: '13px', color: 'var(--dsw-alias-label-tertiary, rgba(128,128,128,0.95))', margin: '0 0 16px', lineHeight: 1.6 }
const fieldStyle: any = { display: 'block', marginBottom: '14px' }
const labelStyle: any = { fontSize: '13px', fontWeight: 600, marginBottom: '6px' }
const inputStyle: any = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.4))', background: 'var(--dsw-alias-bg-layer-3, transparent)', color: 'var(--dsw-alias-label-primary, inherit)', fontSize: '14px' }
const hintStyle: any = { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary, rgba(128,128,128,0.9))', marginTop: '4px' }
const rowStyle: any = { display: 'flex', alignItems: 'center', marginTop: '20px' }
const buttonStyle: any = { padding: '8px 18px', borderRadius: '6px', border: 'none', background: 'var(--dsw-alias-brand-primary, #4f46e5)', color: '#ffffff', cursor: 'pointer', fontSize: '14px' }
const statusStyle: any = { marginLeft: '12px', fontSize: '13px', color: 'var(--dsw-alias-label-tertiary, rgba(128,128,128,0.95))' }

/** Register the settings section. */
function apply(ctx: any): void {
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      { name: 'settings.section', id: 'vision-api', order: 30, label: COPY.title },
      (props: any) => {
        const React = require('react')
        return React.createElement(VisionSettingsPage, props)
      },
    ),
  )
}

export { apply, inject }
