import { useState } from 'react'
import type { BindingMutation, VaultTarget } from '../../shared/contracts.js'
import type { VaultClientStore } from '../store-types.js'
import { useVaultSnapshot } from '../unlock/controller.js'
import { GroupCredentials } from './GroupCredentials.js'

interface CredentialAction {
  readonly mode: 'change' | 'recover'
  readonly groupId: string
  readonly groupName: string
}

interface DeleteAction {
  readonly groupId: string
  readonly groupName: string
}

export function GroupsPanel({ store }: { readonly store: VaultClientStore }) {
  const snapshot = useVaultSnapshot(store) ?? store.getSnapshot()
  const [credentialAction, setCredentialAction] = useState<CredentialAction | null>(null)
  const [deleteAction, setDeleteAction] = useState<DeleteAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (credentialAction !== null) return (
    <GroupCredentials
      mode={credentialAction.mode}
      groupId={credentialAction.groupId}
      groupName={credentialAction.groupName}
      store={store}
      onClose={() => setCredentialAction(null)}
    />
  )
  if (deleteAction !== null) {
    const source = snapshot.groups.find(group => group.id === deleteAction.groupId)
    const targets = snapshot.groups.filter(group => group.id !== deleteAction.groupId)
    const target: VaultTarget = { type: 'workspace', id: 'vault-group-management' }
    const execute = async (mutation: BindingMutation, groupIds: readonly string[]) => {
      setError(null)
      for (const groupId of groupIds) {
        if (!store.hasUnlockedGroup(groupId) && !(await store.requestUnlock(groupId, target))) {
          setError('请先解锁对应密码组')
          return
        }
      }
      const result = await store.updateBindings(mutation)
      if (result.ok) {
        setDeleteAction(null)
        return
      }
      if (result.error.code === 'revision-conflict') {
        await store.refresh()
        setError('配置已变化，已刷新，请重试')
        return
      }
      setError('删除失败，请重试')
    }
    if (source === undefined) return null
    return (
      <section className="dsh-vault-settings-panel" aria-labelledby="dsh-vault-delete-title">
        <h3 id="dsh-vault-delete-title">删除密码组：{deleteAction.groupName}</h3>
        <p>必须迁移成员或解除全部保护，不能直接删除。</p>
        {targets.map(group => (
          <button key={group.id} type="button" className="dsh-vault-button" onClick={() => { void execute({ kind: 'delete-group', groupId: source.id, moveToGroupId: group.id }, [source.id, group.id]) }}>
            迁移到 {group.name}
          </button>
        ))}
        <button type="button" className="dsh-vault-button" onClick={() => { void execute({ kind: 'delete-group', groupId: source.id, removeProtection: true }, [source.id]) }}>
          解除全部保护并删除
        </button>
        <button type="button" className="dsh-vault-button" onClick={() => setDeleteAction(null)}>取消</button>
        {error !== null && <p className="dsh-vault-settings-warning" role="alert">{error}</p>}
      </section>
    )
  }

  return (
    <section className="dsh-vault-settings-panel" aria-label="密码组">
      {snapshot.groups.length === 0 ? <p>尚未创建密码组</p> : (
        <ul className="dsh-vault-group-list">
          {snapshot.groups.map(group => (
            <li key={group.id}>
              <strong>{group.name}</strong>
              <span>{group.memberCount} 个保护对象</span>
              <div className="dsh-vault-dialog-actions">
                <button type="button" className="dsh-vault-button" aria-label={`锁定 ${group.name}`} onClick={() => { void store.lockGroup(group.id) }}>锁定</button>
                <button type="button" className="dsh-vault-button" aria-label={`修改密码 ${group.name}`} onClick={() => setCredentialAction({ mode: 'change', groupId: group.id, groupName: group.name })}>修改密码</button>
                <button type="button" className="dsh-vault-button" aria-label={`恢复 ${group.name}`} onClick={() => setCredentialAction({ mode: 'recover', groupId: group.id, groupName: group.name })}>恢复</button>
                <button type="button" className="dsh-vault-button" aria-label={'删除 ' + group.name} onClick={() => setDeleteAction({ groupId: group.id, groupName: group.name })}>删除</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
