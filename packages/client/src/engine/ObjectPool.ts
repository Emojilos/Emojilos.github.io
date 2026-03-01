/**
 * Generic object pool for frequently created/destroyed objects.
 * Reduces GC pressure by reusing objects instead of allocating new ones.
 */
export class ObjectPool<T> {
  private readonly pool: T[] = [];
  private readonly create: () => T;
  private readonly reset: (obj: T) => void;

  constructor(create: () => T, reset: (obj: T) => void, preAllocate = 0) {
    this.create = create;
    this.reset = reset;
    for (let i = 0; i < preAllocate; i++) {
      this.pool.push(this.create());
    }
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.create();
  }

  release(obj: T): void {
    this.reset(obj);
    this.pool.push(obj);
  }

  get size(): number {
    return this.pool.length;
  }

  dispose(cleanup?: (obj: T) => void): void {
    if (cleanup) {
      for (const obj of this.pool) {
        cleanup(obj);
      }
    }
    this.pool.length = 0;
  }
}
