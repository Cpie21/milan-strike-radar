This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Strike synchronization

The dashboard and calendar read Supabase. Refreshing a page does **not** fetch
new MIT announcements. `/api/cron/sync-strikes` performs that separate job.

`vercel.json` schedules it daily at 05:00 UTC (07:00 in Italian summer time,
06:00 in winter). Include this file in the production deployment; a local file
or a preview deployment alone does not activate the production schedule.
After deployment, verify the job is enabled in the project's Cron Jobs page
and check that the next scheduled invocation succeeds in runtime logs.

Required server environment variables: `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. Set `CRON_SECRET` in production; Vercel sends it
as the Bearer authorization header. Never put the service role key in browser
code. `DEEPL_API_KEY` is optional.

The sync uses the official HTTPS page, retries failed fetches up to three times
with a 15-second timeout per attempt, and returns an error if the official
table is missing instead of reporting a successful empty sync. The function
has a 300-second execution budget for database writes. A successful sync
invalidates the city pages, strike API, and calendar route.

Run `npm run test:sync` for parsing, regional-scope, retry, and schedule tests.
For incidents, compare the official MIT list with the database and inspect
`[sync-strikes]` runtime logs. No future database records is not proof that
there are no strikes. A successful manual sync proves fetching and writing
work, but does not prove the scheduler is running.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
```bash
npx vercel --prod
```
