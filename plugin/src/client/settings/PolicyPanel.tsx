import { useState } from 'react'
import type { VaultPolicy } from '../../shared/contracts.js'
import { passwordPolicyError } from '../../shared/password-policy.js'

export interface PolicyPanelProps {
  readonly policy: VaultPolicy
  readonly onChange?: (policy: VaultPolicy) => void
}

export function PolicyPanel({ policy, onChange }: PolicyPanelProps) {
  const [value, setValue] = useState(policy)
  const update = (next: VaultPolicy) => {
    setValue(next)
    onChange?.(next)
  }
  const protection = value.failedAttemptProtection
  const passwordPolicy = value.passwordPolicy
  const updatePasswordPolicy = (next: VaultPolicy['passwordPolicy']) => update({ ...value, passwordPolicy: next })

  return (
    <section className="dsh-vault-settings-panel" aria-label="锁定策略">
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
            <input id="dsh-vault-max-attempts" type="number" min="1" value={protection.maxAttempts} onChange={event => update({ ...value, failedAttemptProtection: { ...protection, maxAttempts: Math.max(1, Number(event.currentTarget.value)) } })} />
          </label>
          <label className="dsh-vault-field" htmlFor="dsh-vault-cooldown">
            <span>暂停时间（秒）</span>
            <input id="dsh-vault-cooldown" type="number" min="1" value={protection.cooldownSeconds} onChange={event => update({ ...value, failedAttemptProtection: { ...protection, cooldownSeconds: Math.max(1, Number(event.currentTarget.value)) } })} />
          </label>
        </div>
      ) : (
        <p className="dsh-vault-settings-warning" role="note">关闭后不会累计失败次数或进入暂停期</p>
      )}
      <label className="dsh-vault-field" htmlFor="dsh-vault-password-min-length"><span>密码最小长度</span><input id="dsh-vault-password-min-length" type="number" min="4" max="128" value={passwordPolicy.minLength} onChange={event => updatePasswordPolicy({ ...passwordPolicy, minLength: Math.min(128, Math.max(4, Number(event.currentTarget.value))) })} /></label>
      <label className="dsh-vault-checkbox"><input type="checkbox" aria-label="要求大写字母" checked={passwordPolicy.requireUppercase} onChange={event => updatePasswordPolicy({ ...passwordPolicy, requireUppercase: event.currentTarget.checked })} />要求大写字母</label>
      <label className="dsh-vault-checkbox"><input type="checkbox" aria-label="要求小写字母" checked={passwordPolicy.requireLowercase} onChange={event => updatePasswordPolicy({ ...passwordPolicy, requireLowercase: event.currentTarget.checked })} />要求小写字母</label>
      <label className="dsh-vault-checkbox"><input type="checkbox" aria-label="要求数字" checked={passwordPolicy.requireNumber} onChange={event => updatePasswordPolicy({ ...passwordPolicy, requireNumber: event.currentTarget.checked })} />要求数字</label>
      <label className="dsh-vault-checkbox"><input type="checkbox" aria-label="要求符号" checked={passwordPolicy.requireSymbol} onChange={event => updatePasswordPolicy({ ...passwordPolicy, requireSymbol: event.currentTarget.checked })} />要求符号</label>
      <p className="dsh-vault-settings-warning" role="note">{passwordPolicyError('示例密码', passwordPolicy) ?? '当前密码策略已满足最低要求'}</p>
    </section>
  )
}
