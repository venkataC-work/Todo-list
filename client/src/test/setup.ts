import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { sessionStore } from '@/shared/session/session-store';
import { toasts } from '@/shared/lib/toast';

// jsdom does not implement modal dialogs; browser tests exercise the native behavior.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: {
    configurable: true,
    value() {
      this.setAttribute('open', '');
    },
  },
  close: {
    configurable: true,
    value() {
      this.removeAttribute('open');
    },
  },
});

afterEach(() => {
  cleanup();
  sessionStore.clear();
  toasts.set([]);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
