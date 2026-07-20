# THE ARTZ — build notes

## What's in this delivery
- `login.html` — sign-in page (split masonry preview + form, social login row)
- `profile.html` — full profile page: header, artwork showcase with add/edit/delete, payment (UPI + QR), favorites/collections, activity feed, settings & security

Both are self-contained HTML/CSS/JS (Tailwind-free, hand-written CSS using your design tokens) so you can open them directly in a browser or drop them into any static host right now. All data (artz, collections, activity) is in-memory mock data with working CRUD — add/edit/delete an artz, like/unlike, and everything re-renders live.

This sandbox can't stand up a real Postgres/MongoDB/Redis/Node cluster for you to click around in, so I focused on getting the frontend to production-visual-quality and fully interactive. Below is how each piece maps onto the stack you specified, so a dev can wire it up quickly.

## Mapping to your stack

| Layer | Where it plugs in |
|---|---|
| **Next.js + React + Tailwind** | Convert `profile.html`'s sections into components (`ProfileHeader`, `ArtworkGrid`, `ArtModal`, `PaymentSection`, `Collections`, `ActivityFeed`, `SettingsPanel`). The CSS here is plain classes with CSS variables for the design tokens (`--bg`, `--black`, `--line`, etc.) — trivial to port to a `tailwind.config.js` theme extension. |
| **Node + Express + GraphQL** | Replace the mock arrays (`artworks`, `collections`, `activity`) with GraphQL queries/mutations: `myArtz`, `createArtz`, `updateArtz`, `deleteArtz`, `toggleLike`, `myActivity`, `myCollections`. The modal's `saveArt()` is the natural spot for a `createArtz`/`updateArtz` mutation call. |
| **PostgreSQL** | Users, follows, transactions/sales, payment methods (UPI ID) — anything relational and consistency-critical. |
| **MongoDB** | Artz documents (flexible metadata: tags, AI-generated descriptions, style vectors) and collections/boards. |
| **Redis** | Session cache, like counters, activity feed fan-out, rate limiting on uploads. |
| **TensorFlow.js** | Run client-side on image upload in the Art Details modal (where `previewImage()` currently just does a `FileReader` preview) — auto-tag category/style before the artz is submitted. |
| **OpenAI** | Auto-generate artz descriptions from the image/title, power the search bar's semantic matching, and drive a "similar artz" recommendation rail. |

## Design tokens used
```
--bg:     #FAF7F2   warm-white background
--black:  #0E0D0B   primary accent (buttons, active states)
--ink:    #14120F   primary text
--ink-soft: #5B5643 secondary text
--line:   #E7E1D4   borders/dividers
--muted:  #9A927D   placeholder/meta text
```
Typeface: Plus Jakarta Sans (clean geometric sans, matches the "minimal, content-first" brief). Masonry via CSS `column-count`. Cards lift + shadow on hover per spec. All buttons are pill-shaped.

## Next steps if you want this taken further
- Scaffold the actual Next.js app (pages/App Router + component split) from these two files
- Stand up GraphQL schema + resolvers against Postgres/Mongo
- Wire the upload flow to real object storage (S3/GCS) + TF.js tagging
