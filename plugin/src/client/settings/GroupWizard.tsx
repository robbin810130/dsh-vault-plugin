import { useState } from 'react'
import type { FormEvent } from 'react'
import type { VaultClientStore } from '../store-types.js'
import { passwordPolicyError } from '../../shared/password-policy.js'

export interface GroupWizardProps {
  readonly store: VaultClientStore
  readonly onClose?: () => void
}

export function GroupWizard({ store, onClose }: GroupWizardProps) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const passwordPolicy = typeof store.getSnapshot === 'function'
    ? store.getSnapshot().policy.passwordPolicy
    : { minLength: 8, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSymbol: false }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (password !== confirmation) { setError('两次密码不一致'); return }
    const passwordError = passwordPolicyError(password, passwordPolicy)
    if (passwordError !== undefined) { setError(passwordError); return }
    if (name.trim().length === 0 || password.length === 0 || pending) return
    setPending(true)
    setError(null)
    void store.createGroup({ name: name.trim(), password, bindings: [] })
      .then(result => {
        if (result.ok) setRecoveryKey(result.value.recoveryKey)
        else setError(result.error.code === 'duplicate-name' ? '密码组名称已存在' : result.error.code === 'weak-password' ? '密码不符合当前策略' : '创建失败，请重试')
      })
      .catch(() => setError('保险箱暂时不可用，请稍后重试'))
      .finally(() => { setPending(false); setPassword(''); setConfirmation('') })
  }

  if (recoveryKey !== null) return (
    <section className="dsh-vault-settings-panel" aria-labelledby="dsh-vault-recovery-key-title">
      <h3 id="dsh-vault-recovery-key-title">请保存恢复密钥</h3>
      <output className="dsh-vault-recovery-key">{recoveryKey}</output>
      <p>关闭后将不再显示。</p>
      <button type="button" className="dsh-vault-button dsh-vault-button-primary" onClick={() => { setRecoveryKey(null); onClose?.() }}>完成</button>
    </section>
  )

  return (
    <form className="dsh-vault-settings-panel" onSubmit={submit}>
      <h3>新建密码组</h3>
      <label className="dsh-vault-field" htmlFor="dsh-vault-group-name"><span>密码组名称</span><input id="dsh-vault-group-name" value={name} onChange={event => setName(event.currentTarget.value)} /></label>
      <label className="dsh-vault-field" htmlFor="dsh-vault-group-password"><span>密码</span><input id="dsh-vault-group-password" type="password" minLength={passwordPolicy.minLength} value={password} onChange={event => setPassword(event.currentTarget.value)} /></label>
      <label className="dsh-vault-field" htmlFor="dsh-vault-group-confirm"><span>确认密码</span><input id="dsh-vault-group-confirm" type="password" value={confirmation} onChange={event => setConfirmation(event.currentTarget.value)} /></label>
      {password.length > 0 && passwordPolicyError(password, passwordPolicy) !== undefined && <p className="dsh-vault-settings-warning" role="note">{passwordPolicyError(password, passwordPolicy)}</p>}
      {error !== null && <p className="dsh-vault-settings-warning" role="alert">{error}</p>}
      <div className="dsh-vault-dialog-actions"><button type="button" className="dsh-vault-button" onClick={onClose}>取消</button><button type="submit" className="dsh-vault-button dsh-vault-button-primary" disabled={pending || name.trim().length === 0 || password.length === 0 || confirmation.length === 0 || passwordPolicyError(password, passwordPolicy) !== undefined}>创建密码组</button></div>
    </form>
  )
}
