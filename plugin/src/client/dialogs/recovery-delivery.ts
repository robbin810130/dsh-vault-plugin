import type { VaultClientStore } from '../store-types.js'

interface RecoveryDelivery { readonly key: string }

// Per-store, memory-only delivery survives row and settings lifecycles. Never
// include these secrets in ordinary snapshots, persistence or diagnostics.
export function createRecoveryDelivery() {
  let queue: readonly RecoveryDelivery[] = []
  let active = true
  const listeners = new Set<() => void>()
  const notify = () => { for (const listener of listeners) listener() }
  return {
    getSnapshot: (): RecoveryDelivery | null => queue[0] ?? null,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    deliver(key: string) {
      if (!active) return
      queue = [...queue, { key }]
      notify()
    },
    acknowledge(delivery: RecoveryDelivery) {
      if (queue[0] !== delivery) return
      queue = queue.slice(1)
      notify()
    },
    dispose() { active = false; queue = []; notify(); listeners.clear() },
  }
}
const deliveries = new WeakMap<VaultClientStore, ReturnType<typeof createRecoveryDelivery>>()
export function recoveryDeliveryFor(store: VaultClientStore) {
  let delivery = deliveries.get(store)
  if (delivery === undefined) { delivery = createRecoveryDelivery(); deliveries.set(store, delivery) }
  return delivery
}
