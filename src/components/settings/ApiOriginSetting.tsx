import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  DEFAULT_API_ORIGIN,
  isValidApiOrigin,
  normalizeApiOrigin,
  setApiOrigin,
  useSettings,
} from '../../services/settings.js'
import styles from './Settings.module.css'

/** 默认地址统一去掉末尾斜杠，便于与用户输入比对 */
const defaultOrigin = normalizeApiOrigin(DEFAULT_API_ORIGIN) ?? DEFAULT_API_ORIGIN

/** API 地址：留空或「恢复默认」即使用构建时注入的地址。 */
export const ApiOriginSetting = () => {
  const t = useTranslate()
  const apiOrigin = useSettings((state) => state.apiOrigin)
  const [value, setValue] = useState(apiOrigin ?? '')
  const [invalid, setInvalid] = useState(false)

  const commit = () => {
    const normalized = normalizeApiOrigin(value)
    // 空值或与默认地址相同都视为未覆盖
    if (normalized === null || normalized === defaultOrigin) {
      setApiOrigin(null)
      setValue('')
      setInvalid(false)
      return
    }
    if (!isValidApiOrigin(normalized)) {
      setInvalid(true)
      return
    }
    setApiOrigin(normalized)
    setValue(normalized)
    setInvalid(false)
  }

  const restore = () => {
    setApiOrigin(null)
    setValue('')
    setInvalid(false)
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
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setInvalid(false)
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.currentTarget.blur()
              }
            }}
          />
        </div>
        <div className={styles.description}>{t('settingsApiOriginDescription')}</div>
        {invalid ? <div className={styles.error}>{t('settingsApiOriginInvalid')}</div> : null}
        {apiOrigin ? (
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