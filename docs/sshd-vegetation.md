# Grass, Small Trees and Signs

## Supported Data

Sources: LonLon-Labs/SSHD_APWorld, revision
`0e65d71d8af29f45c4c850b60c55d89f3a3ced3c`, `Locations.py` and
`sshd-rando-backend/data/world/*.yaml`.

- `grass_shuffle=off`: no grass checks.
- `grass_shuffle=bundles`: 854 patch checks.
- `grass_shuffle=blades`: 12,579 independent blade checks, instead of patches.
- `tree_shuffle=on`: 91 small-tree/bamboo checks.
- `sign_shuffle=on`: 8 sign checks (7 Central Skyloft, 1 Beedle's Island).

Sign names and placement come from revision
`fa80a894466ac84fbb080d0d0427dce0e8c3489e` of the same repository.
Its published world files still require Sword alone. The generator expands only
that exact sign-only rule to Sword, Gust Bellows, Slingshot, Clawshots, Bow or
Bomb Bag, following Wesley's Discord clarification supplied on 2026-11-15.
More specific requirements or a future `Can_Cut_Signs` macro are preserved.

These are dataset counts, not a fixed total for every seed. Other shuffle settings
still control the existing location types. Missing shuffle options default to off.
Each new location uses its upstream physical area and cutting requirement.
Multiple access paths are retained. No new map coordinates are needed.

## Interface

Grass, Trees and Signs appear as collapsed sections below ordinary checks in each region.
Blade mode adds a second level for each named grass patch. Summaries show checked
out of total, and accessible unchecked locations. The existing All, Checked and
Accessible filters also apply to these groups; totals remain whole-group totals.
Every location retains its own AP identity, manual checked state, item hint and
requirements tooltip. Summary controls never mark arbitrary locations checked.

Expanded groups and patches are remembered per region in localStorage. Main-list
and nested-list scroll positions are remembered separately for each region and
filter, including when navigating through Server & Tools or reloading the page.

Expanded lists use react-window: only visible rows plus a small overscan are
mounted. Row height adapts to the available width. Closed sections do not mount
their check controls or tooltip subscriptions.

Vegetation checks with exactly identical access paths and requirements share a
reachability bit. Their AP identifiers, hint entries, checked state and counters
remain separate. Different areas, conditions or alternative paths never share
reachability. This keeps the logic graph small even in blade mode.

## Manual Demo

Double-click `run-demo.bat`, or run `npm run demo`.
The terminal prints the website URL (normally `http://127.0.0.1:5180/`) and the
AP server address (normally `localhost:38282`). Busy ports are skipped.

On the connection page, enter that server and either slot name, with no password:

- `Vegetation Player`: grass bundles, trees and signs.
- `Blade Player`: grass blades, trees and signs.

Connect and launch a new tracker, then select Central Skyloft. Seven grass checks
are already marked checked. Open Grass/Trees or a grass patch to inspect the
lists and try the filters. Other provinces also contain vegetation.

Send `!demo-check` in the Server & Tools command field to simulate the server
checking another Central Skyloft grass location. Return to the map and select
Central Skyloft to see the updated counter.
Send `!demo-sign` to simulate checking the next Central Skyloft sign.

This is a deterministic UI fixture, not a generated playable seed. The demo uses
a separate browser origin to avoid changing normal tracker saves. Keep the demo
terminal open while testing; Ctrl+C stops its servers.

## Maintenance and Tests

To update vegetation without overwriting unrelated baseline logic, use a matching
upstream source checkout and run:

```text
node scripts/generateSshdVegetation.mjs <sshd-rando-backend-root> <Locations.py>
```

Append `--signs-only` to import only signs while preserving existing grass/tree
data. The current sign import added exactly 8 checks; no existing checks changed.

The additive generator reuses the existing SSHD requirement converter. Missing
source access paths or tracker areas are errors, not guesses. A full SSHD dump
generation also reads vegetation from current upstream world/location files.
Do not regenerate the whole dump from the old temporary source checkout.

`npm run check` verifies source counts, all mode combinations, cutting rules,
individual AP synchronization, grouping/filter behavior, reachability sharing,
and browser operation with the full blade dataset.
