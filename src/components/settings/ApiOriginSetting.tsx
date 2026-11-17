import { useState, type KeyboardEvent } from 'react'
import { DEFAULT_API_PATH } from '../../config.js'
import { useTranslate } from '../../i18n/index.js'
import {
  DEFAULT_API_ORIGIN,
  isValidApiOrigin,
  isValidApiPath,
  normalizeApiOrigin,
  normalizeApiPath,
  parseApiAddress,
  setApiOrigin,
  setApiPath,
  setCompatMode,
  useSettings,
} from '../../services/settings.js'
import styles from './Settings.module.css'

/** 默认地址统一去掉末尾斜杠，便于与用户输入比对 */
const defaultOrigin = normalizeApiOrigin(DEFAULT_API_ORIGIN) ?? DEFAULT_API_ORIGIN

/**
 * API 地址与路径前缀：留空或「恢复默认」即使用默认值。
 * 聚合网关（one-api / new-api）常把 Claude 兼容接口放在 /v1 下，而不是 /anthropic/v1。
 */
export const ApiOriginSetting = () => {
  const t = useTranslate()
  const apiOrigin = useSettings((state) => state.apiOrigin)
  const apiPath = useSettings((state) => state.apiPath)
  const compatMode = useSettings((state) => state.compatMode)
  const [origin, setOrigin] = useState(apiOrigin ?? '')
  const [path, setPath] = useState(apiPath ?? '')
  const [originInvalid, setOriginInvalid] = useState(false)
  const [pathInvalid, setPathInvalid] = useState(false)

  const commitOrigin = () => {
    const raw = origin.trim()
    if (raw === '') {
      setApiOrigin(null)
      setOrigin('')
      setOriginInvalid(false)
      return
    }
    // 地址里若带了路径（含直接粘贴的完整接口地址），把路径移到「路径前缀」
    const parsed = parseApiAddress(raw)
    if (!isValidApiOrigin(parsed.origin)) {
      setOriginInvalid(true)
      return
    }
    if (parsed.path !== null) {
      const nextPath = parsed.path === DEFAULT_API_PATH ? null : parsed.path
      setApiPath(nextPath)
      setPath(nextPath ?? '')
      setPathInvalid(false)
    }
    if (parsed.origin === defaultOrigin) {
      setApiOrigin(null)
      setOrigin('')
    } else {
      setApiOrigin(parsed.origin)
      setOrigin(parsed.origin)
    }
    setOriginInvalid(false)
  }

  const commitPath = () => {
    const normalized = normalizeApiPath(path)
    if (normalized === null || normalized === DEFAULT_API_PATH) {
      setApiPath(null)
      setPath('')
      setPathInvalid(false)
      return
    }
    if (!isValidApiPath(normalized)) {
      setPathInvalid(true)
      return
    }
    setApiPath(normalized)
    setPath(normalized)
    setPathInvalid(false)
  }

  const restore = () => {
    setApiOrigin(null)
    setApiPath(null)
    setOrigin('')
    setPath('')
    setOriginInvalid(false)
    setPathInvalid(false)
  }

  const pressEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.currentTarget.blur()
    }
  }

  return (
    <div className={styles.cell}>
      <div className={styles.field}>
        <div className={styles.label}>{t('settingsApiOrigin')}</div>
        <div className={styles.textInput}>
          <input
            placeholder={defaultOrigin}
            aria-label={t('settingsApiOrigin')}
            autoComplete="off"
            spellCheck={false}
            value={origin}
            onChange={(event) => {
              setOrigin(event.target.value)
              setOriginInvalid(false)
            }}
            onBlur={commitOrigin}
            onKeyDown={pressEnter}
          />
        </div>
        <div className={styles.label}>{t('settingsApiPath')}</div>
        <div className={styles.textInput}>
          <input
            placeholder={DEFAULT_API_PATH}
            aria-label={t('settingsApiPath')}
            autoComplete="off"
            spellCheck={false}
            value={path}
            onChange={(event) => {
              setPath(event.target.value)
              setPathInvalid(false)
            }}
            onBlur={commitPath}
            onKeyDown={pressEnter}
          />
        </div>
        <div className={styles.description}>
          {t('settingsApiOriginDescription', {
            origin: defaultOrigin,
            path: DEFAULT_API_PATH,
          })}
        </div>
        <label className={styles.compatRow}>
          <input
            type="checkbox"
            checked={compatMode}
            onChange={(event) => setCompatMode(event.target.checked)}
          />
          <span>{t('settingsCompatMode')}</span>
        </label>
        <div className={styles.description}>{t('settingsCompatModeDescription')}</div>
        {originInvalid ? (
          <div className={styles.error}>{t('settingsApiOriginInvalid')}</div>
        ) : null}
        {pathInvalid ? <div className={styles.error}>{t('settingsApiPathInvalid')}</div> : null}
        {apiOrigin || apiPath ? (
          <div className={styles.fieldActions}>
            <button type="button" className={styles.confirm} onClick={restore}>
              {t('settingsRestoreDefault')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}