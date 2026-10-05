const cloudflareBeaconToken = (import.meta.env.VITE_CLOUDFLARE_BEACON_TOKEN || '').trim();
let beaconScript;

export const enableAnalytics = async () => {
  if (beaconScript || !cloudflareBeaconToken) return Boolean(beaconScript);

  beaconScript = document.createElement('script');
  beaconScript.type = 'module';
  beaconScript.defer = true;
  beaconScript.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beaconScript.setAttribute(
    'data-cf-beacon',
    JSON.stringify({ token: cloudflareBeaconToken }),
  );
  document.head.appendChild(beaconScript);
  return true;
};

export const disableAnalytics = async () => {
  beaconScript?.remove();
  beaconScript = undefined;
};
