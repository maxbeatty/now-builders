const startTime = process.hrtime();

const esm = require('esm');

// Load Config
const _esm = esm(module, {
  cjs: {
    dedefault: true,
  },
});
const nuxtConfig = _esm('__NUXT_CONFIG__');

// Create nuxt
const { Nuxt } = require('@nuxt/core__NUXT_SUFFIX__');
const nuxt = new Nuxt({
  _start: true,
  ...nuxtConfig,
});

// Start nuxt initialization process
let isReady = false;
const readyPromise = nuxt
  .ready()
  .then(() => {
    isReady = true;
    const hrTime = process.hrtime(startTime);
    const hrTimeMs = (hrTime[0] * 1e9 + hrTime[1]) / 1e6;
    // eslint-disable-next-line no-console
    console.log(`λ Cold start took: ${hrTimeMs}ms`);
  })
  .catch((error: any) => {
    // eslint-disable-next-line no-console
    console.error('λ Error while initializing nuxt:', error);
    process.exit(1);
  });

// Create brdige and start listening
import { Server, IncomingMessage, ServerResponse } from 'http'; // eslint-disable-line import/order
const { Bridge } = require('./now__bridge.js');

const server = new Server(async (req: IncomingMessage, res: ServerResponse) => {
  if (!isReady) {
    await readyPromise;
  }
  nuxt.server.app(req, res);
});
const bridge = new Bridge(server);

bridge.listen();

export const launcher = bridge.launcher;
