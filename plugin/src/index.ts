import type { Context } from '@deepseek-ai/cordis'
import type { Config as VaultConfig } from './config.js'

export * from './config.js'
export * from './shared/contracts.js'

export function apply(_ctx: Context, _config: VaultConfig): void {}
