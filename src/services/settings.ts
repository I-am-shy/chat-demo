import { create } from 'zustand'
import {
  DEFAULT_API_PATH,
  DEFAULT_MODEL,
  DEFAULT_MODELS,
  DEFAULT_SYSTEM_PROMPT,
  type ModelEntry,
} from '../config.js'
import type { TtsVoice } from './api/speech.js'
import { normalizeLocation, type UserLocation } from './location.js'

export type Locale = 'zh-CN' | 'en-US'

/** 主题偏好；默认跟随系统 */
export type ThemePreference = 'light' | 'dark' | 'system'

/** 构建期注入的默认 API 地址（见 rspack.config.ts 的 apiOrigin 选项） */
export const DEFAULT_API_ORIGIN = __API_ORIGIN__

/**
 * 本机设置，存 localStorage：API Key、语言、主题、位置、朗读音色、深度思考与智能搜索开关、
 * 侧边栏收起状态，以及可选的模型列表、选中模型与系统提示词（null 表示沿用 config.ts 的默认值）。
 */
type Settings = {
  apiKey: string | null
  /** API 地址覆盖值；null 表示使用构建期默认地址 */
  apiOrigin: string | null
  /** API 路径前缀覆盖值；null 表示使用 config.ts 的默认路径 */
  apiPath: string | null
  /** 兼容模式：按标准 Anthropic 协议发送请求体（补 max_tokens、不带扩展字段） */
  compatMode: boolean
  locale: Locale
  themePreference: ThemePreference
  location: UserLocation | null
  ttsVoice: TtsVoice
  thinking: boolean
  search: boolean
  siderCollapsed: boolean
  /** 已配置模型；null 表示未改动，使用默认列表 */
  models: ModelEntry[] | null
  /** 当前选中的模型 id；null 表示使用列表首项 */
  model: string | null
  /** 系统提示词；null 表示使用默认值 */
  systemPrompt: string | null
}

const KEYS = {
  apiKey: 'chat-demo:api-key',
  apiOrigin: 'chat-demo:api-origin',
  apiPath: 'chat-demo:api-path',
  compatMode: 'chat-demo:compat-mode',
  locale: 'chat-demo:locale',
  location: 'chat-demo:location',
  themePreference: 'chat-demo:theme-preference',
  ttsVoice: 'chat-demo:tts-voice',
  thinking: 'chat-demo:thinking',
  search: 'chat-demo:search',
  siderCollapsed: 'chat-demo:sider-collapsed',
  models: 'chat-demo:models',
  model: 'chat-demo:model',
  systemPrompt: 'chat-demo:system-prompt',
} as const

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
}

/** 位置选择模式跟随浏览器语言，与应用内选择的界面语言无关。 */
export const isChineseBrowser = (): boolean =>
  (typeof navigator === 'undefined' ? 'zh' : navigator.language).toLowerCase().startsWith('zh')

const initialLocale = (): Locale => {
  const saved = read(KEYS.locale)
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }
  return isChineseBrowser() ? 'zh-CN' : 'en-US'
}

const initialLocation = (): UserLocation | null => {
  try {
    const location = normalizeLocation(JSON.parse(read(KEYS.location) ?? 'null'))
    if (!location) {
      return null
    }
    return isChineseBrowser()
      ? location.region === 'CN' && location.province
        ? location
        : null
      : { region: location.region }
  } catch {
    return null
  }
}

