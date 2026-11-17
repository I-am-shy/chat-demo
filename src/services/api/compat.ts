import type { CreateMessageRequest } from './types.js'

/**
 * 兼容模式下的输出上限。Anthropic 的 Messages 接口要求 max_tokens 必填，
 * 取一个各家模型普遍接受的值，避免网关因「缺少字段」直接拒绝请求。
 */
export const COMPAT_MAX_TOKENS = 8192

/** 标准 Anthropic 版本头，严格校验的网关会要求 */
export const ANTHROPIC_VERSION = '2023-06-01'

/**
 * 转成标准 Anthropic Messages 请求体。
 * 去掉 Chat Engine 的扩展字段（thinking / tools / safety_check / title 与
 * latest_reminder 角色）：one-api / new-api 这类聚合网关按标准 schema 校验，
 * 遇到缺失的 max_tokens 或未知字段会直接返回 400。
 * latest_reminder 的正文并入 system，保留当前日期上下文。
 */
export const toCompatibleBody = (body: CreateMessageRequest): CreateMessageRequest => {
  const reminders = body.messages.flatMap((message) =>
    message.role === 'latest_reminder' ? [message.content] : []
  )
  return {
    model: body.model,
    system: [body.system, ...reminders].filter((part) => part !== '').join('\n\n'),
    messages: body.messages.filter(
      (message) => message.role === 'user' || message.role === 'assistant'
    ),
    max_tokens: COMPAT_MAX_TOKENS,
  }
}