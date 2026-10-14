// LiteRT.js loads its Emscripten runtime with `importScripts` when it runs in a
// worker, but module workers (which the SDK's top-level await needs) throw on
// `importScripts`. Replace it with a synchronous fetch + global eval, which is
// what a classic worker's importScripts does. Must be imported before the SDK.

const scope = self as unknown as { importScripts: (...urls: string[]) => void };

scope.importScripts = (...urls: string[]) => {
  for (const url of urls) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send();
    if (xhr.status < 200 || xhr.status >= 300) {
      throw new Error(`importScripts: ${url} returned ${xhr.status}`);
    }
    // Indirect eval runs in global scope, so the script's top-level `var`s
    // become worker globals, as with a real importScripts.
    (0, eval)(`${xhr.responseText}\n//# sourceURL=${url}`);
  }
};

export {};
