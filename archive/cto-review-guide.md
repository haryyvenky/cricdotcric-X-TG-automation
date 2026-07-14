# CTO Review Guide

## One-Line Summary

This is a queue-driven X/Twitter automation system for cricket content, designed
to turn editorial rules and scheduled content into reliable, repeatable posts.

## What To Notice

### 1. Clear separation of concerns

- `content/` contains publishable inputs
- `scripts/` contains executable logic
- `docs/` contains rules, architecture, and operational notes
- `state/` is reserved for local runtime artifacts

### 2. Idempotent posting design

The queue runner stores posting history separately from queue content so the
same job can be executed repeatedly without duplicating posts.

### 3. Externalized secrets

Credentials are not committed. The posting client reads them from an external
secrets source.

### 4. Operational validation

The queue runner rejects incomplete or placeholder-grade items before posting.

### 5. Portability

The repository uses repo-relative paths and does not assume macOS `cron`.

## Suggested Review Order

1. `README.md`
2. `docs/architecture.md`
3. `docs/editorial-template.md`
4. `docs/scheduler.md`
5. `scripts/x-post.js`
6. `scripts/post-queue.js`
7. `content/ipl-daily-queue.json`

## Honest Scope

This project is not a full social media platform. It is a focused automation
system for:

- queue generation
- editorial enforcement
- image-backed posting
- runtime-safe publishing

That narrow scope is deliberate.

## What I Would Improve Next

- add formal tests around queue validation and scheduling
- define a cleaner config layer instead of relying on environment + external secrets shape
- add CI checks for queue quality and JSON schema validation
- add a pluggable scheduler adapter for non-OpenClaw environments
