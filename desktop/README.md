# TCNP Central — desktop program

The installable TCNP program for Windows and Mac, built with Electron.

It is a real desktop program: it installs from a file, has its own Start menu
or Dock entry and its own window, and does not depend on which browser is on
the computer. Inside the window it shows TCNP's screens from
`https://tcnp.vercel.app`, so it is always on the current version.

Officers who prefer the browser or the installable web app keep using those;
nothing here changes them.

## What it does beyond a browser tab

- One window, remembered size and position, one copy at a time.
- Alerts appear as Windows / macOS notifications while it is running.
- Links to anything other than TCNP open in the default browser.
- A "Can't reach TCNP" page with a retry button when there is no connection.
- Signed out, it opens on sign-in, never on the public download page.

The page inside gets no more access to the computer than a browser tab: no
Node, sandboxed, context-isolated, and only camera, notifications, fullscreen
and clipboard-write may be granted, to TCNP's own address only.

## Commands

```bash
npm install            # once (downloads Electron, about 120 MB)
npm start              # run from source
npm run smoke          # start, load TCNP once, print the result, exit
npm run build:win      # dist/TCNP-Central-Setup.exe
npm run build:mac      # dist/TCNP-Central.dmg (must be run on a Mac)
```

## Publishing a new Windows installer

The download page links to
`https://github.com/luvhaven/tcnp/releases/latest/download/TCNP-Central-Setup.exe`.
The file name never changes, so publishing a new release updates the download
with no change to the website:

```bash
npm run build:win
gh release create desktop-v1.0.0 dist/TCNP-Central-Setup.exe --title "TCNP Central for Windows 1.0.0"
```

## Known limits

- The installer is not signed with a code-signing certificate, so Windows
  shows "Windows protected your PC" the first time. Choosing More info, then
  Run anyway installs it. A certificate (paid, yearly) removes the prompt.
- The Mac build needs a Mac to produce, and an Apple Developer account to sign;
  an unsigned Mac app is blocked by macOS until the user allows it in Settings.
- Alerts arrive only while the program is running.
- Location sharing is for phones; desktops do not report a location.
