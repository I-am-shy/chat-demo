import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SYSTEM_PROMPT } from '../../config.js'
import { useTranslate } from '../../i18n/index.js'
import {
  setModel,
  setModels,
  setSystemPrompt,
  useModelOptions,
  useSettings,
} from '../../services/settings.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { IconCloseFill14 } from '../base/icons.js'
import styles from './Settings.module.css'

/**
 * 行内输入：非受控，失焦或回车提交；提交被拒绝（空值、重名）时回滚为已提交值，
 * 外部改动（恢复默认、改名）在未聚焦时同步回显示值。
 */
const InlineInput = ({
  value,
  placeholder,
  ariaLabel,
  commit,
}: {
  value: string
  placeholder: string
  ariaLabel: string
  commit: (next: string) => boolean
}) => {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = ref.current
    if (input && document.activeElement !== input && input.value !== value) {
      input.value = value
    }
  }, [value])

  return (
    <input
      ref={ref}
      className={styles.modelField}
      defaultValue={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoComplete="off"
      spellCheck={false}
      onBlur={(event) => {
        const input = event.currentTarget
        if (!commit(input.value)) {
          input.value = value
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.currentTarget.blur()
        }
      }}
    />
  )
}

/**
 * 已配置模型：别名与模型名分开填写，可增删、可改名。列表会同步到聊天输入区旁的下拉框，
 * 删除或改名后选中项会跟随。
 */
export const ModelSetting = () => {
  const t = useTranslate()
  const { options, model } = useModelOptions()
  const configured = useSettings((state) => state.models)
  const [alias, setAlias] = useState('')
  const [name, setName] = useState('')
  const [duplicate, setDuplicate] = useState(false)

  const add = () => {
    const id = name.trim()
    if (!id) {
      return
    }
    if (options.some((entry) => entry.id === id)) {
      setDuplicate(true)
      return
    }
    setModels([...options, { id, label: alias.trim() }])
    setAlias('')
    setName('')
    setDuplicate(false)
  }

  const renameAlias = (id: string, label: string) => {
    const entry = options.find((item) => item.id === id)
    if (!entry || entry.label === label.trim()) {
      return true
    }
    setModels(options.map((item) => (item.id === id ? { ...item, label } : item)))
    return true
  }

  const renameId = (id: string, next: string) => {
    const value = next.trim()
    if (value === id) {
      return true
    }
    if (value === '') {
      return false
    }
    if (options.some((entry) => entry.id === value)) {
      setDuplicate(true)
      return false
    }
    // 改名后让选中项跟随，避免被当成「选中的模型已删除」
    const selected = model === id
    setModels(options.map((entry) => (entry.id === id ? { ...entry, id: value } : entry)))
    if (selected) {
      setModel(value)
    }
    setDuplicate(false)
    return true
  }

  const remove = (id: string) => setModels(options.filter((entry) => entry.id !== id))

  return (
    <div className={styles.cell}>
      <div className={styles.field}>
        <div className={styles.label}>{t('settingsModel')}</div>
        <div className={styles.description}>{t('settingsModelDescription')}</div>
        <div className={styles.modelList}>
          {options.map((entry) => (
            <div key={entry.id} className={styles.modelItem}>
              <InlineInput
                value={entry.label}
                placeholder={t('settingsModelAliasPlaceholder')}
                ariaLabel={t('settingsModelAlias')}
                commit={(next) => renameAlias(entry.id, next)}
              />
              <InlineInput
                value={entry.id}
                placeholder={t('settingsModelPlaceholder')}
                ariaLabel={t('settingsModelPlaceholder')}
                commit={(next) => renameId(entry.id, next)}
              />
              <IconButton
                icon={<IconCloseFill14 />}
                aria-label={t('delete')}
                disabled={options.length <= 1}
                onClick={() => remove(entry.id)}
              />
            </div>
          ))}
        </div>
        <div className={styles.modelAdd}>
          <div className={clsx(styles.textInput, styles.modelAddInput)}>
            <input
              placeholder={t('settingsModelAliasPlaceholder')}
              aria-label={t('settingsModelAlias')}
              autoComplete="off"
              spellCheck={false}
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
            />
          </div>
          <div className={clsx(styles.textInput, styles.modelAddInput)}>
            <input
              placeholder={t('settingsModelPlaceholder')}
              aria-label={t('settingsModelPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setDuplicate(false)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  add()
                }
              }}
            />
          </div>
          <Button size="s" variant="outlined" disabled={!name.trim()} onClick={add}>
            {t('settingsModelAdd')}
          </Button>
        </div>
        {duplicate ? <div className={styles.error}>{t('settingsModelDuplicate')}</div> : null}
        {configured ? (
          <div className={styles.fieldActions}>
            <button type="button" className={styles.confirm} onClick={() => setModels(null)}>
              {t('settingsRestoreDefault')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** 与默认值相同的内容视为未覆盖，避免「已自定义」状态误判 */
const commitPrompt = (value: string) =>
  setSystemPrompt(value.trim() === DEFAULT_SYSTEM_PROMPT.trim() ? null : value)

/** 系统提示词：多行编辑，失焦或弹窗关闭时提交。 */
export const SystemPromptSetting = () => {
  const t = useTranslate()
  const systemPrompt = useSettings((state) => state.systemPrompt)
  const effective = systemPrompt ?? DEFAULT_SYSTEM_PROMPT
  const [draft, setDraft] = useState(effective)
  const draftRef = useRef(draft)
  draftRef.current = draft

  // 恢复默认后把文本域同步回默认内容
  useEffect(() => {
    setDraft(effective)
  }, [effective])

  // 点关闭按钮时输入框可能未失焦，卸载前兜底提交一次
  useEffect(() => () => commitPrompt(draftRef.current), [])

  return (
    <div className={styles.cell}>
      <div className={styles.field}>
        <div className={styles.label}>{t('settingsSystemPrompt')}</div>
        <div className={styles.description}>{t('settingsSystemPromptDescription')}</div>
        <textarea
          className={styles.promptInput}
          rows={4}
          maxLength={20000}
          spellCheck={false}
          value={draft}
          aria-label={t('settingsSystemPrompt')}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commitPrompt(draft)}
        />
        {systemPrompt ? (
          <div className={styles.fieldActions}>
            <button type="button" className={styles.confirm} onClick={() => setSystemPrompt(null)}>
              {t('settingsRestoreDefault')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}