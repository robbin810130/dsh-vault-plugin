/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { createVaultApiClient } from '../../src/client/api.js'
import { createVaultClientStore } from '../../src/client/store.js'
import { VaultSettingsCard } from '../../src/client/settings/VaultSettingsCard.js'
import { GroupCredentials } from '../../src/client/settings/GroupCredentials.js'
import { GroupWizard } from '../../src/client/settings/GroupWizard.js'
import { VaultOverlays } from '../../src/client/dialogs/VaultOverlays.js'
import type { VaultPolicy, VaultSnapshot } from '../../src/shared/contracts.js'

afterEach(cleanup)
const policy: VaultPolicy = {
  autoLockMinutes: 15, lockOnSystemSleep: true, lockedNameVisibility: 'all-hidden',
  failedAttemptProtection: { enabled: true, maxAttempts: 3, cooldownSeconds: 300 },
  passwordPolicy: { minLength: 8, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSymbol: false },
}
function barrier() {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}
function fixture() {
  let current: VaultSnapshot = { revision: 1, policy: structuredClone(policy), groups: [{ id: 'g', name: 'alias', credentialVersion: 1, recoveryConfigured: true, recoveryGeneratedAt: 'now', memberCount: 0 }], bindings: [] }
  let mutationGate = Promise.resolve()
  const entered = barrier()
  const fetcher: typeof fetch = async (_url, init) => {
    const request = JSON.parse(init?.body as string)
    let value: unknown
    if (request.action === 'snapshot') value = current
    else if (request.action === 'group-create-intent') value = { intent: 'I'.repeat(43) }
    else {
      const committed = { ...current, revision: current.revision + 1 }
      current = committed
      entered.release()
      await mutationGate
      value = { snapshot: committed, recoveryKey: 'RECOVERY-REVIEW-TEST-ONLY' }
    }
    return new Response(JSON.stringify({ ok: true, value }))
  }
  const store = createVaultClientStore(createVaultApiClient(fetcher))
  return { store, entered: entered.promise, get: () => current,
    gate: (promise: Promise<void>) => { mutationGate = promise },
    update: (next: VaultPolicy) => { current = { ...current, policy: next } },
    advance: () => { current = { ...current, revision: current.revision + 1 } },
  }
}

describe('successful recovery results independent of snapshot order', () => {
  it('still refuses malformed successful wire results instead of delivering an unvalidated key', async () => {
    const store = createVaultClientStore(createVaultApiClient(async () => new Response(JSON.stringify({
      ok: true, value: { snapshot: { revision: -1 }, recoveryKey: 'UNVALIDATED-KEY' },
    }))))
    const result = await store.recoverGroup({ groupId: 'g', recoveryKey: 'old key', newPassword: 'correct horse' })
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-response' } })
    expect(JSON.stringify(result)).not.toContain('UNVALIDATED-KEY')
    expect(store.getSnapshot().host).toBe('offline')
  })
  it.each(['create', 'change', 'recover'] as const)('delivers %s key after a newer refresh and origin unmount', async mode => {
    const source = fixture(); const gate = barrier(); source.gate(gate.promise)
    await source.store.refresh()
    const view = render(<><VaultOverlays store={source.store} />{mode === 'create'
      ? <GroupWizard store={source.store} />
      : <GroupCredentials mode={mode} groupId="g" groupName="alias" store={source.store} />}</>)
    if (mode === 'create') {
      fireEvent.change(screen.getByLabelText('密码组名称'), { target: { value: 'new alias' } })
      fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'correct horse' } })
      fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'correct horse' } })
      fireEvent.click(screen.getByRole('button', { name: '创建密码组' }))
    } else {
      fireEvent.change(screen.getByLabelText(mode === 'change' ? '当前密码' : '恢复密钥'), { target: { value: 'old secret' } })
      fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'correct horse' } })
      fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'correct horse' } })
      if (mode === 'change') fireEvent.click(screen.getByRole('checkbox', { name: '同时轮换恢复密钥' }))
      fireEvent.click(screen.getByRole('button', { name: mode === 'change' ? '保存新密码' : '恢复密码组' }))
    }
    await act(async () => { await source.entered })
    view.rerender(<VaultOverlays store={source.store} />)
    source.advance()
    await act(async () => { await source.store.refresh(); gate.release() })
    expect(await screen.findByText('RECOVERY-REVIEW-TEST-ONLY')).toBeVisible()
    expect(source.store.getSnapshot()).toMatchObject({ revision: 3, host: 'ready' })
    fireEvent.click(screen.getByRole('button', { name: '我已保存恢复密钥' }))
    expect(screen.queryByText('RECOVERY-REVIEW-TEST-ONLY')).toBeNull()
  })
})

