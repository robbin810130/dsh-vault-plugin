/** @vitest-environment jsdom */
import type { ComponentType } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../../src/client/index.js'
import { createVaultApiClient } from '../../src/client/api.js'
import { createVaultClientStore } from '../../src/client/store.js'
import { VaultRowAction } from '../../src/client/rows/VaultRowAction.js'
import { GroupWizard } from '../../src/client/settings/GroupWizard.js'
import { GroupCredentials } from '../../src/client/settings/GroupCredentials.js'
import { VaultOverlays } from '../../src/client/dialogs/VaultOverlays.js'
import { recoveryDeliveryFor } from '../../src/client/dialogs/recovery-delivery.js'
import { GroupsPanel } from '../../src/client/settings/GroupsPanel.js'
import { VaultSettingsCard } from '../../src/client/settings/VaultSettingsCard.js'
import type { VaultPolicy, VaultSnapshot } from '../../src/shared/contracts.js'

const SECRET = 'PRIVATE-TITLE-9471'
const KEY = 'RECOVERY-TEST-ONLY-9471'
const policy: VaultPolicy = {
  autoLockMinutes: 15, lockOnSystemSleep: true, lockedNameVisibility: 'workspace-visible-session-hidden',
  failedAttemptProtection: { enabled: true, maxAttempts: 3, cooldownSeconds: 300 },
  passwordPolicy: { minLength: 8, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSymbol: false },
}
const group = (id = 'g', name = SECRET) => ({ id, name, credentialVersion: 1, recoveryConfigured: true, recoveryGeneratedAt: '2026-09-16', memberCount: 1 })
const snapshot = (): VaultSnapshot => ({ revision: 1, policy, groups: [], bindings: [] })
const ok = (value: unknown) => new Response(JSON.stringify({ ok: true, value }), { headers: { 'content-type': 'application/json' } })
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(yes => { resolve = yes })
  return { promise, resolve }
}
function server(initial = snapshot()) {
  let current = initial
  const requests: Array<Record<string, any>> = []
  let createGate: Promise<void> | undefined
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const request = JSON.parse(init?.body as string)
    requests.push(request)
    if (request.action === 'snapshot') return ok(current)
    if (request.action === 'group-create-intent') return ok({ intent: 'I'.repeat(43) })
    if (request.action === 'group-create') {
      await createGate
      current = { ...current, revision: current.revision + 1, groups: [...current.groups, group('g' + current.revision, request.input.name)],
        bindings: request.input.bindings.map((binding: object) => ({ ...binding, passwordGroupId: 'g' + current.revision })) }
      return ok({ snapshot: current, recoveryKey: KEY })
    }
    if (request.action === 'group-change-password' || request.action === 'group-recover') {
      await createGate
      current = { ...current, revision: current.revision + 1 }
      return ok({ snapshot: current, recoveryKey: KEY })
    }
    if (request.action === 'unlock') return ok({ grant: { groupId: request.groupId, credentialVersion: 1, token: 'A'.repeat(43) }, expiresAt: 0 })
    if (request.action === 'lock-group' || request.action === 'lock-all') return ok(null)
    throw new Error('Unexpected API action: ' + request.action)
  }) as unknown as typeof fetch
  return { fetcher, requests, get: () => current, gate: (value: Promise<void>) => { createGate = value },
    setPolicy: (next: VaultPolicy) => { current = { ...current, policy: next, revision: current.revision + 1 } } }
}
let disposers: Array<() => void> = []
afterEach(() => { cleanup(); disposers.forEach(dispose => dispose()); disposers = []; vi.unstubAllGlobals(); vi.restoreAllMocks() })
function mountShell(fetcher: typeof fetch) {
  vi.stubGlobal('fetch', fetcher)
  const overlays: ComponentType[] = []
  apply({ locale: {}, configForms: { get: () => ({ getSnapshot: () => ({ status: 'ready', revision: 1 }), mutate: async () => true }), whileServed: (_ids, register) => register() },
    sessions: { openingAccess: { register: () => () => undefined } }, workspaces: { list: { getSnapshot: () => ({ items: [] }) } },
    slots: { inject: (_name: string, factory: () => unknown) => factory(), register: (config: { name: string }, component: ComponentType) => {
      if (config.name === 'shell.overlay') overlays.push(component)
      return () => undefined
    } }, effect: (factory: () => () => void) => { disposers.push(factory()) },
  } as never)
  return () => <>{overlays.map((Overlay, i) => <Overlay key={i} />)}</>
}
function submitQuickLock() {
  fireEvent.click(screen.getByRole('button', { name: '上锁' }))
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'correct horse' } })
  fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'correct horse' } })
  fireEvent.click(screen.getByRole('button', { name: '保存并上锁' }))
}
async function mountSettings(source = server(), scope?: { set(field: string, value: unknown): Promise<void> }) {
  const store = createVaultClientStore(createVaultApiClient(source.fetcher))
  await store.refresh()
  const view = render(<VaultSettingsCard store={store} {...(scope ? { policyScope: scope } : {})} />)
  fireEvent.click(screen.getByRole('button', { name: '展开设置: 保险箱' }))
  return { store, view }
}

