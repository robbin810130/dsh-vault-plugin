import type { PasswordPolicy } from './contracts.js'

export function passwordPolicyError(password: string, policy: PasswordPolicy): string | undefined {
  if (Array.from(password).length < policy.minLength) return `密码至少需要 ${policy.minLength} 个字符`
  if (policy.requireUppercase && !/[A-Z]/u.test(password)) return '密码必须包含大写字母'
  if (policy.requireLowercase && !/[a-z]/u.test(password)) return '密码必须包含小写字母'
  if (policy.requireNumber && !/[0-9]/u.test(password)) return '密码必须包含数字'
  if (policy.requireSymbol && !/[^A-Za-z0-9]/u.test(password)) return '密码必须包含符号'
  return undefined
}
