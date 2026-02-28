# Arbitrum Proposal Dashboard

## Requirements

- [Node (>= v20.18.3)](https://nodejs.org/en/download/)
- Yarn ([v1](https://classic.yarnpkg.com/en/docs/install/) or [v2+](https://yarnpkg.com/getting-started/install))
- [Git](https://git-scm.com/downloads)

## Environment Variables

Create a `.env.local` file in `packages/nextjs/` with the following variables:

```bash
# Tally API key for fetching proposals
# Get your API key from https://www.tally.xyz/
TALLY_API_KEY=your_tally_api_key_here

# Secret for protecting import endpoints (used by cron jobs)
# Set a secure random string for production
CRON_SECRET=your_cron_secret_here

# Gemini API key for LLM-based matching
# Get your API key from https://aistudio.google.com/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# Gemini model to use (optional, defaults to gemini-2.5-flash-lite)
GEMINI_MODEL=gemini-2.5-flash-lite

**Note:** The `.env.local` file is gitignored and should not be committed to version control.

## Quickstart

1. Clone the repo

2. Install dependencies:

```bash
cd arbitrum-dashboard
yarn install
```

2. Spin up the Postgres database service

```bash
docker compose up -d
# sync database
yarn drizzle-kit push
# import data
yarn db:seed
# if you want to wipe the database
yarn db:wipe
```

Note: If you get any issues with the database, you can restart by:

```bash
docker compose down
rm -rf data/
docker compose up -d
```

3. Start your NextJS app:

```bash
yarn start
```

Visit your app on: `http://localhost:3000`.

4. You can explore the database with:

```
yarn drizzle-kit studio
```

### Database (dev info)

To iterate fast on the database locally:

- Tweak the schema in `schema.ts`
- Run `yarn drizzle-kit push` to apply the changes.
- Copy `seed.data.example.ts` to `seed.data.ts`, tweak as needed and run `yarn db:seed` (will delete existing data)

We'd switch to a migration model when ready (site live).

### Imports

You can locally call the import routes like:

**Forum posts:**

```sh
curl -X POST http://localhost:3000/api/import-forum-posts \
  -H "Authorization: Bearer my-cron-secret"
```

**Snapshot proposals:**

```sh
curl -X POST http://localhost:3000/api/import-snapshot-proposals \
  -H "Authorization: Bearer my-cron-secret"
```

**Tally proposals:**

```sh
curl -X POST http://localhost:3000/api/import-tally-proposals \
  -H "Authorization: Bearer my-cron-secret"
```

### LLM Matching

Match snapshot/tally stages to canonical proposals using Gemini:

```sh
# Match a specific stage
yarn match:llm --type tally --id <stage-uuid>
yarn match:llm --type snapshot --id <stage-uuid>

# Match all unprocessed stages
yarn match:llm --type tally --all
yarn match:llm --type snapshot --all
yarn match:llm --all
```

> **Note:** The default model (`gemini-2.5-flash-lite`) can produce false positives on ambiguous stages. For hard cases, use a stronger model like `gemini-3.1-pro-preview` via the `GEMINI_MODEL` env var.
