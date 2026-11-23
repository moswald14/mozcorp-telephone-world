# Bullshit Telephone World

Bullshit Telephone World is a dating site for adults. Members choose a display name, answer an icebreaker, and opt into discovery. A private conversation opens when both people choose Interested. The site also includes the original MozCorp world, with the Telephone machine, Recent Transmissions, Voo Don’t, EVERYWHEN, Mozville, Friend Scrubber, Corruption Check, Swordfish, HOPE||LON, Bug World, and Dot Wave Studio.

[Open dating](https://mozcorp-telephone-dating.pages.dev/dating) · [Explore MozCorp World](https://moswald14.github.io/mozcorp-telephone-world/#mozcorp) · [Host Mozville on your Pi](https://github.com/moswald14/mozcorp-telephone-world/releases/tag/keeper-0.20b-private.7)

## Host Mozville on your Pi

Run an invite-only Mozville feed and Private Telephone Dating in your own Doodle Tick Keeper. Members can post, reply, and like under a Mozville name. Dating is optional. Mutual matches can co-write a story and edit its soundtrack together in Dot Wave Studio. Dating profiles can include a native DVC receiving address.

The [Mozville for Keeper release](https://github.com/moswald14/mozcorp-telephone-world/releases/tag/keeper-0.20b-private.7) has a local app ZIP for Home Assistant OS and a separate bundle for Raspberry Pi OS. Each includes a setup guide. Your invites, profiles, and posts live on your Keeper.

## Dating

The public GitHub site opens dating on Cloudflare Pages. Member profiles, matches, and messages are stored in a dedicated D1 database. The dating site links to the original creative world and Studio address where browsers already keep their projects.

Run the complete site locally with Node.js 24 or later.

```sh
node dating/server.mjs
```

Open [the local dating site](http://127.0.0.1:8787/dating.html). Use separate browser profiles to create two independent accounts and check a reciprocal match. Each account receives a randomly generated sign-in key. Save it before leaving the account creation screen.

### Host the dating service

**Cloudflare Pages and D1.** The public dating deployment uses the [`prepare-pages.mjs`](dating/prepare-pages.mjs) build. Run `node dating/prepare-pages.mjs` and upload the contents of `dating/.pages-output` to Pages. Initialize a dedicated D1 database with [`schema.sql`](dating/schema.sql), bind it to the production Pages project as `DB`, and redeploy. The public `/dating-api/status` endpoint confirms when the database is ready.

**Cloudflare Workers and D1.** Create a dedicated D1 database. Copy `dating/wrangler.example.jsonc` to `dating/wrangler.jsonc` and fill in the database ID. Install or run a current Wrangler CLI signed into that account. From the repository root, run the following commands.

```sh
node dating/prepare-assets.mjs
wrangler d1 execute mozcorp-telephone-dating --remote --file dating/schema.sql --config dating/wrangler.jsonc
wrangler deploy --config dating/wrangler.jsonc
```

The worker serves the entire site on one HTTPS origin. The production schema starts empty. Change the publishing URLs in `dating-app.mjs` and `dating/prepare-pages.mjs` for a separate installation.

**Node hosting.** Run `node dating/server.mjs` behind an HTTPS reverse proxy on the same host. Set `TELEPHONE_PUBLIC_ORIGIN` to the public HTTPS origin and `TELEPHONE_DATA_DIR` to a persistent private directory. `TELEPHONE_PORT` defaults to 8787. Set `TELEPHONE_PROXY_IP_HEADER` only if the proxy overwrites that header with the client address. `TELEPHONE_SIGNUPS=closed` pauses new accounts on either runtime while existing members can sign in.

Report and block actions close the conversation for both people. Reports go into the private `dating_reports` table for the site operator to review. A member can hide their profile or delete their account. Account deletion removes their chats and matches. Moderation reports retain their reason and opaque account identifiers.

Run `node --test public-world.test.mjs dating/dating.test.mjs` for the creative-world checks and the multi-account dating flow.

## MozCorp World

Choose **Dial a story** for three fictional starters. Each opens a fresh workspace with the premise loaded in the Input Hopper. Run the machine, save the world, and choose **Edit soundtrack** to take it into Dot Wave Studio. On the dating side of the homepage, **Next question** and **Copy question** give you an icebreaker you can use in a profile or conversation.

1. Open **By The Way / the whole machine** and enter a fictional prompt. Run it to see the story, **14 · Credits**, and **15 · Blooper Reel**.
2. Choose **Edit soundtrack** to save the world and open it in the embedded Dot Wave Studio. Make or load an editable soundtrack, then choose **Keep this song with the world** in Studio’s **Telephone** tab.
3. Choose **Back to MozCorp** to return to the same room. **Export project** makes a portable file that can also open in MozCorp on Doodle Tick Keeper.

Choose **Dot Wave Studio** from the site navigation to start with the sound editor. Use **Open in a separate tab** when you want the standalone editor.

The browser edition includes local savepoints, a paused-by-default HOPE fiction feed, and a manual proposal desk. Savepoints store the pre-story machine state. **Save world** keeps the final story and its attached score. Browser saves stay on this browser and address. Use the export controls to keep copies.

Keeper runs shared cloud savepoints, RSS news, HOPE, and optional AI proposals on its own authenticated installation. The public site has local versions of the savepoint, HOPE, and proposal desks. It leaves live RSS and AI requests to Keeper. See the [Doodle Tick Keeper source and releases](https://github.com/moswald14/doodletick) and [the Keeper guide](https://github.com/moswald14/doodletick/blob/0.17b/keeper/MOZCORP.md).

## Run a local copy

Clone or download this repository. To preview just the creative world, run `python -m http.server 8080` in the extracted folder, then visit [the local preview](http://localhost:8080/#mozcorp). Start with an empty browser profile if you want a fresh project shelf.

## Run the public world in your own Keeper

The browser edition uses the same project format. A separately prepared [MozCorp public-content kit](./MozCorp-Public-Stations.zip) also contains the eight rooms for a Keeper build. Its checksum is in [keeper-bundle-pin.mjs](./keeper-bundle-pin.mjs).

Use a fresh checkout of [Keeper 0.17b](https://github.com/moswald14/doodletick/tree/0.17b). Copy `keeper-bundle-pin.mjs` into that checkout as `keeper/private-room-bundle.mjs`, run `node scripts/sync-ha.mjs`, and follow the Keeper guide to build your own copy. Install the ZIP through **MozCorp Labs → Choose private bundle** in that build. Versioned Keeper images check for their own exact bundle, so keep using the matching room package on an existing installation. The public content kit carries ready-to-run room source and a blank starting state. Setup on your own Keeper supplies its live services.

## Source and credits

The room HTML contains the editable scripts and artwork from the MozCorp world as distributed here. The host and integrated Studio adapt code from the public Doodle Tick release. See [NOTICE.md](./NOTICE.md) and [Studio’s notices](./studio-notices.txt) for provenance and terms.

The [plugin waterfall](./docs/plugin-waterfall.md) records the steps for building, testing, and publishing an update.
