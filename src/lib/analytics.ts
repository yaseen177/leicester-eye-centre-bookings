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
  
  
// Google Ads conversion for completed online bookings.
// transaction_id = Firestore booking id, so each booking is counted once.
// Sends ONLY the service - never the NHS/diabetic/benefits category or patient details.
export const ADS_SEND_TO = 'AW-18309519693/V1ThCP3J7oYdEM2y1JpE';

export function trackBookingConversion(bookingId: string, service: string) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;

  if (!ADS_SEND_TO.includes('XXXX')) {
    window.gtag('event', 'conversion', {
      send_to: ADS_SEND_TO,
      transaction_id: bookingId,
    });
  }

  window.gtag('event', 'booking_completed', {
    booking_id: bookingId,
    service,
  });
}

// GA4-only lead event for the Hearingcare enquiry form.
export function trackLead(formName: string) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', 'generate_lead', { form_name: formName });
}