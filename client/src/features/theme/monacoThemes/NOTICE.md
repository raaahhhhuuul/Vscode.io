`dracula.json`, `githubDark.json`, `monokai.json`, `nightOwl.json`, and
`solarizedDark.json` in this directory are vendored from the
[`monaco-themes`](https://www.npmjs.com/package/monaco-themes) npm package
(MIT licensed), rather than taken as a runtime dependency — the project's
spec names both approaches as acceptable.

`oneDark.json` is hand-written for this project (not from monaco-themes,
which doesn't bundle a One Dark port): it implements the well-known Atom
"One Dark" color palette, which is a set of color values, not copyrightable
code or a redistributed file.
