import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigserial,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Wavelength — group sound sessions.
 *
 * A session is created by a host laptop that relays its audio over P2P WebRTC
 * to every joined peer. The DB only carries presence + signalling metadata;
 * audio itself never touches the server.
 */
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 8 }).notNull().unique(),
  name: text("name").notNull().default("Untitled session"),
  hostPeerId: uuid("host_peer_id").notNull(),
  mode: varchar("mode", { length: 16 }).notNull().default("idle"), // idle | relay | theatre
  alignDelayMs: integer("align_delay_ms").notNull().default(180),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  lastSeen: timestamp("last_seen", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const peers = pgTable(
  "peers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    label: text("label").notNull().default("Listener"),
    latencyMs: integer("latency_ms").notNull().default(0),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("peers_session_idx").on(t.sessionId)]
);

export const signals = pgTable(
  "signals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    fromPeer: uuid("from_peer").notNull(),
    toPeer: uuid("to_peer").notNull(),
    kind: varchar("kind", { length: 16 }).notNull(), // offer | answer | candidate
    payload: text("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("signals_inbox_idx").on(t.sessionId, t.toPeer, t.id)]
);

export type Session = typeof sessions.$inferSelect;
export type Peer = typeof peers.$inferSelect;
export type Signal = typeof signals.$inferSelect;