/** 未保存过时跟随系统 */
const initialThemePreference = (): ThemePreference => {
  const saved = read(KEYS.themePreference)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

/** 未保存过时使用服务端默认音色 stella（海星） */
const initialTtsVoice = (): TtsVoice => (read(KEYS.ttsVoice) === 'tide' ? 'tide' : 'stella')

/** 用户常把完整接口地址粘进来：命中这些后缀就截断，只保留域名与前缀 */
const ENDPOINT_SUFFIXES = [
  '/anthropic/v1/messages',
  '/anthropic/v1/files',
  '/anthropic/v1',
  '/v1/messages',
  '/v1/files',
  '/v1/models',
  '/messages',
  '/files',
  '/models',
  '/v1',
]

/** 规范化 API 地址：去空白与末尾斜杠、截掉误粘的接口路径，空串视为未配置 */
export const normalizeApiOrigin = (value: string): string | null => {
  let trimmed = value.trim().replace(/\/+$/, '')
  for (const suffix of ENDPOINT_SUFFIXES) {
    if (trimmed.toLowerCase().endsWith(suffix)) {
      trimmed = trimmed.slice(0, -suffix.length).replace(/\/+$/, '')
      break
    }
  }
  return trimmed === '' ? null : trimmed
}

/** 只接受 http/https 绝对地址 */
export const isValidApiOrigin = (value: string): boolean => {
  const normalized = normalizeApiOrigin(value)
  if (normalized === null) {
    return false
  }
  try {
    const url = new URL(normalized)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.host !== ''
  } catch {
    return false
  }
}

/** 完整接口地址的结尾部分，拆地址时去掉 */
const ENDPOINT_TAILS = ['/messages', '/files', '/models']

/**
 * 把用户输入拆成「地址 + 路径前缀」：允许直接粘贴完整接口地址，
 * 例如 https://host/v1/messages → { origin: 'https://host', path: '/v1' }。
 */
export const parseApiAddress = (value: string): { origin: string; path: string | null } => {
  const raw = value.trim().replace(/\/+$/, '')
  if (raw === '') {
    return { origin: '', path: null }
  }
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    let path = url.pathname.replace(/\/+$/, '')
    for (const tail of ENDPOINT_TAILS) {
      if (path.toLowerCase().endsWith(tail)) {
        path = path.slice(0, -tail.length)
        break
      }
    }
    path = path.replace(/\/+$/, '')
    return { origin: `${url.protocol}//${url.host}`, path: path === '' ? null : path }
  } catch {
    return { origin: raw, path: null }
  }
}

const initialApiOrigin = (): string | null => {
  const value = read(KEYS.apiOrigin)
  return value !== null && isValidApiOrigin(value) ? normalizeApiOrigin(value) : null
}

/** 路径前缀统一补上开头的斜杠、去掉末尾斜杠；空串视为未配置 */
export const normalizeApiPath = (value: string): string | null => {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (trimmed === '') {
    return null
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

/** 只接受不含空白与协议的绝对路径 */
export const isValidApiPath = (value: string): boolean => {
  const normalized = normalizeApiPath(value)
  return normalized !== null && /^\/[\w\-.]+(\/[\w\-.]+)*$/.test(normalized)
}

const initialApiPath = (): string | null => {
  const value = read(KEYS.apiPath)
  return value !== null && isValidApiPath(value) ? normalizeApiPath(value) : null
}

const isModelEntry = (value: unknown): value is { id: string; label?: unknown } => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const entry = value as Record<string, unknown>
  return typeof entry.id === 'string' && (entry.label === undefined || typeof entry.label === 'string')
}

const initialModels = (): ModelEntry[] | null => {
  try {
    const raw = read(KEYS.models)
    if (raw === null) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every(isModelEntry)) {
      return null
    }
    const models = normalizeModels(
      parsed.map((entry) => ({ id: entry.id, label: typeof entry.label === 'string' ? entry.label : '' }))
    )
    return models.length > 0 ? models : null
  } catch {
    return null
  }
}

const initialModel = (): string | null => {
  const value = read(KEYS.model)?.trim()
  return value ? value : null
}

/** 保留原始换行与缩进，只用 trim 判断是否为空 */
const initialSystemPrompt = (): string | null => {
  const value = read(KEYS.systemPrompt)
  return value?.trim() ? value : null
}

export const useSettings = create<Settings>(() => ({
  apiKey: read(KEYS.apiKey),
  apiOrigin: initialApiOrigin(),
  apiPath: initialApiPath(),
  compatMode: read(KEYS.compatMode) === 'true',
  locale: initialLocale(),
  location: initialLocation(),
  themePreference: initialThemePreference(),
  ttsVoice: initialTtsVoice(),
  thinking: read(KEYS.thinking) === 'true',
  search: read(KEYS.search) === 'true',
  siderCollapsed: read(KEYS.siderCollapsed) === 'true',
  models: initialModels(),
  model: initialModel(),
  systemPrompt: initialSystemPrompt(),
}))

/** 去掉空 id 与重复 id（保留首次出现的别名） */
export function normalizeModels(models: ModelEntry[]): ModelEntry[] {
  const seen = new Set<string>()
  const result: ModelEntry[] = []
  for (const entry of models) {
    const id = entry.id.trim()
    if (!id || seen.has(id)) {
      continue
    }
    seen.add(id)
    result.push({ id, label: entry.label.trim() })
  }
  return result
}

export const setLocale = (locale: Locale) => {
  write(KEYS.locale, locale)
  useSettings.setState({ locale })
}

export const setLocation = (value: UserLocation | null) => {
  const location = normalizeLocation(value)
  write(KEYS.location, location ? JSON.stringify(location) : null)
  useSettings.setState({ location })
}

export const setThemePreference = (themePreference: ThemePreference) => {
  write(KEYS.themePreference, themePreference)
  useSettings.setState({ themePreference })
}

