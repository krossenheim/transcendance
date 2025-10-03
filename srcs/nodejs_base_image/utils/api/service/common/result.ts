export class Result<T, E> {
	private constructor(
		private readonly inner: { ok: true; value: T } | { ok: false; error: E }
	) { }

	static Ok<T, E = never>(value: T) {
		return new Result<T, E>({ ok: true, value });
	}

	static Err<T = never, E = unknown>(error: E) {
		return new Result<T, E>({ ok: false, error });
	}

	isOk(): boolean {
		return this.inner.ok;
	}

	isErr(): boolean {
		return !this.inner.ok;
	}

	unwrap(): T {
		if (this.inner.ok) return this.inner.value;
		throw new Error("Tried to unwrap Err");
	}

	unwrapErr(): E {
		if (!this.inner.ok) return this.inner.error;
		throw new Error("Tried to unwrap Ok");
	}
}