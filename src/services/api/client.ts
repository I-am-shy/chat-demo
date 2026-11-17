import { translate, type TranslationMessage } from '../../i18n/index.js'
import { getEffectiveApiOrigin, getEffectiveApiPath, getEffectiveCompatMode } from '../settings.js'
import { ANTHROPIC_VERSION, toCompatibleBody } from './compat.js'
import { readMessageEvent } from './parseEvent.js'
import { readServerSentEvents } from './sse.js'
import type {
  ApiErrorBody,
  CreateMessageRequest,
  FileObject,
  FilePurpose,
  MessageStreamEvent,
} from './types.js'

/** Anthropic 兼容接口的前缀：地址与路径前缀都可在设置里覆盖，这里按请求取当前值 */
const anthropicBaseUrl = (): string => `${getEffectiveApiOrigin()}${getEffectiveApiPath()}`
/** 引用 Files API 上传的图片、调用 Anthropic 兼容 Files API 时必须携带 */
const FILES_BETA = 'files-api-2025-04-14'

export type ApiErrorKind =
  /** 非 2xx 响应 */
  | 'http'
  /** 流中返回的错误帧（如等待生成超时），随后连接关闭 */
  | 'stream'
  /** 请求没有到达服务端（断网、跨域被拦截等） */
  | 'network'
  /** 流在 message_stop 之前结束 */
  | 'interrupted'
  /** 响应不符合协议（如非 SSE 响应） */
  | 'protocol'

export class ApiError extends Error {
  readonly localMessage?: TranslationMessage

  constructor(
    readonly kind: ApiErrorKind,
    message: string | TranslationMessage,
    readonly status?: number
  ) {
    super(typeof message === 'string' ? message : translate(message.key, message.params))
    this.name = 'ApiError'
    this.localMessage = typeof message === 'string' ? undefined : message
  }
}

const isErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  'error' in value &&
  typeof (value as ApiErrorBody).error?.message === 'string'

/** 网关对未匹配的路径常返回 HTML（SPA 兜底页、登录页、404 页），据此给出可操作的提示 */
const isHtmlContentType = (response: Response): boolean =>
  (response.headers.get('Content-Type') ?? '').toLowerCase().includes('text/html')

const looksLikeHtml = (text: string): boolean => {
  const head = text.trimStart().slice(0, 64).toLowerCase()
  return head.startsWith('<!doctype html') || head.startsWith('<html')
}

/** 错误里带上实际请求地址，便于发现路径被重复拼接 */
const htmlResponseError = (
  response: Response,
  kind: 'http' | 'protocol' = 'protocol'
): ApiError =>
  new ApiError(kind, { key: 'apiHtmlResponse', params: { url: response.url } }, response.status)

const readErrorResponse = async (
  response: Response,
  kind: 'http' | 'protocol' = 'http',
  fallback = response.statusText
): Promise<ApiError> => {
  if (isHtmlContentType(response)) {
    return htmlResponseError(response, kind)
  }
  const text = await response.text().catch(() => '')
  if (looksLikeHtml(text)) {
    return htmlResponseError(response, kind)
  }
  let message = text || fallback
  try {
    const body: unknown = JSON.parse(text)
    if (isErrorBody(body)) {
      message = body.error.message
    }
  } catch {
    // 非 JSON 响应体直接展示原文
  }
  return new ApiError(kind, message, response.status)
}

export const request = async (url: string, init: RequestInit): Promise<Response> => {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    if (init.signal?.aborted) {
      throw error
    }
    throw new ApiError('network', error instanceof Error ? error.message : String(error))
  }
  if (!response.ok) {
    throw await readErrorResponse(response)
  }
  // 2xx 但返回 HTML：路由到了前端兜底页，说明地址不对
  if (isHtmlContentType(response)) {
    throw htmlResponseError(response)
  }
  return response
}

