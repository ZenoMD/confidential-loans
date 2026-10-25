import { setTimeout as sleep } from 'node:timers/promises'

import { rippleTimeToISOTime } from 'xrpl'
import type { Client } from 'xrpl'

import { reconnecting } from '#lib/network'

/**
 * Reads the close time of the latest validated ledger, in seconds since the Ripple Epoch.
 *
 * Phase gates and loan due dates compare against ledger close time, not the local clock.
 *
 * @param client - Connected client.
 * @returns Ledger close time in Ripple Epoch seconds.
 */
export async function ledgerTime(client: Client): Promise<number> {
  const response = await reconnecting(client, () =>
    client.request({ command: 'ledger', ledger_index: 'validated' }),
  )
  return response.result.ledger.close_time
}

/**
 * Waits until a validated ledger closes at or after `target`.
 *
 * @param client - Connected client.
 * @param target - Ripple Epoch seconds to wait for.
 * @param label - What is being waited for, for the log line.
 */
export async function waitForLedgerTime(
  client: Client,
  target: number,
  label: string,
): Promise<void> {
  console.log(`waiting for ${label} at ${rippleTimeToISOTime(target)}`)
  while ((await ledgerTime(client)) < target) await sleep(2000)
}
