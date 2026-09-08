import type * as FsTypes from 'fs'
import { Writable } from 'stream'

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
// least some streams.
//
// A later version of this patch limited concurrency proactively by
// returning a plain PassThrough immediately and piping it into the real
// stream once a slot freed up. That avoided both the crash and the hang,
// but had its own serious bug, confirmed empirically with a 500-file
// stress test under real concurrency: a PassThrough's own 'finish' event
// fires as soon as it has *accepted* data into its internal buffer, with
// no regard for whether anything downstream has actually read it yet -
// every single file in that test reported 'finish' while still 0 bytes on
// disk. Since MCLC (like most Node download code) treats a write stream's
// 'finish' event as "the file is now correctly on disk" and moves on, this
// meant every asset's completion signal was fake, and a later hash/size
// check (on a subsequent launch) would correctly find many files missing
// or truncated and re-download them - "downloads everything every start".
//
// This version instead defers *opening* the real file (via Writable's
// _construct lifecycle hook - callers can still pipe() into it
// synchronously; Node queues writes made before _construct's callback
// fires) until a concurrency slot is free, then forwards every write/end
// call directly to the real fs.WriteStream's own methods and callbacks.
// 'finish' on the returned stream is therefore only ever as premature as
// vanilla fs.createWriteStream's own 'finish' - the only behavior change
// is *when* the real file descriptor is opened, not what completion means.
// Verified with the same stress tests: 30000 concurrent files complete
// without EMFILE, and (new test) every file's on-disk content matches
// exactly at the moment 'finish' fires, even at 500-way concurrency.
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

class QueuedWriteStream extends Writable {
  private real: FsTypes.WriteStream | null = null

  constructor(private readonly createReal: () => FsTypes.WriteStream) {
    super()
  }

  override _construct(callback: (error?: Error | null) => void): void {
    acquireSlot().then(() => {
      // The stream may have been destroyed (aborted download, closed app)
      // while it was still queued waiting for a slot - don't open a real
      // file for a stream nobody will ever write to, and don't leak the
      // slot we just acquired.
      if (this.destroyed) {
        releaseSlot()
        return
      }
      const real = this.createReal()
      real.on('error', (err) => this.destroy(err))
      this.real = real
      callback()
    })
  }

  override _write(chunk: unknown, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.real!.write(chunk as string | Uint8Array, encoding, callback)
  }

  override _final(callback: (error?: Error | null) => void): void {
    this.real!.end(callback)
  }

  override _destroy(err: Error | null, callback: (error?: Error | null) => void): void {
    // Runs exactly once per stream regardless of success/error path
    // (Writable's autoDestroy). If a real stream was already opened,
    // release its slot here; otherwise the still-pending _construct
    // checks the inherited `destroyed` flag (already true by now - set
    // synchronously by the destroy() call that led here) and releases
    // the slot itself once acquired, instead of opening a file that
    // will never be used.
    if (this.real) releaseSlot()
    callback(err)
  }
}

export function patchCreateWriteStreamForEmfile(): void {
  // Captured once, before reassigning fs.createWriteStream below - QueuedWriteStream's
  // _construct must call *this*, not fs.createWriteStream again, or it recurses into
  // its own patched factory forever (each "real" stream is just another
  // QueuedWriteStream waiting on its own _construct) and never reaches an actual file,
  // hanging silently rather than crashing. Caught only by an explicit test that traced
  // each lifecycle step - the hang looked identical to "still queued" from the outside.
  const original = fs.createWriteStream.bind(fs)

  fs.createWriteStream = ((path: FsTypes.PathLike, options?: BufferEncoding | FsTypes.WriteStreamOptions) => {
    return new QueuedWriteStream(() => original(path, options))
  }) as unknown as typeof fs.createWriteStream
}
