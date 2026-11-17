import "@testing-library/jest-dom";
import "fake-indexeddb/auto";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";

// Unify Blob and File implementations across JSDOM and Node environment
// JSDOM's custom Blob is not clonable by Node's structuredClone in fake-indexeddb
// @ts-expect-error override with node native buffer Blob
globalThis.Blob = NodeBlob;
// @ts-expect-error override with node native buffer File
globalThis.File = NodeFile;

// Robust localStorage implementation for Vitest / Node 22+ JSDOM environment
class LocalStorageMock implements Storage {
  private store: Record<string, string> = {};

  clear(): void {
    this.store = {};
  }

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? (this.store[key] ?? null) : null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  get length(): number {
    return Object.keys(this.store).length;
  }

  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }
}

const mockStorage = new LocalStorageMock();
Object.defineProperty(globalThis, "localStorage", {
  value: mockStorage,
  writable: true,
  configurable: true,
});

if (typeof window !== "undefined") {
  // @ts-expect-error override with node native buffer Blob
  window.Blob = NodeBlob;
  // @ts-expect-error override with node native buffer File
  window.File = NodeFile;

  Object.defineProperty(window, "localStorage", {
    value: mockStorage,
    writable: true,
    configurable: true,
  });

  // Ensure URL.createObjectURL and URL.revokeObjectURL exist in JSDOM test environment
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = (_blob: Blob) => {
      return `blob:http://localhost:3000/${Math.random().toString(36).substring(2, 10)}`;
    };
  }
  if (!window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL = (_url: string) => {};
  }

  // JSDOM Image and Canvas emulation for client-side image downscaling
  if (typeof window.Image !== "undefined") {
    // Automatically trigger onload for Image elements in tests
    Object.defineProperty(window.Image.prototype, "src", {
      set(this: HTMLImageElement & { _src?: string }, src: string) {
        this._src = src;
        setTimeout(() => {
          this.width = this.width || 800;
          this.height = this.height || 600;
          if (this.onload) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.onload({} as any);
          }
        }, 0);
      },
      get(this: { _src?: string }) {
        return this._src || "";
      },
      configurable: true,
    });
  }

  if (typeof window.HTMLCanvasElement !== "undefined") {
    window.HTMLCanvasElement.prototype.getContext = (() => ({
      drawImage: () => {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any;

    window.HTMLCanvasElement.prototype.toDataURL = (_type?: string, _quality?: number) => {
      // Return a base64 encoded JPEG mock string
      return "data:image/jpeg;base64,bW9jay1qcGVnLWRhdGE=";
    };
  }
}
