# App icon

**App icon created by Eiad Oraby.**

Place the application icon files here so the packaged app uses a custom icon:

- **Windows:** `icon.ico` (256×256 recommended)
- **macOS:** `icon.icns` (512×512 or 1024×1024 for Retina)
- **Linux / dev:** `icon.png` (512×512)

Use the same base name `icon` (no extension) in `package.json`; Electron Forge picks the right file per platform when you run `npm run package` or `npm run make`.

Start from a 1024×1024 PNG, then convert to `.ico` (Windows) and `.icns` (macOS) with a tool such as [electron-icon-builder](https://www.npmjs.com/package/electron-icon-builder) or [Image2Icon](https://img2icnsapp.com/).
