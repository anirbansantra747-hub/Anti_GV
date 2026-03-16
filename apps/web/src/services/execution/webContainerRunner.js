/**
 * @file webContainerRunner.js
 * @description Runs JavaScript/Node.js code using the WebContainers API (browser-native WASM).
 * Requires Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp headers.
 */

import { WebContainer } from '@webcontainer/api';

let webContainerInstance = null;

/**
 * Initialize (or reuse) a WebContainer instance.
 * @returns {Promise<WebContainer>}
 */
async function getWebContainer() {
  if (webContainerInstance) return webContainerInstance;
  webContainerInstance = await WebContainer.boot();
  return webContainerInstance;
}

/**
 * Execute a JavaScript/Node.js code string inside a WebContainer.
 * @param {string} code - The code to run.
 * @param {function(string): void} onOutput - Callback for stdout/stderr lines.
 * @param {function(number): void} [onExit] - Callback for exit code.
 */
export async function runInWebContainer(code, onOutput, onExit) {
  try {
    onOutput('\x1b[36m▶ Running in WebContainers (Node.js WASM)...\x1b[0m\r\n');
    const wc = await getWebContainer();

    // Mount the code file into the container's virtual FS
    await wc.mount({
      'index.js': {
        file: { contents: code },
      },
    });

    // Spawn node process
    const process = await wc.spawn('node', ['index.js']);

    // Stream stdout
    process.output.pipeTo(
      new WritableStream({
        write(chunk) {
          onOutput(chunk);
        },
      })
    );

    // Wait for exit
    const exitCode = await process.exit;
    if (onExit) onExit(exitCode);

    if (exitCode === 0) {
      onOutput('\r\n\x1b[32m✓ Process exited with code 0\x1b[0m\r\n');
    } else {
      onOutput(`\r\n\x1b[31m✗ Process exited with code ${exitCode}\x1b[0m\r\n`);
    }
  } catch (err) {
    onOutput(`\r\n\x1b[31m[WebContainers Error] ${err.message}\x1b[0m\r\n`);
    if (onExit) onExit(1);
  }
}
