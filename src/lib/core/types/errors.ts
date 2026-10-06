export type AppErrorKind =
	| "app"
	| "book-not-found"
	| "book-service"
	| "book-unsupported"
	| "network"
	| "database"
	| "book-cache";

export interface AppErrorOptions {
	kind?: AppErrorKind;
	cause?: unknown;
}

export class AppError extends Error {
	readonly kind: AppErrorKind;

	constructor(message: string, options: AppErrorOptions = {}) {
		super(message, { cause: options.cause });
		this.kind = options.kind ?? "app";
		this.name = "AppError";
	}
}

export class BookNotFoundError extends AppError {
	readonly kind: AppErrorKind = "book-not-found";

	constructor(
		readonly bookId: string,
		options: { cause?: unknown } = {},
	) {
		super(`Book not found: ${bookId}`, { kind: "book-not-found", ...options });
		this.name = "BookNotFoundError";
	}
}

export class BookServiceError extends AppError {
	readonly kind: AppErrorKind = "book-service";

	constructor(
		operation: string,
		readonly status: number,
		options: { cause?: unknown } = {},
	) {
		super(`Book service ${operation} failed (status ${status})`, {
			kind: "book-service",
			...options,
		});
		this.name = "BookServiceError";
	}
}

/** The book loaded, but its contents list has nothing this app can type. */
export class BookUnsupportedError extends AppError {
	readonly kind: AppErrorKind = "book-unsupported";

	constructor(
		readonly bookId: string,
		options: { cause?: unknown } = {},
	) {
		super(`Nothing to type in ${bookId}`, {
			kind: "book-unsupported",
			...options,
		});
		this.name = "BookUnsupportedError";
	}
}

export class NetworkError extends AppError {
	readonly kind: AppErrorKind = "network";
	/** The request was abandoned at its time limit rather than refused. */
	readonly timedOut: boolean;

	constructor(
		message: string,
		options: { cause?: unknown; timedOut?: boolean } = {},
	) {
		super(message, { kind: "network", cause: options.cause });
		this.name = "NetworkError";
		this.timedOut = options.timedOut ?? false;
	}
}

export class DatabaseError extends AppError {
	readonly kind: AppErrorKind = "database";

	constructor(message: string, options: { cause?: unknown } = {}) {
		super(message, { kind: "database", ...options });
		this.name = "DatabaseError";
	}
}

export class BookCacheError extends AppError {
	readonly kind: AppErrorKind = "book-cache";

	constructor(message: string, options: { cause?: unknown } = {}) {
		super(message, { kind: "book-cache", ...options });
		this.name = "BookCacheError";
	}
}

export function isAppError(value: unknown): value is AppError {
	return value instanceof AppError;
}
