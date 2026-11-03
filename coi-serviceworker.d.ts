/** Why the page is not cross-origin isolated. */
export type CoiFailure =
  | 'module-script'
  | 'no-service-worker'
  | 'registration-failed'
  | 'storage-unavailable'
  | 'still-not-isolated';

/** Where the page ends up: isolated, not isolated for `reason`, or without the worker. */
export type CoiSettled =
  | { status: 'isolated' }
  | { status: 'failed'; reason: CoiFailure }
  | { status: 'unregistered' };

/** A state the script reports in a `coi-serviceworker` event. */
export type CoiState = CoiSettled | { status: 'reloading' };

/** `window.coiServiceWorker`, set as soon as the script runs. */
export type CoiServiceWorker = (CoiState | { status: 'pending' }) & {
  /** Resolves once the page is isolated or has failed; never while it reloads. */
  settled: Promise<CoiSettled>;
};
