// iOS home-screen PWAs (standalone + viewport-fit=cover) are known to size
// `height: 100%` — and even `100dvh` — to less than the real screen, so the app
// shell ends up shorter than the display and leaves an empty band below the tab
// bar (where Safari's URL bar would otherwise sit). `window.innerHeight` is
// reliably the full usable height in standalone mode, so we mirror it into a
// `--app-height` CSS variable that the shell is pinned to, sidestepping every
// viewport-unit quirk. On iOS the soft keyboard overlays without changing
// innerHeight, so this stays stable while typing.
function setAppHeight() {
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
}

setAppHeight()
window.addEventListener('resize', setAppHeight)
window.addEventListener('orientationchange', setAppHeight)
// Standalone iOS restores from the back/forward cache on app-switch without
// firing resize, so re-measure when the page is shown again.
window.addEventListener('pageshow', setAppHeight)
