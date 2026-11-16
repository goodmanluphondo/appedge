# AppEdge

AppEdge is an internal infrastructure console for managing application delivery, custom domains and routing configuration.

## Capabilities

The dashboard reads operational records from Cloudflare D1. It presents clients, applications, domains, routes and audit activity, with distinct status fields for domain ownership, DNS validation, SSL certificates and route activation. Microsoft Entra app role assignment controls access.

## Requirements

- Node.js 22.12 or newer (`.nvmrc` selects 22.22.3)
- npm
- A Cloudflare Worker runtime with an `APPEDGE_DB` D1 binding for Cloudflare preview and deployment

## Local setup

Select the project Node.js version with `nvm use`, then install dependencies with `npm install`. Copy `.env.example` to `.env.local` and set the Worker, D1 and Microsoft Entra values for the environment you are preparing. Apply the schema to local D1 with `npm run db:migrate:local`, then add the canonical demonstration records with `npm run db:seed:local`. Start Next.js with `npm run dev` or build and preview the Worker runtime with `npm run cf:preview`. Development and Cloudflare commands generate the ignored Wrangler configuration from the active environment files before starting.

The committed Wrangler file contains shared runtime settings only. A generated, ignored Wrangler file receives the Worker and D1 resource names from the active environment file. Missing values stop configuration generation and identify the variable that needs to be set. The provided database commands target local D1 only. No command provisions remote resources, applies a remote migration or writes a remote seed.

## Architecture

OpenNext for Cloudflare provides the Worker runtime context. Server components query D1 through the `APPEDGE_DB` binding. The application does not use the Cloudflare HTTP API or store a Cloudflare account token. Client components are limited to browser interactions such as navigation and table search.

## Configuration

Environment-specific configuration belongs in environment files. Set `APPEDGE_WORKER_NAME`, `APPEDGE_D1_DATABASE_NAME`, `APPEDGE_D1_DATABASE_ID` and the application URL in the environment file for the target. The generated Wrangler configuration takes the selected D1 database name and ID from these values. Next.js development always uses the local D1 simulator; its database is selected by `APPEDGE_D1_DATABASE_NAME`. The generator creates the D1 binding named `APPEDGE_DB` and configures the Worker self-reference service to use the selected Worker name; the committed Wrangler file contains no environment-specific resource identifiers.

## Microsoft sign-in

Authentication uses an AppEdge-owned Microsoft Entra OpenID Connect flow with the callback path configured as `/auth/callback`. The sign-in request stores a one-time state, nonce and PKCE verifier in D1. The callback consumes that attempt once, verifies the ID token signature and its issuer, audience and nonce, then issues an opaque eight-hour session token whose hash is stored in D1. Sign-in and callback requests are limited to 20 per source address in a five-minute window. Only non-guest members of the configured tenant who are assigned the `AppEdge.Administrator` application role can sign in. AppEdge validates the role claim in the ID token and stores the account identity in the session; it does not maintain a separate administrator allowlist in D1.

Set `NEXT_PUBLIC_APP_URL` to the exact origin serving the application. It is `http://localhost:3000` for `npm run dev`; for `npm run cf:preview`, set it to the preview origin `http://localhost:8787` before building because the public variable is fixed during the build. Set `AUTH_MICROSOFT_ENTRA_ID_CLIENT_ID` to the Entra application client ID, `AUTH_MICROSOFT_ENTRA_ID_CLIENT_SECRET` to its secret value and `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID` to the tenant ID. Register `${NEXT_PUBLIC_APP_URL}/auth/callback` as a Web redirect URI in the Entra application. Define an enabled app role with the value `AppEdge.Administrator` in the app registration. In the matching Enterprise application, set assignment required to Yes and assign that app role to the `AppEdge Administrators` security group. Assign the people who need access to that group. Group assignment requires Entra ID P1; if that licence is unavailable, assign the role to people individually. AppEdge checks for the exact role value in the signed ID token, so tenant membership alone does not grant access. Keep the client secret in secret storage and configure it for the Worker runtime. Apply the initial schema migration before sign-in so D1 has the one-time attempt and session tables. The authentication schema stores session identity without a separate D1 administrator allowlist. The committed example and local environment files list each variable without storing credentials.

## Development checks

Run `npm run lint` for ESLint and `npx tsc --noEmit` for TypeScript. No deployment command is included in the package scripts.
