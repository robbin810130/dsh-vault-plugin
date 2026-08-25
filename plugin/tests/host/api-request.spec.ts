import { describe, expect, it } from 'vitest'
import { parseVaultApiRequest } from '../../src/host/api/request.js'

const grant = {
  groupId: 'group-1',
  credentialVersion: 1,
  token: 'A'.repeat(43),
}

const createRequest = {
  action: 'group-create',
  clientInstanceId: 'client-1',
  expectedRevision: 1,
  grants: [grant],
  input: { name: 'Primary', password: 'correct horse', bindings: [] },
} as const

const bindingsRequest = {
  action: 'bindings-update',
  clientInstanceId: 'client-1',
  expectedRevision: 1,
  grants: [grant],
  input: { kind: 'remove', targetType: 'workspace', targetId: 'workspace-1' },
} as const

describe('Vault API request contract', () => {
  it('requires clientInstanceId for credential-changing actions', () => {
    expect(parseVaultApiRequest({
      action: 'group-change-password', clientInstanceId: 'client-1', expectedRevision: 1,
      input: { groupId: 'group-1', currentPassword: 'correct horse', newPassword: 'new horse', rotateRecovery: false },
    })).toEqual({
      action: 'group-change-password', clientInstanceId: 'client-1', expectedRevision: 1,
      input: { groupId: 'group-1', currentPassword: 'correct horse', newPassword: 'new horse', rotateRecovery: false },
    })
    expect(parseVaultApiRequest({
      action: 'group-recover', clientInstanceId: 'client-1', expectedRevision: 1,
      input: { groupId: 'group-1', recoveryKey: 'ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZAB-CDEF-GHIJ-KLMN-NOPQ-RSTU-VA12', newPassword: 'new horse' },
    })).toMatchObject({ action: 'group-recover', clientInstanceId: 'client-1', expectedRevision: 1 })
  })

  it.each([createRequest, bindingsRequest])('parses $action with client-bound grant proofs', (request) => {
    expect(parseVaultApiRequest(request)).toEqual(request)
  })

  it.each([createRequest, bindingsRequest])('rejects $action without clientInstanceId or grants', (request) => {
    const { clientInstanceId: _clientInstanceId, ...withoutClient } = request
    const { grants: _grants, ...withoutGrants } = request

    expect(() => parseVaultApiRequest(withoutClient)).toThrow(TypeError)
    expect(() => parseVaultApiRequest(withoutGrants)).toThrow(TypeError)
  })

  it.each([
    ['an unknown top-level field', { ...createRequest, unexpected: true }],
    ['an overlong clientInstanceId', { ...bindingsRequest, clientInstanceId: 'c'.repeat(129) }],
    ['more than 256 grants', { ...createRequest, grants: Array.from({ length: 257 }, () => grant) }],
    ['an unknown grant field', { ...bindingsRequest, grants: [{ ...grant, unexpected: true }] }],
  ])('rejects %s for authorization-bearing mutations', (_label, request) => {
    expect(() => parseVaultApiRequest(request)).toThrow(TypeError)
  })
})
