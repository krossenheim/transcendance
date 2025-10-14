import { zodParse } from "./zodUtils.js";
import { z } from "zod";

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

	unwrapOr(defaultValue: T): T {
		return this.inner.ok ? this.inner.value : defaultValue;
	}

	map<U>(fn: (value: T) => U): Result<U, E> {
		if (this.inner.ok)
			return Result.Ok(fn(this.inner.value));
		return Result.Err(this.inner.error);
	}

	mapErr<F>(fn: (error: E) => F): Result<T, F> {
		if (this.inner.ok)
			return Result.Ok(this.inner.value);
		return Result.Err(fn(this.inner.error));
	}
}