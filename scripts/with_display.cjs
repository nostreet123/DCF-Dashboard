#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

function printUsageAndExit() {
  // eslint-disable-next-line no-console
  console.error('Usage: node scripts/with_display.cjs -- <command> [args...]');
  process.exit(2);
}

const delimiterIndex = process.argv.indexOf('--');
if (delimiterIndex === -1) {
  printUsageAndExit();
}

const commandParts = process.argv.slice(delimiterIndex + 1);
if (commandParts.length === 0) {
  printUsageAndExit();
}

const isLinux = process.platform === 'linux';
const hasDisplay = Boolean(process.env.DISPLAY && process.env.DISPLAY.trim());
const screen = process.env.XVFB_SCREEN || '1280x720x24';
const serverArgs = process.env.XVFB_SERVER_ARGS || `-screen 0 ${screen} -ac +extension RANDR`;

const shouldWrapWithXvfb = isLinux && !hasDisplay;

const command = shouldWrapWithXvfb ? 'xvfb-run' : commandParts[0];
const args = shouldWrapWithXvfb
  ? ['-a', '--server-args', serverArgs, ...commandParts]
  : commandParts.slice(1);

if (shouldWrapWithXvfb) {
  // eslint-disable-next-line no-console
  console.error(`No $DISPLAY detected; running under Xvfb (${screen}).`);
}

const child = spawn(command, args, {
  stdio: 'inherit',
  env: process.env,
});

const forwardSignal = (signal) => {
  if (child.killed) return;
  child.kill(signal);
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('error', (err) => {
  if (shouldWrapWithXvfb && err && err.code === 'ENOENT') {
    // eslint-disable-next-line no-console
    console.error('xvfb-run not found. Install Xvfb or run on a machine with a display.');
  } else {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 1);
});
