# Scheduler

## Scheduling Model

This project can be run by any external scheduler that invokes the Node entry
points.

Recommended scheduling target:

- `node scripts/post-ipl-queue.js`

Optional queue refresh before posting:

- `node scripts/build-ipl-daily-queue.js`

## Original Deployment

In the original OpenClaw deployment:

- OpenClaw's internal cron subsystem stored job definitions and run history
- macOS `launchd` only kept the OpenClaw gateway service running
- user-level macOS `cron` was not used

That means:

- scheduler logic belonged to the application runtime
- OS-level process supervision was separate from queue execution

## Why This Matters

This separation is operationally cleaner:

- application jobs are versioned and visible to the application
- runtime state is centralized
- system scheduling remains minimal

## Portable Use

To reuse this repository outside OpenClaw, run it from:

- a GitHub Actions workflow
- a server-side cron
- a container scheduler
- a lightweight host scheduler

The scripts themselves do not require macOS-specific cron behavior.
