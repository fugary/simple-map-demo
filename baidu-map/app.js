/* global fetch, URLSearchParams */
import { createApp, ref, onMounted, reactive, markRaw, computed, watch } from 'vue';
import ElementPlus, { ElMessage } from 'element-plus';
import 'element-plus/dist/index.css';
import { MapUtils } from '../shared/utils.js';
import {
  DEFAULT_GOOGLE_PROXY_BASE,
  getStoredGoogleConfig,
  googleGeocode,
  googleNearbySearch,
  googleTextSearch
} from '../shared/google-provider.js';
import '../shared/i18n.js';
import './route-drawer.js';

if (typeof window !== 'undefined') {
  window.ElementPlus = ElementPlus;
}

const app = createApp({
  setup() {
    const currentLang = ref(window.AppI18n ? window.AppI18n.getLang() : 'zh');
    const t = (key, fallback, params) => {
      // Access currentLang.value to trigger Vue reactivity tracking
      currentLang.value; 
      return window.AppI18n ? window.AppI18n.t(key, fallback, params) : (fallback || key);
    };

    watch(currentLang, (newLang) => {
      if (window.AppI18n && window.AppI18n.getLang() !== newLang) {
        window.AppI18n.setLang(newLang, { reload: false });
      }
    });

    window.addEventListener('app-language-change', (e) => {
      const newLang = e.detail.lang;
      if (currentLang.value !== newLang) {
        currentLang.value = newLang;
      }
    });

    const mapLanguage = () => (window.AppI18n && window.AppI18n.getLang() === 'en' ? 'en' : 'zh-CN');
    const BAIDU_SCRIPT_ID = 'simple-map-demo-baidu-sdk';

    const browserAkList = ref([]);
    const browserAk = ref('');
    const serverAkList = ref([]);
    const serverAk = ref('');
    const regionList = ref([]);
    const globalRegion = ref('New York');
    const mapReady = ref(false);
    const activeTab = ref('config');
    const mapScope = ref('domestic');
    const hasGoogleRouteProvider = ref(false);
    const hasGooglePlaceProvider = ref(false);

    let mapInstance = null;

    const mapLoading = ref(false);
    const searchLoading = ref(false);
    const routeLoading = ref(false);
    const locateLoading = ref(false);

    const searchForm = reactive({
      apiMode: 'webgl',
      keyword: 'Empire State Building',
      count: 10
    });
    const searchResults = ref([]);
    const serverSearchRawData = ref(null);
    const searchResultTab = ref('list');

    const locateForm = reactive({
      apiMode: 'webgl',
      input: '',
      resolvedCoords: '',
      nearbyKeyword: '',
      radius: 2000,
      count: 20
    });
    const nearbyResults = ref([]);
    const nearbyRawData = ref(null);
    const locateResultTab = ref('list');

    const routeForm = reactive({
      apiMode: 'webgl',
      travelMode: 'driving',
      start: 'Times Square',
      end: 'Empire State Building',
      startCoords: '',
      endCoords: ''
    });
    const routeResults = ref(null);
    const routeDetailInfo = ref(null);
    const routeResultTab = ref('list');

    const searchJsonHtml = computed(() => (
      serverSearchRawData.value
        ? MapUtils.highlightJson(JSON.stringify(serverSearchRawData.value, null, 2))
        : ''
    ));
    const routeJsonHtml = computed(() => {
      const raw = routeResults.value && routeResults.value.raw ? routeResults.value.raw : routeResults.value;
      return raw ? MapUtils.highlightJson(JSON.stringify(raw, null, 2)) : '';
    });
    const nearbyJsonHtml = computed(() => (
      nearbyRawData.value
        ? MapUtils.highlightJson(JSON.stringify(nearbyRawData.value, null, 2))
        : ''
    ));

    const getGoogleConfig = () => {
      const config = getStoredGoogleConfig();
      if (!config.apiKey) return null;
      return {
        apiKey: config.apiKey,
        region: config.region || '',
        proxyBaseUrl: config.proxyBaseUrl || DEFAULT_GOOGLE_PROXY_BASE
      };
    };

    const initConfig = () => {
      browserAkList.value = MapUtils.loadConfigList('baidu_map_browser_aks');
      if (browserAkList.value.length > 0) browserAk.value = browserAkList.value[0];

      serverAkList.value = MapUtils.loadConfigList('baidu_map_server_aks');
      if (serverAkList.value.length > 0) serverAk.value = serverAkList.value[0];

      regionList.value = MapUtils.loadConfigList('baidu_map_regions');
      if (regionList.value.length > 0) globalRegion.value = regionList.value[0];

      const googleConfig = getGoogleConfig();
      hasGoogleRouteProvider.value = Boolean(googleConfig);
      hasGooglePlaceProvider.value = Boolean(googleConfig);
    };

    const destroyMapInstance = () => {
      mapInstance = null;
      mapReady.value = false;
      const container = document.getElementById('map-container');
      if (container) container.innerHTML = '';
    };

    const unloadBaiduSdk = () => {
      destroyMapInstance();
      const script = document.getElementById(BAIDU_SCRIPT_ID);
      if (script) script.remove();
      delete window.initBaiduMapCallback;
      delete window.BMapGL;
      delete window.BMapGLLib;
      delete window.__simpleMapBaiduLang;
    };

    const clearDrawings = () => {
      if (!mapInstance) return;
      mapInstance.clearOverlays();
      if (window.BaiduRouteDrawer) window.BaiduRouteDrawer.clearRoute(mapInstance);
    };

    const isInChina = (lng, lat) => lng >= 73.5 && lng <= 135.1 && lat >= 3.8 && lat <= 53.6;

    const buildPointItem = (title, address, lng, lat, raw = null) => ({
      title: title || 'Unnamed',
      address: `${address || 'Unknown'} [${Number(lng).toFixed(6)},${Number(lat).toFixed(6)}]`,
      point: markRaw(new window.BMapGL.Point(Number(lng), Number(lat))),
      raw: raw ? markRaw(raw) : null
    });

    const formatGoogleDisplayAddress = ({ originalAddress, baiduAddress, googleLocation, baiduLocation }) => {
      const lines = [originalAddress || 'Unknown'];
      if (baiduAddress) lines.push(`百度地址: ${baiduAddress}`);
      if (googleLocation) {
        lines.push(`Google 坐标: ${Number(googleLocation.lng).toFixed(6)},${Number(googleLocation.lat).toFixed(6)}`);
      }
      if (baiduLocation) {
        lines.push(`百度坐标: ${Number(baiduLocation.lng).toFixed(6)},${Number(baiduLocation.lat).toFixed(6)}`);
      }
      return lines.join(' | ');
    };

    const formatGoogleCoordCompare = ({ googleLocation, baiduLocation }) => {
      const parts = [];
      if (googleLocation) {
        parts.push(`G: ${Number(googleLocation.lng).toFixed(6)},${Number(googleLocation.lat).toFixed(6)}`);
      }
      if (baiduLocation) {
        parts.push(`B: ${Number(baiduLocation.lng).toFixed(6)},${Number(baiduLocation.lat).toFixed(6)}`);
      }
      return parts.join(' | ');
    };

    const buildGooglePointItem = (item) => {
      if (!item || !item.location) return null;
      const coords = MapUtils.googleToBaiduCoords(item.location.lng, item.location.lat);
      return {
        title: item.title || 'Unnamed',
        address: formatGoogleDisplayAddress({
          originalAddress: item.address,
          googleLocation: item.location,
          baiduLocation: coords
        }),
        coordCompare: formatGoogleCoordCompare({
          googleLocation: item.location,
          baiduLocation: coords
        }),
        originalAddress: item.address || 'Unknown',
        baiduAddress: '',
        googleLocation: item.location,
        point: markRaw(new window.BMapGL.Point(Number(coords.lng), Number(coords.lat))),
        raw: item.raw ? markRaw(item.raw) : item.raw
      };
    };

    const reverseGeocodeBaidu = (point) => new Promise((resolve) => {
      if (!window.BMapGL || !window.BMapGL.Geocoder) {
        resolve(null);
        return;
      }
      const geocoder = new window.BMapGL.Geocoder();
      geocoder.getLocation(point, (rs) => {
        if (rs && rs.address) {
          resolve(rs.address);
        } else {
          resolve(null);
        }
      });
    });

    const enrichWithBaiduAddress = async (items) => {
      await Promise.all(items.map(async (item) => {
        if (item && item.point) {
          try {
            const baiduAddr = await reverseGeocodeBaidu(item.point);
            if (baiduAddr) {
              item.baiduAddress = baiduAddr;
              item.address = formatGoogleDisplayAddress({
                originalAddress: item.originalAddress,
                baiduAddress: baiduAddr,
                googleLocation: item.googleLocation,
                baiduLocation: item.point
              });
              item.coordCompare = formatGoogleCoordCompare({
                googleLocation: item.googleLocation,
                baiduLocation: item.point
              });
            }
          } catch {
            // ignore
          }
        }
      }));
    };

    const renderNearbyItems = (centerPoint, items) => {
      if (!mapInstance) return;
      clearDrawings();
      const points = [];
      if (centerPoint) {
        mapInstance.addOverlay(new window.BMapGL.Marker(centerPoint));
        points.push(centerPoint);
      }
      items.forEach((item) => {
        if (!item.point) return;
        mapInstance.addOverlay(new window.BMapGL.Marker(item.point));
        points.push(item.point);
      });
      if (points.length > 0) {
        mapInstance.setViewport(points, { margins: [50, 50, 50, 50] });
      }
    };

    const autoDetectMapScope = (region) => {
      if (!region || region === '全国') {
        mapScope.value = 'domestic';
        return;
      }
      const local = new window.BMapGL.LocalSearch(mapInstance, {
        onSearchComplete: (results) => {
          if (local.getStatus() === window.BMAP_STATUS_SUCCESS && results.getCurrentNumPois() > 0) {
            const poi = results.getPoi(0);
            if (poi && poi.point) {
              mapScope.value = isInChina(poi.point.lng, poi.point.lat) ? 'domestic' : 'international';
            }
          }
        },
        pageCapacity: 1
      });
      local.search(region);
    };

    const loadBaiduMap = () => {
      if (!browserAk.value && !serverAk.value) {
        ElMessage.warning('至少配置一个 AK 才能继续');
        return;
      }

      mapLoading.value = true;
      MapUtils.saveConfigVal(browserAkList, browserAk.value, 'baidu_map_browser_aks');
      MapUtils.saveConfigVal(serverAkList, serverAk.value, 'baidu_map_server_aks');
      MapUtils.saveConfigVal(regionList, globalRegion.value, 'baidu_map_regions');

      if (!browserAk.value) {
        mapReady.value = true;
        mapLoading.value = false;
        return;
      }

      const desiredLang = mapLanguage();
      if (window.BMapGL && window.__simpleMapBaiduLang !== desiredLang) unloadBaiduSdk();
      if (window.BMapGL) {
        window.__simpleMapBaiduLang = desiredLang;
        destroyMapInstance();
        initMap();
        return;
      }

      window.initBaiduMapCallback = () => {
        window.__simpleMapBaiduLang = desiredLang;
        initMap();
      };

      const script = document.createElement('script');
      script.id = BAIDU_SCRIPT_ID;
      script.src = `https://api.map.baidu.com/api?v=1.0&type=webgl&ak=${browserAk.value}&language=${desiredLang}&callback=initBaiduMapCallback&_=${Date.now()}`;
      script.onerror = () => {
        mapLoading.value = false;
        ElMessage.error('百度地图引擎加载失败，请检查 AK 或网络');
      };
      document.body.appendChild(script);
    };

    const fallbackServerGeo = (address, resolve) => {
      if (!serverAk.value) return resolve(null);
      const city = globalRegion.value && globalRegion.value !== '全国' ? globalRegion.value : '';
      MapUtils.jsonp(`https://api.map.baidu.com/geocoding/v3/?address=${encodeURIComponent(address)}&city=${encodeURIComponent(city)}&output=json&ak=${serverAk.value}`)
        .then((res) => {
          resolve(res && res.status === 0 && res.result
            ? { lng: res.result.location.lng, lat: res.result.location.lat }
            : null);
        })
        .catch(() => resolve(null));
    };

    const localSearchGeo = (keyword) => new Promise((resolve) => {
      if (!mapInstance) return resolve(null);
      const local = new window.BMapGL.LocalSearch(mapInstance, {
        onSearchComplete: (results) => {
          if (local.getStatus() === window.BMAP_STATUS_SUCCESS && results.getCurrentNumPois() > 0) {
            const poi = results.getPoi(0);
            resolve(poi && poi.point ? { lng: poi.point.lng, lat: poi.point.lat } : null);
          } else {
            resolve(null);
          }
        },
        pageCapacity: 1
      });
      if (globalRegion.value && globalRegion.value !== '全国') local.setLocation(globalRegion.value);
      local.search(keyword);
    });

    const getCoords = (addressOrCoords) => new Promise((resolve) => {
      const parsed = MapUtils.parseCoords(addressOrCoords);
      if (parsed) return resolve(parsed);

      const value = String(addressOrCoords || '').trim();
      if (!value) return resolve(null);

      if (mapInstance) {
        localSearchGeo(value).then((result) => {
          if (result) resolve(result);
          else fallbackServerGeo(value, resolve);
        });
      } else {
        fallbackServerGeo(value, resolve);
      }
    });

    const resolveGoogleCoordsRaw = async (addressOrCoords) => {
      const parsed = MapUtils.parseCoords(addressOrCoords);
      if (parsed) return parsed;

      const value = String(addressOrCoords || '').trim();
      if (!value) return null;

      const config = getGoogleConfig();
      if (!config) return null;

      const result = await googleGeocode({ address: value, config });
      if (!result.location) return null;
      return result.location;
    };

    const resolveGoogleCoords = async (addressOrCoords) => {
      const parsed = MapUtils.parseCoords(addressOrCoords);
      if (parsed) return parsed;

      const value = String(addressOrCoords || '').trim();
      if (!value) return null;

      const config = getGoogleConfig();
      if (!config) return null;

      const result = await googleGeocode({ address: value, config });
      if (!result.location) return null;
      return MapUtils.googleToBaiduCoords(result.location.lng, result.location.lat);
    };

    const getCoordsByMode = async (addressOrCoords, apiMode) => {
      if (apiMode !== 'google') {
        return getCoords(addressOrCoords);
      }

      try {
        const googleResult = await resolveGoogleCoords(addressOrCoords);
        if (googleResult) return googleResult;
      } catch (error) {
        console.warn('Google geocode failed, fallback to Baidu:', error);
      }

      return getCoords(addressOrCoords);
    };

    const initMap = async () => {
      try {
        destroyMapInstance();

        mapInstance = markRaw(new window.BMapGL.Map('map-container', {
          displayOptions: { language: mapLanguage() === 'en' ? 'en' : 'zh' }
        }));

        let center = new window.BMapGL.Point(116.404, 39.915);
        let zoom = 12;

        // Initialize map with a temporary center so LocalSearch has a valid map state to operate on
        mapInstance.centerAndZoom(center, 5);

        const region = String(globalRegion.value || '').trim();
        if (region && region !== '全国') {
          let point = await localSearchGeo(region);
          if (!point) point = await getCoords(region);
          
          if (!point) {
            // Fallback to Google if Baidu fails (for overseas locations)
            try {
              point = await resolveGoogleCoords(region);
            } catch (err) {
              console.warn('Fallback to Google geocode failed for region:', err);
            }
          }

          if (point) {
            center = new window.BMapGL.Point(point.lng, point.lat);
          }
        } else {
          zoom = 5;
        }

        mapInstance.centerAndZoom(center, zoom);
        mapInstance.enableScrollWheelZoom(true);
        mapInstance.addControl(new window.BMapGL.ScaleControl());
        mapInstance.addControl(new window.BMapGL.ZoomControl());

        mapReady.value = true;
        mapLoading.value = false;
        autoDetectMapScope(region);
      } catch (error) {
        console.error(error);
        mapLoading.value = false;
        ElMessage.error('地图初始化失败，请检查 AK 是否合法');
      }
    };

    const doSearch = async () => {
      if (!searchForm.keyword) return;

      searchLoading.value = true;
      searchResults.value = [];
      serverSearchRawData.value = null;

      try {
        if (searchForm.apiMode === 'google') {
          const config = getGoogleConfig();
          if (!config) {
            ElMessage.warning('请先配置 Google Maps API Key');
            return;
          }

          const targetRegion = globalRegion.value === '全国' ? '' : globalRegion.value;
          let finalQuery = searchForm.keyword;
          if (targetRegion && !finalQuery.includes(targetRegion)) {
            finalQuery = `${finalQuery} ${targetRegion}`;
          }

          const result = await googleTextSearch({
            query: finalQuery,
            count: searchForm.count,
            config
          });
          serverSearchRawData.value = result.raw;
          if (result.raw && result.raw.status !== 'OK' && result.raw.status !== 'ZERO_RESULTS') {
            throw new Error(result.raw.status || 'Unknown');
          }
          const items = result.items.map(buildGooglePointItem).filter(Boolean);
          await enrichWithBaiduAddress(items);
          searchResults.value = items;
          return;
        }

        if (searchForm.apiMode === 'server') {
          if (!serverAk.value) {
            ElMessage.warning('请先配置服务端 AK');
            return;
          }

          const apiPath = mapScope.value === 'international' ? 'place_abroad/v1/search' : 'place/v2/search';
          const res = await MapUtils.jsonp(
            `https://api.map.baidu.com/${apiPath}?query=${encodeURIComponent(searchForm.keyword)}&region=${encodeURIComponent(globalRegion.value || '全国')}&output=json&ak=${serverAk.value}`
          );
          serverSearchRawData.value = res;
          searchResults.value = res && res.status === 0
            ? (res.results || []).map((item) => buildPointItem(item.name, item.address, item.location.lng, item.location.lat, item))
            : [];
          return;
        }

        if (!mapInstance) return;

        clearDrawings();
        const local = new window.BMapGL.LocalSearch(mapInstance, {
          onSearchComplete: (results) => {
            if (local.getStatus() === window.BMAP_STATUS_SUCCESS) {
              searchResults.value = [];
              for (let i = 0; i < results.getCurrentNumPois(); i += 1) {
                const poi = results.getPoi(i);
                if (!poi) continue;
                searchResults.value.push({
                  title: poi.title || 'Unnamed',
                  address: `${poi.address || 'Unknown'} [${poi.point ? `${poi.point.lng.toFixed(6)},${poi.point.lat.toFixed(6)}` : ''}]`,
                  point: poi.point ? markRaw(poi.point) : null,
                  raw: poi ? markRaw(poi) : null
                });
              }
            } else {
              searchResults.value = [];
            }
          },
          pageCapacity: searchForm.count || 10
        });
        if (globalRegion.value && globalRegion.value !== '全国') local.setLocation(globalRegion.value);
        local.search(searchForm.keyword);
      } catch (error) {
        console.error(error);
        searchResults.value = [];
        serverSearchRawData.value = null;
        ElMessage.error(`地点搜索失败: ${error.message}`);
      } finally {
        searchLoading.value = false;
      }
    };

    const viewOnMap = (item) => {
      if (!mapInstance || !item || !item.point) return;

      clearDrawings();
      mapInstance.addOverlay(new window.BMapGL.Marker(item.point));
      mapInstance.panTo(item.point);

      const popup = new window.BMapGL.InfoWindow(`地址: ${item.address || ''}`, {
        title: item.title,
        width: 250,
        height: 80
      });
      mapInstance.openInfoWindow(popup, item.point);
    };

    const quickSearch = (keyword) => {
      if (!mapInstance) return;
      activeTab.value = 'search';
      searchForm.keyword = keyword;
      if (!globalRegion.value) globalRegion.value = 'New York';
      doSearch();
    };

    const nearbyByFrontend = (centerPoint) => new Promise((resolve) => {
      const local = new window.BMapGL.LocalSearch(mapInstance, {
        onSearchComplete: (results) => {
          const items = [];
          if (local.getStatus() === window.BMAP_STATUS_SUCCESS) {
            for (let i = 0; i < results.getCurrentNumPois(); i += 1) {
              const poi = results.getPoi(i);
              if (!poi) continue;
              items.push({
                title: poi.title || 'Unnamed',
                address: `${poi.address || 'Unknown'} [${poi.point ? `${poi.point.lng.toFixed(6)},${poi.point.lat.toFixed(6)}` : ''}]`,
                point: poi.point ? markRaw(poi.point) : null,
                raw: poi ? markRaw(poi) : null
              });
            }
          }
          resolve(items);
        },
        pageCapacity: locateForm.count || 20
      });
      local.searchNearby(locateForm.nearbyKeyword, centerPoint, locateForm.radius || 2000);
    });

    const nearbyByGoogle = async (googleCenter) => {
      const config = getGoogleConfig();
      if (!config) {
        throw new Error('Google API Key is missing');
      }

      const result = await googleNearbySearch({
        location: { lat: googleCenter.lat, lng: googleCenter.lng },
        keyword: locateForm.nearbyKeyword,
        radius: locateForm.radius || 2000,
        count: locateForm.count || 20,
        config
      });

      return {
        raw: result.raw,
        items: result.items.map(buildGooglePointItem).filter(Boolean)
      };
    };

    const locateInput = async () => {
      if (!mapInstance) return;

      const input = locateForm.input.trim();
      if (!input) return;

      locateLoading.value = true;
      nearbyResults.value = [];
      nearbyRawData.value = null;

      try {
        let centerPoint = null;
        let originalGoogleCenter = null;

        if (locateForm.apiMode === 'google') {
          const parsed = MapUtils.parseCoords(input);
          if (parsed) {
            originalGoogleCenter = parsed;
          } else {
            const config = getGoogleConfig();
            const geoRes = await googleGeocode({ address: input, config });
            if (geoRes && geoRes.location) {
              originalGoogleCenter = geoRes.location;
            }
          }
          if (!originalGoogleCenter) {
            locateForm.resolvedCoords = '';
            ElMessage.warning('Google中心点解析失败');
            return;
          }
          const bdCoords = MapUtils.googleToBaiduCoords(originalGoogleCenter.lng, originalGoogleCenter.lat);
          centerPoint = new window.BMapGL.Point(bdCoords.lng, bdCoords.lat);
          locateForm.resolvedCoords = `${bdCoords.lng.toFixed(6)}, ${bdCoords.lat.toFixed(6)}`;
        } else {
          const center = await getCoordsByMode(input, locateForm.apiMode);
          if (!center) {
            locateForm.resolvedCoords = '';
            ElMessage.warning('中心点解析失败');
            return;
          }
          centerPoint = new window.BMapGL.Point(center.lng, center.lat);
          locateForm.resolvedCoords = `${center.lng.toFixed(6)}, ${center.lat.toFixed(6)}`;
        }

        if (!locateForm.nearbyKeyword.trim()) {
          renderNearbyItems(centerPoint, []);
          return;
        }

        if (locateForm.apiMode === 'google') {
          const result = await nearbyByGoogle(originalGoogleCenter);
          nearbyRawData.value = result.raw;
          if (result.raw && result.raw.status !== 'OK' && result.raw.status !== 'ZERO_RESULTS') {
            throw new Error(result.raw.status || 'Unknown');
          }
          await enrichWithBaiduAddress(result.items);
          nearbyResults.value = result.items;
        } else if (locateForm.apiMode === 'server') {
          if (!serverAk.value) {
            ElMessage.warning('附近搜索需要先配置服务端 AK');
            return;
          }

          const apiPath = mapScope.value === 'international' ? 'place_abroad/v1/search' : 'place/v2/search';
          const res = await MapUtils.jsonp(
            `https://api.map.baidu.com/${apiPath}?query=${encodeURIComponent(locateForm.nearbyKeyword)}&location=${centerPoint.lat},${centerPoint.lng}&radius=${locateForm.radius || 2000}&output=json&ak=${serverAk.value}`
          );
          nearbyRawData.value = res;
          nearbyResults.value = res && res.status === 0
            ? (res.results || []).map((item) => buildPointItem(item.name, item.address, item.location.lng, item.location.lat, item))
            : [];
        } else {
          nearbyResults.value = await nearbyByFrontend(centerPoint);
        }

        renderNearbyItems(centerPoint, nearbyResults.value);
      } catch (error) {
        console.error(error);
        locateForm.resolvedCoords = '';
        nearbyResults.value = [];
        nearbyRawData.value = null;
        ElMessage.error(`附近搜索失败: ${error.message}`);
      } finally {
        locateLoading.value = false;
      }
    };

    const parseBaiduRouteDetail = (res, mode) => {
      if (!res || res.status !== 0 || !res.result || !res.result.routes) return null;

      return res.result.routes.map((route, idx) => ({
        index: idx + 1,
        distance: MapUtils.formatDistance(route.distance),
        duration: MapUtils.formatDuration(route.duration),
        steps: mode === 'transit'
          ? (route.steps || []).flatMap((group, groupIndex) => (
            (Array.isArray(group) ? group : [group]).map((segment, segmentIndex) => ({
              index: groupIndex * 10 + segmentIndex + 1,
              instruction: segment.vehicle && segment.vehicle.name
                ? `乘坐 ${segment.vehicle.name}`
                : MapUtils.stripHtml(segment.instruction || '步行'),
              distance: segment.distance ? MapUtils.formatDistance(segment.distance) : '',
              duration: segment.duration ? MapUtils.formatDuration(segment.duration) : '',
              vehicleName: segment.vehicle && segment.vehicle.name ? segment.vehicle.name : ''
            }))
          ))
          : (route.steps || []).map((step, stepIndex) => ({
            index: stepIndex + 1,
            instruction: MapUtils.stripHtml(step.instruction || ''),
            distance: step.distance ? MapUtils.formatDistance(step.distance) : '',
            duration: step.duration ? MapUtils.formatDuration(step.duration) : ''
          }))
      }));
    };

    const parseGoogleDirectionsDetail = (res) => {
      if (!res || !Array.isArray(res.routes)) return null;

      return res.routes.map((route, idx) => {
        const leg = route.legs && route.legs[0];
        if (!leg) return null;

        return {
          index: idx + 1,
          distance: leg.distance ? leg.distance.text : 'Unknown',
          duration: leg.duration ? leg.duration.text : 'Unknown',
          steps: (leg.steps || []).map((step, stepIndex) => ({
            index: stepIndex + 1,
            instruction: MapUtils.stripHtml(step.html_instructions || ''),
            distance: step.distance ? step.distance.text : '',
            duration: step.duration ? step.duration.text : '',
            vehicleName: step.transit_details && step.transit_details.line
              ? (step.transit_details.line.short_name || step.transit_details.line.name || '')
              : ''
          }))
        };
      }).filter(Boolean);
    };

    const convertGoogleRouteToBaidu = (res) => ({
      status: 0,
      result: {
        routes: (res.routes || []).map((route) => {
          const leg = route.legs && route.legs[0];
          if (!leg) return null;

          if (routeForm.travelMode === 'transit') {
            return {
              distance: leg.distance ? leg.distance.value : 0,
              duration: leg.duration ? leg.duration.value : 0,
              steps: (leg.steps || []).map((step) => {
                const path = MapUtils.decodeGooglePolyline(step.polyline && step.polyline.points)
                  .map((point) => MapUtils.googleToBaiduCoords(point.lng, point.lat))
                  .map((point) => `${point.lng},${point.lat}`)
                  .join(';');
                const segment = {
                  path,
                  instruction: MapUtils.stripHtml(step.html_instructions || ''),
                  distance: step.distance ? step.distance.value : 0,
                  duration: step.duration ? step.duration.value : 0,
                  type: step.travel_mode === 'WALKING' ? 5 : 3
                };
                if (step.transit_details) {
                  segment.vehicle = {
                    name: step.transit_details.line
                      ? (step.transit_details.line.short_name || step.transit_details.line.name || '')
                      : '',
                    start_name: step.transit_details.departure_stop ? step.transit_details.departure_stop.name : '',
                    end_name: step.transit_details.arrival_stop ? step.transit_details.arrival_stop.name : '',
                    stop_num: step.transit_details.num_stops || 0
                  };
                }
                return [segment];
              })
            };
          }

          return {
            distance: leg.distance ? leg.distance.value : 0,
            duration: leg.duration ? leg.duration.value : 0,
            steps: (leg.steps || []).map((step) => ({
              path: MapUtils.decodeGooglePolyline(step.polyline && step.polyline.points)
                .map((point) => MapUtils.googleToBaiduCoords(point.lng, point.lat))
                .map((point) => `${point.lng},${point.lat}`)
                .join(';'),
              instruction: MapUtils.stripHtml(step.html_instructions || ''),
              distance: step.distance ? step.distance.value : 0,
              duration: step.duration ? step.duration.value : 0
            }))
          };
        }).filter(Boolean)
      }
    });

    const calcGoogleRouteForBaidu = async (origin, destination) => {
      const config = getGoogleConfig();
      if (!config) throw new Error('Google config missing');

      const modeMap = {
        driving: 'driving',
        transit: 'transit',
        walking: 'walking',
        riding: 'bicycling'
      };

      const url = `${String(config.proxyBaseUrl).replace(/\/+$/, '')}/directions/json?${new URLSearchParams({
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        mode: modeMap[routeForm.travelMode] || 'driving',
        alternatives: 'true',
        key: config.apiKey,
        language: mapLanguage()
      })}`;

      const raw = await fetch(url).then((response) => response.json());
      if (!(raw && raw.status === 'OK' && Array.isArray(raw.routes) && raw.routes.length > 0)) {
        throw new Error(raw.status || 'Unknown');
      }

      const converted = convertGoogleRouteToBaidu(raw);
      routeResults.value = { provider: 'google', raw, converted };
      routeDetailInfo.value = parseGoogleDirectionsDetail(raw);

      if (window.BaiduRouteDrawer) {
        window.BaiduRouteDrawer.drawServerRoute(mapInstance, converted, routeForm.travelMode, {
          startName: '起',
          endName: '终',
          showRouteEndpoints: true
        });
      }
    };

    const calcRoute = async () => {
      if (!routeForm.start || !routeForm.end) return;

      routeLoading.value = true;
      routeDetailInfo.value = null;
      routeResults.value = null;

      clearDrawings();

      if (routeForm.apiMode === 'google') {
        try {
          const originalOrigin = await resolveGoogleCoordsRaw(routeForm.start);
          const originalDestination = await resolveGoogleCoordsRaw(routeForm.end);
          if (!originalOrigin || !originalDestination) {
            routeLoading.value = false;
            ElMessage.error('无法解析 Google 路线起终点');
            return;
          }

          const originBaidu = MapUtils.googleToBaiduCoords(originalOrigin.lng, originalOrigin.lat);
          const destinationBaidu = MapUtils.googleToBaiduCoords(originalDestination.lng, originalDestination.lat);

          routeForm.startCoords = `G: ${originalOrigin.lng.toFixed(6)}, ${originalOrigin.lat.toFixed(6)} | B: ${originBaidu.lng.toFixed(6)}, ${originBaidu.lat.toFixed(6)}`;
          routeForm.endCoords = `G: ${originalDestination.lng.toFixed(6)}, ${originalDestination.lat.toFixed(6)} | B: ${destinationBaidu.lng.toFixed(6)}, ${destinationBaidu.lat.toFixed(6)}`;

          await calcGoogleRouteForBaidu(originalOrigin, originalDestination);
        } catch (error) {
          console.error(error);
          ElMessage.error(`Google 路线数据转换失败: ${error.message}`);
        } finally {
          routeLoading.value = false;
        }
        return;
      }

      const origin = await getCoords(routeForm.start);
      const destination = await getCoords(routeForm.end);
      if (!origin) {
        routeForm.startCoords = '解析失败';
        routeLoading.value = false;
        ElMessage.error(`无法解析起点地址: ${routeForm.start}`);
        return;
      }
      if (!destination) {
        routeForm.endCoords = '解析失败';
        routeLoading.value = false;
        ElMessage.error(`无法解析终点地址: ${routeForm.end}`);
        return;
      }

      routeForm.startCoords = MapUtils.parseCoords(routeForm.start)
        ? ''
        : `百度: ${origin.lng.toFixed(6)}, ${origin.lat.toFixed(6)}`;
      routeForm.endCoords = MapUtils.parseCoords(routeForm.end)
        ? ''
        : `百度: ${destination.lng.toFixed(6)}, ${destination.lat.toFixed(6)}`;

      if (routeForm.apiMode === 'server') {
        try {
          if (!serverAk.value) {
            routeLoading.value = false;
            ElMessage.warning('请先配置服务端 AK');
            return;
          }

          const base = mapScope.value === 'international' ? 'direction_abroad/v1' : 'directionlite/v1';
          const res = await MapUtils.jsonp(
            `https://api.map.baidu.com/${base}/${routeForm.travelMode}?output=json&ak=${serverAk.value}&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}`
          );
          routeResults.value = res;
          if (res && res.status === 0) {
            routeDetailInfo.value = parseBaiduRouteDetail(res, routeForm.travelMode);
            if (window.BaiduRouteDrawer) {
              window.BaiduRouteDrawer.drawServerRoute(mapInstance, res, routeForm.travelMode, {
                startName: '起',
                endName: '终',
                showRouteEndpoints: true
              });
            }
            ElMessage.success('路线规划成功');
          } else {
            routeDetailInfo.value = null;
            ElMessage.error(`路线规划失败: ${res.info || res.message || 'Unknown'}`);
          }
        } catch (error) {
          console.error(error);
          ElMessage.error(`路线规划失败: ${error.message}`);
        } finally {
          routeLoading.value = false;
        }
        return;
      }

      if (mapScope.value === 'international') {
        routeLoading.value = false;
        ElMessage.warning('百度 WebGL 前端引擎不支持国际路线规划，请切换为“服务端”或“Google”模式');
        if (window.BaiduRouteDrawer) {
          window.BaiduRouteDrawer.drawRouteEndpoints(mapInstance, origin, destination);
        }
        return;
      }

      let routeInstance = null;
      const opts = {
        renderOptions: { map: mapInstance, autoViewport: true },
        onSearchComplete: (result) => {
          routeLoading.value = false;
          try {
            if (!routeInstance || routeInstance.getStatus() !== window.BMAP_STATUS_SUCCESS) {
              routeDetailInfo.value = null;
              ElMessage.warning('未能找到有效路线');
              if (window.BaiduRouteDrawer) {
                window.BaiduRouteDrawer.drawRouteEndpoints(mapInstance, origin, destination);
              }
              return;
            }

            if (routeForm.travelMode === 'transit') {
              const detail = [];
              const count = result.getNumPlans ? result.getNumPlans() : 0;
              for (let i = 0; i < count && i < 5; i += 1) {
                const plan = result.getPlan(i);
                if (!plan) continue;
                detail.push({
                  index: i + 1,
                  distance: plan.getDistance ? MapUtils.formatDistance(plan.getDistance(false)) : 'Unknown',
                  duration: plan.getDuration ? MapUtils.formatDuration(plan.getDuration(false)) : 'Unknown',
                  steps: [{
                    index: 1,
                    instruction: MapUtils.stripHtml(plan.getDescription ? plan.getDescription() : ''),
                    distance: '',
                    duration: ''
                  }]
                });
              }
              routeDetailInfo.value = detail;
              ElMessage.success('路线规划成功');
              return;
            }

            const plan = result.getPlan ? result.getPlan(0) : null;
            if (!plan) {
              ElMessage.warning('未能找到有效路线');
              return;
            }

            const detail = {
              index: 1,
              distance: plan.getDistance ? MapUtils.formatDistance(plan.getDistance(false)) : 'Unknown',
              duration: plan.getDuration ? MapUtils.formatDuration(plan.getDuration(false)) : 'Unknown',
              steps: []
            };

            const routeCount = plan.getNumRoutes ? plan.getNumRoutes() : 1;
            for (let routeIndex = 0; routeIndex < routeCount; routeIndex += 1) {
              const routeObject = plan.getRoute ? plan.getRoute(routeIndex) : null;
              if (!routeObject || !routeObject.getNumSteps) continue;
              for (let stepIndex = 0; stepIndex < routeObject.getNumSteps(); stepIndex += 1) {
                const step = routeObject.getStep(stepIndex);
                detail.steps.push({
                  index: detail.steps.length + 1,
                  instruction: MapUtils.stripHtml(step.getDescription ? step.getDescription(true) : ''),
                  distance: step.getDistance ? MapUtils.formatDistance(step.getDistance(false)) : '',
                  duration: ''
                });
              }
            }
            routeDetailInfo.value = [detail];
            ElMessage.success('路线规划成功');
          } catch (error) {
            console.warn('提取 WebGL 路线详情失败:', error);
            ElMessage.error(`路线规划失败: ${error.message}`);
          }
        }
      };

      if (routeForm.travelMode === 'driving') routeInstance = new window.BMapGL.DrivingRoute(mapInstance, opts);
      if (routeForm.travelMode === 'transit') routeInstance = new window.BMapGL.TransitRoute(mapInstance, opts);
      if (routeForm.travelMode === 'walking') routeInstance = new window.BMapGL.WalkingRoute(mapInstance, opts);
      if (!routeInstance) {
        routeLoading.value = false;
        ElMessage.warning('当前出行方式暂不支持');
        return;
      }

      routeInstance.search(
        new window.BMapGL.Point(origin.lng, origin.lat),
        new window.BMapGL.Point(destination.lng, destination.lat)
      );
    };

    onMounted(() => {
      initConfig();
      window.addEventListener('app-language-change', () => {
        if (browserAk.value && (window.BMapGL || mapInstance)) loadBaiduMap();
      });
    });

    return {
      activeTab,
      browserAkList,
      browserAk,
      serverAkList,
      serverAk,
      regionList,
      globalRegion,
      mapReady,
      mapScope,
      hasGoogleRouteProvider,
      hasGooglePlaceProvider,
      mapLoading,
      searchLoading,
      routeLoading,
      locateLoading,
      loadBaiduMap,
      searchForm,
      searchResults,
      serverSearchRawData,
      searchResultTab,
      doSearch,
      viewOnMap,
      quickSearch,
      locateForm,
      nearbyResults,
      nearbyRawData,
      locateResultTab,
      locateInput,
      routeForm,
      routeResults,
      routeDetailInfo,
      routeResultTab,
      calcRoute,
      copyJson: MapUtils.copyJson,
      searchJsonHtml,
      routeJsonHtml,
      nearbyJsonHtml,
      t,
      currentLang
    };
  }
});

app.use(ElementPlus);
app.mount('#app');


