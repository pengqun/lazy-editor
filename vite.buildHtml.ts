/**
 * Post-process production `index.html` emitted by Vite.
 *
 * Vite may add `crossorigin` on `<script type="module">`, stylesheet links, and
 * modulepreload links. Whether that affects module execution under WKWebView
 * when the document is loaded from Tauri’s custom protocol is unconfirmed; it
 * is a hypothesis to validate on macOS (Mini console/network).
 */
export function stripCrossoriginFromProductionHtml(html: string): string {
  return html.replace(/\s+crossorigin(?:="anonymous")?/g, "");
}