function mountCard(source: ReturnType<typeof fixture>, scope: { set(field: string, value: unknown): Promise<void> }) {
  const view = render(<VaultSettingsCard store={source.store} policyScope={scope} />)
  fireEvent.click(screen.getByRole('button', { name: '展开设置: 保险箱' }))
  return view
}
function editLength(value: string) { fireEvent.change(screen.getByLabelText('密码最小长度'), { target: { value } }) }
async function save() { await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存策略' })) }) }

describe('policy leaf draft baseline and execution-time merge', () => {
  it('uses a clean refreshed baseline and resets it again after a successful save', async () => {
    const source = fixture(); await source.store.refresh()
    mountCard(source, { set: async (field, value) => source.update({ ...source.get().policy, [field]: value }) })
    source.update({ ...source.get().policy, passwordPolicy: { ...source.get().policy.passwordPolicy, minLength: 16 } })
    await act(async () => { await source.store.refresh() })
    expect(screen.getByLabelText('密码最小长度')).toHaveValue(16)
    editLength('20'); await save()
    expect(source.get().policy.passwordPolicy.minLength).toBe(20)
    editLength('24'); await save()
    expect(source.get().policy.passwordPolicy.minLength).toBe(24)
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('merges failed-attempt leaves without resetting an unedited concurrent leaf', async () => {
    const source = fixture(); await source.store.refresh()
    mountCard(source, { set: async (field, value) => source.update({ ...source.get().policy, [field]: value }) })
    fireEvent.change(screen.getByLabelText('最大尝试次数'), { target: { value: '5' } })
    source.update({ ...source.get().policy, failedAttemptProtection: { ...source.get().policy.failedAttemptProtection, cooldownSeconds: 600 } })
    await save()
    expect(source.get().policy.failedAttemptProtection).toEqual({ enabled: true, maxAttempts: 5, cooldownSeconds: 600 })
    expect(screen.getByLabelText('暂停时间（秒）')).toHaveValue(600)
  })
  it('detects a queued same-leaf conflict after the preceding card finishes saving', async () => {
    const source = fixture(); await source.store.refresh()
    const gate = barrier(); const entered = barrier(); let calls = 0
    const scope = { set: async (field: string, value: unknown) => {
      calls++; entered.release(); await gate.promise
      source.update({ ...source.get().policy, [field]: value })
    } }
    const first = mountCard(source, scope); editLength('16'); await save()
    await entered.promise; first.unmount()
    mountCard(source, scope); editLength('12'); await save()
    await act(async () => { gate.release() })
    expect(await screen.findByRole('alert')).toHaveTextContent('冲突')
    expect(calls).toBe(1)
    expect(source.get().policy.passwordPolicy.minLength).toBe(16)
    expect(screen.getByLabelText('密码最小长度')).toHaveValue(12)
  })
  it.each([false, true])('preserves another card nested edit when queued=%s', async queued => {
    const source = fixture(); await source.store.refresh()
    const gate = barrier(); const entered = barrier(); let calls = 0
    const scope = { set: async (field: string, value: unknown) => {
      if (++calls === 1) { entered.release(); await gate.promise }
      source.update({ ...source.get().policy, [field]: value })
    } }
    const first = mountCard(source, scope)
    fireEvent.click(screen.getByRole('checkbox', { name: '要求大写字母' }))
    await save(); await entered.promise; first.unmount()
    mountCard(source, scope); editLength('12')
    if (queued) await save()
    await act(async () => { gate.release() })
    if (!queued) await save()
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(source.get().policy.passwordPolicy).toMatchObject({ minLength: 12, requireUppercase: true })
    expect(screen.getByRole('checkbox', { name: '要求大写字母' })).toBeChecked()
  })
  it('does not undo an unedited top-level field after a refresh', async () => {
    const source = fixture(); await source.store.refresh()
    mountCard(source, { set: async (field, value) => source.update({ ...source.get().policy, [field]: value }) })
    editLength('12')
    source.update({ ...source.get().policy, autoLockMinutes: 30 })
    await act(async () => { await source.store.refresh() })
    await save()
    expect(source.get().policy.autoLockMinutes).toBe(30)
    expect(source.get().policy.passwordPolicy.minLength).toBe(12)
    expect(screen.getByLabelText('自动锁定')).toHaveValue('30')
  })
  it('rejects a same-leaf conflict before any writes and retains the draft until explicit reload', async () => {
    const source = fixture(); await source.store.refresh(); let writes = 0
    mountCard(source, { set: async (field, value) => { writes++; source.update({ ...source.get().policy, [field]: value }) } })
    editLength('12')
    fireEvent.change(screen.getByLabelText('自动锁定'), { target: { value: '30' } })
    source.update({ ...source.get().policy, passwordPolicy: { ...source.get().policy.passwordPolicy, minLength: 16 } })
    await save()
    expect(screen.getByRole('alert')).toHaveTextContent('冲突')
    expect(writes).toBe(0)
    expect(screen.getByLabelText('密码最小长度')).toHaveValue(12)
    fireEvent.click(screen.getByRole('button', { name: '放弃草稿并载入最新策略' }))
    expect(screen.getByLabelText('密码最小长度')).toHaveValue(16)
    editLength('20'); await save()
    expect(source.get().policy.passwordPolicy.minLength).toBe(20)
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('allows an already-applied same-leaf value without conflict or redundant writes', async () => {
    const source = fixture(); await source.store.refresh(); let writes = 0
    mountCard(source, { set: async () => { writes++ } })
    editLength('12')
    source.update({ ...source.get().policy, passwordPolicy: { ...source.get().policy.passwordPolicy, minLength: 12 } })
    await save()
    expect(writes).toBe(0)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
