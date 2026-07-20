# THE ARTZ — Backend

Node.js + Express + GraphQL API for THE ARTZ, backed by PostgreSQL (relational/money data), MongoDB (artwork content), and Redis (cache + realtime pub/sub), with TensorFlow.js (client-side) and OpenAI (server-side) for AI features.

This has been built and verified in isolation: dependencies install cleanly, the GraphQL schema (10 queries / 19 mutations / 2 subscriptions) builds and resolves against the resolver map, and the Express + Apollo Server boots and answers a live GraphQL request over HTTP. It hasn't been run against real Postgres/Mongo instances outside this project — connect it to your own databases and run the migration + seed script below.

## Why two databases

- **PostgreSQL** — `users`, `follows`, `payment_methods`, `transactions`. Anything relational, consistency-critical, or involving money.
- **MongoDB** — `artworks`, `collections`, `activity`. Flexible, fast-evolving content (AI tags, embeddings, per-category metadata) that doesn't want a rigid schema.
- **Redis** — read-through cache (artwork lists, follower counts) with TTL + explicit invalidation on writes, plus pub/sub powering the two GraphQL subscriptions (`activityReceived`, `artworkLiked`).

There's no foreign key between the two databases — artworks reference `ownerId` (a Postgres UUID) and transactions reference `artworkId` (a Mongo ObjectId) as plain strings, resolved in application code via the GraphQL field resolvers.

## Quick start

```bash
cp .env.example .env        # fill in OPENAI_API_KEY if you want live AI features
npm install

# Option A — Docker (spins up Postgres, Mongo, Redis, and the API)
docker compose up --build

# Option B — local databases already running
npm run migrate             # creates Postgres tables from src/migrations/001_init.sql
npm run seed                # seeds a demo user (mayasolano / password123) + artz
npm start                   # or: npm run dev (nodemon)
```

Once running:
- GraphQL endpoint: `http://localhost:4000/graphql`
- GraphQL subscriptions (WS): `ws://localhost:4000/graphql`
- Image upload (REST): `POST http://localhost:4000/api/upload` (multipart, field `image`, optional `tags` JSON array)
- Health check: `GET http://localhost:4000/health`

## Auth

`login`/`signup` mutations return a JWT. Send it as `Authorization: Bearer <token>` on subsequent requests (and as `connectionParams: { authorization: 'Bearer <token>' }` for WS subscriptions).

## Wiring up `profile.html`

The frontend currently uses in-memory mock data. To connect it to this API:

1. On page load, call `myArtz`, `myCollections`, `myActivity`, and `me` and use the results in place of the hardcoded `artworks`/`collections`/`activity` arrays.
2. In `saveArt()`, before calling the (future) `createArtz`/`updateArtz` mutation: run TensorFlow.js in the browser on the uploaded image to get tags → POST the file + tags to `/api/upload` → take the returned `imageUrl` and pass it, along with the tags, into the mutation. Set `generateDescription: true` if the description field is empty so the server fills it in via OpenAI.
3. `toggleLike()` → call the `toggleLike` mutation instead of mutating local state.
4. The search bar in the top nav → `searchArtz(query)`, which uses OpenAI embeddings for semantic ranking (falls back to substring match if no API key is set).
5. Subscribe to `activityReceived` over the GraphQL WS endpoint to push new notifications into the Activity section in real time instead of polling.

## AI integration points

- **TensorFlow.js (client)** — runs in the browser at upload time in the Art Details modal; extracts tags/category hints from the image before it's ever sent to the server.
- **OpenAI (server)** — `src/services/openai.js`:
  - `generateArtworkDescription` — writes a short description from title + TF.js tags (used by `createArtz` when `generateDescription: true`)
  - `semanticSearch` — embeds the search query and ranks artz by similarity (`searchArtz` query)
  - `recommendSimilar` — category + tag-overlap based "similar artz" (`recommendedArtz` query); swap the naive ranking for `embedText` + cosine similarity once you're storing `styleEmbedding` on every artwork.

## Project layout

```
src/
  index.js                 Express + Apollo Server + WS subscriptions entrypoint
  config/                  postgres.js, mongo.js, redis.js connections
  models/postgres/         Sequelize: User, Follow, PaymentMethod, Transaction
  models/mongo/            Mongoose: Artwork, Collection, Activity
  graphql/
    typeDefs.js             full schema
    pubsub.js                Redis-backed PubSub for subscriptions
    resolvers/               user.js, artwork.js, collection.js, activity.js, transaction.js, index.js
  services/
    auth.js                  password hashing + JWT
    openai.js                AI description/search/recommendations
    upload.js                multer image upload handling
  middleware/auth.js         resolves the current user from a JWT for GraphQL context
  migrations/001_init.sql    Postgres schema
  seed/seed.js                demo data matching the frontend mock
```
