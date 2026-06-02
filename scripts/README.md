# Scripts

## Purpose

This folder contains the executable automation for queue generation and X
publishing.

## Files

- `x-post.js`
  - low-level X API client
  - supports auth verification, tweet posting, media upload, and deletion

- `post-queue.js`
  - generic queue runner
  - validates due items
  - downloads images
  - posts tweets
  - updates repo-local state

- `post-ipl-queue.js`
  - convenience wrapper for the IPL daily queue

- `build-ipl-daily-queue.js`
  - builds the daily queue from the official IPL schedule feed
  - falls back to `docs/ipl-2026-schedule.md`
