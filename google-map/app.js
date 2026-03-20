import { createApp, ref, onMounted, reactive, markRaw, computed, watch } from 'vue';
import ElementPlus, { ElMessage } from 'element-plus';
import 'element-plus/dist/index.css';
import { MapUtils } from '../shared/utils.js';
import '../shared/i18n.js';

const DEFAULT_PROXY_BASE = 'https://mock-dev.citsgbt.com/mock/3471f5ba61824bfea6efb264d70e235d';
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
      if (apiKey.value && (window.google || mapReady.value)) loadGoogleMap();
    });

    const mapLanguage = () => {
      const lang = window.AppI18n && window.AppI18n.getLang();
      const result = lang === 'en' ? 'en' : 'zh-CN';
      console.log('[Google mapLanguage] AppI18n.getLang()=', lang, '=> mapLanguage=', result);
      return result;
    };
    const mapRegion = () =>
      window.AppI18n && window.AppI18n.getLang() === 'en' ? 'US' : 'CN';

    const apiKeyList = ref([]);
    const apiKey = ref('');
    const regionList = ref([]);
    const globalRegion = ref('New York');
    const proxyBaseUrl = ref(DEFAULT_PROXY_BASE);
    const mapReady = ref(false);
    const activeTab = ref('config');
    let mapInstance = null;
    let directionsRenderer = null;
    let searchMarkers = [];
    let nearbyMarkers = [];
    let routeMarkers = [];
    let routePolylines = [];
    let sharedInfoWindow = null;
    let nearbyCenterPoint = null;

    const searchLoading = ref(false);
    const routeLoading = ref(false);
    const locateLoading = ref(false);

    const searchForm = reactive({
      apiMode: 'frontend',
      keyword: 'Empire State Building',
      count: 10
    });
    const searchResults = ref([]);
    const serverSearchRawData = ref(null);
    const searchResultTab = ref('list');

    const locateForm = reactive({
      apiMode: 'frontend',
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
      apiMode: 'frontend',
      travelMode: 'DRIVING',
      start: 'Times Square',
      end: 'Empire State Building',
      startCoords: '',
      endCoords: ''
    });
    const routeDetailInfo = ref(null);
    const routeResults = ref(null);
    const routeResultTab = ref('list');

    const searchJsonHtml = computed(() => {
      if (!serverSearchRawData.value) return '';
      return MapUtils.highlightJson(JSON.stringify(serverSearchRawData.value, null, 2));
    });

    const routeJsonHtml = computed(() => {
      if (!routeResults.value) return '';
      return MapUtils.highlightJson(JSON.stringify(routeResults.value, null, 2));
    });

    const nearbyJsonHtml = computed(() => {
      if (!nearbyRawData.value) return '';
      return MapUtils.highlightJson(JSON.stringify(nearbyRawData.value, null, 2));
    });

    const initConfig = () => {
      apiKeyList.value = MapUtils.loadConfigList('google_map_api_keys');
      if (apiKeyList.value.length > 0) apiKey.value = apiKeyList.value[0];

      regionList.value = MapUtils.loadConfigList('google_map_regions');
      if (regionList.value.length > 0) globalRegion.value = regionList.value[0];

      const savedProxy = localStorage.getItem('google_map_proxy_base');
      if (savedProxy) {
        proxyBaseUrl.value = savedProxy;
      }
    };

    const proxyUrl = (path, params) => {
      const base = (proxyBaseUrl.value || DEFAULT_PROXY_BASE).replace(/\/+$/, '');
      const qs = new URLSearchParams(params).toString();
      return `${base}/${path}?${qs}`;
    };

    const normalizeLocation = (loc) => {
      if (!loc) return null;
      if (typeof loc.lat === 'function') {
        return { lat: loc.lat(), lng: loc.lng() };
      }
      return { lat: Number(loc.lat), lng: Number(loc.lng) };
    };

    const clearMarkers = (markers) => {
      markers.forEach((marker) => marker.setMap(null));
      markers.length = 0;
    };

    const clearSearchMarkers = () => clearMarkers(searchMarkers);
    const clearNearbyMarkers = () => {
      nearbyCenterPoint = null;
      clearMarkers(nearbyMarkers);
    };
    const clearRouteMarkers = () => clearMarkers(routeMarkers);

    const clearRenderedRoute = () => {
      if (directionsRenderer) {
        directionsRenderer.setMap(null);
        directionsRenderer = null;
      }
      routePolylines.forEach((polyline) => polyline.setMap(null));
      routePolylines = [];
      clearRouteMarkers();
    };

    const getInfoWindow = () => {
      if (!sharedInfoWindow) {
        sharedInfoWindow = new google.maps.InfoWindow();
      }
      return sharedInfoWindow;
    };

    const fitGoogleBounds = (points) => {
      if (!mapInstance || !points.length) return;
      const bounds = new google.maps.LatLngBounds();
      points.forEach((point) => bounds.extend(point));
      mapInstance.fitBounds(bounds);
    };

    const addMarker = (store, position, title, content) => {
      const marker = new google.maps.Marker({
        position,
        map: mapInstance,
        title
      });
      if (content) {
        marker.addListener('click', () => {
          const infoWindow = getInfoWindow();
          infoWindow.setContent(content);
          infoWindow.open(mapInstance, marker);
        });
      }
      store.push(marker);
      return marker;
    };

    const unloadGoogleSdk = () => {
      const existingRefs = document.querySelectorAll('script[src*="maps.googleapis.com"]');
      existingRefs.forEach(node => node.remove());
      delete window.google;
      delete window.initGoogleMapCallback;
      mapReady.value = false;
      mapInstance = null;
      clearSearchMarkers();
      clearNearbyMarkers();
      clearRouteMarkers();
      clearRenderedRoute();
      if (document.getElementById('map-container')) {
        document.getElementById('map-container').innerHTML = '';
      }
    };

    const loadGoogleMap = () => {
      if (!apiKey.value) {
        ElMessage.warning('请输入 Google Maps API Key');
        return;
      }

      MapUtils.saveConfigVal(apiKeyList, apiKey.value, 'google_map_api_keys');
      MapUtils.saveConfigVal(regionList, globalRegion.value, 'google_map_regions');
      localStorage.setItem('google_map_proxy_base', proxyBaseUrl.value);

      const desiredLang = mapLanguage();
      if (window.google && window.__simpleMapGoogleLang !== desiredLang) {
        unloadGoogleSdk();
      }

      if (window.google && window.google.maps) {
        window.__simpleMapGoogleLang = desiredLang;
        initMap();
        return;
      }

      window.initGoogleMapCallback = () => {
        window.__simpleMapGoogleLang = desiredLang;
        initMap();
      };

      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey.value}&libraries=places,geometry&language=${desiredLang}&region=${mapRegion()}&callback=initGoogleMapCallback`;
      script.onerror = () => {
        ElMessage.error('Google Maps 加载失败，请检查 API Key 或网络');
      };
      document.body.appendChild(script);
    };

    const initMap = async () => {
      try {
        let defaultCenter = { lat: 39.915, lng: 116.404 };
        if (globalRegion.value) {
          const pt = await resolveLocation(globalRegion.value, 'frontend');
          if (pt) {
            defaultCenter = pt;
          }
        }

        mapInstance = markRaw(new google.maps.Map(document.getElementById('map-container'), {
          center: defaultCenter,
          zoom: 11,
          mapTypeControl: true,
          streetViewControl: false
        }));

        mapReady.value = true;
        ElMessage.success('Google Maps 加载成功');
      } catch (error) {
        console.error('Map init error:', error);
        ElMessage.error('地图初始化失败，请检查 API Key 是否合法');
      }
    };

    const geocodeByFrontend = (address) => {
      return new Promise((resolve) => {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address }, (results, status) => {
          if (status === 'OK' && results[0]) {
            resolve(normalizeLocation(results[0].geometry.location));
          } else {
            resolve(null);
          }
        });
      });
    };

    const geocodeByServer = async (address) => {
      const res = await fetch(proxyUrl('geocode/json', {
        address,
        key: apiKey.value,
        language: mapLanguage()
      })).then((response) => response.json());
      if (res && res.status === 'OK' && Array.isArray(res.results) && res.results[0]) {
        return normalizeLocation(res.results[0].geometry.location);
      }
      return null;
    };

    const resolveLocation = async (input, mode = 'frontend') => {
      const parsed = MapUtils.parseCoords(input);
      if (parsed) {
        return { lat: parsed.lat, lng: parsed.lng };
      }

      const address = String(input || '').trim();
      if (!address) return null;

      if (mode === 'server') {
        try {
          const serverResult = await geocodeByServer(address);
          if (serverResult) return serverResult;
        } catch (error) {
          console.warn('Server geocode failed:', error);
        }
      }

      if (window.google && window.google.maps) {
        return geocodeByFrontend(address);
      }

      if (mode !== 'server') {
        try {
          return await geocodeByServer(address);
        } catch (error) {
          console.warn('Fallback server geocode failed:', error);
        }
      }

      return null;
    };

    const mapSearchResult = (result, isServer) => {
      const location = isServer
        ? normalizeLocation(result.geometry && result.geometry.location)
        : normalizeLocation(result.geometry && result.geometry.location);
      return {
        title: result.name || 'Unnamed',
        address: `${result.formatted_address || result.vicinity || 'Unknown'} [${location ? `${location.lng.toFixed(6)},${location.lat.toFixed(6)}` : ''}]`,
        location,
        placeId: result.place_id || '',
        raw: result
      };
    };

    const renderSearchResults = (items) => {
      if (!mapInstance) return;
      clearSearchMarkers();
      const points = [];
      items.forEach((item) => {
        if (!item.location) return;
        const marker = addMarker(
          searchMarkers,
          item.location,
          item.title,
          `<div style="font-size:13px;"><b>${item.title}</b><br/>${item.address || ''}</div>`
        );
        points.push(marker.getPosition());
      });
      if (points.length > 0) {
        fitGoogleBounds(points);
      }
    };

    const doSearch = async () => {
      if (!searchForm.keyword) {
        ElMessage.warning('请输入查询关键字');
        return;
      }

      searchLoading.value = true;

      if (searchForm.apiMode === 'server') {
        clearSearchMarkers();
        serverSearchRawData.value = null;
        try {
          const params = {
            query: searchForm.keyword,
            key: apiKey.value,
            language: mapLanguage()
          };
          if (globalRegion.value && globalRegion.value !== '全国' && !params.query.includes(globalRegion.value)) {
            params.query = `${params.query} ${globalRegion.value}`;
          }
          const res = await fetch(proxyUrl('place/textsearch/json', params)).then((response) => response.json());
          serverSearchRawData.value = res;
          if (res && res.status === 'OK' && Array.isArray(res.results)) {
            searchResults.value = res.results
              .slice(0, searchForm.count || 10)
              .map((item) => mapSearchResult(item, true));
            renderSearchResults(searchResults.value);
            ElMessage.success(`服务端 API 找到 ${searchResults.value.length} 条结果`);
          } else {
            searchResults.value = [];
            ElMessage.warning(`服务端搜索失败: ${res.status || 'Unknown'}`);
          }
        } catch (error) {
          console.error('Server search error:', error);
          searchResults.value = [];
          ElMessage.error(`服务端搜索请求失败: ${error.message}`);
        } finally {
          searchLoading.value = false;
        }
        return;
      }

      if (!mapReady.value || !mapInstance) {
        searchLoading.value = false;
        return;
      }

      clearSearchMarkers();
      serverSearchRawData.value = null;
      const service = new google.maps.places.PlacesService(mapInstance);
      const request = {
        query: searchForm.keyword,
        fields: ['name', 'formatted_address', 'geometry', 'place_id']
      };
      if (globalRegion.value && mapInstance.getBounds()) {
        request.bounds = mapInstance.getBounds();
      }

      service.textSearch(request, (results, status) => {
        searchLoading.value = false;
        if (status === google.maps.places.PlacesServiceStatus.OK && Array.isArray(results)) {
          searchResults.value = results
            .slice(0, searchForm.count || 10)
            .map((item) => mapSearchResult(item, false));
          renderSearchResults(searchResults.value);
          ElMessage.success(`找到 ${searchResults.value.length} 条结果`);
        } else {
          searchResults.value = [];
          ElMessage.info(`未找到相关结果 (${status})`);
        }
      });
    };

    const viewOnMap = (item) => {
      if (!mapInstance || !item || !item.location) return;
      clearSearchMarkers();
      const marker = addMarker(
        searchMarkers,
        item.location,
        item.title,
        `<div style="font-size:13px;"><b>${item.title}</b><br/>${item.address || ''}</div>`
      );
      mapInstance.panTo(item.location);
      mapInstance.setZoom(15);
      const infoWindow = getInfoWindow();
      infoWindow.setContent(`<div style="font-size:13px;"><b>${item.title}</b><br/>${item.address || ''}</div>`);
      infoWindow.open(mapInstance, marker);
    };

    const quickSearch = (keyword) => {
      if (!mapReady.value || !mapInstance) return;
      activeTab.value = 'search';
      searchForm.keyword = keyword;
      doSearch();
    };

    const isSameNearbyItem = (left, right) => {
      if (!left || !right) return false;
      if (left.placeId && right.placeId) return left.placeId === right.placeId;
      if (!left.location || !right.location) return false;
      return left.location.lat === right.location.lat && left.location.lng === right.location.lng;
    };

    const mapNearbyItems = (items) => (Array.isArray(items) ? items : [])
      .map(mapNearbyResult)
      .filter((item) => item.location)
      .slice(0, locateForm.count || 20);

    const renderNearbyResults = (centerPoint, items, activeItem = null) => {
      if (!mapInstance) return;
      nearbyCenterPoint = centerPoint;
      clearMarkers(nearbyMarkers);
      const points = [];

      const centerMarker = addMarker(
        nearbyMarkers,
        centerPoint,
        'Center',
        `<div style="font-size:13px;"><b>Center</b><br/>${centerPoint.lng.toFixed(6)}, ${centerPoint.lat.toFixed(6)}</div>`
      );
      points.push(centerMarker.getPosition());

      items.forEach((item) => {
        if (!item.location) return;
        const content = `<div style="font-size:13px;"><b>${item.title}</b><br/>${item.address || ''}</div>`;
        const marker = addMarker(
          nearbyMarkers,
          item.location,
          item.title,
          content
        );
        points.push(marker.getPosition());
        if (activeItem && isSameNearbyItem(item, activeItem)) {
          const infoWindow = getInfoWindow();
          infoWindow.setContent(content);
          infoWindow.open(mapInstance, marker);
        }
      });

      fitGoogleBounds(points);
    };

    const mapNearbyResult = (item) => {
      const location = normalizeLocation(item.geometry && item.geometry.location);
      return {
        title: item.name || 'Unnamed',
        address: `${item.vicinity || item.formatted_address || 'Unknown'} [${location ? `${location.lng.toFixed(6)},${location.lat.toFixed(6)}` : ''}]`,
        location,
        placeId: item.place_id || '',
        raw: item
      };
    };

    const nearbySearchByFrontend = (centerPoint) => {
      return new Promise((resolve, reject) => {
        const service = new google.maps.places.PlacesService(mapInstance);
        service.nearbySearch({
          location: centerPoint,
          radius: locateForm.radius || 2000,
          keyword: locateForm.nearbyKeyword
        }, (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK || status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            resolve({
              status,
              raw: results || [],
              items: mapNearbyItems(results)
            });
          } else {
            reject(new Error(status));
          }
        });
      });
    };

    const nearbySearchByServer = async (centerPoint) => {
      const res = await fetch(proxyUrl('place/nearbysearch/json', {
        location: `${centerPoint.lat},${centerPoint.lng}`,
        radius: String(locateForm.radius || 2000),
        keyword: locateForm.nearbyKeyword,
        key: apiKey.value,
        language: mapLanguage()
      })).then((response) => response.json());

      return {
        status: res && res.status,
        raw: res,
        items: res && res.status === 'OK' && Array.isArray(res.results)
          ? mapNearbyItems(res.results)
          : []
      };
    };

    const locateInput = async () => {
      if (!mapReady.value || !mapInstance) return;

      const input = locateForm.input.trim();
      if (!input) {
        ElMessage.warning('请输入地址或经纬度');
        return;
      }

      locateLoading.value = true;
      nearbyResults.value = [];
      nearbyRawData.value = null;
      clearNearbyMarkers();

      try {
        const centerPoint = await resolveLocation(input, locateForm.apiMode);
        if (!centerPoint) {
          locateForm.resolvedCoords = '';
          ElMessage.warning('地址解析失败');
          return;
        }

        locateForm.resolvedCoords = `${centerPoint.lng.toFixed(6)}, ${centerPoint.lat.toFixed(6)}`;

        if (!locateForm.nearbyKeyword.trim()) {
          renderNearbyResults(centerPoint, []);
          ElMessage.success('中心点解析成功');
          return;
        }

        if (locateForm.apiMode === 'server') {
          const result = await nearbySearchByServer(centerPoint);
          nearbyRawData.value = result.raw;
          if (result.status && result.status !== 'OK' && result.status !== 'ZERO_RESULTS') {
            throw new Error(result.status);
          }
          nearbyResults.value = result.items;
        } else {
          const result = await nearbySearchByFrontend(centerPoint);
          nearbyResults.value = result.items;
        }

        renderNearbyResults(centerPoint, nearbyResults.value);
        if (nearbyResults.value.length > 0) {
          ElMessage.success(`找到 ${nearbyResults.value.length} 条附近结果`);
        } else {
          ElMessage.info('未找到附近结果');
        }
      } catch (error) {
        console.error('Nearby search failed:', error);
        locateForm.resolvedCoords = '';
        nearbyResults.value = [];
        nearbyRawData.value = null;
        ElMessage.error(`附近搜索失败: ${error.message}`);
      } finally {
        locateLoading.value = false;
      }
    };

    const viewNearbyOnMap = (item) => {
      if (!mapInstance || !item || !item.location) return;
      renderNearbyResults(nearbyCenterPoint || item.location, nearbyResults.value, item);
      mapInstance.panTo(item.location);
      mapInstance.setZoom(16);
    };

    const parseGoogleRouteDetail = (routes) => {
      if (!Array.isArray(routes)) return null;
      return routes.map((route, idx) => {
        const leg = route.legs && route.legs[0];
        if (!leg) return null;
        return {
          index: idx + 1,
          distance: leg.distance ? leg.distance.text : 'Unknown',
          duration: leg.duration ? leg.duration.text : 'Unknown',
          steps: (leg.steps || []).map((step, stepIndex) => {
            const transit = step.transit_details || step.transit || null;
            const lineName = transit && transit.line ? transit.line.short_name || transit.line.name || '' : '';
            return {
              index: stepIndex + 1,
              instruction: MapUtils.stripHtml(step.html_instructions || step.instructions || ''),
              distance: step.distance ? step.distance.text : '',
              duration: step.duration ? step.duration.text : '',
              transitDetail: lineName
            };
          })
        };
      }).filter(Boolean);
    };

    const renderServerRoute = (res, originPoint, destPoint) => {
      if (!mapInstance || !res || res.status !== 'OK' || !Array.isArray(res.routes) || res.routes.length === 0) {
        return;
      }

      clearRenderedRoute();
      const route = res.routes[0];
      const leg = route.legs && route.legs[0];
      const path = route.overview_polyline && route.overview_polyline.points
        ? MapUtils.decodeGooglePolyline(route.overview_polyline.points).map((point) => ({ lat: point.lat, lng: point.lng }))
        : [];

      if (path.length > 0) {
        const polyline = new google.maps.Polyline({
          path,
          map: mapInstance,
          strokeColor: '#4285F4',
          strokeOpacity: 0.85,
          strokeWeight: 6
        });
        routePolylines.push(polyline);
      }

      const startPoint = leg && leg.start_location ? normalizeLocation(leg.start_location) : originPoint;
      const endPoint = leg && leg.end_location ? normalizeLocation(leg.end_location) : destPoint;
      if (startPoint) {
        addMarker(routeMarkers, startPoint, 'Start', '<div><b>Start</b></div>');
      }
      if (endPoint) {
        addMarker(routeMarkers, endPoint, 'End', '<div><b>End</b></div>');
      }

      if (route.bounds && route.bounds.northeast && route.bounds.southwest) {
        const bounds = new google.maps.LatLngBounds(route.bounds.southwest, route.bounds.northeast);
        mapInstance.fitBounds(bounds);
      } else {
        const points = [];
        if (startPoint) points.push(startPoint);
        if (endPoint) points.push(endPoint);
        path.forEach((point) => points.push(point));
        fitGoogleBounds(points);
      }
    };

    const calcServerRoute = async (originPoint, destPoint) => {
      const modeMap = {
        DRIVING: 'driving',
        WALKING: 'walking',
        BICYCLING: 'bicycling',
        TRANSIT: 'transit'
      };
      const res = await fetch(proxyUrl('directions/json', {
        origin: `${originPoint.lat},${originPoint.lng}`,
        destination: `${destPoint.lat},${destPoint.lng}`,
        mode: modeMap[routeForm.travelMode] || 'driving',
        alternatives: 'true',
        key: apiKey.value,
        language: mapLanguage()
      })).then((response) => response.json());

      routeResults.value = res ? markRaw(res) : null;
      if (res && res.status === 'OK' && Array.isArray(res.routes)) {
        routeDetailInfo.value = parseGoogleRouteDetail(res.routes);
        renderServerRoute(res, originPoint, destPoint);
        ElMessage.success('路线规划成功');
      } else {
        routeDetailInfo.value = null;
        ElMessage.error(`路线规划失败: ${res.status || 'Unknown'}`);
      }
    };

    const calcRoute = async () => {
      if (!routeForm.start || !routeForm.end) {
        ElMessage.warning('请输入完整起点和终点');
        return;
      }
      if (!mapReady.value || !mapInstance) return;

      routeLoading.value = true;
      routeDetailInfo.value = null;
      routeResults.value = null;

      const originPoint = await resolveLocation(routeForm.start, routeForm.apiMode);
      if (!originPoint) {
        routeForm.startCoords = '解析失败';
        routeLoading.value = false;
        ElMessage.error(`无法解析起点地址: ${routeForm.start}`);
        return;
      }
      routeForm.startCoords = MapUtils.parseCoords(routeForm.start)
        ? ''
        : `${originPoint.lng.toFixed(6)}, ${originPoint.lat.toFixed(6)}`;

      const destPoint = await resolveLocation(routeForm.end, routeForm.apiMode);
      if (!destPoint) {
        routeForm.endCoords = '解析失败';
        routeLoading.value = false;
        ElMessage.error(`无法解析终点地址: ${routeForm.end}`);
        return;
      }
      routeForm.endCoords = MapUtils.parseCoords(routeForm.end)
        ? ''
        : `${destPoint.lng.toFixed(6)}, ${destPoint.lat.toFixed(6)}`;

      try {
        clearRenderedRoute();
        clearSearchMarkers();
        clearNearbyMarkers();

        if (routeForm.apiMode === 'server') {
          await calcServerRoute(originPoint, destPoint);
          return;
        }

        directionsRenderer = new google.maps.DirectionsRenderer({
          map: mapInstance
        });
        const directionsService = new google.maps.DirectionsService();
        directionsService.route({
          origin: originPoint,
          destination: destPoint,
          travelMode: google.maps.TravelMode[routeForm.travelMode],
          provideRouteAlternatives: true
        }, (result, status) => {
          routeLoading.value = false;
          if (status === 'OK') {
            directionsRenderer.setDirections(result);
            routeDetailInfo.value = parseGoogleRouteDetail(result.routes);
            ElMessage.success('路线规划成功');
          } else {
            routeDetailInfo.value = null;
            ElMessage.error(`路线规划失败: ${status}`);
          }
        });
      } catch (error) {
        console.error('Route error:', error);
        ElMessage.error(`路线规划失败: ${error.message}`);
      } finally {
        if (routeForm.apiMode === 'server') {
          routeLoading.value = false;
        }
      }
    };

    onMounted(() => {
      initConfig();
    });

    return {
      activeTab,
      apiKeyList,
      apiKey,
      regionList,
      globalRegion,
      proxyBaseUrl,
      mapReady,
      loadGoogleMap,
      searchForm,
      searchResults,
      searchLoading,
      routeLoading,
      locateLoading,
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
      viewNearbyOnMap,
      routeForm,
      routeDetailInfo,
      routeResults,
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
