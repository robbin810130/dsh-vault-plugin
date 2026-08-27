import type { VaultClientStore } from '../store-types.js'

export function RecoveryPanel({ store }: { readonly store: VaultClientStore }) {
  const snapshot = store.getSnapshot()
  return (
    <section className="dsh-vault-settings-panel" aria-label="恢复能力">
      <div className="dsh-vault-settings-heading dsh-vault-settings-heading-actions-only">
        <button type="button" className="dsh-vault-button dsh-vault-button-primary" onClick={() => void store.lockAll()}>立即全部上锁</button>
      </div>
      <p>恢复密钥只在创建或恢复成功后显示一次，不会写入设置、日志或浏览器存储。</p>
      <ul className="dsh-vault-group-list">
        {snapshot.groups.map(group => <li key={group.id}><strong>{group.name}</strong><span>{group.recoveryConfigured ? '已配置恢复能力' : '未配置恢复能力'}</span></li>)}
      </ul>
    </section>
  )
}
