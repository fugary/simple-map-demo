const DEFAULT_GOOGLE_PROXY_BASE = 'https://mock-dev.citsgbt.com/mock/3471f5ba61824bfea6efb264d70e235d';

const getGoogleLanguage = () => {
  const lang = (typeof window !== 'undefined' && window.AppI18n) ? window.AppI18n.getLang() : null;
  const result = lang === 'en' ? 'en' : 'zh-CN';
  console.log('[google-provider] AppI18n.getLang()=', lang, '=> language=', result);
  return result;
};

const getStoredGoogleConfig = () => {
  const apiKeys = JSON.parse(localStorage.getItem('google_map_api_keys') || '[]');
  const regions = JSON.parse(localStorage.getItem('google_map_regions') || '[]');
  return {
    apiKey: apiKeys[0] || '',
    region: regions[0] || '',
    proxyBaseUrl: localStorage.getItem('google_map_proxy_base') || DEFAULT_GOOGLE_PROXY_BASE
  };
};

const buildProxyUrl = (path, params, config = getStoredGoogleConfig()) => {
  const base = String(config.proxyBaseUrl || DEFAULT_GOOGLE_PROXY_BASE).replace(/\/+$/, '');
  return `${base}/${path}?${new URLSearchParams(params).toString()}`;
};

const normalizeGoogleLocation = (location) => {
  if (!location) return null;
  if (typeof location.lat === 'function') {
    return { lat: location.lat(), lng: location.lng() };
  }
  return {
    lat: Number(location.lat),
    lng: Number(location.lng)
  };
};

const normalizeGooglePlace = (item) => {
  const location = normalizeGoogleLocation(item.geometry && item.geometry.location);
  return {
    title: item.name || 'Unnamed',
    address: item.formatted_address || item.vicinity || 'Unknown',
    location,
    placeId: item.place_id || '',
    raw: item
  };
};

const ensureGoogleConfig = (config = getStoredGoogleConfig()) => {
  if (!config.apiKey) throw new Error('Google API Key is missing');
  return config;
};

const googleTextSearch = async ({ query, region = '', count = 10, config } = {}) => {
  const finalConfig = ensureGoogleConfig(config);
  const params = {
    query,
    key: finalConfig.apiKey,
    language: getGoogleLanguage()
  };
  if (region) params.region = region;

  const raw = await fetch(buildProxyUrl('place/textsearch/json', params, finalConfig)).then((response) => response.json());
  return {
    raw,
    items: raw && raw.status === 'OK' && Array.isArray(raw.results)
      ? raw.results.slice(0, count || 10).map(normalizeGooglePlace)
      : []
  };
};

const googleNearbySearch = async ({ location, keyword = '', radius = 2000, count = 20, config } = {}) => {
  const finalConfig = ensureGoogleConfig(config);
  const raw = await fetch(buildProxyUrl('place/nearbysearch/json', {
    location: `${location.lat},${location.lng}`,
    keyword,
    radius: String(radius || 2000),
    key: finalConfig.apiKey,
    language: getGoogleLanguage()
  }, finalConfig)).then((response) => response.json());

  return {
    raw,
    items: raw && raw.status === 'OK' && Array.isArray(raw.results)
      ? raw.results.slice(0, count || 20).map(normalizeGooglePlace)
      : []
  };
};

const googleGeocode = async ({ address, config } = {}) => {
  const finalConfig = ensureGoogleConfig(config);
  const raw = await fetch(buildProxyUrl('geocode/json', {
    address,
    key: finalConfig.apiKey,
    language: getGoogleLanguage()
  }, finalConfig)).then((response) => response.json());

  const first = raw && raw.status === 'OK' && Array.isArray(raw.results) ? raw.results[0] : null;
  return {
    raw,
    location: first ? normalizeGoogleLocation(first.geometry && first.geometry.location) : null
  };
};

export {
  DEFAULT_GOOGLE_PROXY_BASE,
  getStoredGoogleConfig,
  buildProxyUrl,
  normalizeGoogleLocation,
  normalizeGooglePlace,
  googleTextSearch,
  googleNearbySearch,
  googleGeocode
};
