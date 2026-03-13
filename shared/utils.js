/**
 * MapUtils - 多地图服务商测试平台共用工具函数
 * 挂载到 window.MapUtils 供各地图页面调用
 */
window.MapUtils = (() => {

  /**
   * JSON 语法高亮
   * @param {string} jsonStr - JSON 字符串
   * @returns {string} 带有高亮 span 标签的 HTML
   */
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

  /**
   * 复制 JSON 数据到剪贴板
   * @param {*} data - 要复制的数据对象
   */
  const copyJson = async (data) => {
    try {
      const text = JSON.stringify(data, null, 2);
      await navigator.clipboard.writeText(text);
      ElementPlus.ElMessage.success('已复制到剪贴板');
    } catch {
      ElementPlus.ElMessage.error('复制失败，请手动复制');
    }
  };

  /**
   * 格式化距离（米）
   * @param {number} meters - 距离（米）
   * @returns {string} 格式化后的距离字符串
   */
  const formatDistance = (meters) => {
    if (meters == null) return '未知';
    if (meters >= 1000) {
      return (meters / 1000).toFixed(1) + ' 公里';
    }
    return Math.round(meters) + ' 米';
  };

  /**
   * 格式化时长（秒）
   * @param {number} seconds - 时长（秒）
   * @returns {string} 格式化后的时长字符串
   */
  const formatDuration = (seconds) => {
    if (seconds == null) return '未知';
    if (seconds < 60) return Math.round(seconds) + ' 秒';
    if (seconds < 3600) return Math.round(seconds / 60) + ' 分钟';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return hours + ' 小时 ' + mins + ' 分钟';
  };

  /**
   * JSONP 请求工具（用于规避 CORS 的服务端 API 调用）
   * @param {string} url - 请求 URL
   * @returns {Promise<*>}
   */
  const jsonp = (url) => {
    return new Promise((resolve, reject) => {
      const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
      window[callbackName] = function(data) {
        delete window[callbackName];
        document.body.removeChild(script);
        resolve(data);
      };
      const script = document.createElement('script');
      script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + callbackName;
      script.onerror = () => {
        delete window[callbackName];
        document.body.removeChild(script);
        reject(new Error('JSONP Request failed'));
      };
      document.body.appendChild(script);
    });
  };

  /**
   * 保存配置值到 localStorage（带去重 + 置顶）
   * @param {import('vue').Ref<string[]>} listRef - Vue ref 数组
   * @param {string} val - 要保存的值
   * @param {string} storageKey - localStorage 键名
   */
  const saveConfigVal = (listRef, val, storageKey) => {
    if (val && !listRef.value.includes(val)) {
      listRef.value.push(val);
    } else if (val) {
      listRef.value = [val, ...listRef.value.filter(i => i !== val)];
    }
    localStorage.setItem(storageKey, JSON.stringify(listRef.value));
  };

  /**
   * 从 localStorage 加载配置列表
   * @param {string} storageKey - localStorage 键名
   * @returns {string[]}
   */
  const loadConfigList = (storageKey) => {
    try {
      const data = localStorage.getItem(storageKey);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to parse config from localStorage:', storageKey, e);
      return [];
    }
  };

  /**
   * 解析坐标字符串 "lng,lat" 或 "lng lat"
   * @param {string} str - 输入字符串
   * @returns {{lng: number, lat: number}|null}
   */
  const parseCoords = (str) => {
    const match = (str || '').trim().match(/^([-\d.]+)[,\s]+([-\d.]+)$/);
    if (match) {
      return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
    }
    return null;
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
      const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += deltaLat;

      shift = 0;
      result = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
      lng += deltaLng;

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

  const isOutOfChina = (lng, lat) => lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;

  const wgs84ToGcj02 = (lng, lat) => {
    if (isOutOfChina(lng, lat)) {
      return { lng, lat };
    }
    const a = 6378245.0;
    const ee = 0.00669342162296594323;
    let dLat = transformLat(lng - 105.0, lat - 35.0);
    let dLng = transformLng(lng - 105.0, lat - 35.0);
    const radLat = lat / 180.0 * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
    return {
      lng: lng + dLng,
      lat: lat + dLat
    };
  };

  const gcj02ToBd09 = (lng, lat) => {
    const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * Math.PI * 3000.0 / 180.0);
    const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * Math.PI * 3000.0 / 180.0);
    return {
      lng: z * Math.cos(theta) + 0.0065,
      lat: z * Math.sin(theta) + 0.006
    };
  };

  const wgs84ToBd09 = (lng, lat) => {
    const gcj = wgs84ToGcj02(lng, lat);
    return gcj02ToBd09(gcj.lng, gcj.lat);
  };

  return {
    highlightJson,
    copyJson,
    formatDistance,
    formatDuration,
    jsonp,
    saveConfigVal,
    loadConfigList,
    parseCoords,
    stripHtml,
    decodeGooglePolyline,
    wgs84ToBd09
  };

})();
