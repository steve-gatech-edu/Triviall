# Verification spike results

Two kinds of evidence live here.

1. **Automated.** The block below is rewritten by `scripts/spike.mjs`. In a Codespace it runs on every start, about 20 seconds after the server comes up. You can also run `make spike`.
2. **Manual.** The table after it is yours to fill in. The script never touches it.

## How to pass results back

After the Codespace has started, wait a minute, then commit and push `docs/spike-results.md` and `docs/spike-results.json`, or download them and share them in the conversation. Nothing is sent anywhere automatically. For the restart check (A5), stop and restart the Codespace once, wait a minute, and share the files again.

<!-- auto:start -->
No automated run yet. Start the Codespace, or run `make spike`.
<!-- auto:end -->

## Manual checks

Fill in one row per check with the date, the device, and what you saw.

| Check | What to do | Result | Date | Notes |
| --- | --- | --- | --- | --- |
| A2 | On a phone with no GitHub login, on cellular, open the forwarded URL. Note any warning page or sign-in. | | | |
| A3 | Open the URL printed by `scripts/start.sh` on a phone and confirm it matches the page you expect. | | | |
| A4 | Needs the server. WebSocket idle and reconnect timing through forwarding. | | | |
| A6 | Needs the server. A private admin port issues the first host credential. | | | |
| A7 | Load a minimal Cast sender page in Chrome desktop, Chrome Android, Safari iOS, Chrome iOS. | | | |
| A8 | Register a custom receiver and launch it on a registered device. | | | |
| A9 | Pairing token exchange yields a read-only display credential. | | | |
| A10 | On Android Chrome, play as a player while casting. | | | |
| A11 | Render the display on a Chromecast-class device and on a Google TV at 4K. | | | |
