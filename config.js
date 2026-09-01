// Nyx runtime configuration.
//
// This file is intentionally NOT processed by Vite's JS bundler — it is
// served as a static asset and loaded via a plain <script> tag before the
// app bundle in index.html. That means it survives `npm run build` verbatim
// and can be edited directly in `dist/config.js` on the server to point at
// a different backend, with no rebuild required.
//
// This preserves the pre-Vite deployment workflow, where the `API` constant
// was edited directly inside nyx.html after copying it to the server.
//
// See DEPLOYMENT.md for details.
window.NYX_CONFIG = {
  API_URL: "http://192.168.1.139:8000",
};