const anthropicHeaders = (apiKey: string, beta: boolean): Record<string, string> => ({
  // DeepSeek 兼容接口的鉴权方式，也可使用 Authorization: Bearer。
  'x-api-key': apiKey,
  // Files API 和通过 file_id 引用图片时必传；纯文本聊天无需携带。
  ...(beta ? { 'anthropic-beta': FILES_BETA } : {}),
})

/** 用 GET /models 校验 API Key（不产生费用）；聚合网关只在路径前缀下提供该接口 */
export const verifyApiKey = async (apiKey: string, signal?: AbortSignal): Promise<void> => {
  const headers = { Authorization: `Bearer ${apiKey}` }
  try {
    await request(`${getEffectiveApiOrigin()}/models`, { method: 'GET', headers, signal })
    return
  } catch (error) {
    // 根路径返回 404 或 HTML 兜底页时，按配置的路径前缀再试一次
    const retriable = error instanceof ApiError && (error.kind === 'protocol' || error.status === 404)
    if (!retriable || signal?.aborted) {
      throw error
    }
  }
  await request(`${anthropicBaseUrl()}/models`, { method: 'GET', headers, signal })
}

/**
 * POST /anthropic/v1/files 上传附件（不设过期时间，会话里的历史附件一直可用）。
 * purpose 为 null 时不传该字段（图片）；purpose 必须排在 file 之前。
 */
export const uploadFile = async (
  apiKey: string,
  file: File,
  purpose: FilePurpose | null,
  signal?: AbortSignal
): Promise<FileObject> => {
  const form = new FormData()
  if (purpose) {
    form.append('purpose', purpose)
  }
  form.append('file', file)
  const response = await request(`${anthropicBaseUrl()}/files`, {
    method: 'POST',
    headers: anthropicHeaders(apiKey, true),
    body: form,
    signal,
  })
  return (await response.json()) as FileObject
}

/** DELETE /anthropic/v1/files/{file_id} */
export const deleteFile = async (apiKey: string, fileId: string): Promise<void> => {
  await request(`${anthropicBaseUrl()}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: anthropicHeaders(apiKey, true),
  })
}

const hasFile = (body: CreateMessageRequest) =>
  body.messages.some(
    (message) =>
      typeof message.content !== 'string' &&
      message.content.some((block) => block.type === 'image' || block.type === 'document')
  )

/**
 * POST /anthropic/v1/messages（stream: true），逐个产出流式事件，收到 message_stop 时结束。
 * ping、保活注释与无法解析的内容不产出；中止请求时抛出 signal 的 AbortError。
 */
export async function* streamMessage(
  apiKey: string,
  body: CreateMessageRequest,
  signal: AbortSignal
): AsyncGenerator<MessageStreamEvent> {
  // 兼容模式下换成标准 Anthropic 请求体：补 max_tokens，去掉 Chat Engine 扩展字段
  const compat = getEffectiveCompatMode()
  const payload = compat ? toCompatibleBody(body) : body
  const response = await request(`${anthropicBaseUrl()}/messages`, {
    method: 'POST',
    headers: {
      ...anthropicHeaders(apiKey, hasFile(body)),
      ...(compat ? { 'anthropic-version': ANTHROPIC_VERSION } : {}),
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ ...payload, stream: true }),
    signal,
  })
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!response.body || !contentType.includes('text/event-stream')) {
    throw await readErrorResponse(response, 'protocol', '')
  }
  for await (const { event: eventName, data } of readServerSentEvents(response.body, signal)) {
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      if (eventName !== 'error') {
        continue
      }
    }
    if (isErrorBody(payload)) {
      throw new ApiError('stream', payload.error.message)
    }
    if (eventName === 'error') {
      throw new ApiError('stream', data)
    }
    const event = readMessageEvent(payload)
    if (!event) {
      continue
    }
    yield event
    if (event.type === 'message_stop') {
      return
    }
  }
  // 服务端没有提供错误内容时保持为空，不推测断流原因。
  throw new ApiError('interrupted', '')
}
