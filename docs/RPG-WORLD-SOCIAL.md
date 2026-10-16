# World groups and chat

Presence is independent of a group: a zone admits twenty authenticated accounts; Team membership remains limited to five. Entering, walking and transferring create no Team or GameSession. Inviting a nearby public avatar lazily creates a normal Team. Joining, leaving, leader transfer and removal reuse existing Team services and database constraints. A group never starts an expedition automatically.

Invitation handles are private server-created UUIDs, expire after sixty seconds, and are usable only by their intended recipient. Limits are five outgoing and ten incoming invitations. The accepting player receives no team join code or another account's private user ID. A reconnect rebuilds group projections from Team; offline members get opaque display handles, not fake world avatars. Maintenance removes expired invitations and unused aliases.

Local chat is ephemeral within the current zone and uses existing text validation plus rate limiting. Group/DM chat uses the existing ChatMessage store and authorization; private messages require accepted friendship. Public targets are resolved from nearby avatars or the caller's actual group, never accepted as arbitrary database user IDs. Each recipient receives only its permitted channel. The client retains fifty messages and suspends movement while typing.

The integrated real-WebSocket test forms a five-person group while six people remain in the same world, rejects a sixth group member, verifies group/local recipient separation and rejects a private message between non-friends. Leaving a group does not terminate the zone. No change to PvP matchmaking or realtime Survivor snapshots is required.
