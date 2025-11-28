# Arbitrum Proposal Dashboard

## Requirements

- [Node (>= v20.18.3)](https://nodejs.org/en/download/)
- Yarn ([v1](https://classic.yarnpkg.com/en/docs/install/) or [v2+](https://yarnpkg.com/getting-started/install))
- [Git](https://git-scm.com/downloads)

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

You can locally call the (forum) import route like

```sh
curl -X POST http://localhost:3000/api/import-forum-posts \
  -H "Authorization: Bearer my-cron-secret"
```
