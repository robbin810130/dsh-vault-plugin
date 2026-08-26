import { useState } from 'react'
import type { VaultClientStore } from '../store-types.js'
import { useVaultStore } from '../unlock/controller.js'
import { GroupsPanel } from './GroupsPanel.js'
import { PolicyPanel } from './PolicyPanel.js'
import { RecoveryPanel } from './RecoveryPanel.js'

type Tab = 'policy' | 'groups' | 'recovery'

export function VaultSettingsCard({ store: storeProp }: { readonly store?: VaultClientStore }) {
  const store = useVaultStore(storeProp)
  const [tab, setTab] = useState<Tab>('policy')
  if (store === undefined) return null
  const snapshot = store.getSnapshot()
  const tabs: readonly [Tab, string][] = [['policy', '锁定策略'], ['groups', '密码组'], ['recovery', '恢复能力']]
  return (
    <section className="dsh-vault-settings-card" aria-label="保险箱">
      <h2>保险箱</h2>
      <div className="dsh-vault-settings-tabs" role="tablist">
        {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'policy' && <PolicyPanel policy={snapshot.policy} />}
      {tab === 'groups' && <GroupsPanel store={store} />}
      {tab === 'recovery' && <RecoveryPanel store={store} />}
      <p className="dsh-vault-settings-disclosure">一期仅控制 DSH 前台访问，原始会话文件未加密</p>
    </section>
  )
}
