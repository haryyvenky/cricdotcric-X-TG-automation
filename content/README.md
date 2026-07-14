# Content

Runtime inputs for the Claude posting agent.

## Files

- `coverage.json` — the **series watchlist** (source of truth). The agent only
  drafts fixtures belonging to a listed, `active: true` series. Managed by the
  operator (given as text; the assistant writes it here).
- `queue.json` — the **draft buffer**. The draft run appends items here with
  `status: "pending"`; the check-and-post run moves them to `posted` / `rejected`.
- `t20wc2026-thread.md` — long-form editorial reference artifact.

## coverage.json item shape

```json
{
  "series": [
    {
      "id": "ind-aus-t20i-2026",
      "name": "India vs Australia T20I Series 2026",
      "teams": ["IND", "AUS"],
      "format": "T20I",
      "active": true,
      "startDate": "2026-07-20",
      "endDate": "2026-08-05"
    }
  ]
}
```

## queue.json item shape

```json
{
  "id": "ind-aus-t20i-2026-m1-preview",
  "type": "preview",
  "date": "2026-07-20",
  "scheduledFor": "2026-07-20T12:15:00+08:00",
  "account": "cricdotcric",
  "tweet": "…",
  "imageUrl": "https://…",
  "imageSource": "…",
  "status": "pending",
  "telegramMessageId": 123
}
```