describe('F02 stable recovery-key delivery', () => {
  it.each(['workspace', 'session'] as const)('keeps %s key visible after lock and row removal until explicit acknowledgement', async kind => {
    const source = server()
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    const Shell = mountShell(source.fetcher)
    const row = <VaultRowAction kind={kind} workspaceId="w" {...(kind === 'session' ? { sessionId: 's' } : {})} />
    const view = render(<><Shell />{row}</>)
    await act(async () => { await Promise.resolve() })
    submitQuickLock(); await act(async () => { await Promise.resolve() })
    expect(source.get().bindings).toHaveLength(1)
    expect(screen.queryByRole('button', { name: '上锁' })).toBeNull()
    expect(screen.queryByText(KEY)).toBeVisible()
    view.rerender(<Shell />)
    expect(screen.queryByText(KEY)).toBeVisible()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByText(KEY)).toBeVisible()
    expect(screen.getByRole('dialog')).toHaveTextContent('刷新')
    fireEvent.click(screen.getByRole('button', { name: '我已保存恢复密钥' }))
    view.rerender(<><Shell />{row}</>)
    expect(screen.queryByText(KEY)).toBeNull()
    expect(storage).not.toHaveBeenCalled()
  })
  it('delivers a late successful response even if the originating row unmounts while saving', async () => {
    const source = server(); const gate = deferred(); source.gate(gate.promise)
    const Shell = mountShell(source.fetcher)
    const view = render(<><Shell /><VaultRowAction kind="workspace" workspaceId="w" /></>)
    await act(async () => { await Promise.resolve() })
    submitQuickLock()
    await waitFor(() => expect(source.requests.some(request => request.action === 'group-create')).toBe(true))
    view.rerender(<Shell />)
    await act(async () => { gate.resolve() })
    expect(screen.queryByText(KEY)).toBeVisible()
  })
})

describe('F03 settings title privacy', () => {
  it('uses a neutral quick-lock alias without copying the target title into persistent group metadata', async () => {
    const source = server(); const store = createVaultClientStore(createVaultApiClient(source.fetcher)); await store.refresh()
    render(<VaultRowAction kind="session" sessionId="s" workspaceId="w" presentation={{ label: SECRET }} store={store} />)
    submitQuickLock(); await act(async () => { await Promise.resolve() })
    const request = source.requests.find(request => request.action === 'group-create')!
    expect(request.input.name).not.toContain(SECRET)
    expect(request.input.name).toMatch(/保护/)
    expect(request.input.bindings[0].targetId).toBe('s')
  })
  it.each(['修改密码', '恢复', '删除'])('hides existing locked names in DOM, aria and the %s subview without renaming data', async action => {
    const source = server({ ...snapshot(), groups: [group(), group('g2', SECRET + '-2')] })
    const store = createVaultClientStore(createVaultApiClient(source.fetcher)); await store.refresh()
    render(<GroupsPanel store={store} />)
    expect(document.body.innerHTML).not.toContain(SECRET)
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp('^' + action + ' ') })[0]!)
    expect(document.body.innerHTML).not.toContain(SECRET)
    expect(store.getSnapshot().groups[0]?.name).toBe(SECRET)
    expect(source.requests.map(request => request.action)).toEqual(['snapshot'])
  })
  it('redacts an already open credential subview when its group relocks', async () => {
    const source = server({ ...snapshot(), groups: [group()] })
    const store = createVaultClientStore(createVaultApiClient(source.fetcher)); await store.refresh(); await store.unlock('g', 'correct horse')
    render(<GroupsPanel store={store} />)
    fireEvent.click(screen.getByRole('button', { name: '修改密码 ' + SECRET }))
    expect(screen.getByRole('heading')).toHaveTextContent(SECRET)
    await act(async () => { await store.lockGroup('g') })
    expect(document.body.innerHTML).not.toContain(SECRET)
  })
})