export const setTtsVoice = (ttsVoice: TtsVoice) => {
  write(KEYS.ttsVoice, ttsVoice)
  useSettings.setState({ ttsVoice })
}

export const setApiKey = (apiKey: string | null) => {
  write(KEYS.apiKey, apiKey)
  useSettings.setState({ apiKey })
}

/** 写入 API 地址；非法地址或空值都会回落到默认地址 */
export const setApiOrigin = (apiOrigin: string | null) => {
  const normalized = apiOrigin === null ? null : normalizeApiOrigin(apiOrigin)
  const value = normalized !== null && isValidApiOrigin(normalized) ? normalized : null
  write(KEYS.apiOrigin, value)
  useSettings.setState({ apiOrigin: value })
}

/** 当前生效的 API 地址：设置里的覆盖值优先，否则用构建期默认值 */
export const getEffectiveApiOrigin = (): string =>
  useSettings.getState().apiOrigin ?? DEFAULT_API_ORIGIN

/** 写入 API 路径前缀；非法值或空值都会回落到默认路径 */
export const setApiPath = (apiPath: string | null) => {
  const normalized = apiPath === null ? null : normalizeApiPath(apiPath)
  const value = normalized !== null && isValidApiPath(normalized) ? normalized : null
  write(KEYS.apiPath, value)
  useSettings.setState({ apiPath: value })
}

/** 当前生效的 API 路径前缀 */
export const getEffectiveApiPath = (): string => useSettings.getState().apiPath ?? DEFAULT_API_PATH

/** 兼容模式：适配按标准 Anthropic schema 校验请求体的聚合网关 */
export const setCompatMode = (compatMode: boolean) => {
  write(KEYS.compatMode, compatMode ? 'true' : 'false')
  useSettings.setState({ compatMode })
}

export const getEffectiveCompatMode = (): boolean => useSettings.getState().compatMode

export const setThinking = (thinking: boolean) => {
  write(KEYS.thinking, String(thinking))
  useSettings.setState({ thinking })
}

export const setSearch = (search: boolean) => {
  write(KEYS.search, String(search))
  useSettings.setState({ search })
}

export const setSiderCollapsed = (siderCollapsed: boolean) => {
  write(KEYS.siderCollapsed, String(siderCollapsed))
  useSettings.setState({ siderCollapsed })
}

/**
 * 写入已配置模型；null 表示「恢复默认」。
 * 列表为空或当前选中的模型已被移除时，选中项回到列表首项。
 */
export const setModels = (models: ModelEntry[] | null) => {
  const normalized = models ? normalizeModels(models) : []
  const next = normalized.length > 0 ? normalized : null
  const { model } = useSettings.getState()
  const keepModel = next !== null && model !== null && next.some((entry) => entry.id === model)
  write(KEYS.models, next ? JSON.stringify(next) : null)
  if (keepModel) {
    useSettings.setState({ models: next })
    return
  }
  write(KEYS.model, null)
  useSettings.setState({ models: next, model: null })
}

export const setModel = (model: string | null) => {
  const value = model?.trim() ? model.trim() : null
  write(KEYS.model, value)
  useSettings.setState({ model: value })
}

export const setSystemPrompt = (systemPrompt: string | null) => {
  const value = systemPrompt?.trim() ? systemPrompt : null
  write(KEYS.systemPrompt, value)
  useSettings.setState({ systemPrompt: value })
}

/** 已配置模型；未改动过时回落到 config.ts 的默认列表 */
export const getModelOptions = (): readonly ModelEntry[] =>
  useSettings.getState().models ?? DEFAULT_MODELS

/** 下拉框展示名：有别名用别名，否则用模型 id */
export const getModelLabel = (entry: ModelEntry): string => entry.label || entry.id

/** 当前生效的模型 id：选中值仍在列表中时用它，否则用列表首项 */
export const getEffectiveModel = (): string => {
  const { model } = useSettings.getState()
  const options = getModelOptions()
  return options.find((entry) => entry.id === model)?.id ?? options[0]?.id ?? DEFAULT_MODEL
}

/** 当前生效的系统提示词 */
export const getEffectiveSystemPrompt = (): string =>
  useSettings.getState().systemPrompt ?? DEFAULT_SYSTEM_PROMPT

/** 订阅已配置模型与选中项，供设置列表与输入区下拉框使用 */
export const useModelOptions = () => {
  const models = useSettings((state) => state.models)
  const model = useSettings((state) => state.model)
  const options = models ?? DEFAULT_MODELS
  const effective =
    options.find((entry) => entry.id === model)?.id ?? options[0]?.id ?? DEFAULT_MODEL
  return { options, model: effective }
}