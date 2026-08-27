import { useState } from 'react'
import type { VaultClientStore } from '../store-types.js'
import { useVaultStore } from '../unlock/controller.js'
import { GroupsPanel } from './GroupsPanel.js'
import { PolicyPanel } from './PolicyPanel.js'
import { RecoveryPanel } from './RecoveryPanel.js'
import type { VaultPolicy } from '../../shared/contracts.js'

type Tab = 'policy' | 'groups' | 'recovery'

function NativeChevron() {
  return <span className="dsh-vault-settings-card-chevron" aria-hidden="true" />
}

export interface VaultPolicyScope {
  set(field: string, value: unknown): Promise<void>
}

export function VaultSettingsCard({ store: storeProp, policyScope }: { readonly store?: VaultClientStore; readonly policyScope?: VaultPolicyScope }) {
  const store = useVaultStore(storeProp)
  const [tab, setTab] = useState<Tab>('policy')
  const [expanded, setExpanded] = useState(false)
  if (store === undefined) return null
  const snapshot = store.getSnapshot()
  const persistPolicy = (next: VaultPolicy): void => {
    if (policyScope === undefined) return
    const writes: Promise<void>[] = []
    if (next.autoLockMinutes !== snapshot.policy.autoLockMinutes) writes.push(policyScope.set('autoLockMinutes', next.autoLockMinutes))
    if (next.lockOnSystemSleep !== snapshot.policy.lockOnSystemSleep) writes.push(policyScope.set('lockOnSystemSleep', next.lockOnSystemSleep))
    if (next.lockedNameVisibility !== snapshot.policy.lockedNameVisibility) writes.push(policyScope.set('lockedNameVisibility', next.lockedNameVisibility))
    if (JSON.stringify(next.failedAttemptProtection) !== JSON.stringify(snapshot.policy.failedAttemptProtection)) {
      writes.push(policyScope.set('failedAttemptProtection', next.failedAttemptProtection))
    }
    if (JSON.stringify(next.passwordPolicy) !== JSON.stringify(snapshot.policy.passwordPolicy)) writes.push(policyScope.set('passwordPolicy', next.passwordPolicy))
    void Promise.all(writes).then(() => store.refresh()).catch(() => store.refresh())
  }
  const tabs: readonly [Tab, string][] = [['policy', '锁定策略'], ['groups', '密码组'], ['recovery', '恢复能力']]
  return (
    <section className={`dsh-vault-settings-card${expanded ? ' dsh-vault-settings-card-open' : ''}`} aria-label="保险箱">
      <button
        type="button"
        className="dsh-vault-settings-card-header"
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
            {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
          </div>
          {tab === 'policy' && <PolicyPanel policy={snapshot.policy} onChange={persistPolicy} />}
          {tab === 'groups' && <GroupsPanel store={store} />}
          {tab === 'recovery' && <RecoveryPanel store={store} />}
          <p className="dsh-vault-settings-disclosure">一期仅控制 DSH 前台访问，原始会话文件未加密</p>
        </div> : null}
    </section>
  )
}
