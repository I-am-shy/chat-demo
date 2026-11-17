/**
 * 应用级默认配置。
 * 设置面板中的「模型」列表与「系统提示词」可覆盖这里的值；未覆盖时使用本文件的默认值。
 */

/** 已配置模型：id 为请求体 model 字段，label 为展示别名（空字符串时显示 id） */
export type ModelEntry = {
  id: string
  label: string
}

/**
 * 默认模型列表，也是设置里「恢复默认」的目标。
 * deepseek-flash 同时支持深度思考与图片输入。
 */
export const DEFAULT_MODELS: readonly ModelEntry[] = [
  { id: 'deepseek-flash', label: '' },
  { id: 'deepseek-v4-pro', label: '' },
]

/** 列表为空或选中项失效时的兜底模型 */
export const DEFAULT_MODEL: string = DEFAULT_MODELS[0].id

/** 默认系统提示词：所有生成请求统一携带的助手身份说明 */
export const DEFAULT_SYSTEM_PROMPT = '该助手为DeepSeek，由深度求索公司创造。'

/**
 * 默认 API 路径前缀（拼在 API 地址之后）。
 * DeepSeek 的 Anthropic 兼容接口在 /anthropic/v1 下；one-api / new-api 这类聚合网关通常是 /v1。
 */
export const DEFAULT_API_PATH = '/anthropic/v1'