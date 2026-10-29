import { describe, it, expect } from 'vitest'
import { replayReferences, mergeReferences, scanSteamCache } from '../src/domain/steamCache'
const bytes = (s: string) => new TextEncoder().encode(s)
describe('local Steam cache extraction', () => {
  it('extracts only numeric Deadlock replay references from binary headers, without a file path or host', () => {
    const refs = replayReferences(
      bytes(
        '\0http://replay404.valve.net/1422450/123456_987.meta.bz2\0 https://replay404.valve.net/1422450/123456_654.dem.bz2?x=1\0',
      ),
    )
    expect(mergeReferences(refs)).toEqual([
      { match_id: 123456, cluster_id: 404, metadata_salt: 987, replay_salt: 654 },
    ])
  })
  it('ignores foreign apps, forged hosts, invalid numbers, sessions and cookies', () => {
    const refs = replayReferences(
      bytes(
        'http://replay404.valve.net.evil/1422450/1_2.meta.bz2\0http://replay404.valve.net/730/1_2.meta.bz2\0http://evilreplay404.valve.net/1422450/1_2.meta.bz2\0http://replay404.valve.net/1422450/9007199254740993_2.meta.bz2\0http://replay0.valve.net/1422450/1_2.meta.bz2\0sessionid=secret',
      ),
    )
    expect(refs).toEqual([])
  })
  it('deduplicates downloads while keeping clusters separate and discarding conflicting salts', () => {
    expect(
      mergeReferences([
        { match_id: 1, cluster_id: 1, metadata_salt: 2 },
        { match_id: 1, cluster_id: 1, metadata_salt: 3 },
        { match_id: 1, cluster_id: 2, metadata_salt: 4 },
        { match_id: 1, cluster_id: 2, replay_salt: 5 },
      ]),
    ).toEqual([{ match_id: 1, cluster_id: 2, metadata_salt: 4, replay_salt: 5 }])
  })
  it('reads only the small header, reports progress and stops when cancelled', async () => {
    const file = new File(
      [
        '\0http://replay404.valve.net/1422450/123456_987.meta.bz2\0' +
          ' '.repeat(600) +
          'http://replay404.valve.net/1422450/999_999.meta.bz2\0',
      ],
      'not-uploaded.bin',
    )
    const controller = new AbortController(),
      progress: number[] = []
    const scan = await scanSteamCache([file], controller.signal, (n) => progress.push(n))
    expect(scan.references).toEqual([{ match_id: 123456, cluster_id: 404, metadata_salt: 987 }])
    expect(progress).toEqual([1])
    controller.abort()
    await expect(scanSteamCache([file], controller.signal, () => {})).rejects.toThrow()
    await expect(
      scanSteamCache(Array(20001).fill(file), new AbortController().signal, () => {}),
    ).rejects.toThrow(/20 000/)
  })
})
