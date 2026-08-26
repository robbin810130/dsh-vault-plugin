import { useState } from 'react'
import type { FormEvent } from 'react'
import type { VaultClientStore } from '../store-types.js'

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
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const clearSecrets = (): void => {
    setCredential('')
    setPassword('')
    setConfirmation('')
  }

  const close = (): void => {
    clearSecrets()
    setRecoveryKey(null)
    setError(null)
    onClose?.()
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (password !== confirmation) { setError('两次密码不一致'); return }
    if (credential.length === 0 || password.length === 0 || pending) return
    setPending(true)
    setError(null)
    const request = mode === 'change'
      ? store.changePassword({ groupId, currentPassword: credential, newPassword: password, rotateRecovery })
      : store.recoverGroup({ groupId, recoveryKey: credential, newPassword: password })
    void request
      .then(result => {
        if (!result.ok) {
          setError(result.error.code === 'invalid-credentials' ? '凭据无效' : '操作失败，请刷新后重试')
          return
        }
        if (result.value.recoveryKey !== undefined) setRecoveryKey(result.value.recoveryKey)
        else onClose?.()
      })
      .catch(() => setError('保险箱暂时不可用，请稍后重试'))
      .finally(() => {
        clearSecrets()
        setPending(false)
      })
  }

  if (recoveryKey !== null) return (
    <section className="dsh-vault-settings-panel" aria-labelledby="dsh-vault-credential-recovery-title">
      <h3 id="dsh-vault-credential-recovery-title">请保存新的恢复密钥</h3>
      <output className="dsh-vault-recovery-key">{recoveryKey}</output>
      <p>关闭后将不再显示。</p>
      <button type="button" className="dsh-vault-button dsh-vault-button-primary" onClick={close}>完成</button>
    </section>
  )

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
