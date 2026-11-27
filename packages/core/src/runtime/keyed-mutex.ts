/**
 * Runs work for one key one call after another inside this process; work for different keys runs
 * concurrently. A failed call rejects only its own caller and never blocks the next call for the key.
 * Across processes the ADR 0003 single-writer rule applies, not this lock.
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(work);
    // The failure reaches its own caller through `result`; the tail only orders the next call.
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    try {
      return await result;
    } finally {
      // Drop the entry once the last queued call settles, so idle keys hold no memory.
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}

/** The one-key case: every call of this instance runs after the previous one settles. */
export class SerialMutex {
  private readonly mutex = new KeyedMutex();

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.mutex.run('', work);
  }
}
