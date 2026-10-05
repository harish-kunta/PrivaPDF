// Privacy-respecting analytics via Cloudflare Web Analytics.
// Cookieless, no fingerprinting, aggregate visit counts only.
// The beacon is loaded ONLY after the user explicitly opts in via the
// consent banner. Declining means nothing is ever loaded or sent.
//
// Setup (one time, ~2 minutes):
//   1. Create a free account at https://dash.cloudflare.com
//   2. Go to "Web Analytics" -> "Add a site" and enter your site URL
//   3. Copy the site token and paste it below.

const CLOUDFLARE_BEACON_TOKEN = 'PASTE_YOUR_CLOUDFLARE_WEB_ANALYTICS_TOKEN_HERE';

const TOKEN_PLACEHOLDER = 'PASTE_YOUR_CLOUDFLARE_WEB_ANALYTICS_TOKEN_HERE';

let beaconLoaded = false;

export const enableAnalytics = async () => {
  if (beaconLoaded) return true;
  if (!CLOUDFLARE_BEACON_TOKEN || CLOUDFLARE_BEACON_TOKEN === TOKEN_PLACEHOLDER) {
    // eslint-disable-next-line no-console
    console.warn('[PrivaPDF] Analytics token not configured — skipping analytics.');
    return false;
  }
  const script = document.createElement('script');
  script.defer = true;
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  script.setAttribute('data-cf-beacon', JSON.stringify({ token: CLOUDFLARE_BEACON_TOKEN }));
  document.head.appendChild(script);
  beaconLoaded = true;
  return true;
};

export const disableAnalytics = async () => {
  // The beacon is cookieless and stores nothing, so declining simply means
  // it is never loaded. There is nothing to tear down.
};

export const trackEvent = async () => {
  // Cloudflare Web Analytics automatically counts page views.
  // Custom events are intentionally not sent: aggregate popularity is all we need,
  // and every extra event is extra data leaving the device.
};
