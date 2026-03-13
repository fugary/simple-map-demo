const { createApp, ref, onMounted, reactive, markRaw, computed } = Vue;

const DEFAULT_PROXY_BASE = 'https://mock-dev.citsgbt.com/mock/3471f5ba61824bfea6efb264d70e235d';

const app = createApp({
  setup() {
    const mapLanguage = () =>
      window.AppI18n && window.AppI18n.getLang() === 'en' ? 'en' : 'zh-CN';
    const mapRegion = () =>
      window.AppI18n && window.AppI18n.getLang() === 'en' ? 'US' : 'CN';

    const apiKeyList = ref([]);
    const apiKey = ref('');
    const regionList = ref([]);
    const globalRegion = ref('');
    const proxyBaseUrl = ref(DEFAULT_PROXY_BASE);
    const mapReady = ref(false);
    const activeTab = ref('config');
    let mapInstance = null;
    let directionsRenderer = null;

    // Loading states
    const searchLoading = ref(false);
    const routeLoading = ref(false);

    const searchForm = reactive({
      apiMode: 'frontend',
      keyword: 'Times Square',
      count: 10
    });
    const searchResults = ref([]);
    const serverSearchRawData = ref(null);
    const searchResultTab = ref('list');

    // Locate Form
    const locateForm = reactive({
      input: '',
      resolvedCoords: ''
    });

    // Route Form
    const routeForm = reactive({
      travelMode: 'DRIVING',
      start: '',
      end: '',
      startCoords: '',
      endCoords: ''
    });
    const routeDetailInfo = ref(null);
    const routeResults = ref(null);
    const routeResultTab = ref('list');

    // JSON highlights
    const searchJsonHtml = computed(() => {
      if (!serverSearchRawData.value) return '';
      return MapUtils.highlightJson(JSON.stringify(serverSearchRawData.value, null, 2));
    });

    const routeJsonHtml = computed(() => {
      if (!routeResults.value) return '';
      return MapUtils.highlightJson(JSON.stringify(routeResults.value, null, 2));
    });

    // Load config from localStorage
    const initConfig = () => {
      apiKeyList.value = MapUtils.loadConfigList('google_map_api_keys');
      if (apiKeyList.value.length > 0) apiKey.value = apiKeyList.value[0];

      regionList.value = MapUtils.loadConfigList('google_map_regions');
      if (regionList.value.length > 0) globalRegion.value = regionList.value[0];

      const savedProxy = localStorage.getItem('google_map_proxy_base');
      if (savedProxy) proxyBaseUrl.value = savedProxy;
    };

    const loadGoogleMap = () => {
      if (!apiKey.value) {
        ElementPlus.ElMessage.warning('请输入 Google Maps API Key');
        return;
      }

      MapUtils.saveConfigVal(apiKeyList, apiKey.value, 'google_map_api_keys');
      MapUtils.saveConfigVal(regionList, globalRegion.value, 'google_map_regions');
      localStorage.setItem('google_map_proxy_base', proxyBaseUrl.value);

      if (window.google && window.google.maps) {
        initMap();
        return;
      }

      window.initGoogleMapCallback = () => {
        initMap();
      };

      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey.value}&libraries=places&language=${mapLanguage()}&region=${mapRegion()}&callback=initGoogleMapCallback`;
      script.onerror = () => {
        ElementPlus.ElMessage.error('Google Maps 加载失败，请检查 API Key 或网络！');
      };
      document.body.appendChild(script);
    };

    const initMap = async () => {
      try {
        let defaultCenter = { lat: 39.915, lng: 116.404 };

        // If user specified a region, geocode it and center before init
        if (globalRegion.value) {
            const pt = await getCoords(globalRegion.value);
            if (pt) {
                defaultCenter = { lat: pt.lat, lng: pt.lng };
            }
        }

        mapInstance = markRaw(new google.maps.Map(document.getElementById('map-container'), {
          center: defaultCenter,
          zoom: 11,
          mapTypeControl: true,
          streetViewControl: false
        }));

        mapReady.value = true;
        ElementPlus.ElMessage.success('Google Maps 加载成功');
      } catch (e) {
        console.error('Map init error:', e);
        ElementPlus.ElMessage.error('地图初始化失败，请检查 API Key 是否合法！');
      }
    };

    // ---- Proxy helper: build proxy URL ----
    const proxyUrl = (path, params) => {
      const base = (proxyBaseUrl.value || DEFAULT_PROXY_BASE).replace(/\/+$/, '');
      const qs = new URLSearchParams(params).toString();
      return `${base}/${path}?${qs}`;
    };

    // ---- Place Search ----
    let searchMarkers = [];

    const clearSearchMarkers = () => {
      searchMarkers.forEach(m => m.setMap(null));
      searchMarkers = [];
    };

    const doSearch = async () => {
      if (!searchForm.keyword) {
        ElementPlus.ElMessage.warning('请输入查询关键字');
        return;
      }

      searchLoading.value = true;

      if (searchForm.apiMode === 'server') {
        // Server mode via proxy
        clearSearchMarkers();
        serverSearchRawData.value = null;
        try {
          const params = {
            query: searchForm.keyword,
            key: apiKey.value
          };
          if (globalRegion.value) {
            params.region = globalRegion.value;
          }
          const url = proxyUrl('place/textsearch/json', params);
          const res = await fetch(url).then(r => r.json());
          serverSearchRawData.value = res;

          if (res && res.status === 'OK' && res.results) {
            const limited = res.results.slice(0, searchForm.count || 10);
            searchResults.value = limited.map(r => ({
              title: r.name || '无名称',
              address: `${r.formatted_address || '无地址'} [${r.geometry ? r.geometry.location.lng.toFixed(6) + ',' + r.geometry.location.lat.toFixed(6) : ''}]`,
              location: r.geometry ? { lat: r.geometry.location.lat, lng: r.geometry.location.lng } : null,
              placeId: r.place_id
            }));

            // Show markers on map if available
            if (mapInstance) {
              const bounds = new google.maps.LatLngBounds();
              limited.forEach(r => {
                if (r.geometry && r.geometry.location) {
                  const pos = { lat: r.geometry.location.lat, lng: r.geometry.location.lng };
                  const marker = new google.maps.Marker({
                    position: pos,
                    map: mapInstance,
                    title: r.name
                  });
                  searchMarkers.push(marker);
                  bounds.extend(pos);
                }
              });
              if (searchMarkers.length > 0) {
                mapInstance.fitBounds(bounds);
              }
            }

            ElementPlus.ElMessage.success(`服务端 API 找到 ${searchResults.value.length} 条结果`);
          } else {
            ElementPlus.ElMessage.warning('服务端 API 未找到结果: ' + (res.status || 'Unknown'));
            searchResults.value = [];
          }
        } catch (e) {
          console.error('Server search error:', e);
          ElementPlus.ElMessage.error('服务端 API 请求失败: ' + e.message);
          searchResults.value = [];
        } finally {
          searchLoading.value = false;
        }
        return;
      }

      // Frontend mode
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

      // If region is set, bias towards it
      if (globalRegion.value && mapInstance.getBounds()) {
        request.bounds = mapInstance.getBounds();
      }

      service.textSearch(request, (results, status) => {
        searchLoading.value = false;
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          const limited = results.slice(0, searchForm.count || 10);
          searchResults.value = limited.map(r => ({
            title: r.name || '无名称',
            address: `${r.formatted_address || '无地址'} [${r.geometry ? r.geometry.location.lng().toFixed(6) + ',' + r.geometry.location.lat().toFixed(6) : ''}]`,
            location: r.geometry ? r.geometry.location : null,
            placeId: r.place_id
          }));

          // Add markers and fit bounds
          const bounds = new google.maps.LatLngBounds();
          limited.forEach(r => {
            if (r.geometry && r.geometry.location) {
              const marker = new google.maps.Marker({
                position: r.geometry.location,
                map: mapInstance,
                title: r.name
              });
              searchMarkers.push(marker);
              bounds.extend(r.geometry.location);
            }
          });
          if (searchMarkers.length > 0) {
            mapInstance.fitBounds(bounds);
          }

          ElementPlus.ElMessage.success(`找到 ${searchResults.value.length} 条结果`);
        } else {
          ElementPlus.ElMessage.info('未找到相关结果 (' + status + ')');
          searchResults.value = [];
        }
      });
    };

    const viewOnMap = (item) => {
      if (!mapInstance) return;
      const loc = item.location;
      if (!loc) return;

      // Normalize location: server mode returns plain object, frontend returns LatLng
      const pos = typeof loc.lat === 'function'
        ? { lat: loc.lat(), lng: loc.lng() }
        : loc;

      mapInstance.panTo(pos);
      mapInstance.setZoom(15);

      clearSearchMarkers();
      const marker = new google.maps.Marker({
        position: pos,
        map: mapInstance,
        title: item.title
      });
      searchMarkers.push(marker);

      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="font-size:13px;"><b>${item.title}</b><br/>${item.address || ''}</div>`
      });
      infoWindow.open(mapInstance, marker);
    };

    const quickSearch = (keyword) => {
      if (!mapReady.value || !mapInstance) return;
      activeTab.value = 'search';
      searchForm.keyword = keyword;
      doSearch();
    };

    // ---- Geocoding / Locate ----
    const locateInput = () => {
      if (!mapReady.value || !mapInstance) return;
      const input = locateForm.input.trim();
      if (!input) return;

      const coordsParsed = MapUtils.parseCoords(input);
      if (coordsParsed) {
        const pos = { lat: coordsParsed.lat, lng: coordsParsed.lng };
        clearSearchMarkers();
        const marker = new google.maps.Marker({
          position: pos,
          map: mapInstance
        });
        searchMarkers.push(marker);
        mapInstance.panTo(pos);
        mapInstance.setZoom(15);
        locateForm.resolvedCoords = `${coordsParsed.lng.toFixed(6)}, ${coordsParsed.lat.toFixed(6)}`;
      } else {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: input }, (results, status) => {
          if (status === 'OK' && results[0]) {
            const loc = results[0].geometry.location;
            clearSearchMarkers();
            const marker = new google.maps.Marker({
              position: loc,
              map: mapInstance
            });
            searchMarkers.push(marker);
            mapInstance.setCenter(loc);
            mapInstance.setZoom(16);
            locateForm.resolvedCoords = `${loc.lng().toFixed(6)}, ${loc.lat().toFixed(6)}`;
          } else {
            ElementPlus.ElMessage.warning('未能解析该地址的坐标');
            locateForm.resolvedCoords = '';
          }
        });
      }
    };

    // ---- Route Planning ----
    const getCoords = (addressOrCoords) => {
      return new Promise((resolve) => {
        const coordsParsed = MapUtils.parseCoords(addressOrCoords);
        if (coordsParsed) {
          resolve(coordsParsed);
          return;
        }

        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: (addressOrCoords || '').trim() }, (results, status) => {
          if (status === 'OK' && results[0]) {
            const loc = results[0].geometry.location;
            resolve({ lng: loc.lng(), lat: loc.lat() });
          } else {
            resolve(null);
          }
        });
      });
    };

    // Server mode route via proxy
    const calcServerRoute = async (originPt, destPt) => {
      const modeMap = { 'DRIVING': 'driving', 'WALKING': 'walking', 'BICYCLING': 'bicycling', 'TRANSIT': 'transit' };
      const params = {
        origin: `${originPt.lat},${originPt.lng}`,
        destination: `${destPt.lat},${destPt.lng}`,
        mode: modeMap[routeForm.travelMode] || 'driving',
        key: apiKey.value,
        alternatives: 'true'
      };
      const url = proxyUrl('directions/json', params);
      try {
        const res = await fetch(url).then(r => r.json());
        routeResults.value = res;
        if (res && res.status === 'OK' && res.routes) {
          routeDetailInfo.value = parseServerDirections(res);
          ElementPlus.ElMessage.success('服务端路线规划成功');
        } else {
          ElementPlus.ElMessage.error('服务端路线规划失败: ' + (res.status || 'Unknown'));
          routeDetailInfo.value = null;
        }
      } catch (e) {
        console.error('Server route error:', e);
        ElementPlus.ElMessage.error('服务端路线请求失败: ' + e.message);
      }
    };

    const parseServerDirections = (res) => {
      if (!res || !res.routes) return null;
      return res.routes.map((route, idx) => {
        const leg = route.legs[0];
        const detail = {
          index: idx + 1,
          distance: leg.distance ? leg.distance.text : '未知',
          duration: leg.duration ? leg.duration.text : '未知',
          steps: []
        };
        if (leg.steps) {
          leg.steps.forEach((step, i) => {
            const stepItem = {
              index: i + 1,
              instruction: (step.html_instructions || '').replace(/<[^>]+>/g, ''),
              distance: step.distance ? step.distance.text : '',
              duration: step.duration ? step.duration.text : '',
              transitDetail: ''
            };
            if (step.transit_details) {
              const t = step.transit_details;
              const lineName = t.line ? t.line.short_name || t.line.name || '' : '';
              stepItem.transitDetail = lineName;
              const departure = t.departure_stop ? t.departure_stop.name : '';
              const arrival = t.arrival_stop ? t.arrival_stop.name : '';
              const numStops = t.num_stops || '';
              stepItem.instruction = `乘坐 ${lineName}` +
                (departure ? `（${departure}` : '') +
                (arrival ? ` → ${arrival}）` : departure ? '）' : '') +
                (numStops ? ` 途经 ${numStops} 站` : '');
            }
            detail.steps.push(stepItem);
          });
        }
        return detail;
      });
    };

    const calcRoute = async () => {
      if (!routeForm.start || !routeForm.end) {
        ElementPlus.ElMessage.warning('请输入完整起点和终点');
        return;
      }
      if (!mapReady.value || !mapInstance) return;

      routeLoading.value = true;
      routeDetailInfo.value = null;
      routeResults.value = null;

      // Resolve coords for display
      const originPt = await getCoords(routeForm.start);
      if (originPt) {
        const isCoord = MapUtils.parseCoords(routeForm.start);
        routeForm.startCoords = isCoord ? '' : `${originPt.lng.toFixed(6)}, ${originPt.lat.toFixed(6)}`;
      } else {
        ElementPlus.ElMessage.error(`无法解析起点地址：${routeForm.start}`);
        routeForm.startCoords = '解析失败';
        routeLoading.value = false;
        return;
      }

      const destPt = await getCoords(routeForm.end);
      if (destPt) {
        const isCoord = MapUtils.parseCoords(routeForm.end);
        routeForm.endCoords = isCoord ? '' : `${destPt.lng.toFixed(6)}, ${destPt.lat.toFixed(6)}`;
      } else {
        ElementPlus.ElMessage.error(`无法解析终点地址：${routeForm.end}`);
        routeForm.endCoords = '解析失败';
        routeLoading.value = false;
        return;
      }

      // Server mode
      if (searchForm.apiMode === 'server') {
        await calcServerRoute(originPt, destPt);
        routeLoading.value = false;
        return;
      }

      // Frontend mode
      // Clear previous route
      if (directionsRenderer) {
        directionsRenderer.setMap(null);
      }
      directionsRenderer = new google.maps.DirectionsRenderer({
        map: mapInstance
      });

      clearSearchMarkers();

      const directionsService = new google.maps.DirectionsService();
      const request = {
        origin: { lat: originPt.lat, lng: originPt.lng },
        destination: { lat: destPt.lat, lng: destPt.lng },
        travelMode: google.maps.TravelMode[routeForm.travelMode],
        provideRouteAlternatives: true
      };

      directionsService.route(request, (result, status) => {
        routeLoading.value = false;
        if (status === 'OK') {
          directionsRenderer.setDirections(result);
          routeDetailInfo.value = parseDirectionsResult(result);
          ElementPlus.ElMessage.success('路线规划成功');
        } else {
          ElementPlus.ElMessage.error('路线规划失败: ' + status);
          routeDetailInfo.value = null;
        }
      });
    };

    const parseDirectionsResult = (result) => {
      if (!result || !result.routes) return null;

      return result.routes.map((route, idx) => {
        const leg = route.legs[0];
        const detail = {
          index: idx + 1,
          distance: leg.distance ? leg.distance.text : '未知',
          duration: leg.duration ? leg.duration.text : '未知',
          steps: []
        };

        if (leg.steps) {
          leg.steps.forEach((step, i) => {
            const stepItem = {
              index: i + 1,
              instruction: (step.instructions || '').replace(/<[^>]+>/g, ''),
              distance: step.distance ? step.distance.text : '',
              duration: step.duration ? step.duration.text : '',
              transitDetail: ''
            };

            // Transit specific info
            if (step.transit) {
              const t = step.transit;
              const lineName = t.line ? t.line.short_name || t.line.name || '' : '';
              const departure = t.departure_stop ? t.departure_stop.name : '';
              const arrival = t.arrival_stop ? t.arrival_stop.name : '';
              const numStops = t.num_stops || '';
              stepItem.transitDetail = lineName;
              stepItem.instruction = `乘坐 ${lineName}` +
                (departure ? `（${departure}` : '') +
                (arrival ? ` → ${arrival}）` : departure ? '）' : '') +
                (numStops ? ` 途经 ${numStops} 站` : '');
            }

            detail.steps.push(stepItem);
          });
        }

        return detail;
      });
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
      serverSearchRawData,
      searchResultTab,
      doSearch,
      viewOnMap,
      quickSearch,
      locateForm,
      locateInput,
      routeForm,
      routeDetailInfo,
      routeResults,
      routeResultTab,
      calcRoute,
      copyJson: MapUtils.copyJson,
      searchJsonHtml,
      routeJsonHtml
    };
  }
});

app.use(ElementPlus);
app.mount('#app');
