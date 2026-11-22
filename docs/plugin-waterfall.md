# Telephone World plugin waterfall

Run each stage against the same GitHub-backed site. Pass the result to the next stage so the public build comes from the version that was actually reviewed and tested.

| Stage | Route | What it hands to the next stage |
| --- | --- | --- |
| 1. Find the baseline | GitHub connector | Current `main` commit and the GitHub Pages destination. |
| 2. Walk the site | Browser | The visible path from an icebreaker to dating and from the homepage to a saved Telephone World project. |
| 3. Make the visual | ImageGen | Original photography-style art for the icebreaker panel, sized for the site. |
| 4. Build the flow | Local workspace and existing Telephone machine and Dot Wave Studio | A usable icebreaker deck and a shorter path from a fictional premise to a saved world and editable soundtrack. |
| 5. Prove it | Node tests and the in-app browser | Checks for the normal path, a held or unsaved draft, existing room integrity, and a usable small-screen layout. Use disposable projects. |
| 6. Publish and verify | GitHub connector and the existing Pages site | One fast-forward update, a commit link, and a check of the actual site and assets. |

Use the existing project and service that own each stage. Keep public dating accounts on their current service. Mozville’s member data belongs to its self-hosted Keeper. A test or preview should use disposable fixtures for either service.
