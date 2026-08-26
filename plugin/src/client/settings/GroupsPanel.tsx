import { useState } from 'react'
import type { VaultClientStore } from '../store-types.js'
import { GroupWizard } from './GroupWizard.js'

export function GroupsPanel({ store }: { readonly store: VaultClientStore }) {
  const snapshot = store.getSnapshot()
  const [creating, setCreating] = useState(false)
  if (creating) return <GroupWizard store={store} onClose={() => setCreating(false)} />

  return (
    <section className="dsh-vault-settings-panel" aria-labelledby="dsh-vault-groups-title">
      <div className="dsh-vault-settings-heading">
        <h3 id="dsh-vault-groups-title">密码组</h3>
        <button type="button" className="dsh-vault-button dsh-vault-button-primary" onClick={() => setCreating(true)}>新建密码组</button>
      </div>
      {snapshot.groups.length === 0 ? <p>尚未创建密码组</p> : (
        <ul className="dsh-vault-group-list">
          {snapshot.groups.map(group => <li key={group.id}><strong>{group.name}</strong><span>{group.memberCount} 个保护对象</span></li>)}
        </ul>
      )}
    </section>
  )
}
