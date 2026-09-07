import type * as FsTypes from 'fs'
import { PassThrough } from 'stream'
import { pipeline } from 'stream/promises'

// require, not `import * as fs` - the latter produces a read-only ESM
// namespace object under esbuild's interop, which is what was actually
// breaking earlier attempts at this patch (not anything Electron itself
// seals).
const fs = require('fs') as typeof FsTypes

// MCLC's asset downloader fires one unbounded Promise.all over every asset
// in a version's index (thousands of entries for modern MC) with zero
// concurrency limiting, each doing fs.createWriteStream + pipe(). That
// reliably exceeds the open-file-handle ceiling (~8192 on Windows) and
// crashes the main process with EMFILE.
//
// Earlier attempts patched this reactively (retry-on-EMFILE by subclassing
// WriteStream and overriding its open()) - that avoided the crash but hung
// instead: overriding open() bypasses some of Node's internal stream
// bookkeeping in a way that silently breaks the 'finish' event for at
// least some streams. Rather than fight Node's internal stream lifecycle,
// this limits concurrency *proactively* instead: fs.createWriteStream
// returns a plain PassThrough immediately (so callers can pipe() into it
// synchronously, same as before), but the real underlying file isn't
// opened until a concurrency slot is free, using only public, stable
// stream composition APIs (PassThrough + stream/promises pipeline) rather
// than subclassing anything from 'fs'.
const MAX_CONCURRENT_STREAMS = 200

let active = 0
const waiting: Array<() => void> = []

function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT_STREAMS) {
    active++
    return Promise.resolve()
  }
  return new Promise((resolve) => waiting.push(resolve))
}

function releaseSlot(): void {
  active--
  const next = waiting.shift()
  if (next) {
    active++
    next()
  }
}

export function patchCreateWriteStreamForEmfile(): void {
  const original = fs.createWriteStream.bind(fs)

  fs.createWriteStream = ((path: FsTypes.PathLike, options?: BufferEncoding | FsTypes.WriteStreamOptions) => {
    const proxy = new PassThrough()

    acquireSlot().then(() => {
      const real = original(path, options)
      pipeline(proxy, real)
        .catch(() => {
          // Errors already propagate to `proxy` via pipeline's own chained
          // destroy-on-error behavior - callers listening on the returned
          // stream's 'error' event still see them. Just avoid an unhandled
          // rejection here.
        })
        .finally(() => releaseSlot())
    })

    return proxy
  }) as unknown as typeof fs.createWriteStream
}
