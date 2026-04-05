export class UnwrapError<E> extends Error {
  constructor(public readonly error: E, message?: string) {
    super(message || `Unwrapped the wrong variant of Result`);
    Object.setPrototypeOf(this, UnwrapError.prototype);
  }
}

export class Result<T, E> {
  private constructor(
    private readonly inner: { ok: true; value: T } | { ok: false; error: E }
  ) { }

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
    throw new UnwrapError<E>(this.inner.error);
  }

  expect(message: string): T {
    if (this.inner.ok) return this.inner.value;
    throw new UnwrapError<E>(this.inner.error, message);
  }

  unwrapErr(): E {
    if (!this.inner.ok) return this.inner.error;
    throw new UnwrapError<T>(this.inner.value);
  }

  unwrapOr<D>(defaultValue: D): T | D {
    return this.inner.ok ? this.inner.value : defaultValue;
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    if (this.inner.ok) return Result.Ok(fn(this.inner.value));
    return Result.Err(this.inner.error);
  }

  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    if (this.inner.ok) return fn(this.inner.value);
    return Result.Err(this.inner.error);
  }

  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    if (this.inner.ok) return Result.Ok(this.inner.value);
    return Result.Err(fn(this.inner.error));
  }

  flatMapErr<F>(fn: (error: E) => Result<T, F>): Result<T, F> {
    if (this.inner.ok) return Result.Ok(this.inner.value);
    return fn(this.inner.error);
  }

  static safeTry<T, E>(fn: () => Result<T, E> | T, errorMapper: (e: unknown) => E): Result<T, E> {
    try {
      const result = fn();
      if (result instanceof Result) {
        return result;
      }
      return Result.Ok(result);
    } catch (e) {
      if (e instanceof UnwrapError) {
        return Result.Err(e.error as E);
      }
      return Result.Err(errorMapper(e));
    }
  }

  static safeTryAsync<T, E>(fn: () => Promise<Result<T, E> | T>, errorMapper: (e: unknown) => E): Promise<Result<T, E>> {
    return fn().then(result => {
      if (result instanceof Result) {
        return result;
      }
      return Result.Ok(result);
    }).catch(e => {
      if (e instanceof UnwrapError) {
        return Result.Err(e.error as E);
      }
      return Result.Err(errorMapper(e));
    });
  }
}

