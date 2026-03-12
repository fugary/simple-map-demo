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

  return {
    highlightJson,
    copyJson,
    formatDistance,
    formatDuration,
    jsonp,
    saveConfigVal,
    loadConfigList,
    parseCoords
  };

})();
