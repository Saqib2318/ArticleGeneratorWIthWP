# ArticleGeneratorWIthWP

ArticleGeneratorWIthWP is a full-stack Next.js application for managing SEO content projects from a single dashboard. It connects a project to a Google Sheet of keyword clusters, uses AI generation for article drafts, and can publish the finished article to WordPress while tracking background jobs, generated content, and project configuration.

## Overview

The platform is designed for an SEO content workflow:

- Create and manage projects
- Store WordPress connection details securely
- Connect Google Sheets and Docs through Google OAuth
- Pull pending keyword rows from a spreadsheet
- Generate article drafts with AI
- Check duplicate risk against past work
- Publish or rewrite content using WordPress and project instructions
- Monitor long-running jobs from the dashboard

## Main Features

- Project management dashboard with create, edit, and delete flows
- WordPress configuration per project
- Google OAuth integration for Sheets and Docs access
- AI content generation with Gemini-based article creation
- Draft publishing to WordPress with metadata support
- Google Sheet status tracking to avoid reprocessing rows
- Background job processing for generation and publishing tasks
- Prisma-powered persistence with PostgreSQL

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Prisma + PostgreSQL
- Google APIs + OAuth
- Gemini AI via @google/genai
- Inngest and BullMQ for background processing
- Tailwind CSS

## Project Structure

```text
app/
  api/
    google/
    jobs/
    projects/
  generated/
  globals.css
  layout.tsx
  page.tsx
components/
lib/
  articleService.ts
  google-oauth.ts
  inngest/
  prisma.ts
  projects.ts
prisma/
  schema.prisma
```

## Database Model

The Prisma schema includes:

- User
- Project
- ProjectWpConfig
- ProjectSheet
- GeneratedArticle
- BackgroundJob
- GoogleConnection

This allows each project to own its own WordPress config, Google sheet reference, generated article history, and connected Google account.

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Google Cloud OAuth client credentials
- Gemini API key
- Optional Redis instance depending on job runner setup

### Installation

```bash
git clone <repo-url>
cd nextjs-fullstack
npm install
```

### Environment Variables

Create a `.env` file in the project root and define values similar to the following:

```bash
DATABASE_URL="postgresql://user:password@HOST:PORT/DB"
GEMINI_API_KEY="your-gemini-api-key"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_REDIRECT_URI="HOST/api/google/callback"
NEXT_PUBLIC_APP_URL="http://HOST:PORT"
```

If you use a different database provider or deployment setup, adjust the `DATABASE_URL` accordingly.

### Database Setup

```bash
npx prisma db push
```

### Run the App

```bash
npm run dev
```

Then open:

```text
http://HOST:3000
```

## Available Scripts

```bash
npm run dev
npm run build
npm run start
npm run db:push
npm run db:studio
npm run db:generate
```

## Application Flow

1. Create a project and configure WordPress login details.
2. Connect a Google account to access Sheets and Docs.
3. Link a spreadsheet containing keyword clusters.
4. Fetch pending rows from the sheet.
5. Generate article drafts based on project instructions and target content goals.
6. Review duplicate-risk scores and metadata.
7. Publish the draft or rewrite with feedback.
8. Save generated content and job status in the database.

## API Highlights

Main project API routes include:

```text
GET /api/projects
POST /api/projects
GET /api/projects/:id
PUT /api/projects/:id
DELETE /api/projects/:id
GET /api/projects/:id/pending-rows
POST /api/projects/:id/generate-one
POST /api/projects/:id/generate-batch
POST /api/projects/:id/publish-draft
POST /api/projects/:id/import-gdoc
POST /api/projects/:id/rewrite
GET /api/projects/:id/articles
```

These endpoints are used by the dashboard and AI job flows to operate on project data and article generation tasks.

## Notes

- This project is best suited for a managed SEO content workflow and internal production use.
- Authentication is currently minimal and uses a development owner pattern for some flows.
- Google Sheets must be shared with the relevant Google service account or authorized account if write-back status tracking is enabled.
- WordPress SEO plugins such as Rank Math or Yoast should match your project configuration and metadata expectations.

## License

This project is provided as-is for internal or personal use. Add your preferred license if you plan to distribute or commercialize it.
```
