// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
	}

	/*
	 * THE FILE SYSTEM ACCESS API, declared here because TypeScript's DOM library
	 * does not carry it. It is a live standard that Chromium ships and the others
	 * do not, and the shape below is only what $lib/workspace.ts actually calls —
	 * a declaration file is not a place to write down a specification.
	 *
	 * EVERY MEMBER IS OPTIONAL, which is the point of declaring them rather than
	 * reaching for `any`. A browser without the API has no `showDirectoryPicker`
	 * at all, so the type says so and the call site has to ask before it calls.
	 */
	interface Window {
		showDirectoryPicker?: (options?: {
			mode?: 'read' | 'readwrite';
			startIn?: string;
			id?: string;
		}) => Promise<FileSystemDirectoryHandle>;
	}

	interface FileSystemFileHandle {
		/* Rename, or move to another folder. Chromium only, and the reason a move
		 * is one call rather than a read, a write and a delete — which is three
		 * chances to leave half a document somewhere. */
		move(name: string): Promise<void>;
		move(directory: FileSystemDirectoryHandle, name?: string): Promise<void>;
	}

	/* On the handle base, because it is how a REMEMBERED folder would be re-asked
	 * for — the grant does not survive a reload even though the handle does. */
	interface FileSystemHandle {
		queryPermission?: (options?: {
			mode?: 'read' | 'readwrite';
		}) => Promise<PermissionState>;
		requestPermission?: (options?: {
			mode?: 'read' | 'readwrite';
		}) => Promise<PermissionState>;
	}
}

export {};
