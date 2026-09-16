// Match codes only: backend messages may contain sensitive filesystem details.
export function vaultOperationError(code: string | undefined, fallback = '操作失败，请稍后重试'): string {
  switch (code) {
    case 'busy': return '保险箱验证繁忙，请稍后重试。'
    case 'state-lock-busy': return '保险箱状态正在使用，请稍后重试。'
    case 'state-lock-recovery-required': return '保险箱状态锁需要管理员检查并恢复。请勿直接删除状态文件。'
    default: return fallback
  }
}
