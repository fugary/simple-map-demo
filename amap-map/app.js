/* global AMap */
import { createApp, ref, onMounted, reactive, markRaw, computed } from 'vue';
import ElementPlus, { ElMessage } from 'element-plus';
import 'element-plus/dist/index.css';
import { MapUtils } from '../shared/utils.js';
import '../shared/i18n.js';
import './route-drawer.js';

if (typeof window !== 'undefined') {
  window.ElementPlus = ElementPlus;
}

const app = createApp({
  setup() {
    const mapLanguage = () => {
      const lang = window.AppI18n && window.AppI18n.getLang();
      const result = lang === 'en' ? 'en' : 'zh_cn';
      console.log('[Amap mapLanguage] AppI18n.getLang()=', lang, '=> mapLanguage=', result);
      return result;
    };
    const AMAP_SCRIPT_ID = 'simple-map-demo-amap-sdk';

    const browserAkList = ref([]);
    const browserAk = ref('');
    const serverAkList = ref([]);
    const serverAk = ref('');
    const browserSecurityCode = ref('');
    const regionList = ref([]);
    const globalRegion = ref('上海');
    const mapReady = ref(false);
    const activeTab = ref('config');
    let mapInstance = null;
    let routePlugin = null;
    let infoWindow = null;

    const mapLoading = ref(false);
    const searchLoading = ref(false);
    const routeLoading = ref(false);
    const locateLoading = ref(false);

    const searchForm = reactive({
      apiMode: 'jsapi',
      keyword: '人民广场',
      count: 10
    });
    const searchResults = ref([]);
    const serverSearchRawData = ref(null);
    const searchResultTab = ref('list');

    const locateForm = reactive({
      apiMode: 'jsapi',
      input: '',
      resolvedCoords: '',
      nearbyKeyword: '',
      radius: 2000
    });
    const nearbyResults = ref([]);
    const nearbyRawData = ref(null);
    const locateResultTab = ref('list');

    const routeForm = reactive({
      apiMode: 'jsapi',
      travelMode: 'driving',
      start: '人民广场',
      end: '正大广场',
      startCoords: '',
      endCoords: ''
    });
    const routeResults = ref(null);
    const routeDetailInfo = ref(null);
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
      browserAkList.value = MapUtils.loadConfigList('amap_map_browser_aks');
      if (browserAkList.value.length > 0) browserAk.value = browserAkList.value[0];

      serverAkList.value = MapUtils.loadConfigList('amap_map_server_aks');
      if (serverAkList.value.length > 0) serverAk.value = serverAkList.value[0];

      const scList = MapUtils.loadConfigList('amap_map_browser_security_codes');
      if (scList.length > 0) browserSecurityCode.value = scList[0];

      regionList.value = MapUtils.loadConfigList('amap_map_regions');
      if (regionList.value.length > 0) globalRegion.value = regionList.value[0];
    };

    const resetMapContainer = () => {
      const container = document.getElementById('map-container');
      if (container) {
        container.innerHTML = '';
      }
    };

    const destroyMapInstance = () => {
      if (mapInstance && typeof mapInstance.destroy === 'function') {
        mapInstance.destroy();
      }
      mapInstance = null;
      routePlugin = null;
      mapReady.value = false;
      resetMapContainer();
    };

    const unloadAmapSdk = () => {
      destroyMapInstance();
      const script = document.getElementById(AMAP_SCRIPT_ID);
      if (script) {
        script.remove();
      }
      delete window.initAmapCallback;
      delete window.AMap;
      delete window.__simpleMapAmapLang;
    };

    const clearDrawings = () => {
      if (!mapInstance) return;
      mapInstance.clearMap();
      if (window.AmapRouteDrawer) {
        window.AmapRouteDrawer.clearRoute(mapInstance);
      }
      if (routePlugin && typeof routePlugin.clear === 'function') {
        routePlugin.clear();
      }
    };

    const ensureInfoWindow = () => {
      if (!infoWindow) {
        infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -30) });
      }
      return infoWindow;
    };

    const buildPointItem = (title, address, lng, lat, raw = null) => ({
      title: title || 'Unnamed',
      address: `${address || 'Unknown'} [${Number(lng).toFixed(6)},${Number(lat).toFixed(6)}]`,
      point: [Number(lng), Number(lat)],
      raw
    });

    const renderPointItems = (centerPoint, items) => {
      if (!mapInstance) return;
      clearDrawings();
      const overlays = [];
      if (centerPoint) {
        overlays.push(new AMap.Marker({
          position: centerPoint,
          title: 'Center'
        }));
      }
      items.forEach((item) => {
        if (!item.point) return;
        overlays.push(new AMap.Marker({
          position: item.point,
          title: item.title
        }));
      });
      if (overlays.length > 0) {
        mapInstance.add(overlays);
        mapInstance.setFitView(overlays);
      }
    };

    const loadAmap = () => {
      if (!browserAk.value && !serverAk.value) {
        ElMessage.warning('至少配置一个 AK 才能继续');
        return;
      }

      mapLoading.value = true;
      MapUtils.saveConfigVal(browserAkList, browserAk.value, 'amap_map_browser_aks');
      MapUtils.saveConfigVal(serverAkList, serverAk.value, 'amap_map_server_aks');
      if (browserSecurityCode.value) {
        const scList = ref(MapUtils.loadConfigList('amap_map_browser_security_codes'));
        MapUtils.saveConfigVal(scList, browserSecurityCode.value, 'amap_map_browser_security_codes');
      }
      MapUtils.saveConfigVal(regionList, globalRegion.value, 'amap_map_regions');

      if (!browserAk.value) {
        mapReady.value = true;
        mapLoading.value = false;
        ElMessage.info('未填浏览器端 AK，仅可使用服务端模式相关功能');
        return;
      }

      const desiredLang = mapLanguage();
      if (window.AMap && window.__simpleMapAmapLang !== desiredLang) {
        unloadAmapSdk();
      }

      if (window.AMap && window.AMap.Map) {
        window.__simpleMapAmapLang = desiredLang;
        destroyMapInstance();
        initMap();
        return;
      }

      if (browserSecurityCode.value) {
        window._AMapSecurityConfig = {
          securityJsCode: browserSecurityCode.value
        };
      }

      window.initAmapCallback = () => {
        window.__simpleMapAmapLang = desiredLang;
        initMap();
      };

      const script = document.createElement('script');
      script.id = AMAP_SCRIPT_ID;
      script.type = 'text/javascript';
      script.src = `https://webapi.amap.com/maps?v=1.4.15&key=${browserAk.value}&lang=${desiredLang}&plugin=AMap.PlaceSearch,AMap.Driving,AMap.Transfer,AMap.Walking,AMap.Riding,AMap.Geocoder,AMap.ToolBar,AMap.Scale&callback=initAmapCallback&_=${Date.now()}`;
      script.onerror = () => {
        mapLoading.value = false;
        ElMessage.error('高德地图引擎加载失败，请检查 AK/SecurityCode 或网络');
      };
      document.body.appendChild(script);
    };

    const fallbackServerGeo = (address, resolve) => {
      if (!serverAk.value) {
        resolve(null);
        return;
      }
      const cityCode = (globalRegion.value && globalRegion.value !== '全国') ? encodeURIComponent(globalRegion.value) : '';
      MapUtils.jsonp(`https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&city=${cityCode}&output=json&key=${serverAk.value}`)
        .then((res) => {
          if (res && res.status === '1' && res.geocodes && res.geocodes.length > 0) {
            const [lng, lat] = res.geocodes[0].location.split(',');
            resolve({ lng: parseFloat(lng), lat: parseFloat(lat) });
          } else {
            resolve(null);
          }
        })
        .catch(() => resolve(null));
    };

    const getCoords = (addressOrCoords) => {
      return new Promise((resolve) => {
        const parsed = MapUtils.parseCoords(addressOrCoords);
        if (parsed) {
          resolve(parsed);
          return;
        }

        const value = String(addressOrCoords || '').trim();
        if (!value) {
          resolve(null);
          return;
        }

        if (window.AMap && window.AMap.Geocoder) {
          const geocoder = new AMap.Geocoder({
            city: globalRegion.value && globalRegion.value !== '全国' ? globalRegion.value : undefined
          });
          geocoder.getLocation(value, (status, result) => {
            if (status === 'complete' && result.info === 'OK' && result.geocodes && result.geocodes.length > 0) {
              resolve({
                lng: result.geocodes[0].location.lng,
                lat: result.geocodes[0].location.lat
              });
            } else {
              fallbackServerGeo(value, resolve);
            }
          });
        } else {
          fallbackServerGeo(value, resolve);
        }
      });
    };

    const initMap = async () => {
      try {
        destroyMapInstance();
        let centerPoint = [116.397428, 39.90923];
        const region = String(globalRegion.value || '').trim();
        if (region && region !== '全国') {
          const point = await getCoords(region);
          if (point) {
            centerPoint = [point.lng, point.lat];
          }
        }

        mapInstance = markRaw(new AMap.Map('map-container', {
          zoom: 11,
          center: centerPoint,
          lang: mapLanguage()
        }));
        mapInstance.addControl(new AMap.Scale());
        mapInstance.addControl(new AMap.ToolBar());
        if (region && region !== '全国') {
          mapInstance.setCity(region);
        }

        mapReady.value = true;
        mapLoading.value = false;
        ElMessage.success('地图加载成功');
      } catch (error) {
        console.error('Map init error:', error);
        mapLoading.value = false;
        ElMessage.error('地图初始化失败，请检查 AK/SecurityCode 是否合法并已授权域名');
      }
    };

    const doSearch = async () => {
      if (!searchForm.keyword) {
        ElMessage.warning('请输入查询关键字');
        return;
      }

      searchLoading.value = true;
      clearDrawings();

      if (searchForm.apiMode === 'server') {
        if (!serverAk.value) {
          searchLoading.value = false;
          ElMessage.warning('需要配置服务端 AK');
          return;
        }

        try {
          const cityCode = (globalRegion.value && globalRegion.value !== '全国') ? encodeURIComponent(globalRegion.value) : '';
          const url = `https://restapi.amap.com/v3/place/text?keywords=${encodeURIComponent(searchForm.keyword)}&city=${cityCode}&offset=${searchForm.count}&page=1&output=json&key=${serverAk.value}`;
          const res = await MapUtils.jsonp(url);
          serverSearchRawData.value = res;
          if (res && res.status === '1') {
            searchResults.value = (res.pois || [])
              .filter((poi) => poi.location)
              .map((poi) => {
                const [lng, lat] = poi.location.split(',');
                return buildPointItem(poi.name, poi.address || poi.adname, lng, lat, poi);
              });
            renderPointItems(null, searchResults.value);
            ElMessage.success(`服务端 API 找到 ${searchResults.value.length} 条结果`);
          } else {
            searchResults.value = [];
            ElMessage.error(`服务端搜索失败: ${res.info || 'Unknown'}`);
          }
        } catch (error) {
          console.error(error);
          searchResults.value = [];
          ElMessage.error('服务端搜索请求失败');
        } finally {
          searchLoading.value = false;
        }
        return;
      }

      if (!mapReady.value || !mapInstance) {
        searchLoading.value = false;
        return;
      }

      serverSearchRawData.value = null;
      searchResults.value = [];

      try {
        const placeSearch = new AMap.PlaceSearch({
          pageSize: searchForm.count || 10,
          pageIndex: 1,
          city: globalRegion.value && globalRegion.value !== '全国' ? globalRegion.value : undefined
        });

        placeSearch.search(searchForm.keyword, (status, result) => {
          searchLoading.value = false;
          if (status === 'complete' && result.info === 'OK') {
            searchResults.value = (result.poiList.pois || []).map((poi) =>
              buildPointItem(poi.name, poi.address || poi.adname, poi.location.lng, poi.location.lat, poi)
            );
          } else {
            searchResults.value = [];
            ElMessage.info(`未找到相关结果或查询失败 (${status})`);
          }
        });
      } catch (error) {
        console.error(error);
        searchLoading.value = false;
        ElMessage.error('前端检索失败');
      }
    };

    const viewOnMap = (item) => {
      if (!mapInstance || !item || !item.point) return;
      clearDrawings();
      mapInstance.setCenter(item.point);
      const marker = new AMap.Marker({
        position: item.point,
        title: item.title
      });
      mapInstance.add(marker);

      const popup = ensureInfoWindow();
      popup.setContent(`<strong>${item.title}</strong><br/>${item.address}`);
      popup.open(mapInstance, item.point);
      marker.on('click', () => popup.open(mapInstance, item.point));
    };

    const quickSearch = (keyword) => {
      if (!mapReady.value || !mapInstance) return;
      activeTab.value = 'search';
      searchForm.keyword = keyword;
      if (!globalRegion.value) {
        globalRegion.value = '北京';
      }
      doSearch();
    };

    const locateInput = async () => {
      if (!mapReady.value || !mapInstance) return;
      const input = locateForm.input.trim();
      if (!input) return;

      locateLoading.value = true;
      nearbyResults.value = [];
      nearbyRawData.value = null;

      try {
        const center = await getCoords(input);
        if (!center) {
          locateForm.resolvedCoords = '';
          ElMessage.warning('地址解析失败');
          return;
        }

        const centerPoint = [center.lng, center.lat];
        locateForm.resolvedCoords = `${center.lng.toFixed(6)}, ${center.lat.toFixed(6)}`;

        if (!locateForm.nearbyKeyword.trim()) {
          renderPointItems(centerPoint, []);
          return;
        }

        if (locateForm.apiMode === 'server') {
          if (!serverAk.value) {
            ElMessage.warning('附近搜索需要配置服务端 AK');
            return;
          }

          const cityCode = (globalRegion.value && globalRegion.value !== '全国') ? encodeURIComponent(globalRegion.value) : '';
          const url = `https://restapi.amap.com/v3/place/around?location=${center.lng},${center.lat}&keywords=${encodeURIComponent(locateForm.nearbyKeyword)}&radius=${locateForm.radius || 2000}&offset=20&page=1&output=json&key=${serverAk.value}&city=${cityCode}`;
          const res = await MapUtils.jsonp(url);
          nearbyRawData.value = res;
          if (res && res.status === '1') {
            nearbyResults.value = (res.pois || [])
              .filter((poi) => poi.location)
              .map((poi) => {
                const [lng, lat] = poi.location.split(',');
                return buildPointItem(poi.name, poi.address || poi.adname, lng, lat, poi);
              });
          } else {
            nearbyResults.value = [];
            ElMessage.warning(`附近搜索失败: ${res.info || 'Unknown'}`);
          }
        } else {
          const placeSearch = new AMap.PlaceSearch({
            pageSize: 20,
            pageIndex: 1,
            city: globalRegion.value && globalRegion.value !== '全国' ? globalRegion.value : undefined
          });

          const result = await new Promise((resolve, reject) => {
            placeSearch.searchNearBy(locateForm.nearbyKeyword, centerPoint, locateForm.radius || 2000, (status, searchResult) => {
              if (status === 'complete' && searchResult.info === 'OK') {
                resolve(searchResult);
              } else {
                reject(new Error(status || 'Unknown'));
              }
            });
          });

          nearbyResults.value = ((result.poiList && result.poiList.pois) || []).map((poi) =>
            buildPointItem(poi.name, poi.address || poi.adname, poi.location.lng, poi.location.lat, poi)
          );
        }

        renderPointItems(centerPoint, nearbyResults.value);
      } catch (error) {
        console.error(error);
        locateForm.resolvedCoords = '';
        nearbyResults.value = [];
        ElMessage.error(`附近搜索失败: ${error.message}`);
      } finally {
        locateLoading.value = false;
      }
    };

    const parseServerRouteDetail = (res, travelMode) => {
      if (!res || res.status !== '1' || !res.route) return null;
      const paths = res.route.paths || res.route.transits || [];
      if (paths.length === 0) return null;

      return paths.map((path, idx) => {
        const detail = {
          index: idx + 1,
          distance: MapUtils.formatDistance(parseFloat(path.distance)),
          duration: MapUtils.formatDuration(parseFloat(path.duration || path.time || 0)),
          steps: []
        };

        if (travelMode === 'transit' && path.segments) {
          path.segments.forEach((segment) => {
            if (segment.walking && segment.walking.steps && segment.walking.steps.length > 0) {
              detail.steps.push({
                index: detail.steps.length + 1,
                instruction: 'Walk to transit',
                distance: MapUtils.formatDistance(parseFloat(segment.walking.distance || 0)),
                duration: ''
              });
            }
            if (segment.bus && segment.bus.buslines && segment.bus.buslines.length > 0) {
              const busline = segment.bus.buslines[0];
              detail.steps.push({
                index: detail.steps.length + 1,
                instruction: `Take ${busline.name}`,
                vehicleName: busline.type,
                distance: MapUtils.formatDistance(parseFloat(busline.distance || 0)),
                duration: ''
              });
            }
          });
        } else if (path.steps) {
          detail.steps = path.steps.map((step, stepIndex) => ({
            index: stepIndex + 1,
            instruction: MapUtils.stripHtml(step.instruction || step.action || 'Go ahead'),
            distance: MapUtils.formatDistance(parseFloat(step.distance || 0)),
            duration: MapUtils.formatDuration(parseFloat(step.duration || step.time || 0))
          }));
        }

        return detail;
      });
    };

    const calcRoute = async () => {
      if (!routeForm.start || !routeForm.end) {
        ElMessage.warning('请输入完整起点和终点');
        return;
      }

      routeLoading.value = true;
      routeDetailInfo.value = null;
      routeResults.value = null;

      const origin = await getCoords(routeForm.start);
      if (!origin) {
        routeForm.startCoords = '解析失败';
        routeLoading.value = false;
        ElMessage.error(`无法解析起点地址: ${routeForm.start}`);
        return;
      }
      routeForm.startCoords = MapUtils.parseCoords(routeForm.start)
        ? ''
        : `${origin.lng.toFixed(6)}, ${origin.lat.toFixed(6)}`;

      const destination = await getCoords(routeForm.end);
      if (!destination) {
        routeForm.endCoords = '解析失败';
        routeLoading.value = false;
        ElMessage.error(`无法解析终点地址: ${routeForm.end}`);
        return;
      }
      routeForm.endCoords = MapUtils.parseCoords(routeForm.end)
        ? ''
        : `${destination.lng.toFixed(6)}, ${destination.lat.toFixed(6)}`;

      clearDrawings();

      if (routeForm.apiMode === 'server') {
        if (!serverAk.value) {
          routeLoading.value = false;
          ElMessage.warning('需要配置服务端 AK');
          return;
        }

        let subPath = 'driving';
        if (routeForm.travelMode === 'transit') subPath = 'transit/integrated';
        if (routeForm.travelMode === 'walking') subPath = 'walking';
        if (routeForm.travelMode === 'riding') subPath = 'bicycling';
        const version = routeForm.travelMode === 'riding' ? 'v4' : 'v3';

        let query = `origin=${origin.lng},${origin.lat}&destination=${destination.lng},${destination.lat}`;
        if (routeForm.travelMode === 'transit') {
          query += `&city=${encodeURIComponent(globalRegion.value === '全国' ? '北京' : globalRegion.value)}`;
        }

        try {
          const url = `https://restapi.amap.com/${version}/direction/${subPath}?${query}&output=json&key=${serverAk.value}`;
          const res = await MapUtils.jsonp(url);
          routeResults.value = res;
          if (res && res.status === '1') {
            routeDetailInfo.value = parseServerRouteDetail(res, routeForm.travelMode);
            if (mapInstance && window.AmapRouteDrawer) {
              window.AmapRouteDrawer.drawServerRoute(mapInstance, res, routeForm.travelMode, {
                startName: '起',
                endName: '终'
              });
            }
            ElMessage.success('路线规划成功');
          } else {
            ElMessage.error(`路线规划失败: ${res.info || 'Unknown'}`);
          }
        } catch (error) {
          console.error(error);
          ElMessage.error(`路线规划失败: ${error.message}`);
        } finally {
          routeLoading.value = false;
        }
        return;
      }

      let PluginClass = null;
      if (routeForm.travelMode === 'driving') PluginClass = AMap.Driving;
      if (routeForm.travelMode === 'transit') PluginClass = AMap.Transfer;
      if (routeForm.travelMode === 'walking') PluginClass = AMap.Walking;
      if (routeForm.travelMode === 'riding') PluginClass = AMap.Riding;

      if (!PluginClass) {
        routeLoading.value = false;
        ElMessage.warning('当前出行方式暂不支持');
        return;
      }

      routePlugin = new PluginClass({
        map: mapInstance,
        city: globalRegion.value && globalRegion.value !== '全国' ? globalRegion.value : '北京市'
      });

      routePlugin.search([origin.lng, origin.lat], [destination.lng, destination.lat], (status, result) => {
        routeLoading.value = false;
        if (status === 'complete' && result.info === 'OK') {
          try {
            const plans = result.plans || result.routes || [];
            routeDetailInfo.value = plans.slice(0, 5).map((plan, idx) => ({
              index: idx + 1,
              distance: MapUtils.formatDistance(parseFloat(plan.distance || 0)),
              duration: MapUtils.formatDuration(parseFloat(plan.time || plan.duration || 0)),
              steps: (plan.steps || plan.segments || []).map((step, stepIndex) => ({
                index: stepIndex + 1,
                instruction: MapUtils.stripHtml(step.instruction || step.action || ''),
                distance: MapUtils.formatDistance(parseFloat(step.distance || 0)),
                duration: ''
              }))
            }));
          } catch (error) {
            console.warn('Failed to extract route detail:', error);
          }
        } else {
          routeDetailInfo.value = null;
          ElMessage.warning(`路线规划失败: ${status}`);
        }
      });
    };

    onMounted(() => {
      initConfig();
      window.addEventListener('app-language-change', () => {
        if (browserAk.value && (window.AMap || mapInstance)) {
          loadAmap();
        }
      });
    });

    return {
      activeTab,
      browserAkList,
      browserAk,
      serverAkList,
      serverAk,
      browserSecurityCode,
      regionList,
      globalRegion,
      mapReady,
      mapLoading,
      searchLoading,
      routeLoading,
      locateLoading,
      loadAmap,
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
      nearbyJsonHtml
    };
  }
});

app.use(ElementPlus);
app.mount('#app');
