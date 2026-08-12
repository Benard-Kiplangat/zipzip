let configPromise;

export function getConfig() {
  if (!configPromise) {
    configPromise = fetch("/config.json", {
      cache: "no-store"
    }).then(async response => {
      if (!response.ok) {
        throw new Error(`Failed to load config.json: ${response.status}`);
      }

      return response.json();
    });
  }

  return configPromise;
}