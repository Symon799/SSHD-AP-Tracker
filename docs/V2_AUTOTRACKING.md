# V2 Autotracking Preparation

## Status

The tracker reads the Rust client's announced DataStorage contract:
`sshd_rs_{RoomInfo.seed_name}_{slot}_tracker_location`. It requests the current
value on login (Get) and subscribes to updates (SetNotify). The object contains
`stage`, optional `stage_name`, `room`, `layer`, `entrance`. Routing uses the stage
code, not the human-readable name. Null resets telemetry to waiting without moving
the visible map. Invalid values and other seed/slot keys are ignored.

This adapter is tested with the simulated server, including login snapshots,
updates and resets. A real Rust-client session is still needed to validate the
announced key namespace and payload end to end. X/Y/Z position updates are not
subscribed. The earlier proposed Bounced adapter below remains supported.

- Follow player is on by default on first use; the saved preference is respected.
  The crosshair beside the map title toggles it and enabling it immediately
  returns to the player's map when valid telemetry and a unique association exist.
  Right-clicking returns to that map without changing the follow preference.
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

In map properties, choose **Configure associations**. The dialog has two
independent tabs. **Apply Changes** commits all edits as one undo step, after a
transfer review if another map owns any selected associations. **Discard Changes**
restores the last applied associations. Neither action closes the settings dialog,
including the transfer review's **Apply Change** and **Discard Changes** actions.
The footer reports pending edits; Apply/Discard are disabled when there are none.
Closing via the cross, Escape or backdrop warns about unapplied edits, offering
**Apply & close**, **Keep editing**, or **Discard & close**, in that order.
Apply stays to the left of Discard throughout. Both confirmation paths display any
transfers directly, without a checkbox. Existing pack IDs and assignments are preserved.

- **Player following:** search areas by name/code, optionally filter the region,
  and tick those represented by this image. **Select filtered** adds the visible
  matches; **Clear selection** removes only the filtered matches. Unknown stages
  in imported rules or client telemetry remain selectable. **Use player's current
  area** adds the received stage to the pending selection. Room, layer and spawn
  index are under **Advanced conditions** and should normally stay blank. They
  constrain newly selected areas only. Use verified values, not guessed ones.
- **Entrance destinations:** select the AP entrances ending on this image. These
  associations serve game-entrance links, not player following. A link's **Game
  entrance** identifies the physical exit on its source image; its manual ER
  destination is resolved through these map-arrival associations. Fixed links
  need neither association type.
- Assignments owned by another map are labelled. Transfers require confirmation;
  Apply removes the exact association from the old map and adds it to the new map
  atomically. A specific room rule may coexist with a broad province fallback.

Example: one whole Knight Academy image can use F001r with no advanced fields.
Two floor images sharing F001r need verified room conditions. A whole-dungeon
image may have several stage codes, one per internal area represented. None of
these require Game entrance links or AP arrival bindings for Follow player.

More specific rules take precedence. Equal specificity on different maps is
ambiguous, so no switch occurs. Exact duplicate rules are rejected. A confirmed
transfer moves a stage-only rule from a province to a new detailed map in one
operation. New V1 starter packs get coarse stage rules; customized packs are not
silently changed. Rules autosave, support undo/redo and travel in the pack ZIP.

Entrance bindings remain separate: location rules describe where Link really is;
door bindings describe physical exits represented by links. See the
[default-pack merge checklist and open associations](V2_DEFAULT_PACK.md) for the
current reviewed coverage and what still needs authoring or an in-game check.
No VGCartography assets were added; confirm reuse permission and credits before
distributing new images.

## Simulated Testing

Connect as **Rust Player** to test the real DataStorage adapter. It starts with
F100 already stored; enabling Follow immediately opens Faron. Commands
`!demo-rust-stage F200`, `!demo-rust-clear`, `!demo-rust-stage F000` simulate
notifications, a cleared value and recovery. This does not require X/Y/Z updates.

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
