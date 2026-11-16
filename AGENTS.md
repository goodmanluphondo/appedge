<general-guidelines>
## Language

Always use South African English in all written content: comments, commit messages, documentation, error messages, and responses.

- organisation (not organization)
- authorisation (not authorization)
- standardised (not standardized)
- colour, behaviour, centre, etc.

Two characters are banned everywhere in this codebase, in code and in prose alike:

- The em dash (—) and the en dash (–). Use a colon, a comma, brackets, or a full stop instead. A hyphen in a compound word is fine.
- The section sign (§). Write "section" out in full.

## General

- Before creating a file or directory, verify it does not already exist.
- Before editing any git-ignored file (`.env`, `.env.local` and the like), read its current contents first.
- Values that differ by environment (API and app addresses, project IDs, keys) always go in the environment file, never in code, and never get a fallback or default. There are no exceptions: not for a value that only switches something on (analytics, for one), not for a development-only default and not for a production address. Read every one with `requireEnv(name, process.env.NAME)` from `@repo/env`, so a missing value fails loudly, naming the variable, instead of quietly pointing somewhere else. List each variable in the app's `.env.example` and make it available to the npm scripts and runtime configuration that need it.

## Code style

- No inline comments anywhere in code you author. Names must be descriptive enough that a comment would be redundant: if a comment feels necessary, rename instead. The only exception is TSDoc on an exported function, hook or component whose parameters or return value are not obvious from their types.
- Never comment out code. Delete what is not needed: git history is the record of what was removed, not a commented-out block left in the file.
- Server Components by default in the Next.js apps. Add `"use client"` only to the specific component that needs interactivity, not to whole trees.

## Progress

`PROGRESS.md` is the running record of the project and is updated as part of every change, not afterwards. Write what landed, how it works, and why it was done that way. The "why" is the part that cannot be recovered from the code later, so it is the part that must not be skipped.

It is written for a reader with no access to this repository, so spell things out rather than linking to files. Replace an entry that is now wrong instead of appending a correction to the bottom.

## Git

Never run git commands. This applies to every git command without exception. `git add`, `git commit` and `git push` most of all, but also branching, merging, rebasing, resetting, and stashing. Reading commands (`git log`, `git status`, `git diff`) are equally off limits.

Git is driven by hand. Leave the working tree dirty and report what changed instead: the files touched and a summary of the change.

## Cloudflare

Never make any change to Cloudflare without an explicit instruction from the user. This covers every route to Cloudflare: Wrangler, the `opennextjs-cloudflare` CLI, the Cloudflare API and dashboard, and package scripts that wrap them (`deploy`, `deploy:worker`, `db:migrate:dev`, `db:migrate:production` and the like). Deploying a Worker, applying a D1 migration or running a write query, changing secrets, variables, cron triggers, routes, DNS, R2 buckets or KV namespaces all count.

An instruction covers only the change it names, for that one occasion. When a change in the repository needs a Cloudflare change to take effect, stop and say what is needed instead of making it.
</general-guidelines>

[//]: # (<design-guidelines>)

[//]: # (## Prototypes are the design source of truth)

[//]: # ()
[//]: # (The Claude Design prototypes &#40;the "AppEdge" project&#41; are the authoritative source of truth for the design of every app. They are not a guide or an inspiration. Every layout, page, screen, surface, interaction, content treatment and state must be implemented from what is present in a prototype. Only what is in a prototype may be built. Never design a screen yourself, not even a stand-in.)

[//]: # ()
[//]: # (Do not re-invent any design decision. Match the prototype's documented layout, surface, interaction, content and state. Do not add an alternative modal, drawer, sheet, page, empty state, loading state, error state or other interface treatment because it seems useful or familiar.)

[//]: # ()
[//]: # (If the app needs a screen that is not in any of the prototypes, stop and say so, naming the screen and where it is needed. A request will then be sent to Claude Design for that screen to be designed, and it is built once the design exists. This applies no matter how small the screen is: a loading or splash state, an empty state, an error or signed-out screen, a confirmation dialog or a side sheet all count.)

[//]: # ()
[//]: # (If a required layout or surface does not exist in the prototypes, stop implementation and ask for that design to be added. Do not create a substitute or infer one from another screen.)

[//]: # (</design-guidelines>)
