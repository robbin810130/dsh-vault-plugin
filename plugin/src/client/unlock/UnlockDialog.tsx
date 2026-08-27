import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { LockIcon } from '../components/LockIcon.js'
import type { VaultClientStore } from '../store-types.js'
import { resolvePromptSnapshot, unlockMessage, useVaultStore } from './controller.js'

export interface UnlockDialogProps {
  readonly store?: VaultClientStore
}

function usePrompt(store: VaultClientStore | undefined) {
  const snapshot = useSyncExternalStore(
    listener => store?.subscribe(listener) ?? (() => undefined),
    () => store?.getSnapshot(),
    () => store?.getSnapshot(),
  )
  return useMemo(() => resolvePromptSnapshot(snapshot), [snapshot])
}

export function UnlockDialog({ store: storeProp }: UnlockDialogProps) {
  const store = useVaultStore(storeProp)
  const promptState = usePrompt(store)
  const passwordId = useId()
  const descriptionId = useId()
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const groupId = promptState?.prompt.groupId
  const group = useMemo(() => {
    if (promptState === null || groupId === undefined) return undefined
    return promptState.snapshot.groups.find(candidate => candidate.id === groupId)
  }, [promptState, groupId])

  useEffect(() => {
    if (promptState === null) {
      setPassword('')
      setError(null)
      setPending(false)
      return
    }
    inputRef.current?.focus()
  }, [promptState])

  useEffect(() => () => {
    setPassword('')
    setError(null)
  }, [])

  if (store === undefined || promptState === null || groupId === undefined) return null

  const close = () => {
    setPassword('')
    setError(null)
    setPending(false)
    store.cancelUnlock(groupId)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (password.length === 0 || pending) return
    setPending(true)
    setError(null)
    void store.unlock(groupId, password)
      .then((result) => {
        if (result.ok) {
          setPassword('')
          setError(null)
          store.settleUnlock(groupId)
          return
        }
        setError(unlockMessage(result.error.code, result.error.retryAt))
      })
      .catch(() => {
        setError(unlockMessage('host-unavailable'))
      })
      .finally(() => {
        setPending(false)
      })
  }

  const dialog = (
    <div className="dsh-vault-dialog-backdrop">
      <form
        className="dsh-vault-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={descriptionId}
        aria-describedby={error === null ? descriptionId : `${descriptionId} ${errorId}`}
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close()
        }}
      >
        <LockIcon className="dsh-vault-dialog-icon" />
        <h2 id={descriptionId} className="dsh-vault-dialog-title">已上锁</h2>
        <p className="dsh-vault-dialog-copy">需要解锁才能查看内容</p>
        {group?.recoveryConfigured === true && (
          <p className="dsh-vault-dialog-support">受保护</p>
        )}
        <label className="dsh-vault-field" htmlFor={passwordId}>
          <span>密码</span>
          <input
            ref={inputRef}
            id={passwordId}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={event => {
              setPassword(event.currentTarget.value)
              if (error !== null) setError(null)
            }}
          />
        </label>
        {error !== null && (
          <p className="dsh-vault-dialog-error" id={errorId} role="alert">
            {error}
          </p>
        )}
        <div className="dsh-vault-dialog-actions">
          <button
            type="button"
            className="dsh-vault-button"
            onClick={close}
          >
            取消
          </button>
          <button
            type="submit"
            className="dsh-vault-button dsh-vault-button-primary"
            disabled={password.length === 0 || pending}
          >
            解锁
          </button>
        </div>
      </form>
    </div>
  )
  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body)
}
