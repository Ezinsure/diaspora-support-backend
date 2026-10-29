# Diaspora Support — Backend

This is the API behind the Diaspora Support admin dashboard and website. Each request moves from the first message to payment and delivery.

Built with **NestJS**, **TypeORM** and **PostgreSQL** (Supabase), written in TypeScript (ES modules).

---

## What it does

- **Requests:** a customer reaches out, the team opens a request, uploads documents, records payments and follows it to the end. Each request gets a reference number`.
- **Customers:** customers can track their request on the website with their reference + email, or with a one-time code sent by email. No account needed.
- **Services & fees:** what we offer, and what we charge for each service.
- **FAQs and company profile:** the content shown on the website.
- **Users & roles:** staff accounts. There's no sign-up: an admin adds people and they get an email to set their password.
- **Activity logs:** who did what, and when. Every change is recorded.

## Getting started

**You'll need:** Node.js 24 (LTS), pnpm, and a PostgreSQL database (Supabase works well).

```bash
pnpm install
cp .env.example .env      
pnpm build
pnpm typeorm migration:run -d dist/config/data-source.js
pnpm create-dev you@company.rw "Your Name" +250788123456
pnpm start:dev
```

`create-dev` makes the first account and prints a link to choose your password. After that, sign in and add everyone else from the dashboard.

The API runs on `http://localhost:5000/v1`.

## Database changes

`synchronize` is off, so the database only changes through migrations.

```bash
pnpm build
pnpm typeorm migration:generate src/migrations/<Name> -d dist/config/data-source.js
# read the generated file before running it
pnpm build
pnpm typeorm migration:run -d dist/config/data-source.js
```

## Project layout

```
src/
  auth/            login, sessions, passwords, guards
  users/           staff accounts
  requests/        requests, documents, payments, public tracking
  customers/
  services/  service-fees/  faqs/  company/
  activityLogs/    audit trail
  mail/  storage/  email (SMTP) and files (Supabase)
  common/          shared helpers (pagination, audit context…)
  config/          database settings + CLI data source
  migrations/
  scripts/         create-dev
```

## Useful commands

| Command | |
|---|---|
| `pnpm start:dev` | Run with auto-reload |
| `pnpm build` | Compile to `dist/` |
| `pnpm start:prod` | Run the compiled app |
