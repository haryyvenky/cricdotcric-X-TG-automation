# Architecture

## Overview

This project is a queue-driven social publishing system for cricket content on X.

It separates responsibilities into four layers:

1. content generation
2. editorial rules
3. posting automation
4. runtime state

## Components

### 1. Content

- `content/ipl-daily-queue.json`
- `content/ipl-hype-queue.json`

These files contain publishable queue items. Each item can include:

- `id`
- `type`
- `date`
- `scheduledFor`
- `account`
- `tweet`
- `imageUrl`
- `imageSource`

### 2. Editorial Rules

- `docs/editorial-template.md`

This document defines:

- preview tweet structure
- review tweet structure
- mandatory review elements
- tone and quality rules
- image sourcing standards

### 3. Posting Automation

- `scripts/build-ipl-daily-queue.js`
- `scripts/post-queue.js`
- `scripts/post-ipl-queue.js`
- `scripts/x-post.js`

`post-queue.js` is the main operational entry point. It:

- loads a queue
- filters due and unposted items
- validates item quality
- downloads the image
- posts via `x-post.js`
- updates local posting state

### 4. Runtime State

- `state/ipl-daily-queue-state.json`
- `state/ipl-hype-queue-state.json`

These files are intentionally local and excluded from Git. They make the runner
idempotent by recording what has already been published.

## Design Choices

- queue files are simple JSON so they are easy to inspect and edit
- state is stored separately from content so publishing remains traceable
- scripts use repo-relative paths so the project is portable
- credentials are externalized from the repository
