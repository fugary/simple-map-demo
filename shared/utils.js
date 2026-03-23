const CHINA_LAT_RANGE = [0.8293, 55.8271];
const CHINA_LNG_RANGE = [72.004, 137.8347];
const EARTH_AXIS = 6378245.0;
const EARTH_ECCENTRICITY = Number('0.00669342162296594323');

const highlightJson = (jsonStr) => {
  if (!jsonStr) return '';
  const escaped = jsonStr
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'json-key' : 'json-string';
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
};

const translate = (key, fallback) => {
  if (typeof window !== 'undefined' && window.AppI18n && typeof window.AppI18n.t === 'function') {
    return window.AppI18n.t(key, fallback);
  }
  return fallback;
};

const copyJson = async (data) => {
  try {
    const text = JSON.stringify(data, null, 2);
    await navigator.clipboard.writeText(text);
    if (typeof window !== 'undefined' && window.ElementPlus) {
      window.ElementPlus.ElMessage.success(translate('common.copyJsonSuccess', '已复制到剪贴板'));
    }
  } catch {
    if (typeof window !== 'undefined' && window.ElementPlus) {
      window.ElementPlus.ElMessage.error(translate('common.copyJsonError', '复制失败，请手动复制'));
    }
  }
};

const formatDistance = (meters) => {
  if (meters == null || Number.isNaN(Number(meters))) return '未知';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} 公里`;
  return `${Math.round(meters)} 米`;
};

const formatDuration = (seconds) => {
  if (seconds == null || Number.isNaN(Number(seconds))) return '未知';
  if (seconds < 60) return `${Math.round(seconds)} 秒`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return `${hours} 小时 ${mins} 分钟`;
};

const fetchData = async (url, options = {}) => {
  const tauriInvoke = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (tauriInvoke && !options.forceBrowser) {
    try {
      const response = await tauriInvoke('native_http_get', { url });
      return JSON.parse(response);
    } catch (e) {
      console.warn('Tauri native_http_get failed, falling back to fetch', e);
    }
  }
  const res = await fetch(url, options);
  return res.json();
};

const jsonp = (url) => new Promise((resolve, reject) => {
  const callbackName = `jsonp_callback_${Math.round(100000 * Math.random())}`;
  const script = document.createElement('script');

  window[callbackName] = (data) => {
    delete window[callbackName];
    script.remove();
    resolve(data);
  };

  script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${callbackName}`;
  script.onerror = () => {
    delete window[callbackName];
    script.remove();
    reject(new Error('JSONP Request failed'));
  };

  document.body.appendChild(script);
});

const saveConfigVal = (listRef, val, storageKey) => {
  if (!val) return;
  if (!listRef.value.includes(val)) {
    listRef.value.push(val);
  } else {
    listRef.value = [val, ...listRef.value.filter((item) => item !== val)];
  }
  localStorage.setItem(storageKey, JSON.stringify(listRef.value));
};

const loadConfigList = (storageKey) => {
  try {
    const data = localStorage.getItem(storageKey);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to parse config from localStorage:', storageKey, error);
    return [];
  }
};

const parseCoords = (str) => {
  const match = String(str || '').trim().match(/^([-\d.]+)[,\s]+([-\d.]+)$/);
  if (!match) return null;
  return { lng: Number.parseFloat(match[1]), lat: Number.parseFloat(match[2]) };
};

const stripHtml = (value) => String(value || '').replace(/<[^>]+>/g, '');

const decodeGooglePolyline = (encoded) => {
  if (!encoded) return [];
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
};

const transformLat = (lng, lat) => {
  let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(lat * Math.PI) + 40.0 * Math.sin(lat / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(lat / 12.0 * Math.PI) + 320 * Math.sin(lat * Math.PI / 30.0)) * 2.0 / 3.0;
  return ret;
};

const transformLng = (lng, lat) => {
  let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
  ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(lng * Math.PI) + 40.0 * Math.sin(lng / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(lng / 12.0 * Math.PI) + 300.0 * Math.sin(lng / 30.0 * Math.PI)) * 2.0 / 3.0;
  return ret;
};

const isOutOfChina = (lng, lat) =>
  lng < CHINA_LNG_RANGE[0] || lng > CHINA_LNG_RANGE[1] || lat < CHINA_LAT_RANGE[0] || lat > CHINA_LAT_RANGE[1];

