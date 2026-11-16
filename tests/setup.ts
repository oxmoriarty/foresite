import "@testing-library/jest-dom";
import "fake-indexeddb/auto";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";

// Unify Blob and File implementations across JSDOM and Node environment
// JSDOM's custom Blob is not clonable by Node's structuredClone in fake-indexeddb
// @ts-expect-error override with node native buffer Blob
globalThis.Blob = NodeBlob;
// @ts-expect-error override with node native buffer File
globalThis.File = NodeFile;

if (typeof window !== "undefined") {
  // @ts-expect-error override with node native buffer Blob
  window.Blob = NodeBlob;
  // @ts-expect-error override with node native buffer File
  window.File = NodeFile;

  // Ensure URL.createObjectURL and URL.revokeObjectURL exist in JSDOM test environment
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = (_blob: Blob) => {
      return `blob:http://localhost:3000/${Math.random().toString(36).substring(2, 10)}`;
    };
  }
  if (!window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL = (_url: string) => {};
  }
}
