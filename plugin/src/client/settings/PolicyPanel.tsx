import { useEffect, useRef, useState } from 'react'
import type { VaultPolicy } from '../../shared/contracts.js'
import { passwordPolicyError } from '../../shared/password-policy.js'

export interface PolicyPanelProps {
  readonly policy: VaultPolicy
  readonly onChange?: (policy: VaultPolicy) => Promise<void> | void
  readonly pending?: boolean
  readonly saveError?: string | null
  readonly onLockAll?: () => void
}

export function PolicyPanel({ policy, onChange, onLockAll, pending = false, saveError = null }: PolicyPanelProps) {
  const [value, setValue] = useState(policy)
  const [numbers, setNumbers] = useState(() => numericDraft(policy))
  const [error, setError] = useState<string | null>(null)
  const dirty = useRef(false)
  const saving = useRef(false)
  // A grant update or refresh must not replace an unfinished numeric draft.
  useEffect(() => {
    if (!dirty.current && !saving.current) { setValue(policy); setNumbers(numericDraft(policy)) }
  }, [policy])
  const update = (next: VaultPolicy) => {
    dirty.current = true
    setError(null)
    setValue(next)
  }
  const updateNumber = (field: keyof ReturnType<typeof numericDraft>, next: string) => {
    dirty.current = true
    setError(null)
    setNumbers(current => ({ ...current, [field]: next }))
  }
  const save = async () => {
    if (pending || saving.current || onChange === undefined) return
    const minLength = Number(numbers.minLength)
    const maxAttempts = Number(numbers.maxAttempts)
    const cooldownSeconds = Number(numbers.cooldownSeconds)
    if (numbers.minLength.trim() === '' || !Number.isSafeInteger(minLength) || minLength < 4 || minLength > 128) {
      setError('密码最小长度必须为 4–128 的整数'); return
    }
    if (numbers.maxAttempts.trim() === '' || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1
      || numbers.cooldownSeconds.trim() === '' || !Number.isSafeInteger(cooldownSeconds) || cooldownSeconds < 1) {
      setError('最大尝试次数和暂停时间必须为大于 0 的整数'); return
    }
    const next: VaultPolicy = { ...value, passwordPolicy: { ...value.passwordPolicy, minLength },
      failedAttemptProtection: { ...value.failedAttemptProtection, maxAttempts, cooldownSeconds } }
    saving.current = true
    setError(null)
    try {
      await onChange(next)
      dirty.current = false
      setValue(next)
      setNumbers(numericDraft(next))
    } catch {
      // The card retains a sanitized, visible persistence error; keep the draft.
    } finally { saving.current = false }
  }
  const protection = value.failedAttemptProtection
  const passwordPolicy = value.passwordPolicy
  const updatePasswordPolicy = (next: VaultPolicy['passwordPolicy']) => update({ ...value, passwordPolicy: next })

  return (
    <section className="dsh-vault-settings-panel" aria-label="锁定策略">
      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <label className="dsh-vault-field" htmlFor="dsh-vault-auto-lock">
        <span>自动锁定</span>
        <select
          id="dsh-vault-auto-lock"
          value={value.autoLockMinutes}
          onChange={event => update({ ...value, autoLockMinutes: Number(event.currentTarget.value) as VaultPolicy['autoLockMinutes'] })}
        >
          <option value="0">不自动锁定</option>
          <option value="15">15 分钟</option>
          <option value="30">30 分钟</option>
          <option value="60">60 分钟</option>
        </select>
      </label>
      <label className="dsh-vault-checkbox">
        <input
          type="checkbox"
          checked={value.lockOnSystemSleep}
          onChange={event => update({ ...value, lockOnSystemSleep: event.currentTarget.checked })}
        />
        系统休眠时上锁
      </label>
      <label className="dsh-vault-checkbox">
        <input
          type="checkbox"
          aria-label="失败尝试保护"
          checked={protection.enabled}
          onChange={event => update({ ...value, failedAttemptProtection: { ...protection, enabled: event.currentTarget.checked } })}
        />
        失败尝试保护
      </label>
      {protection.enabled ? (
        <div className="dsh-vault-policy-fields">
          <label className="dsh-vault-field" htmlFor="dsh-vault-max-attempts">
            <span>最大尝试次数</span>
            <input id="dsh-vault-max-attempts" type="number" min="1" value={numbers.maxAttempts} onChange={event => updateNumber('maxAttempts', event.currentTarget.value)} />
          </label>
          <label className="dsh-vault-field" htmlFor="dsh-vault-cooldown">
            <span>暂停时间（秒）</span>
            <input id="dsh-vault-cooldown" type="number" min="1" value={numbers.cooldownSeconds} onChange={event => updateNumber('cooldownSeconds', event.currentTarget.value)} />
          </label>
        </div>
      ) : (
        <p className="dsh-vault-settings-warning" role="note">关闭后不会累计失败次数或进入暂停期</p>
      )}
      <label className="dsh-vault-field" htmlFor="dsh-vault-password-min-length"><span>密码最小长度</span><input id="dsh-vault-password-min-length" type="number" min="4" max="128" value={numbers.minLength} onChange={event => updateNumber('minLength', event.currentTarget.value)} /></label>
      <label className="dsh-vault-checkbox"><input type="checkbox" aria-label="要求大写字母" checked={passwordPolicy.requireUppercase} onChange={event => updatePasswordPolicy({ ...passwordPolicy, requireUppercase: event.currentTarget.checked })} />要求大写字母</label>
      <label className="dsh-vault-checkbox"><input type="checkbox" aria-label="要求小写字母" checked={passwordPolicy.requireLowercase} onChange={event => updatePasswordPolicy({ ...passwordPolicy, requireLowercase: event.currentTarget.checked })} />要求小写字母</label>
      <label className="dsh-vault-checkbox"><input type="checkbox" aria-label="要求数字" checked={passwordPolicy.requireNumber} onChange={event => updatePasswordPolicy({ ...passwordPolicy, requireNumber: event.currentTarget.checked })} />要求数字</label>
      <label className="dsh-vault-checkbox"><input type="checkbox" aria-label="要求符号" checked={passwordPolicy.requireSymbol} onChange={event => updatePasswordPolicy({ ...passwordPolicy, requireSymbol: event.currentTarget.checked })} />要求符号</label>
      <p className="dsh-vault-settings-warning" role="note">{passwordPolicyError('示例密码', passwordPolicy) ?? '当前密码策略已满足最低要求'}</p>
      </fieldset>
      {(error ?? saveError) !== null && <p className="dsh-vault-settings-warning" role="alert">{error ?? saveError}</p>}
      {pending && <p role="status">保存中，请稍候…</p>}
      <button type="button" className="dsh-vault-button dsh-vault-button-primary" disabled={pending || onChange === undefined} onClick={() => { void save() }}>{pending ? '保存中…' : '保存策略'}</button>
      {onLockAll !== undefined && (
        <div className="dsh-vault-settings-heading dsh-vault-settings-heading-actions-only">
          <button type="button" className="dsh-vault-button dsh-vault-button-primary" onClick={onLockAll}>立即全部上锁</button>
        </div>
      )}
    </section>
  )
}

function numericDraft(policy: VaultPolicy) {
  return { minLength: String(policy.passwordPolicy.minLength), maxAttempts: String(policy.failedAttemptProtection.maxAttempts), cooldownSeconds: String(policy.failedAttemptProtection.cooldownSeconds) }
}
