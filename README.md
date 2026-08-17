# Skeeter

An hourly mosquito bite-risk forecast, and a timed plan for what to do about it.

Weather apps tell you it will be warm. Pest-control sites tell you mosquito season
has started. Neither answers the question you actually have at seven in the
evening: **do I need to spray, and when?**

## The model

Bite risk is the product of two things that behave on completely different
timescales, so Skeeter computes them separately.

**How many mosquitoes are around** — days to weeks. Rain does not create
mosquitoes, it floods eggs that were already laid. Each rain event seeds a cohort
that becomes biting adults only once enough warmth has accumulated, counted as
degree-days above 10.5 °C. This replaces the folk rule of "worse about a week
after rain": the delay is really a warmth budget, so it shortens in a heat wave
and stretches in a cool spell, and the app can tell you a batch is coming days
before it flies. Cohorts then decay with an adult half-life of about nine days.

**Whether they are flying right now** — hour to hour. Temperature, wind,
humidity, active rain, and the dusk/dawn peak keyed to real sunrise and sunset.
These multiply rather than average, because any one of them can shut biting down
on its own.

Every constant lives in [`src/lib/model/params.ts`](src/lib/model/params.ts) with
a note on where it came from, so the model can be recalibrated without touching
any logic.

### Calibration

Two real fixtures, both the same three weeks of August, guard the calibration:
New Orleans (hot and repeatedly wet) must score materially higher than Budapest
(hot and bone dry). A model that cannot separate those two is not measuring
anything. See `calibration across real climates` in
[`model.test.ts`](src/lib/model/model.test.ts).

## Notifications, honestly

There is no push server. That is a deliberate constraint, and it has consequences
the UI states plainly rather than hiding:

| Path | Works when | Where |
| --- | --- | --- |
| In-page timers | App open or just backgrounded | Everywhere |
| Periodic Background Sync | Roughly twice a day, installed app only | Chromium |
| **Calendar subscription** | **Always, app closed, phone locked** | **Everywhere** |

The Notification Triggers API never shipped past its origin trial, so a web app
cannot schedule a notification for 19:40 on its own. Periodic Background Sync has
a ~12-hour floor and is Chromium-only. On iOS, web push needs both an installed
PWA *and* a server.

So the calendar feed is the real delivery mechanism: `/api/ics` recomputes the
next seven days of protect windows on request and returns events with `VALARM`
alarms set to each countermeasure's lead time. The operating system fires them.
It is stateless — every parameter is in the query string, so there is no
subscriber record anywhere.

## Countermeasures are timed

Repellent needs ~20 minutes before you go out; a plug-in vaporiser needs 30–45 to
saturate a room. The plan schedules backwards from when risk actually starts, and
suppresses advice that will not work — no coil when the wind will carry the
vapour away.

Advice is generic by active ingredient. Dosage, reapplication, and use on
children or in pregnancy are label matters, and the app says so.

## Running it

```bash
npm install
npm run dev
```

```bash
npm test
```

Useful while developing:

- `/?now=2026-08-17T19:30` overrides the clock, so a dusk plan can be checked
  without waiting for dusk.
- Geolocation is optional — add a place by name on **Places**.

## Stack

SvelteKit 2, Svelte 5 runes, Tailwind 4, deployed on Netlify. Weather from
[Open-Meteo](https://open-meteo.com) (free, keyless), cached in Netlify Blobs on
a coarse grid so a town shares one upstream call.

Places and preferences live in `localStorage` on the device. There are no
accounts and nothing is uploaded.
