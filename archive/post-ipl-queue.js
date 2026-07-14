#!/usr/bin/env node
const path = require('path');
const { execFileSync } = require('child_process');
const repoRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const output = execFileSync('node', [
  path.join(repoRoot, 'scripts', 'post-queue.js'),
  'ipl-daily-queue.json',
  ...args,
], { encoding: 'utf8' });

process.stdout.write(output);
