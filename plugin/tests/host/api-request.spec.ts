import { describe, expect, it } from 'vitest'
import { parseVaultApiRequest } from '../../src/host/api/request.js'

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
})