describe('F07 policy drafts and persistence', () => {
  it('retains an empty numeric draft without clamping or saving a weaker password policy', async () => {
    const set = vi.fn(async () => undefined)
    await mountSettings(server(), { set })
    fireEvent.change(screen.getByLabelText('密码最小长度'), { target: { value: '' } })
    expect(screen.getByLabelText('密码最小长度')).toHaveValue(null)
    expect(set).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '保存策略' }))
    expect(screen.getByRole('alert')).toHaveTextContent('4')
    expect(set).not.toHaveBeenCalled()
  })
  it('commits 4 to 12 only on Save and retains dirty input through unrelated snapshot notifications', async () => {
    const source = server({ ...snapshot(), policy: { ...policy, passwordPolicy: { ...policy.passwordPolicy, minLength: 4 } } })
    const set = vi.fn(async (field: string, value: unknown) => source.setPolicy({ ...source.get().policy, [field]: value }))
    const { store } = await mountSettings(source, { set })
    fireEvent.change(screen.getByLabelText('密码最小长度'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('密码最小长度'), { target: { value: '12' } })
    await act(async () => { await store.refresh() })
    expect(screen.getByLabelText('密码最小长度')).toHaveValue(12)
    expect(set).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '保存策略' }))
    await waitFor(() => expect(source.get().policy.passwordPolicy.minLength).toBe(12))
    expect(set).toHaveBeenCalledTimes(1)
  })
  it('serializes changed fields, disables repeat submission and surfaces failure with a retryable draft', async () => {
    const source = server(); const gate = deferred(); const calls: string[] = []
    let fail = true
    const set = vi.fn(async (field: string, value: unknown) => {
      calls.push(field)
      if (calls.length === 1) await gate.promise
      if (field === 'passwordPolicy' && fail) throw new Error('PRIVATE backend detail')
      source.setPolicy({ ...source.get().policy, [field]: value })
    })
    await mountSettings(source, { set })
    fireEvent.change(screen.getByLabelText('自动锁定'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('密码最小长度'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: '保存策略' }))
    await waitFor(() => expect(calls).toEqual(['autoLockMinutes']))
    expect(screen.getByRole('status')).toHaveTextContent('保存中')
    expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled()
    await act(async () => { gate.resolve() })
    expect(await screen.findByRole('alert')).toHaveTextContent('重试')
    expect(document.body.innerHTML).not.toContain('PRIVATE backend detail')
    expect(screen.getByLabelText('密码最小长度')).toHaveValue(12)
    expect(calls).toEqual(['autoLockMinutes', 'passwordPolicy'])
    fail = false
    fireEvent.click(screen.getByRole('button', { name: '保存策略' }))
    await waitFor(() => expect(source.get().policy.passwordPolicy.minLength).toBe(12))
    expect(calls).toEqual(['autoLockMinutes', 'passwordPolicy', 'passwordPolicy'])
  })
})

describe('safe admission and state-lock errors', () => {
  it.each([
    ['busy', '繁忙'],
    ['state-lock-busy', '正在使用'],
    ['state-lock-recovery-required', '恢复'],
  ])('preserves %s through the API/store and explains it without server details', async (code, message) => {
    const source = server()
    const fetcher = async (url: unknown, init?: RequestInit) => {
      const request = JSON.parse(init?.body as string)
      if (request.action === 'snapshot') return source.fetcher(url as string, init)
      return new Response(JSON.stringify({ ok: false, error: { code, message: 'PRIVATE server path' } }))
    }
    const store = createVaultClientStore(createVaultApiClient(fetcher as typeof fetch))
    await store.refresh()
    const result = await store.unlock('g', 'password')
    expect(result).toMatchObject({ ok: false, error: { code } })
    expect(JSON.stringify(result)).not.toContain('PRIVATE server path')
    render(<VaultRowAction kind="workspace" workspaceId="w" store={store} />)
    submitQuickLock()
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(document.body.innerHTML).not.toContain('PRIVATE server path')
  })
})


