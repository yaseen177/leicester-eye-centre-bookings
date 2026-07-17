// Fires a GA4 page_view event manually. Needed because this is a single-page
// app — gtag's automatic page_view only fires once on the initial script
// load, so every subsequent in-app navigation (e.g. booking -> /manage/:id ->
// /receipt/:id) would otherwise be invisible in GA4. index.html disables the
// automatic page_view (send_page_view: false) specifically so this is the
// only source of truth for page views here, avoiding duplicates.

declare global {
    interface Window {
      dataLayer: unknown[];
      gtag?: (...args: unknown[]) => void;
    }
  }
  
  export function trackPageView(path: string) {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  
    window.gtag('event', 'page_view', {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    });
  }
  