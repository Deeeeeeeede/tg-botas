/**
 * Patch abort-controller's AbortSignal so node-fetch@2 (used by Telegraf)
 * accepts native Node.js AbortSignal instances.
 *
 * WHY THIS FILE EXISTS:
 * Telegraf internally uses node-fetch@2, which checks:
 *   signal instanceof require('abort-controller').AbortSignal
 *
 * In Node.js 16+ the AbortController is native, so new AbortController().signal
 * is a *native* AbortSignal, NOT an instance of abort-controller's class.
 * That instanceof check fails, throwing:
 *   TypeError: Expected signal to be an instanceof AbortSignal
 *
 * This file MUST be the very first import in index.ts.
 * ES module imports are hoisted — any patch placed in module *body* code
 * runs after all imports have already been initialised, making it useless.
 * By placing the patch in its own module and importing it first, esbuild
 * initialises this module (and therefore runs the patch) before Telegraf
 * or node-fetch are ever evaluated.
 *
 * abort-controller is listed as external in build.mjs so it is loaded at
 * runtime from node_modules (not inlined). Node.js module caching means
 * Telegraf's node-fetch will receive the same, already-patched instance.
 */

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ac = require("abort-controller") as {
    AbortSignal: { [Symbol.hasInstance]: unknown };
  };
  if (ac?.AbortSignal) {
    Object.defineProperty(ac.AbortSignal, Symbol.hasInstance, {
      configurable: true,
      writable: true,
      value(instance: unknown): boolean {
        if (instance == null) return false;
        const i = instance as Record<string, unknown>;
        return (
          typeof i["aborted"] === "boolean" &&
          typeof i["addEventListener"] === "function"
        );
      },
    });
  }
} catch {
  // abort-controller may not be installed — fine, skip the patch.
}
