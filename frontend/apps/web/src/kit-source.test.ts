import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { newSeed, walletFromSeed } from '@confidential-loans/core/accounts'
import { serializeKit } from '@confidential-loans/core/kit'
import type { Kit } from '@confidential-loans/core/kit'
import { KIT_URL, loadKit } from './kit-source.ts'

function account(): { address: string; seed: string } {
  const seed = newSeed()
  return { address: walletFromSeed(seed).address, seed }
}
const KIT: Kit = {
  mptIssuanceID: '00000866A52D5F694AFB8C4C5B885407EDF42F78CE3A8B10',
  vaultID: 'CA13926442BE9FE158DAD76398AF5F77F499CDE7D9B546C6CC4BE7F27298F87C',
  accounts: {
    brokerA: account(),
    depositorA: account(),
    depositorB: account(),
    borrowerA: account(),
    borrowerB: account(),
  },
  elgamal: {
    brokerA: newSeed(),
    borrowerA: newSeed(),
    borrowerB: newSeed(),
    mptAuditor: newSeed(),
    loanAuditor: newSeed(),
  },
}

function answer(status: number, body: string) {
  const urls: string[] = []
  const fetchKitText = async (url: string) => {
    urls.push(url)
    return new Response(body, { status })
  }
  return { urls, fetchKitText }
}

describe('loadKit', () => {
  it('parses the kit the local server serves', async () => {
    const { urls, fetchKitText } = answer(200, serializeKit(KIT))
    assert.deepEqual(await loadKit(fetchKitText), KIT)
    assert.deepEqual(urls, [KIT_URL])
  })

  it("throws the server's message when it cannot build the kit", async () => {
    const { fetchKitText } = answer(500, 'No vault in scripts/state.json\n')
    await assert.rejects(loadKit(fetchKitText), { message: 'No vault in scripts/state.json' })
  })

  it('names the status when the server sends no message', async () => {
    const { fetchKitText } = answer(404, '')
    await assert.rejects(loadKit(fetchKitText), { message: `${KIT_URL} answered 404` })
  })

  it('rejects text that is not a kit', async () => {
    const { fetchKitText } = answer(200, '<!doctype html>')
    await assert.rejects(loadKit(fetchKitText))
  })
})