describe('recovery delivery across settings lifecycles', () => {
  it.each(['create', 'change', 'recover'] as const)('delivers %s recovery after settings unmount, then forgets only on acknowledgement', async mode => {
    const source = server({ ...snapshot(), groups: [group()] })
    const gate = deferred(); source.gate(gate.promise)
    const store = createVaultClientStore(createVaultApiClient(source.fetcher)); await store.refresh()
    const view = render(<><VaultOverlays store={store} />{mode === 'create'
      ? <GroupWizard store={store} />
      : <GroupCredentials mode={mode} groupId="g" groupName="alias" store={store} />}</>)
    if (mode === 'create') {
      fireEvent.change(screen.getByLabelText('密码组名称'), { target: { value: 'alias' } })
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
    const action = mode === 'create' ? 'group-create' : mode === 'change' ? 'group-change-password' : 'group-recover'
    await waitFor(() => expect(source.requests.some(request => request.action === action)).toBe(true))
    view.rerender(<VaultOverlays store={store} />)
    await act(async () => { gate.resolve() })
    expect(screen.queryByText(KEY)).toBeVisible()
    view.unmount()
    render(<VaultOverlays store={store} />)
    expect(screen.queryByText(KEY)).toBeVisible()
    expect(screen.getByRole('button', { name: '我已保存恢复密钥' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: '我已保存恢复密钥' }))
    expect(screen.queryByText(KEY)).toBeNull()
  })
  it('queues keys without overwrite and clears delivery on plugin disposal, including late arrivals', async () => {
    const source = server(); const store = createVaultClientStore(createVaultApiClient(source.fetcher)); await store.refresh()
    const delivery = recoveryDeliveryFor(store)
    delivery.deliver('FIRST-TEST-KEY'); delivery.deliver('SECOND-TEST-KEY')
    render(<VaultOverlays store={store} />)
    const first = delivery.getSnapshot()!
    expect(screen.getByText('FIRST-TEST-KEY')).toBeVisible()
    expect(screen.queryByText('SECOND-TEST-KEY')).toBeNull()
    expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '我已保存恢复密钥' }))
    act(() => delivery.acknowledge(first))
    expect(screen.getByText('SECOND-TEST-KEY')).toBeVisible()
    act(() => delivery.dispose())
    act(() => delivery.deliver('LATE-TEST-KEY'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(delivery.getSnapshot()).toBeNull()
    expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(true)
  })
})


describe('policy persistence after settings remount', () => {
  it('does not overlap an in-flight settings write with a new card save', async () => {
    const source = server(); const gate = deferred(); const calls: string[] = []
    const scope = { set: vi.fn(async (field: string, value: unknown) => {
      calls.push(field)
      if (calls.length === 1) await gate.promise
      source.setPolicy({ ...source.get().policy, [field]: value })
    }) }
    const first = await mountSettings(source, scope)
    fireEvent.change(screen.getByLabelText('自动锁定'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: '保存策略' }))
    await waitFor(() => expect(calls).toEqual(['autoLockMinutes']))
    first.view.unmount()
    render(<VaultSettingsCard store={first.store} policyScope={scope} />)
    fireEvent.click(screen.getByRole('button', { name: '展开设置: 保险箱' }))
    fireEvent.change(screen.getByLabelText('密码最小长度'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: '保存策略' }))
    await act(async () => { await Promise.resolve() })
    expect(calls).toEqual(['autoLockMinutes'])
    await act(async () => { gate.resolve() })
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(source.get().policy.passwordPolicy.minLength).toBe(12)
    expect(source.get().policy.autoLockMinutes).toBe(30)
    expect(screen.getByLabelText('自动锁定')).toHaveValue('30')
  })
})
