export interface CredentialWork {
  readonly revoked: boolean
}

interface Job {
  readonly groupId: string
  readonly clientInstanceId: string
  revoked: boolean
  start(): void
}

/** Shared by all credential routes, never keyed by a caller's chosen identity.
 * Bounds include running work. Revocation marks admitted jobs rather than
 * keeping an ever-growing generation map for arbitrary client identifiers.
 */
export class CredentialWorkQueue {
  private readonly jobs = new Set<Job>()
  private readonly waiting: Job[] = []
  private readonly runningGroups = new Set<string>()

  run<T>(groupId: string, clientInstanceId: string, task: (work: CredentialWork) => Promise<T>, busy: T): Promise<T> {
    if (this.jobs.size >= 64
      || [...this.jobs].filter(job => job.groupId === groupId).length >= 8) return Promise.resolve(busy)
    return new Promise<T>((resolve, reject) => {
      const job: Job = {
        groupId, clientInstanceId, revoked: false,
        start: () => {
          void (async () => {
            try { resolve(await task(job)) } catch (error) { reject(error) } finally {
              this.jobs.delete(job)
              this.runningGroups.delete(groupId)
              this.drain()
            }
          })()
        },
      }
      this.jobs.add(job)
      this.waiting.push(job)
      this.drain()
    })
  }

  revokeGroup(groupId: string, clientInstanceId?: string): void {
    for (const job of this.jobs) {
      if (job.groupId === groupId && (clientInstanceId === undefined || job.clientInstanceId === clientInstanceId)) job.revoked = true
    }
  }

  revokeClient(clientInstanceId: string): void {
    for (const job of this.jobs) if (job.clientInstanceId === clientInstanceId) job.revoked = true
  }

  revokeAll(): void {
    for (const job of this.jobs) job.revoked = true
  }

  private drain(): void {
    while (this.runningGroups.size < 4) {
      const index = this.waiting.findIndex(job => !this.runningGroups.has(job.groupId))
      if (index < 0) return
      const job = this.waiting.splice(index, 1)[0]!
      this.runningGroups.add(job.groupId)
      job.start()
    }
  }
}
