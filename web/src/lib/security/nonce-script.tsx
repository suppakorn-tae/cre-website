/**
 * Hands the request's CSP nonce to libraries that add `<style>` tags at run
 * time. Radix's scroll lock (react-remove-scroll, through react-style-singleton
 * and get-nonce) reads `__webpack_nonce__`; without it the browser blocks the
 * tag under `style-src 'nonce-…'`. The script reads its own nonce, so the value
 * is not written into the page a second time.
 */
export const NONCE_INIT_SCRIPT = 'self.__webpack_nonce__=document.currentScript.nonce;';

/** Render in `<head>` of the root layout, before any client code runs. */
export function NonceScript({ nonce }: { nonce?: string }) {
  return (
    <script id="nonce-init" nonce={nonce} dangerouslySetInnerHTML={{ __html: NONCE_INIT_SCRIPT }} />
  );
}
