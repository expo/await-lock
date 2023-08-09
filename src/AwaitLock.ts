const defaultKey: symbol = Symbol('defaultKey');

/**
 * A mutex lock for coordination across async functions
 */
export default class AwaitLock {
  #acquired: Record<string | symbol, boolean> = { [defaultKey]: false };
  #waitingResolvers: Set<() => void> = new Set();

  /**
   * Whether the lock is currently acquired or not. Accessing this property does not affect the
   * status of the lock.
   */
  get acquired(): boolean {
    return this.#acquired[defaultKey];
  }

  /**
   * Acquires the lock, waiting if necessary for it to become free if it is already locked. The
   * returned promise is fulfilled once the lock is acquired.
   *
   * A timeout (in milliseconds) may be optionally provided. If the lock cannot be acquired before
   * the timeout elapses, the returned promise is rejected with an error. The behavior of invalid
   * timeout values depends on how `setTimeout` handles those values.
   *
   * After acquiring the lock, you **must** call `release` when you are done with it.
   */
  acquireAsync({
    timeout,
    key,
  }: { timeout?: number; key?: string | number | symbol } = {}): Promise<void> {
    key = key ?? defaultKey;
    if (!this.#acquired[key]) {
      this.#acquired[key] = true;
      return Promise.resolve();
    }

    if (timeout == null) {
      return new Promise((resolve) => {
        this.#waitingResolvers.add(resolve);
      });
    }

    let resolver: () => void;
    let timer: ReturnType<typeof setTimeout>;

    return Promise.race<void>([
      new Promise((resolve) => {
        resolver = () => {
          clearTimeout(timer);
          resolve();
        };
        this.#waitingResolvers.add(resolver);
      }),
      new Promise<void>((_, reject) => {
        timer = setTimeout(() => {
          this.#waitingResolvers.delete(resolver);
          reject(new Error(`Timed out waiting for lock`));
        }, timeout);
      }),
    ]);
  }

  /**
   * Acquires the lock if it is free and otherwise returns immediately without waiting. Returns
   * `true` if the lock was free and is now acquired, and `false` otherwise.
   *
   * This method differs from calling `acquireAsync` with a zero-millisecond timeout in that it runs
   * synchronously without waiting for the JavaScript task queue.
   */
  tryAcquire({ key }: { key?: string | symbol | number } = {}): boolean {
    key = key ?? defaultKey;
    if (!this.#acquired[key]) {
      this.#acquired[key] = true;
      return true;
    }

    return false;
  }

  /**
   * Releases the lock and gives it to the next waiting acquirer, if there is one. Each acquirer
   * must release the lock exactly once.
   */
  release({ key }: { key?: string | symbol | number } = { }): void {
    key = key ?? defaultKey;
    if (!this.#acquired[key]) {
      throw new Error(`Cannot release an unacquired lock`);
    }

    if (this.#waitingResolvers.size > 0) {
      // Sets preserve insertion order like a queue
      const [resolve] = this.#waitingResolvers;
      this.#waitingResolvers.delete(resolve);
      resolve();
    } else {
      this.#acquired[key] = false;
    }
  }
}
