export class Result<T, E> {
  private constructor(
    private readonly inner: { ok: true; value: T } | { ok: false; error: E }
  ) {}

  static Ok<T>(value: T): Result<T, never> {
    return new Result<T, never>({ ok: true, value });
  }

  static Err<E>(error: E): Result<never, E> {
    return new Result<never, E>({ ok: false, error });
  }

  isOk(): boolean {
    return this.inner.ok;
  }

  isErr(): boolean {
    return !this.inner.ok;
  }

  unwrap(): T {
    if (this.inner.ok) return this.inner.value;
    throw new Error(`Tried to unwrap Err with value ${this.inner.error}`);
  }

  unwrapErr(): E {
    if (!this.inner.ok) return this.inner.error;
    throw new Error(`Tried to unwrap Ok with value ${this.inner.value}`);
  }

  unwrapOr(defaultValue: T): T {
    return this.inner.ok ? this.inner.value : defaultValue;
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    if (this.inner.ok) return Result.Ok(fn(this.inner.value));
    return Result.Err(this.inner.error);
  }

  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    if (this.inner.ok) return Result.Ok(this.inner.value);
    return Result.Err(fn(this.inner.error));
  }
}