const wgs84ToGcj02 = (lng, lat) => {
  if (isOutOfChina(lng, lat)) return { lng, lat };

  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - EARTH_ECCENTRICITY * magic * magic;
  const sqrtMagic = Math.sqrt(magic);

  dLat = (dLat * 180.0) / (((EARTH_AXIS * (1 - EARTH_ECCENTRICITY)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180.0) / ((EARTH_AXIS / sqrtMagic) * Math.cos(radLat) * Math.PI);

  return {
    lng: lng + dLng,
    lat: lat + dLat
  };
};

const gcj02ToWgs84 = (lng, lat) => {
  if (isOutOfChina(lng, lat)) return { lng, lat };
  const converted = wgs84ToGcj02(lng, lat);
  return {
    lng: lng * 2 - converted.lng,
    lat: lat * 2 - converted.lat
  };
};

const gcj02ToBd09 = (lng, lat) => {
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin((lat * Math.PI * 3000.0) / 180.0);
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos((lng * Math.PI * 3000.0) / 180.0);
  return {
    lng: z * Math.cos(theta) + 0.0065,
    lat: z * Math.sin(theta) + 0.006
  };
};

const bd09ToGcj02 = (lng, lat) => {
  const x = lng - 0.0065;
  const y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin((y * Math.PI * 3000.0) / 180.0);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos((x * Math.PI * 3000.0) / 180.0);
  return {
    lng: z * Math.cos(theta),
    lat: z * Math.sin(theta)
  };
};

const wgs84ToBd09 = (lng, lat) => {
  if (isOutOfChina(lng, lat)) return { lng, lat };
  const gcj = wgs84ToGcj02(lng, lat);
  return gcj02ToBd09(gcj.lng, gcj.lat);
};

const bd09ToWgs84 = (lng, lat) => {
  if (isOutOfChina(lng, lat)) return { lng, lat };
  const gcj = bd09ToGcj02(lng, lat);
  return gcj02ToWgs84(gcj.lng, gcj.lat);
};

const calculateDistance = (lng1, lat1, lng2, lat2) => {
  const toRad = p => (p * Math.PI) / 180;
  const R = 6371e3;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lng2 - lng1);

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const normalizeGoogleCoordSource = (sourceType = 'auto', lng, lat) => {
  if (sourceType === 'gcj02' || sourceType === 'wgs84') return sourceType;
  return isOutOfChina(Number(lng), Number(lat)) ? 'wgs84' : 'gcj02';
};

const googleToBaiduCoords = (lng, lat, sourceType = 'auto') => {
  const finalLng = Number(lng);
  const finalLat = Number(lat);
  const normalizedSource = normalizeGoogleCoordSource(sourceType, finalLng, finalLat);
  return normalizedSource === 'gcj02'
    ? gcj02ToBd09(finalLng, finalLat)
    : wgs84ToBd09(finalLng, finalLat);
};

const baiduToGoogleCoords = (lng, lat, targetType = 'auto') => {
  const finalLng = Number(lng);
  const finalLat = Number(lat);
  const normalizedTarget = normalizeGoogleCoordSource(targetType, finalLng, finalLat);
  return normalizedTarget === 'gcj02'
    ? bd09ToGcj02(finalLng, finalLat)
    : bd09ToWgs84(finalLng, finalLat);
};

const buildBaiduPointData = (title, address, lng, lat, raw = null) => {
  const coords = googleToBaiduCoords(lng, lat);
  return {
    title: title || 'Unnamed',
    address: `${address || 'Unknown'} [${coords.lng.toFixed(6)},${coords.lat.toFixed(6)}]`,
    location: coords,
    raw
  };
};

const getTravelModeIcon = (mode) => {
  const m = String(mode || '').toLowerCase();
  if (m === 'transit') return '🚌';
  if (m === 'walking') return '🚶';
  if (m.includes('rid') || m.includes('bicycl')) return '🚲';
  return '🚗';
};

export const MapUtils = {
  getTravelModeIcon,
  highlightJson,
  copyJson,
  fetchData,
  formatDistance,
  formatDuration,
  jsonp,
  saveConfigVal,
  loadConfigList,
  parseCoords,
  stripHtml,
  decodeGooglePolyline,
  wgs84ToGcj02,
  gcj02ToWgs84,
  gcj02ToBd09,
  bd09ToGcj02,
  wgs84ToBd09,
  bd09ToWgs84,
  normalizeGoogleCoordSource,
  googleToBaiduCoords,
  baiduToGoogleCoords,
  buildBaiduPointData,
  calculateDistance
};

if (typeof window !== 'undefined') {
  window.MapUtils = MapUtils;
}
