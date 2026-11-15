import { MongoClient } from "mongodb";
import pg from "pg";
export async function connect() {
  const pool = new pg.Pool({
    connectionString:
      process.env.DATABASE_URL ||
      `postgresql://devconnect:${encodeURIComponent(process.env.POSTGRES_PASSWORD || "devconnect-local-postgres")}@${process.env.POSTGRES_HOST || "localhost"}:${process.env.POSTGRES_PORT || 5434}/social_network`,
  });
  const mongo = new MongoClient(
    process.env.MONGO_URL ||
      `mongodb://devconnect:${encodeURIComponent(process.env.MONGO_PASSWORD || "devconnect-local-mongo")}@${process.env.MONGO_HOST || "localhost"}:${process.env.MONGO_PORT || 27018}/?authSource=admin`,
    { serverSelectionTimeoutMS: 5000 },
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS app_sessions (token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL); CREATE INDEX IF NOT EXISTS app_sessions_expiry ON app_sessions(expires_at); CREATE UNIQUE INDEX IF NOT EXISTS friends_pair_unique ON friends(LEAST(requester_id,addressee_id),GREATEST(requester_id,addressee_id));`,
  );
  await mongo.connect();
  return {
    pool,
    mongo,
    chat: mongo.db("devconnect"),
    async close() {
      await pool.end();
      await mongo.close();
    },
  };
}
