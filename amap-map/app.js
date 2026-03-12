const { createApp, ref, onMounted, reactive, markRaw, computed } = Vue;

const app = createApp({
  setup() {
    const browserAkList = ref([]);
    const browserAk = ref('');
    const serverAkList = ref([]);
    const serverAk = ref('');
    const browserSecurityCode = ref('');
    const regionList = ref([]);
    const globalRegion = ref('全国');
    const mapReady = ref(false);
    const activeTab = ref('config');
    let mapInstance = null;

    // Loading states
    const mapLoading = ref(false);
    const searchLoading = ref(false);
    const routeLoading = ref(false);

    const searchForm = reactive({
      apiMode: 'jsapi',
      keyword: '时报广场',
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
      apiMode: 'jsapi',
      travelMode: 'driving',
      start: '',
      end: '',
      startCoords: '',
      endCoords: ''
    });
    const routeResults = ref(null);
    const routeDetailInfo = ref(null);
    const routeResultTab = ref('list');

    // Highlighted JSON computed properties
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
      browserAkList.value = MapUtils.loadConfigList('amap_map_browser_aks');
      if (browserAkList.value.length > 0) browserAk.value = browserAkList.value[0];

      serverAkList.value = MapUtils.loadConfigList('amap_map_server_aks');
      if (serverAkList.value.length > 0) serverAk.value = serverAkList.value[0];

      const scList = MapUtils.loadConfigList('amap_map_browser_security_codes');
      if (scList.length > 0) browserSecurityCode.value = scList[0];

      regionList.value = MapUtils.loadConfigList('amap_map_regions');
      if (regionList.value.length > 0) globalRegion.value = regionList.value[0];
    };

    const loadAmap = () => {
      if (!browserAk.value && !serverAk.value) {
        ElementPlus.ElMessage.warning('至少配置一个 AK 以继续');
        return;
      }
      
      mapLoading.value = true;
      MapUtils.saveConfigVal(browserAkList, browserAk.value, 'amap_map_browser_aks');
      MapUtils.saveConfigVal(serverAkList, serverAk.value, 'amap_map_server_aks');
      if (browserSecurityCode.value) {
        let scList = MapUtils.loadConfigList('amap_map_browser_security_codes');
        MapUtils.saveConfigVal(ref(scList), browserSecurityCode.value, 'amap_map_browser_security_codes');
      }
      MapUtils.saveConfigVal(regionList, globalRegion.value, 'amap_map_regions');
      
      if (!browserAk.value) {
        mapReady.value = true;
        mapLoading.value = false;
        ElementPlus.ElMessage.info('未填浏览器端 AK，仅可测试 Server 服务端 API。');
        return;
      }

      if (window.AMap && window.AMap.Map) {
        initMap();
        return;
      }

      if (browserSecurityCode.value) {
        window._AMapSecurityConfig = {
          securityJsCode: browserSecurityCode.value
        };
      }

      window.initAmapCallback = () => {
        initMap();
      };

      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${browserAk.value}&plugin=AMap.PlaceSearch,AMap.Driving,AMap.Transfer,AMap.Walking,AMap.Riding,AMap.Geocoder,AMap.ToolBar,AMap.Scale&callback=initAmapCallback`;
      script.onerror = () => {
        mapLoading.value = false;
        ElementPlus.ElMessage.error('高德地图引擎加载失败，请检查 AK/SecurityCode 或网络！');
      };
      document.body.appendChild(script);
    };

    let markers = []; // Maintain custom markers because PlaceSearch etc defaults might clash or we manual render
    const clearDrawings = () => {
        if (!mapInstance) return;
        mapInstance.clearMap(); // clears all overlays
        if (window.AmapRouteDrawer) {
            window.AmapRouteDrawer.clearRoute(mapInstance);
        }
    };

    const initMap = () => {
      try {
        mapInstance = markRaw(new AMap.Map('map-container', {
            zoom: 11,
            center: [116.397428, 39.90923] // Default Beijing
        }));
        
        mapInstance.addControl(new AMap.Scale());  
        mapInstance.addControl(new AMap.ToolBar());

        const region = (globalRegion.value || '').trim();
        if (region && region !== '全国') {
            mapInstance.setCity(region);
        }
        
        mapReady.value = true;
        mapLoading.value = false;
        ElementPlus.ElMessage.success('地图加载成功');
      } catch (e) {
        console.error('Map init error:', e);
        mapLoading.value = false;
        ElementPlus.ElMessage.error('地图初始化失败，请检查 AK/SecurityCode 是否合法并已授权该域名！');
      }
    };

    const doSearch = async () => {
      if (!searchForm.keyword) {
        ElementPlus.ElMessage.warning('请输入查询关键字');
        return;
      }

      searchLoading.value = true;
      clearDrawings();

      if (searchForm.apiMode === 'server') {
        if (!serverAk.value) {
          ElementPlus.ElMessage.warning('需要配置 服务端端侧 AK');
          searchLoading.value = false;
          return;
        }
        try {
          const cityCode = (globalRegion.value && globalRegion.value !== '全国') ? encodeURIComponent(globalRegion.value) : '';
          const url = `https://restapi.amap.com/v3/place/text?keywords=${encodeURIComponent(searchForm.keyword)}&city=${cityCode}&offset=${searchForm.count}&page=1&output=json&key=${serverAk.value}`;
          const res = await MapUtils.jsonp(url);
          serverSearchRawData.value = res;
          if (res && res.status === '1') {
            searchResults.value = (res.pois || []).map(r => {
                let lng = 0, lat = 0;
                if (r.location && typeof r.location === 'string') {
                    const parts = r.location.split(',');
                    lng = parseFloat(parts[0]);
                    lat = parseFloat(parts[1]);
                }
                return {
                    title: r.name || '无名称',
                    address: `${r.address || r.adname || '无具体地址'} [坐标: ${r.location || '未知'}]`,
                    point: lng ? [lng, lat] : null
                };
            });
            ElementPlus.ElMessage.success(`服务端 API 请求成功 (共找到 ${searchResults.value.length} 条记录)`);
          } else {
            ElementPlus.ElMessage.error(`服务端 API 返回错误: ${res.info || 'Unknown error'}`);
            searchResults.value = [];
          }
        } catch(e) {
          console.error(e);
          ElementPlus.ElMessage.error('服务端 API 请求失败');
        } finally {
          searchLoading.value = false;
        }
        return;
      }

      // JS API Mode
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
                const pois = result.poiList.pois;
                searchResults.value = pois.map(p => ({
                    title: p.name,
                    address: `${p.address || p.adname || '无'} [坐标: ${p.location ? p.location.lng.toFixed(6)+','+p.location.lat.toFixed(6) : '未知'}]`,
                    point: p.location ? [p.location.lng, p.location.lat] : null
                }));
            } else {
                ElementPlus.ElMessage.info('未找到相关结果或查询失败 (' + status + ')');
            }
        });
      } catch (ex) {
        console.error(ex);
        searchLoading.value = false;
        ElementPlus.ElMessage.error('前端检索异常');
      }
    };

    let infoWindow = null;
    const viewOnMap = (item) => {
      if (mapInstance && item.point) {
        clearDrawings();
        mapInstance.setCenter(item.point);
        const marker = new AMap.Marker({
            position: item.point,
            title: item.title
        });
        mapInstance.add(marker);
        
        if (!infoWindow) {
            infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -30) });
        }
        infoWindow.setContent(`<strong>${item.title}</strong><br/>地址: ${item.address}`);
        infoWindow.open(mapInstance, item.point);
        
        marker.on('click', () => {
            infoWindow.open(mapInstance, item.point);
        });
      }
    };

    const quickSearch = (keyword) => {
      if (!mapReady.value || !mapInstance) return;
      activeTab.value = 'search';
      searchForm.apiMode = 'jsapi'; 
      searchForm.keyword = keyword;
      if (!globalRegion.value) {
        globalRegion.value = '北京';
      }
      doSearch();
    };

    const locateInput = () => {
      if (!mapReady.value || !mapInstance) return;
      const input = locateForm.input.trim();
      if (!input) return;

      const coordsParsed = MapUtils.parseCoords(input);
      if (coordsParsed) {
        const pt = [coordsParsed.lng, coordsParsed.lat];
        clearDrawings();
        const marker = new AMap.Marker({ position: pt });
        mapInstance.add(marker);
        mapInstance.setCenter(pt);
        mapInstance.setZoom(15);
        locateForm.resolvedCoords = `${coordsParsed.lng.toFixed(6)}, ${coordsParsed.lat.toFixed(6)}`;
        return;
      }

      // Use AMap.Geocoder
      const geocoder = new AMap.Geocoder({
          city: globalRegion.value && globalRegion.value !== '全国' ? globalRegion.value : undefined
      });
      geocoder.getLocation(input, (status, result) => {
          if (status === 'complete' && result.info === 'OK') {
              const loc = result.geocodes[0].location;
              const pt = [loc.lng, loc.lat];
              clearDrawings();
              mapInstance.setCenter(pt);
              mapInstance.setZoom(16);
              mapInstance.add(new AMap.Marker({ position: pt }));
              locateForm.resolvedCoords = `${loc.lng.toFixed(6)}, ${loc.lat.toFixed(6)}`;
          } else {
              ElementPlus.ElMessage.warning('未能解析该地址的坐标');
              locateForm.resolvedCoords = '';
          }
      });
    };

    // Address resolution
    const fallbackServerGeo = (address, resolve) => {
      if (!serverAk.value) { resolve(null); return; }
      const cityCode = (globalRegion.value && globalRegion.value !== '全国') ? encodeURIComponent(globalRegion.value) : '';
      MapUtils.jsonp(`https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&city=${cityCode}&output=json&key=${serverAk.value}`).then(res => {
        if (res && res.status === '1' && res.geocodes && res.geocodes.length > 0) {
          const locStr = res.geocodes[0].location;
          const parts = locStr.split(',');
          resolve({ lng: parseFloat(parts[0]), lat: parseFloat(parts[1]) });
        } else {
          resolve(null);
        }
      }).catch(() => resolve(null));
    };

    const getCoords = (addressOrCoords) => {
      return new Promise((resolve) => {
        const coordsParsed = MapUtils.parseCoords(addressOrCoords);
        if (coordsParsed) {
          resolve(coordsParsed);
          return;
        }
        
        const str = (addressOrCoords || '').trim();
        if (window.AMap && window.AMap.Geocoder) {
          const geocoder = new AMap.Geocoder({
            city: globalRegion.value && globalRegion.value !== '全国' ? globalRegion.value : undefined
          });
          geocoder.getLocation(str, (status, result) => {
            if (status === 'complete' && result.info === 'OK' && result.geocodes && result.geocodes.length > 0) {
               resolve({ lng: result.geocodes[0].location.lng, lat: result.geocodes[0].location.lat });
            } else {
               fallbackServerGeo(str, resolve);
            }
          });
        } else {
           fallbackServerGeo(str, resolve);
        }
      });
    };

    const parseServerRouteDetail = (res, travelMode) => {
      if (!res || res.status !== '1' || !res.route) return null;
      const paths = res.route.paths || res.route.transits || [];
      if (paths.length === 0) return null;

      return paths.map((path, idx) => {
        const detail = {
          index: idx + 1,
          distance: MapUtils.formatDistance(parseFloat(path.distance)),
          duration: MapUtils.formatDuration(parseFloat(path.duration || path.time || path.cost || 0)),
          steps: []
        };

        if (travelMode === 'transit' && path.segments) {
          path.segments.forEach((seg, sIdx) => {
             // Walking part
             if (seg.walking && seg.walking.steps && seg.walking.steps.length > 0) {
                 detail.steps.push({
                     index: detail.steps.length + 1,
                     instruction: `步行去搭乘公交/地铁`,
                     distance: MapUtils.formatDistance(parseFloat(seg.walking.distance || 0)),
                     duration: ''
                 });
             }
             // Bus part
             if (seg.bus && seg.bus.buslines && seg.bus.buslines.length > 0) {
                 const busline = seg.bus.buslines[0];
                 detail.steps.push({
                     index: detail.steps.length + 1,
                     instruction: `乘坐 ${busline.name}`,
                     vehicleName: busline.type,
                     distance: MapUtils.formatDistance(parseFloat(busline.distance || 0)),
                     duration: ''
                 });
             }
          });
        } else if (path.steps) {
          detail.steps = path.steps.map((step, i) => ({
            index: i + 1,
            instruction: (step.instruction || step.action || '向前行驶').replace(/<[^>]+>/g, ''),
            distance: MapUtils.formatDistance(parseFloat(step.distance)),
            duration: MapUtils.formatDuration(parseFloat(step.duration || step.time || 0))
          }));
        }
        return detail;
      });
    };

    let jsRoutePlugin = null; // Hold the instance to clear it

    const calcRoute = async () => {
      if (!routeForm.start || !routeForm.end) {
        ElementPlus.ElMessage.warning('请输入完整起点和终点');
        return;
      }

      routeLoading.value = true;
      routeDetailInfo.value = null;

      const originPt = await getCoords(routeForm.start);
      if (originPt) {
        const isCoordInput = routeForm.start.match(/^([-\d.]+)[,\s]+([-\d.]+)$/);
        routeForm.startCoords = isCoordInput ? '' : `${originPt.lng.toFixed(6)}, ${originPt.lat.toFixed(6)}`;
      } else {
        routeForm.startCoords = '解析失败';
        routeLoading.value = false;
        return;
      }

      const destPt = await getCoords(routeForm.end);
      if (destPt) {
        const isCoordInput = routeForm.end.match(/^([-\d.]+)[,\s]+([-\d.]+)$/);
        routeForm.endCoords = isCoordInput ? '' : `${destPt.lng.toFixed(6)}, ${destPt.lat.toFixed(6)}`;
      } else {
        routeForm.endCoords = '解析失败';
        routeLoading.value = false;
        return;
      }

      const travelMode = routeForm.travelMode || 'driving';

      if (mapInstance) {
        clearDrawings();
        if (jsRoutePlugin && typeof jsRoutePlugin.clear === 'function') {
           jsRoutePlugin.clear();
        }
        
        mapInstance.add(new AMap.Marker({ position: [originPt.lng, originPt.lat], title: '起点' }));
        mapInstance.add(new AMap.Marker({ position: [destPt.lng, destPt.lat], title: '终点' }));
        mapInstance.setFitView();
      }

      if (routeForm.apiMode === 'server') {
        if (!serverAk.value) {
          ElementPlus.ElMessage.warning('需要配置 服务端端侧 AK');
          routeLoading.value = false;
          return;
        }
        
        let subPath = 'driving';
        let queryStr = `origin=${originPt.lng},${originPt.lat}&destination=${destPt.lng},${destPt.lat}`;
        
        if (travelMode === 'transit') {
            subPath = 'transit/integrated';
            queryStr += `&city=${encodeURIComponent(globalRegion.value === '全国' ? '北京' : globalRegion.value)}`;
        } else if (travelMode === 'walking') {
            subPath = 'walking';
        } else if (travelMode === 'riding') {
            subPath = 'bicycling';
            // riding in Amap goes to v4
            queryStr = `origin=${originPt.lng},${originPt.lat}&destination=${destPt.lng},${destPt.lat}`;
        }
        
        const version = travelMode === 'riding' ? 'v4' : 'v3';
        const apiUrl = `https://restapi.amap.com/${version}/direction/${subPath}?${queryStr}&output=json&key=${serverAk.value}`;
        
        try {
          const res = await MapUtils.jsonp(apiUrl);
          routeResults.value = res;
          if (res && res.status === '1') {
            routeDetailInfo.value = parseServerRouteDetail(res, travelMode);
            ElementPlus.ElMessage.success('服务端 API 线路请求成功');
            if (mapInstance && window.AmapRouteDrawer) {
               window.AmapRouteDrawer.drawServerRoute(mapInstance, res, travelMode, {
                 startName: '起',
                 endName: '终'
               });
            }
          } else {
            ElementPlus.ElMessage.error(`服务端 API 返回错误: ${res.info || 'Unknown error'}`);
          }
        } catch (e) {
          console.error(e);
          ElementPlus.ElMessage.error('服务端 API 请求发生异常');
        } finally {
          routeLoading.value = false;
        }
        return;
      }

      // JS API Mode
      if (!mapReady.value || !mapInstance) {
        routeLoading.value = false;
        return;
      }

      let PluginClass;
      if (travelMode === 'driving') PluginClass = AMap.Driving;
      else if (travelMode === 'transit') PluginClass = AMap.Transfer;
      else if (travelMode === 'walking') PluginClass = AMap.Walking;
      else if (travelMode === 'riding') PluginClass = AMap.Riding;

      if (!PluginClass) {
          ElementPlus.ElMessage.warning('未能识别出行方式');
          routeLoading.value = false;
          return;
      }

      jsRoutePlugin = new PluginClass({
          map: mapInstance,
          city: globalRegion.value && globalRegion.value !== '全国' ? globalRegion.value : '北京市'
      });

      jsRoutePlugin.search([originPt.lng, originPt.lat], [destPt.lng, destPt.lat], (status, result) => {
          routeLoading.value = false;
          if (status === 'complete' && result.info === 'OK') {
             try {
                const details = [];
                const plans = result.plans || result.routes || (result.routes ? [result.routes[0]] : []);
                
                plans.slice(0, 5).forEach((plan, pIdx) => {
                   const distance = plan.distance || 0;
                   const duration = plan.time || plan.duration || 0;
                   const dInfo = {
                       index: pIdx + 1,
                       distance: MapUtils.formatDistance(distance),
                       duration: MapUtils.formatDuration(duration),
                       steps: []
                   };
                   
                   const steps = plan.steps || plan.segments || plan.rides || plan.walks || [];
                   steps.forEach((step, sIdx) => {
                       // Amap Transfer produces segments with transit_mode
                       if (travelMode === 'transit' && step.transit_mode) {
                          dInfo.steps.push({
                              index: sIdx + 1,
                              instruction: step.instruction || '搭乘公共交通',
                              distance: '',
                              duration: ''
                          });
                       } else {
                          dInfo.steps.push({
                              index: sIdx + 1,
                              instruction: (step.instruction || step.action || '向前').replace(/<[^>]+>/g, ''),
                              distance: MapUtils.formatDistance(step.distance || 0),
                              duration: ''
                          });
                       }
                   });
                   
                   details.push(dInfo);
                });
                routeDetailInfo.value = details;
             } catch(ex) {
                 console.warn('Extract route detail failed:', ex);
             }
          } else {
             ElementPlus.ElMessage.warning('前端路线规划失败: ' + status);
          }
      });
    };

    onMounted(() => {
      initConfig();
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
      loadAmap,
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
      routeResults,
      routeDetailInfo,
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
