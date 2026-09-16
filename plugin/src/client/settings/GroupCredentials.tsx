import { recoveryDeliveryFor } from '../dialogs/recovery-delivery.js'
import { vaultOperationError } from '../i18n/errors.js'
import { useState } from 'react'
import type { FormEvent } from 'react'
import type { VaultClientStore } from '../store-types.js'
import { passwordPolicyError } from '../../shared/password-policy.js'

export interface GroupCredentialsProps {
  readonly mode: 'change' | 'recover'
  readonly groupId: string
  readonly groupName: string
  readonly store: VaultClientStore
  readonly onClose?: () => void
}

export function GroupCredentials({ mode, groupId, groupName, store, onClose }: GroupCredentialsProps) {
  const [credential, setCredential] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [rotateRecovery, setRotateRecovery] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const passwordPolicy = typeof store.getSnapshot === 'function'
    ? store.getSnapshot().policy.passwordPolicy
    : { minLength: 8, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSymbol: false }

  const clearSecrets = (): void => {
    setCredential('')
    setPassword('')
    setConfirmation('')
  }

  const close = (): void => {
    clearSecrets()
    setError(null)
    onClose?.()
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (password !== confirmation) { setError('两次密码不一致'); return }
    const passwordError = passwordPolicyError(password, passwordPolicy)
    if (passwordError !== undefined) { setError(passwordError); return }
    if (credential.length === 0 || password.length === 0 || pending) return
    const delivery = recoveryDeliveryFor(store)
    setPending(true)
    setError(null)
    const request = mode === 'change'
      ? store.changePassword({ groupId, currentPassword: credential, newPassword: password, rotateRecovery })
      : store.recoverGroup({ groupId, recoveryKey: credential, newPassword: password })
    void request
      .then(result => {
        if (!result.ok) {
          setError(result.error.code === 'invalid-credentials' ? '凭据无效' : result.error.code === 'weak-password' ? '密码不符合当前策略' : vaultOperationError(result.error.code, '操作失败，请刷新后重试'))
          return
        }
        if (result.value.recoveryKey !== undefined) delivery.deliver(result.value.recoveryKey)
        onClose?.()
      })
      .catch(() => setError('保险箱暂时不可用，请稍后重试'))
      .finally(() => {
        clearSecrets()
        setPending(false)
      })
  }

  return (
    <form className="dsh-vault-settings-panel" onSubmit={submit}>
      <h3>{mode === 'change' ? '修改密码' : '恢复密码组'}：{groupName}</h3>
      <label className="dsh-vault-field">
        <span>{mode === 'change' ? '当前密码' : '恢复密钥'}</span>
        <input
          type="password"
          autoComplete="off"
          aria-label={mode === 'change' ? '当前密码' : '恢复密钥'}
          value={credential}
          onChange={event => setCredential(event.currentTarget.value)}
        />
      </label>
      {password.length > 0 && passwordPolicyError(password, passwordPolicy) !== undefined && <p className="dsh-vault-settings-warning" role="note">{passwordPolicyError(password, passwordPolicy)}</p>}
      <label className="dsh-vault-field">
        <span>新密码</span>
        <input type="password" autoComplete="new-password" aria-label="新密码" value={password} onChange={event => setPassword(event.currentTarget.value)} />
      </label>
      <label className="dsh-vault-field">
        <span>确认新密码</span>
        <input type="password" autoComplete="new-password" aria-label="确认新密码" value={confirmation} onChange={event => setConfirmation(event.currentTarget.value)} />
      </label>
      {mode === 'change' && (
        <label className="dsh-vault-checkbox">
          <input type="checkbox" checked={rotateRecovery} onChange={event => setRotateRecovery(event.currentTarget.checked)} />
          同时轮换恢复密钥
        </label>
      )}
      {error !== null && <p className="dsh-vault-settings-warning" role="alert">{error}</p>}
      <div className="dsh-vault-dialog-actions">
        <button type="button" className="dsh-vault-button" onClick={close}>取消</button>
        <button type="submit" className="dsh-vault-button dsh-vault-button-primary" disabled={pending || credential.length === 0 || password.length === 0}>
          {mode === 'change' ? '保存新密码' : '恢复密码组'}
        </button>
      </div>
    </form>
  )
}
