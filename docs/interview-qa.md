# Interview Q&A

## 1. What problem does this project solve?

It automates a narrow but real publishing workflow: scheduled cricket posts for
X/Twitter. The system turns structured queue items into validated, idempotent
published posts with attached images.

## 2. Why use queues instead of generating and posting everything inline?

Queues create a clean boundary between editorial preparation and operational
execution. They make the system easier to inspect, edit, rerun, and audit.

## 3. How do you avoid duplicate posts?

Posting state is stored separately in `state/*.json`. Before publishing, the
runner checks whether the queue item has already been posted.

## 4. How do you keep secrets out of the repo?

The X client reads credentials from an external secrets file or environment
configuration. No live tokens are committed.

## 5. Why keep editorial rules in docs instead of code only?

Because part of the system is editorial, not purely technical. The docs make the
expected structure, tone, and quality bar explicit, while the runner enforces a
subset of those rules operationally.

## 6. What are the main technical tradeoffs?

- JSON queues are simple and transparent, but less rigid than a schema-backed store
- local JSON state is easy to manage, but not ideal for multi-worker concurrency
- keeping the system small improves reviewability, but limits extensibility

## 7. Why is the scheduler separated from the app logic?

That keeps process supervision separate from job semantics. In the original
deployment, OpenClaw handled cron-like scheduling while the OS only kept the
gateway alive.

## 8. What would you improve next?

- automated tests
- schema validation for queues
- config abstraction
- CI checks
- richer observability and failure reporting

## 9. What part of the code best represents your engineering judgment?

`scripts/post-queue.js`, because it sits at the boundary between content,
validation, scheduling expectations, and irreversible external side effects.

## 10. What is intentionally out of scope?

- engagement management
- analytics dashboards
- multi-user concurrency
- full CMS features
- general-purpose social media orchestration
