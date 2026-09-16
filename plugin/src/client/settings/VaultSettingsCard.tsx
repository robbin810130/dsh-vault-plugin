import { useRef, useState } from 'react'
import type { VaultClientStore } from '../store-types.js'
import { useVaultSnapshot, useVaultStore } from '../unlock/controller.js'
import { GroupsPanel } from './GroupsPanel.js'
import { PolicyPanel } from './PolicyPanel.js'
import type { VaultPolicy } from '../../shared/contracts.js'

type Tab = 'policy' | 'groups'

// Survives settings card unmounts; independent stores do not block one another.
const policySaves = new WeakMap<VaultClientStore, Promise<void>>()
const policyFields = ['autoLockMinutes', 'lockOnSystemSleep', 'lockedNameVisibility', 'failedAttemptProtection', 'passwordPolicy'] as const

class PolicyConflict extends Error {}

function mergeLeaves<T extends object>(baseline: T, draft: T, current: T): T {
  const merged = { ...current }
  for (const field of Object.keys(baseline) as (keyof T)[]) {
    if (Object.is(draft[field], baseline[field])) continue
    if (!Object.is(current[field], baseline[field]) && !Object.is(current[field], draft[field])) {
      throw new PolicyConflict(`策略字段 ${String(field)} 存在冲突，尚未写入。草稿已保留；请载入最新策略后重新编辑。`)
    }
    merged[field] = draft[field]
  }
  return merged
}

function mergePolicy(baseline: VaultPolicy, draft: VaultPolicy, current: VaultPolicy): VaultPolicy {
  const { passwordPolicy: basePassword, failedAttemptProtection: baseAttempts, ...baseScalars } = baseline
  const { passwordPolicy: draftPassword, failedAttemptProtection: draftAttempts, ...draftScalars } = draft
  const { passwordPolicy: currentPassword, failedAttemptProtection: currentAttempts, ...currentScalars } = current
  return {
    ...mergeLeaves(baseScalars, draftScalars, currentScalars),
    passwordPolicy: mergeLeaves(basePassword, draftPassword, currentPassword),
    failedAttemptProtection: mergeLeaves(baseAttempts, draftAttempts, currentAttempts),
  }
}

// The baseline belongs to the mounted draft, not to the store at save time.
// Capture before the panel's first input change; clean refreshes remain live.
function PolicyDraft({ policy, pending, saveError, onSave, onLockAll }: {
  readonly policy: VaultPolicy
  readonly pending: boolean
  readonly saveError: string | null
  readonly onSave?: (draft: VaultPolicy, baseline: VaultPolicy) => Promise<void>
  readonly onLockAll: () => void
}) {
  const baseline = useRef<VaultPolicy | null>(null)
  return <div onChangeCapture={() => { baseline.current ??= policy }}>
    <PolicyPanel policy={policy} pending={pending} saveError={saveError} onLockAll={onLockAll}
      {...(onSave === undefined ? {} : { onChange: (draft: VaultPolicy) => onSave(draft, baseline.current ?? policy) })} />
  </div>
}

function NativeChevron() {
  return <span className="dsh-vault-settings-card-chevron" aria-hidden="true" />
}

export interface VaultPolicyScope {
  set(field: string, value: unknown): Promise<void>
}

export function VaultSettingsCard({ store: storeProp, policyScope }: { readonly store?: VaultClientStore; readonly policyScope?: VaultPolicyScope }) {
  const store = useVaultStore(storeProp)
  const liveSnapshot = useVaultSnapshot(store)
  const [tab, setTab] = useState<Tab>('policy')
  const [expanded, setExpanded] = useState(false)
  const [pending, setPending] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [draftVersion, setDraftVersion] = useState(0)
  const saving = useRef(false)
  if (store === undefined || liveSnapshot === undefined) return null
  const snapshot = liveSnapshot
  const persistPolicy = async (next: VaultPolicy, baseline: VaultPolicy): Promise<void> => {
    if (policyScope === undefined || saving.current) throw new Error('Policy save unavailable')
    saving.current = true
    setPending(true)
    setSaveError(null)
    setConflict(false)
    const prior = policySaves.get(store) ?? Promise.resolve()
    const operation = prior.catch(() => undefined).then(async () => {
      try {
        const latest = await store.refresh()
        if (!latest.ok) throw new Error('Policy refresh failed')
        const current = store.getSnapshot().policy
        // Preflight every dirty leaf before writing any top-level settings field.
        const merged = mergePolicy(baseline, next, current)
        for (const field of policyFields) {
          if (JSON.stringify(merged[field]) !== JSON.stringify(current[field])) await policyScope.set(field, merged[field])
        }
        const refreshed = await store.refresh()
        if (!refreshed.ok) throw new Error('Policy verification failed')
      } catch (error) {
        if (error instanceof PolicyConflict) throw error
        await store.refresh().catch(() => undefined)
        throw new Error('Policy save failed')
      }
    })
    policySaves.set(store, operation)
    try {
      await operation
      // Remount with the merged server policy, not the panel's stale full draft.
      setDraftVersion(value => value + 1)
    } catch (error) {
      setConflict(error instanceof PolicyConflict)
      setSaveError(error instanceof PolicyConflict ? error.message : '保存未完成，部分设置可能已生效。请检查连接后重试；未保存的草稿已保留。')
      throw new Error('Policy save failed')
    } finally {
      if (policySaves.get(store) === operation) policySaves.delete(store)
      saving.current = false
      setPending(false)
    }
  }

  const tabs: readonly [Tab, string][] = [['policy', '锁定策略'], ['groups', '密码组']]
  return (
    <section className={`dsh-vault-settings-card${expanded ? ' dsh-vault-settings-card-open' : ''}`} aria-label="保险箱">
      <button
        type="button"
        className="dsh-vault-settings-card-header"
        disabled={pending}
        aria-expanded={expanded}
        aria-label={`${expanded ? '收起设置' : '展开设置'}: 保险箱`}
        onClick={() => setExpanded(value => !value)}
      >
        <span className="dsh-vault-settings-card-heading">
          <strong>保险箱</strong>
          <small>保护会话和工作区访问</small>
        </span>
        <NativeChevron />
      </button>
      {expanded ? <div className="dsh-vault-settings-card-body">
          <div className="dsh-vault-settings-tabs" role="tablist">
            {tabs.map(([id, label]) => <button key={id} type="button" role="tab" disabled={pending} aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
          </div>
          {tab === 'policy' && <>
            <PolicyDraft key={draftVersion} policy={snapshot.policy} pending={pending} saveError={saveError} {...(policyScope === undefined ? {} : { onSave: persistPolicy })} onLockAll={() => void store.lockAll()} />
            {conflict && <button type="button" className="dsh-vault-button" disabled={pending} onClick={() => {
              setSaveError(null)
              setConflict(false)
              setDraftVersion(value => value + 1)
            }}>放弃草稿并载入最新策略</button>}
          </>}
          {tab === 'groups' && <GroupsPanel store={store} />}
        </div> : null}
    </section>
  )
}
