# Bullshit Telephone World

MozCorp’s complete creative workspace, with the original machine, Recent Transmissions, Voo Don’t, EVERYWHEN, Mozville, Friend Scrubber, Corruption Check, Swordfish, HOPE||LON, Bug World, and the integrated Dot Wave Studio.

[Play the public edition](https://moswald14.github.io/mozcorp-telephone-world/)

1. Open **By The Way / the whole machine** and enter a fictional prompt. Run it to see the story, **14 · Credits**, and **15 · Blooper Reel**.
2. Choose **Save world** and **Edit soundtrack**. In Studio, make or load an editable soundtrack, then choose **Keep this song with the world**.
3. Open the world again to keep writing. **Export project** makes a portable file that can also open in MozCorp on Doodle Tick Keeper.

The browser edition includes local savepoints, a paused-by-default HOPE fiction feed, and a manual proposal desk. Savepoints store the pre-story machine state. **Save world** keeps the final story and its attached score. Browser saves stay on this browser and address. Use the export controls to keep copies.

Keeper runs shared cloud savepoints, RSS news, HOPE, and optional AI proposals on its own authenticated installation. The public site has local versions of the savepoint, HOPE, and proposal desks. It leaves live RSS and AI requests to Keeper. See the [Doodle Tick Keeper source and releases](https://github.com/moswald14/doodletick) and [the Keeper guide](https://github.com/moswald14/doodletick/blob/0.17b/keeper/MOZCORP.md).

## Run a local copy

Clone or download this repository. Run `python -m http.server 8080` in the extracted folder, then visit [the local preview](http://localhost:8080/). Start with an empty browser profile if you want a fresh project shelf. Run the included checks with `node --test public-world.test.mjs` on Node.js 22 or newer.

## Run the public world in your own Keeper

The browser edition uses the same project format. A separately prepared [MozCorp public-content kit](./MozCorp-Public-Stations.zip) also contains the eight rooms for a Keeper build. Its checksum is in [keeper-bundle-pin.mjs](./keeper-bundle-pin.mjs).

Use a fresh checkout of [Keeper 0.17b](https://github.com/moswald14/doodletick/tree/0.17b). Copy `keeper-bundle-pin.mjs` into that checkout as `keeper/private-room-bundle.mjs`, run `node scripts/sync-ha.mjs`, and follow the Keeper guide to build your own copy. Install the ZIP through **MozCorp Labs → Choose private bundle** in that build. Versioned Keeper images check for their own exact bundle, so keep using the matching room package on an existing installation. The public content kit carries ready-to-run room source and a blank starting state. Setup on your own Keeper supplies its live services.

## Source and credits

The room HTML contains the editable scripts and artwork from the MozCorp world as distributed here. The host and integrated Studio adapt code from the public Doodle Tick release. See [NOTICE.md](./NOTICE.md) and [Studio’s notices](./studio-notices.txt) for provenance and terms.
