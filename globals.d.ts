import type { CoiServiceWorker, CoiState } from './coi-serviceworker.d.ts';

declare global {
  interface Window {
    coiServiceWorker: CoiServiceWorker;
  }
  interface WindowEventMap {
    'coi-serviceworker': CustomEvent<CoiState>;
  }
}
