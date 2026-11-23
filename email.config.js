/* Where sign-up and Black Friday emails go. See README.md, "Collecting emails".
 *
 *   mode: 'demo'    kept in the visitor's own browser only. Safe for previews. (current)
 *   mode: 'sheet'   a Google Sheet, via tools/email-to-sheet.gs. Set sheetUrl.
 *   mode: 'shopify' Shopify admin > Customers, tagged (works when the site runs
 *                   on the Shopify store's own domain).
 */
window.NSF_EMAIL = {
  mode: 'demo',
  sheetUrl: '',
};
