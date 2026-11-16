# V2 Autotracking Preparation

## Status

This is tested preparation, NOT a claim that Wesley's client already publishes
compatible telemetry. The proposed contract needs his confirmation.

- Follow player is off by default. The crosshair beside the map title toggles it.
  No valid telemetry means no automatic navigation.
- Unknown stages, ambiguous maps, loading, stale frames and other-player data
  never choose a new map. The preference is saved locally.
- Repeated messages about the same location do not interrupt manual browsing.
  Re-enabling Follow resumes the latest valid location.
- The entrance menu pauses following while open; the editor never follows.
- Discovery reception is an inbox only. Tools / Debug offers explicit application
  of compatible new choices. It preserves existing mappings and rejects wrong
  pools, read-only choices, used arrivals and conflicts. No auto-apply toggle.
- Existing checks/items, manual entrances and old packs continue working.
- No artwork, player coordinates or inferred dungeon floors were added.

## For Lehonno

Continue authoring normally. One image for an entire dungeon is supported: several
stage IDs can point to that map. Room/layer/arrival constraints are optional.
A game layer is not a dungeon floor.

In map properties, expand **Auto map following**, enter a stage ID and **Add rule**.
Stage suggestions use the old V1 region table. **Current stage** fills the stage
from received telemetry, leaving the optional constraints unrestricted.

More specific rules take precedence. Equal specificity on different maps is
ambiguous, so no switch occurs. Exact duplicate rules are rejected. To transfer a
stage-only rule from a province to a new detailed map, remove the province's rule
first. New V1 starter packs get coarse stage rules; customized packs are not
silently changed. Rules autosave, support undo/redo and travel in the pack ZIP.

Entrance bindings remain separate: location rules describe where Link really is;
door bindings describe physical exits represented by links.
Artwork, check placements and door/map associations remain authoring work.
No VGCartography assets were added; confirm reuse permission and credits before
distributing new images.

## Simulated Testing

Run run-v2-demo.bat and connect as Entrance Player, no password. Enable Follow
player and send these commands in Tools:

    !demo-stage F100
    !demo-stage F200
    !demo-stage F000
    !demo-stage F020
    !demo-stage F000 1 0
    !demo-loading F200
    !demo-other-stage F100
    !demo-old-stage F100
    !demo-discover

Optional numbers are room then layer. On a new starter pack, the first four open
Faron, Eldin, Skyloft and the sky overview. Loading, other-player and stale frames
must not move the map. Debug shows location, sequence, match and discovery review.
The discovery example reports the Deep Woods dungeon door leading to Earth Temple;
it changes no connection until explicitly confirmed.

## Proposed Contract

The draft adapter listens to Bounced.data.sshd_tracker:

    {
      "version": 1,
      "seed": "<RoomInfo.seed_name>",
      "team": 0,
      "slot": 1,
      "sequence": 42,
      "location": {
        "stage": "D100", "room": 0, "layer": 0,
        "entrance": 0, "loading": false
      },
      "discoveries": [
        { "exit": "<agreed exit ID>", "entrance": "<agreed arrival ID>" }
      ]
    }

Location or discoveries may be omitted. Room/layer/arrival are optional; absence
is different from zero. Publish stable locations after transitions and a fresh
snapshot after tracker reconnection. Unqualified legacy ss_stage_name messages
do not drive V2 following.

For this draft, sequence must increase per seed/team/slot, including sender
restarts. A negotiated stream/session ID could replace that requirement. The
receiver ignores stale frames and resets on tracker disconnect/new connection.

Discovery lists can be snapshots or additions, max 2,000 entries. New reports
update the inbox only. Unknown IDs cannot grant logic access. Agree shared stable
identifiers or an explicit translation table with Wesley; do not guess from names.
The current draft expects the tracker's exact internal door IDs.

For production, prefer persisted per-player discoveries with change notifications.
AP data-storage snapshot reception is not connected to this adapter yet: agree
the key, schema and reconnect rules first. Do not publish undiscovered connections.

## Messages For Wesley

### Player Location

Hey Wesley! I'm preparing automatic map switching in the web tracker. Could the
Rust client publish the player's current stage, with room/layer/arrival if
available, when a transition finishes and when a tracker reconnects? Please
include the seed, team and slot so we only follow the right player. Stage alone
would already be useful. I have a proposed format, but we can adapt to yours.

### Entrance Discoveries

For automatic entrance tracking, could we agree stable exit/arrival IDs and have
the client publish the connections the player has actually discovered? Ideally
they'd be saved per seed/player and available again after reconnecting, without
revealing undiscovered entrances. The manual tracker and map bindings already
work, so we can build on those once the data format is agreed.

## Remaining Work

1. Agree protocol, IDs, ordering and saved-snapshot transport with Wesley.
2. Implement/confirm publication in the real client and adapt the receiver.
3. Validate real coupled/decoupled seeds, reconnects and multiple SSHD players.
4. Finish authored maps and associations; do not wait for floor support.
5. Consider opt-in automatic discovery application only after real testing, with
   explicit provenance, conflict handling and manual override policy.
