import { createPortal } from 'react-dom'
import { useState } from 'react'
import { LockIcon } from '../components/LockIcon.js'
import type { ProtectionBinding, VaultTarget } from '../../shared/contracts.js'
import type { VaultClientStore } from '../store-types.js'
import { resolveRowLockState, useVaultSnapshot, useVaultStore } from '../unlock/controller.js'
import { passwordPolicyError } from '../../shared/password-policy.js'
import { rememberWorkspaceIdForSession, workspaceIdForSession } from './presentation.js'

export interface VaultRowActionProps {
  readonly locked?: boolean
  readonly kind?: 'workspace' | 'session'
  readonly workspaceId?: string
  readonly sessionId?: string
  readonly store?: VaultClientStore
  readonly onUnlock?: () => void
  readonly onLock?: () => void
  readonly presentation?: { readonly label?: string }
}

interface QuickLockError {
  readonly title: string
  readonly detail?: string
  readonly blocksSubmit?: boolean
}

type QuickLockDialog = 'password' | 'inherited-workspace' | 'unresolved-workspace'

const inheritedWorkspaceProtectionError: QuickLockError = {
  title: '此对话已继承工作区保护',
  detail: '无需再次设置密码。请在工作区级别管理保护。',
  blocksSubmit: true,
}

export function VaultRowAction({ locked: lockedProp, kind: kindProp, workspaceId, sessionId, store: storeProp, onUnlock, onLock, presentation }: VaultRowActionProps) {
  const [dialogOpen, setDialogOpen] = useState<QuickLockDialog | null>(null)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<QuickLockError | null>(null)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const store = useVaultStore(storeProp)
  const liveSnapshot = useVaultSnapshot(store)
  const kind = kindProp ?? (sessionId !== undefined ? 'session' : workspaceId !== undefined ? 'workspace' : undefined)
  const resolvedWorkspaceId = kind === 'session' && sessionId !== undefined
    ? workspaceId ?? workspaceIdForSession(sessionId)
    : workspaceId
  if (kind === 'session' && sessionId !== undefined) rememberWorkspaceIdForSession(sessionId, resolvedWorkspaceId)
  const state = resolveRowLockState(store, kind, resolvedWorkspaceId, sessionId)
  const locked = lockedProp ?? state.locked
  const snapshot = liveSnapshot
  const passwordPolicy = snapshot?.policy.passwordPolicy ?? { minLength: 8, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSymbol: false }
  const target: VaultTarget | undefined = kind === 'workspace' && workspaceId !== undefined
    ? { type: 'workspace', id: workspaceId }
    : kind === 'session' && sessionId !== undefined
      ? { type: 'session', id: sessionId, ...(resolvedWorkspaceId === undefined ? {} : { workspaceId: resolvedWorkspaceId }) }
      : undefined
  const binding = snapshot?.bindings.find(candidate => candidate.targetType === kind && candidate.targetId === target?.id)
  const inheritsWorkspaceProtection = kind === 'session' && resolvedWorkspaceId !== undefined && snapshot?.bindings.some(candidate => (
    candidate.targetType === 'workspace'
    && candidate.targetId === resolvedWorkspaceId
    && candidate.mode === 'direct'
  )) === true
  const workspaceContextIsUnavailable = kind === 'session'
    && resolvedWorkspaceId === undefined
    && snapshot?.bindings.some(candidate => candidate.targetType === 'workspace' && candidate.mode === 'direct') === true
  const collapseWorkspace = () => {
    if (kind !== 'workspace' || typeof document === 'undefined') return
    const row = document.activeElement?.closest<HTMLElement>('[role="treeitem"]')
    if (row?.getAttribute('aria-expanded') === 'true') row.click()
  }
  if (locked) return null
  if (!locked && target === undefined && onLock === undefined) return null

  const groupNameBase = (presentation?.label?.trim() || `${target?.type === 'workspace' ? '工作区' : '对话'}保护`).slice(0, 128)
  const groupName = (() => {
    const names = new Set(snapshot?.groups.map(group => group.name) ?? [])
    if (!names.has(groupNameBase)) return groupNameBase
    for (let suffix = 2; suffix < 1000; suffix += 1) {
      const candidate = `${groupNameBase} (${suffix})`.slice(0, 128)
      if (!names.has(candidate)) return candidate
    }
    return `${groupNameBase.slice(0, 120)} (new)`
  })()
  const save = () => {
    if (store === undefined || target === undefined || pending) return
    const passwordError = passwordPolicyError(password, passwordPolicy)
    if (passwordError !== undefined) { setError({ title: passwordError }); return }
    if (password !== confirmation) { setError({ title: '两次密码不一致' }); return }
    setPending(true)
    setError(null)
    const now = new Date().toISOString()
    const bindingInput: ProtectionBinding = {
      targetType: target.type,
      targetId: target.id,
      mode: 'direct',
      ...(target.type === 'session' && target.workspaceId !== undefined ? { workspaceId: target.workspaceId } : {}),
      createdAt: now,
      updatedAt: now,
    }
    void store.createGroup({ name: groupName, password, bindings: [bindingInput] })
      .then(result => {
        if (result.ok) {
          setRecoveryKey(result.value.recoveryKey)
          setPassword('')
          setConfirmation('')
        } else {
          setError(result.error.code === 'invalid-binding'
            ? inheritedWorkspaceProtectionError
            : result.error.code === 'duplicate-name'
              ? { title: '该对话已有同名保护记录' }
              : result.error.code === 'weak-password'
                ? { title: '密码不符合当前策略' }
                : { title: '创建失败，请重试', detail: '保险箱暂时无法创建保护，请稍后重试。' })
        }
      })
      .catch(() => setError({ title: '保险箱暂时不可用', detail: '请稍后重试。' }))
      .finally(() => setPending(false))
  }
  const toggle = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (locked) {
      if (onUnlock !== undefined) { onUnlock(); return }
      if (store !== undefined && state.groupId !== undefined && target !== undefined) void store.requestUnlock(state.groupId, target)
      return
    }
    if (onLock !== undefined) { onLock(); collapseWorkspace(); return }
    if (binding?.passwordGroupId !== undefined && store !== undefined) {
      void store.lockGroup(binding.passwordGroupId).then(result => { if (result.ok) collapseWorkspace() })
      return
    }
    if (inheritsWorkspaceProtection) {
      setDialogOpen('inherited-workspace')
      setError(null)
      return
    }
    if (workspaceContextIsUnavailable) {
      setDialogOpen('unresolved-workspace')
      setError(null)
      return
    }
    setDialogOpen('password')
    setError(null)
  }

  return <span className="dsh-vault-row-action">
    <button type="button" className="dsh-vault-row-action-button" aria-label={locked ? '解锁' : '上锁'} onClick={toggle}><LockIcon className="dsh-vault-lock-icon" /></button>
    {dialogOpen !== null && typeof document !== 'undefined' ? createPortal(<div className="dsh-vault-dialog-backdrop">
      <section className="dsh-vault-dialog dsh-vault-quick-lock-dialog" role="dialog" aria-label={dialogOpen === 'password' ? '设置密码并上锁' : '不能单独上锁'} aria-modal="true">
        {dialogOpen === 'inherited-workspace' ? <>
          <h2>不能单独上锁</h2><p>此对话已继承工作区保护。</p>
          <div className="dsh-vault-quick-lock-error" role="status"><strong>无需再次设置密码</strong><span>请在工作区级别管理保护。</span></div>
          <div className="dsh-vault-dialog-actions"><button type="button" className="dsh-vault-button dsh-vault-button-primary" onClick={() => setDialogOpen(null)}>知道了</button></div>
        </> : dialogOpen === 'unresolved-workspace' ? <>
          <h2>不能单独上锁</h2><p>无法确认此对话的工作区归属。</p>
          <div className="dsh-vault-quick-lock-error" role="status"><strong>为避免重复创建保护</strong><span>请在工作区级别管理保护。</span></div>
          <div className="dsh-vault-dialog-actions"><button type="button" className="dsh-vault-button dsh-vault-button-primary" onClick={() => setDialogOpen(null)}>知道了</button></div>
        </> : recoveryKey === null ? <>
          <h2>设置密码并上锁</h2><p>保存后将立即锁定当前对话。</p>
          <label className="dsh-vault-field" htmlFor="dsh-vault-quick-password"><span>密码</span><input id="dsh-vault-quick-password" type="password" minLength={passwordPolicy.minLength} value={password} onChange={event => setPassword(event.currentTarget.value)} /></label>
          {password.length > 0 && passwordPolicyError(password, passwordPolicy) !== undefined && <p className="dsh-vault-settings-warning" role="note">{passwordPolicyError(password, passwordPolicy)}</p>}
          <label className="dsh-vault-field" htmlFor="dsh-vault-quick-confirm"><span>确认密码</span><input id="dsh-vault-quick-confirm" type="password" value={confirmation} onChange={event => { setConfirmation(event.currentTarget.value); if (error?.title === '两次密码不一致') setError(null) }} /></label>
          {error !== null && <div className="dsh-vault-quick-lock-error" role="alert"><strong>{error.title}</strong>{error.detail !== undefined && <span>{error.detail}</span>}</div>}
          <div className="dsh-vault-dialog-actions"><button type="button" className="dsh-vault-button" onClick={() => setDialogOpen(null)}>取消</button><button type="button" className="dsh-vault-button dsh-vault-button-primary" disabled={pending || error?.blocksSubmit === true || password.length === 0 || confirmation.length === 0} onClick={save}>保存并上锁</button></div>
        </> : <><h2>已上锁</h2><p>请保存这条恢复密钥，关闭后不会再次显示。</p><output className="dsh-vault-recovery-key">{recoveryKey}</output><button type="button" className="dsh-vault-button dsh-vault-button-primary" onClick={() => { setRecoveryKey(null); setDialogOpen(null) }}>完成</button></>}
      </section>
    </div>, document.body) : null}
  </span>
}
