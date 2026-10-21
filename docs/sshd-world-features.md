# Bird Statues and Goddess Chests

The tracker reads the following AP slot options automatically, with or without
the `option_` prefix:

| Option | Behavior |
| --- | --- |
| `bird_statues_give_items` | Adds the 26 bird statue checks to their existing map regions and counters. |
| `bird_statues_need_unlock` | Gates sky-to-statue travel on the matching unlock item. Walking to a statue and flying back remain possible. |
| `start_with_region_bird_statues` | The actual chosen statues come from starting/received items. The tracker does not guess their identities from this toggle. |
| `decouple_goddess_cubes_and_chests` | Makes the 27 cubes real item checks, independently of chest shuffle. AP checked locations synchronize cube strikes. |
| `goddess_chest_unlock` | Uses the paired cube, Goddess Sword (two Progressive Swords), or immediate activation, respectively. |

Automatic chest activation does not remove physical access requirements such
as Clawshots, bombs, swimming, or time of day. In locked-until-struck mode,
reachable cubes unlock their corresponding chests in logic, and checked cubes
remain activated even if their original access requirements are no longer met.

When statue unlocks are enabled, the item grid includes a Bird Statues icon
directly after Scrapper, with an acquired/total count. Its dialog groups the
individual items by province. It uses `src/assets/bird_statue.png`, separately
from the Spiral Charge statuette. Statue and cube checks appear in existing location
lists, so no new map coordinates are necessary.

Old seeds default to vanilla statue travel, coupled cubes, and cube-activated
chests. Existing check identifiers and map marker positions are preserved.

## Data Sources and Maintenance

`src/data/sshdWorldFeatures.json` records the upstream source and revision, the
26 statue definitions, and the five settings. They were checked against
`Locations.py`, `Items.py`, `SSHD_Options.py`, and the backend world YAML files
on the APWorld `feature/rust-client` branch.

`scripts/sshdWorldFeatures.mjs` applies these additions when generating the SSHD
dump. This keeps unrelated baseline logic intact. Update the pinned definitions
and their tests when upstream changes the statue set or option semantics.
The baseline source checkout used for a full regeneration must include the
previously supported sanity locations as well; an older checkout is insufficient.

## Verification

`src/logic/SshdWorldFeatures.test.ts` covers mappings, counts, option parsing,
travel restrictions, starting and received items, cube strikes, checked cube
persistence, chest activation modes, and optimized logic equivalence.

The feature-player scenario in `tests/e2e/mock-archipelago-server.mjs` also
tests real browser synchronization and the statue dialog with Playwright.
No live AP server or game is required for the automated suite. A real seed
with these options is still recommended for final in-game validation.
