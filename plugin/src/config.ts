import { isAbsolute } from 'node:path'
import z from '@deepseek-ai/schemastery'

export interface Config {
  readonly stateDir?: string
}

export interface VaultPolicy {
  readonly autoLockMinutes: 15 | 30 | 60 | 0
  readonly lockOnSystemSleep: boolean
  readonly lockedNameVisibility: 'workspace-visible-session-hidden' | 'all-visible' | 'all-hidden'
  readonly failedAttemptProtection: {
    readonly enabled: boolean
    readonly maxAttempts: number
    readonly cooldownSeconds: number
  }
}

interface VaultPolicyInput {
  readonly autoLockMinutes?: 15 | 30 | 60 | 0
  readonly lockOnSystemSleep?: boolean
  readonly lockedNameVisibility?: 'workspace-visible-session-hidden' | 'all-visible' | 'all-hidden'
  readonly failedAttemptProtection?: {
    readonly enabled?: boolean
    readonly maxAttempts?: number
    readonly cooldownSeconds?: number
  }
}

const AbsolutePathSchema = z.transform(z.string(), (value, options) => {
  if (!isAbsolute(value)) throw new z.ValidationError('expected an absolute path', options)
  return value
})

export const ConfigSchema: z<Config> = z.object({
  stateDir: AbsolutePathSchema,
})

export const Config = ConfigSchema

export const VaultPolicySchema: z<VaultPolicyInput, VaultPolicy> = z.object({
  autoLockMinutes: z.union([0, 15, 30, 60]).default(15),
  lockOnSystemSleep: z.boolean().default(true),
  lockedNameVisibility: z.union([
    'workspace-visible-session-hidden',
    'all-visible',
    'all-hidden',
  ]).default('workspace-visible-session-hidden'),
  failedAttemptProtection: z.object({
    enabled: z.boolean().default(true),
    maxAttempts: z.number().step(1).min(1).default(3),
    cooldownSeconds: z.number().step(1).min(1).default(300),
  }),
})
