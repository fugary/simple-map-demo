const { createApp, ref, onMounted, reactive, markRaw, computed } = Vue;

const app = createApp({
  setup() {
    const browserAkList = ref([]);
    const browserAk = ref('');
    const serverAkList = ref([]);
    const serverAk = ref('');
    const regionList = ref([]);
    const globalRegion = ref('全国');
    const mapReady = ref(false);
    const activeTab = ref('config');
    const mapScope = ref('domestic'); // 'domestic' or 'international'
    let mapInstance = null;

    // Loading states
    const mapLoading = ref(false);
    const searchLoading = ref(false);
    const routeLoading = ref(false);

    const searchForm = reactive({
      apiMode: 'webgl',
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
      apiMode: 'webgl',
      travelMode: 'driving',
      start: '',
      end: '',
      startCoords: '',
      endCoords: ''
    });
    const routeResults = ref(null);
    const routeDetailInfo = ref(null);
    const routeResultTab = ref('list');

    // Highlighted JSON computed properties (using shared utils)
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
      browserAkList.value = MapUtils.loadConfigList('baidu_map_browser_aks');
      if (browserAkList.value.length > 0) browserAk.value = browserAkList.value[0];

      serverAkList.value = MapUtils.loadConfigList('baidu_map_server_aks');
      if (serverAkList.value.length > 0) serverAk.value = serverAkList.value[0];

      regionList.value = MapUtils.loadConfigList('baidu_map_regions');
      if (regionList.value.length > 0) globalRegion.value = regionList.value[0];

    };

    const loadBaiduMap = () => {
      if (!browserAk.value && !serverAk.value) {
        ElementPlus.ElMessage.warning('至少配置一个 AK 以继续');
        return;
      }
      
      mapLoading.value = true;
      MapUtils.saveConfigVal(browserAkList, browserAk.value, 'baidu_map_browser_aks');
      MapUtils.saveConfigVal(serverAkList, serverAk.value, 'baidu_map_server_aks');
      MapUtils.saveConfigVal(regionList, globalRegion.value, 'baidu_map_regions');
      
      if (!browserAk.value) {
        mapReady.value = true;
        mapLoading.value = false;
        ElementPlus.ElMessage.info('未填浏览器端 AK，仅可测试 Server 服务端 API。');
        return;
      }

      if (window.BMapGL) {
        initMap();
        return;
      }

      window.initBaiduMapCallback = () => {
        initMap();
      };

      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = `https://api.map.baidu.com/api?v=1.0&type=webgl&ak=${browserAk.value}&callback=initBaiduMapCallback`;
      script.onerror = () => {
        mapLoading.value = false;
        ElementPlus.ElMessage.error('百度地图引擎加载失败，请检查 AK 或网络！');
      };
      document.body.appendChild(script);
    };

    // 判断坐标是否在中国境内（粗略矩形边界）
    const isInChina = (lng, lat) => {
      return lng >= 73.5 && lng <= 135.1 && lat >= 3.8 && lat <= 53.6;
    };

    const initMap = () => {
      try {
        mapInstance = markRaw(new BMapGL.Map('map-container'));
        
        const region = (globalRegion.value || '').trim();
        // 如果有指定城市默认立即定位到该城市字符串进行初始化，否则 fallback 为北京坐标
        if (region && region !== '全国') {
            mapInstance.centerAndZoom(region, 12);
        } else {
            mapInstance.centerAndZoom(new BMapGL.Point(116.404, 39.915), 11);
        }
        
        mapInstance.enableScrollWheelZoom(true);
        mapReady.value = true;
        mapLoading.value = false;
        ElementPlus.ElMessage.success('地图加载成功');
        
        mapInstance.addControl(new BMapGL.ScaleControl());  
        mapInstance.addControl(new BMapGL.ZoomControl());

        // 使用检索或者 tilesloaded 事件异步确认是否为国内/国际范围
        autoDetectMapScope(region);
      } catch (e) {
        console.error('Map init error:', e);
        mapLoading.value = false;
        ElementPlus.ElMessage.error('地图初始化失败，请检查 AK 是否合法并已授权该域名！');
      }
    };

    // 辅助异步检测当前地图环境（国内/国际）并记录坐标
    const autoDetectMapScope = (region) => {
      if (!region || region === '全国') {
        // 没有指定城市，保持默认北京中心，标记为国内
        mapScope.value = 'domestic';
        console.log('[MapScope] 默认: domestic (未指定城市)');
        return;
      }

      // 使用 LocalSearch 获取坐标用于 scope 判定
      const searchInstance = new window.BMapGL.LocalSearch(mapInstance, {
        onSearchComplete: (results) => {
          if (searchInstance.getStatus() === window.BMAP_STATUS_SUCCESS && results.getCurrentNumPois() > 0) {
            const poi = results.getPoi(0);
            if (poi.point) {
              // 确保准确的精准坐标并纠正视角
              mapInstance.centerAndZoom(new BMapGL.Point(poi.point.lng, poi.point.lat), 12);
              const detected = isInChina(poi.point.lng, poi.point.lat) ? 'domestic' : 'international';
              mapScope.value = detected;
              console.log(`[MapScope] 自动检测: ${detected} (center: ${poi.point.lng.toFixed(4)}, ${poi.point.lat.toFixed(4)})`);
            }
          } else {
            // LocalSearch 未找到结果，等 tilesloaded 后根据实际中心判断
            mapInstance.addEventListener('tilesloaded', function onTilesLoaded() {
              mapInstance.removeEventListener('tilesloaded', onTilesLoaded);
              const center = mapInstance.getCenter();
              if (center) {
                const detected = isInChina(center.lng, center.lat) ? 'domestic' : 'international';
                mapScope.value = detected;
                console.log(`[MapScope] 回退检测: ${detected} (center: ${center.lng.toFixed(4)}, ${center.lat.toFixed(4)})`);
              }
            });
          }
        },
        pageCapacity: 1
      });
      searchInstance.search(region);
    };

    const doSearch = async () => {
      if (!searchForm.keyword) {
        ElementPlus.ElMessage.warning('请输入查询关键字');
        return;
      }

      searchLoading.value = true;

      if (searchForm.apiMode === 'server') {
        if (!serverAk.value) {
          ElementPlus.ElMessage.warning('需要配置 服务端端侧 AK');
          searchLoading.value = false;
          return;
        }
        try {
          const isAbroad = mapScope.value === 'international';
          const apiPath = isAbroad ? 'place_abroad/v1/search' : 'place/v2/search';
          const url = `https://api.map.baidu.com/${apiPath}?query=${encodeURIComponent(searchForm.keyword)}&region=${encodeURIComponent(globalRegion.value || '全国')}&output=json&ak=${serverAk.value}`;
          const res = await MapUtils.jsonp(url);
          serverSearchRawData.value = res;
          if (res && res.status === 0) {
            searchResults.value = (res.results || []).map(r => ({
              title: r.name || '无名称',
              address: `${r.address || '无具体地址'} [坐标: ${r.location ? r.location.lng+','+r.location.lat : '未知'}]`,
              point: r.location ? new window.BMapGL.Point(r.location.lng, r.location.lat) : null
            }));
            ElementPlus.ElMessage.success('服务端 API 请求成功 (共找到 ' + searchResults.value.length + ' 条记录)');
          } else {
            const extraMsg = res.status === 211 ? " (错误 211：APP被禁用或未添加该域名的白名单，请至控制台检查 AK 设置)" : "";
            ElementPlus.ElMessage.error(`服务端 API 返回错误: ${res.message || 'Unknown error'}${extraMsg}`);
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

      // WebGL Mode
      if (!mapReady.value || !mapInstance) {
        searchLoading.value = false;
        return;
      }
      mapInstance.clearOverlays();
      if (window.BaiduRouteDrawer) {
        window.BaiduRouteDrawer.clearRoute(mapInstance);
      }
      serverSearchRawData.value = null;

      const searchTimer = window.setTimeout(() => {
        if (searchLoading.value) {
          searchLoading.value = false;
          ElementPlus.ElMessage.warning('前端地图搜索超时');
        }
      }, 15000);

      const options = {
        onSearchComplete: (results) => {
          window.clearTimeout(searchTimer);
          searchLoading.value = false;
          if (local.getStatus() === window.BMAP_STATUS_SUCCESS) {
            searchResults.value = [];
            for (let i = 0; i < results.getCurrentNumPois(); i++) {
              const poi = results.getPoi(i);
              searchResults.value.push({
                title: poi.title || '无名称',
                address: `${poi.address || '无地址信息'} [坐标: ${poi.point ? poi.point.lng.toFixed(6)+','+poi.point.lat.toFixed(6) : '未知'}]`,
                point: poi.point
              });
            }
          } else {
            ElementPlus.ElMessage.info('未找到相关结果');
            searchResults.value = [];
          }
        },
        pageCapacity: searchForm.count || 10
      };

      const local = new window.BMapGL.LocalSearch(mapInstance, options);
      if (globalRegion.value && globalRegion.value !== '全国') {
        local.setLocation(globalRegion.value);
      }
      local.search(searchForm.keyword);
    };

    const viewOnMap = (item) => {
      if (mapInstance && item.point) {
        mapInstance.panTo(item.point);
        mapInstance.clearOverlays();
        if (window.BaiduRouteDrawer) {
          window.BaiduRouteDrawer.clearRoute(mapInstance);
        }
        const marker = new window.BMapGL.Marker(item.point);
        mapInstance.addOverlay(marker);
        
        const infoWindow = new window.BMapGL.InfoWindow(`地址: ${item.address || '无'}`, {
          title: item.title,
          width: 250,
          height: 80
        });
        marker.addEventListener('click', function() {          
          mapInstance.openInfoWindow(infoWindow, item.point);
        });
        mapInstance.openInfoWindow(infoWindow, item.point);
      }
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

    const locateInput = () => {
      if (!mapReady.value || !mapInstance) return;
      const input = locateForm.input.trim();
      if (!input) return;

      const coordsParsed = MapUtils.parseCoords(input);
      if (coordsParsed) {
        const pt = new window.BMapGL.Point(coordsParsed.lng, coordsParsed.lat);
        mapInstance.clearOverlays();
        if (window.BaiduRouteDrawer) {
          window.BaiduRouteDrawer.clearRoute(mapInstance);
        }
        const marker = new window.BMapGL.Marker(pt);
        mapInstance.addOverlay(marker);
        mapInstance.panTo(pt);
        mapInstance.setZoom(15);
        locateForm.resolvedCoords = `${coordsParsed.lng.toFixed(6)}, ${coordsParsed.lat.toFixed(6)}`;
        return;
      }

      // 用 BMapGL.LocalSearch 搜索取首条结果坐标（国内国际通用）
      localSearchGeo(input).then(loc => {
        if (loc) {
          const pt = new window.BMapGL.Point(loc.lng, loc.lat);
          mapInstance.clearOverlays();
          if (window.BaiduRouteDrawer) {
            window.BaiduRouteDrawer.clearRoute(mapInstance);
          }
          mapInstance.centerAndZoom(pt, 16);
          mapInstance.addOverlay(new window.BMapGL.Marker(pt));
          locateForm.resolvedCoords = `${loc.lng.toFixed(6)}, ${loc.lat.toFixed(6)}`;
        } else {
          ElementPlus.ElMessage.warning('未能解析该地址的坐标');
          locateForm.resolvedCoords = '';
        }
      });
    };

    // 通用 Geocoding：通过 BMapGL.LocalSearch 搜索取首条结果坐标（前端两步机制，国内国际通用）
    const localSearchGeo = (keyword) => {
      return new Promise((resolve) => {
        if (!mapInstance) { resolve(null); return; }

        const locTimer = window.setTimeout(() => {
          resolve(null);
        }, 10000);

        const searchInstance = new window.BMapGL.LocalSearch(mapInstance, {
          onSearchComplete: (results) => {
            window.clearTimeout(locTimer);
            if (searchInstance.getStatus() === window.BMAP_STATUS_SUCCESS && results.getCurrentNumPois() > 0) {
              const poi = results.getPoi(0);
              resolve(poi.point ? { lng: poi.point.lng, lat: poi.point.lat } : null);
            } else {
              resolve(null);
            }
          },
          pageCapacity: 1
        });
        if (globalRegion.value && globalRegion.value !== '全国') {
          searchInstance.setLocation(globalRegion.value);
        }
        searchInstance.search(keyword);
      });
    };

    // 服务端 Geocoding 回退：通过 geocoding/v3 解析地址（仅服务端模式无前端 SDK 时使用）
    const fallbackServerGeo = (address, resolve) => {
      if (!serverAk.value) { resolve(null); return; }
      const regionToGeocode = (globalRegion.value && globalRegion.value !== '全国') ? globalRegion.value : '';
      MapUtils.jsonp(`https://api.map.baidu.com/geocoding/v3/?address=${encodeURIComponent(address)}&city=${encodeURIComponent(regionToGeocode)}&output=json&ak=${serverAk.value}`).then(res => {
        if (res && res.status === 0 && res.result && res.result.location) {
          resolve({ lng: res.result.location.lng, lat: res.result.location.lat });
        } else {
          resolve(null);
        }
      }).catch(() => resolve(null));
    };

    // 地址解析：优先用前端 LocalSearch，回退服务端 geocoding
    const getCoords = (addressOrCoords) => {
      return new Promise((resolve) => {
        const coordsParsed = MapUtils.parseCoords(addressOrCoords);
        if (coordsParsed) {
          resolve(coordsParsed);
          return;
        }
        
        const str = (addressOrCoords || '').trim();

        // 前端 LocalSearch 取坐标（国内国际通用）
        if (mapInstance) {
          localSearchGeo(str).then(result => {
            if (result) {
              resolve(result);
            } else {
              fallbackServerGeo(str, resolve);
            }
          });
          return;
        }

        // 无前端 SDK 时走服务端
        fallbackServerGeo(str, resolve);
      });
    };

    // Parse server route response to extract detail info
    const parseServerRouteDetail = (res, travelMode) => {
      if (!res || res.status !== 0 || !res.result || !res.result.routes) return null;
      const routes = res.result.routes;
      if (routes.length === 0) return null;

      return routes.map((route, idx) => {
        const detail = {
          index: idx + 1,
          distance: MapUtils.formatDistance(route.distance),
          duration: MapUtils.formatDuration(route.duration),
          rawDistance: route.distance,
          rawDuration: route.duration,
          steps: []
        };

        if (travelMode === 'transit' && route.steps) {
          route.steps.forEach((stepGroup, gi) => {
            const segments = Array.isArray(stepGroup) ? stepGroup : [stepGroup];
            segments.forEach((seg, si) => {
              const stepItem = {
                index: gi * 10 + si + 1,
                instruction: '',
                distance: seg.distance ? MapUtils.formatDistance(seg.distance) : '',
                duration: seg.duration ? MapUtils.formatDuration(seg.duration) : '',
                type: seg.type || 0,
                vehicleName: ''
              };
              if (seg.vehicle && seg.vehicle.name) {
                stepItem.vehicleName = seg.vehicle.name;
                const startStop = seg.vehicle.start_name || '';
                const endStop = seg.vehicle.end_name || '';
                const passStops = seg.vehicle.stop_num ? `途经 ${seg.vehicle.stop_num} 站` : '';
                stepItem.instruction = `乘坐 ${seg.vehicle.name}` +
                  (startStop ? `（${startStop}` : '') +
                  (endStop ? ` → ${endStop}）` : startStop ? '）' : '') +
                  (passStops ? ` ${passStops}` : '');
              } else if (seg.instruction) {
                stepItem.instruction = seg.instruction.replace(/<[^>]+>/g, '');
              } else {
                stepItem.instruction = seg.distance ? `步行 ${MapUtils.formatDistance(seg.distance)}` : '步行';
              }
              detail.steps.push(stepItem);
            });
          });
        } else if (route.steps) {
          detail.steps = route.steps.map((step, i) => ({
            index: i + 1,
            instruction: (step.instruction || '').replace(/<[^>]+>/g, ''),
            distance: step.distance ? MapUtils.formatDistance(step.distance) : '',
            duration: step.duration ? MapUtils.formatDuration(step.duration) : ''
          }));
        }

        return detail;
      });
    };

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
        ElementPlus.ElMessage.error(`无法解析起点地址坐标：${routeForm.start}`);
        routeForm.startCoords = '解析失败';
        routeLoading.value = false;
        return;
      }

      const destPt = await getCoords(routeForm.end);
      if (destPt) {
        const isCoordInput = routeForm.end.match(/^([-\d.]+)[,\s]+([-\d.]+)$/);
        routeForm.endCoords = isCoordInput ? '' : `${destPt.lng.toFixed(6)}, ${destPt.lat.toFixed(6)}`;
      } else {
        ElementPlus.ElMessage.error(`无法解析终点地址坐标：${routeForm.end}`);
        routeForm.endCoords = '解析失败';
        routeLoading.value = false;
        return;
      }

      const travelMode = routeForm.travelMode || 'driving';

      // 提取起点和终点输入框的第一个字作为图钉文字
      const startName = '起';
      const endName = '终';

      // 坐标解析完成后，先在地图上显示起终点标记
      if (mapInstance) {
        mapInstance.clearOverlays();
        const startPt = new window.BMapGL.Point(originPt.lng, originPt.lat);
        const endPt = new window.BMapGL.Point(destPt.lng, destPt.lat);
        
        // 渲染输入的起终点坐标为默认红色 Marker
        mapInstance.addOverlay(new window.BMapGL.Marker(startPt, { title: '起点' }));
        mapInstance.addOverlay(new window.BMapGL.Marker(endPt, { title: '终点' }));

        if (window.BaiduRouteDrawer) {
          window.BaiduRouteDrawer.clearRoute(mapInstance);
        }
        
        // 自动调整视野包含两个点
        const viewPoints = [startPt, endPt];
        mapInstance.setViewport(viewPoints, { margins: [50, 50, 50, 50] });
      }

      if (routeForm.apiMode === 'server') {
        if (!serverAk.value) {
          ElementPlus.ElMessage.warning('需要配置 服务端端侧 AK');
          routeLoading.value = false;
          return;
        }
        
        const isAbroad = mapScope.value === 'international';
        const dirBase = isAbroad ? 'direction_abroad/v1' : 'directionlite/v1';
        let apiUrl = `https://api.map.baidu.com/${dirBase}/${travelMode}?output=json&ak=${serverAk.value}`;
        apiUrl += `&origin=${originPt.lat},${originPt.lng}&destination=${destPt.lat},${destPt.lng}`;
        
        try {
          const res = await MapUtils.jsonp(apiUrl);
          routeResults.value = res;
          if (res && res.status === 0) {
            routeDetailInfo.value = parseServerRouteDetail(res, travelMode);
            ElementPlus.ElMessage.success('服务端 API 线路请求成功');
            if (mapInstance && window.BaiduRouteDrawer) {
               window.BaiduRouteDrawer.drawServerRoute(mapInstance, res, travelMode, {
                 startName,
                 endName,
                 showRouteEndpoints: true
               });
            }
          } else {
            const extraMsg = res.status === 211 ? " (错误 211：APP被禁用，检查 AK 白名单设置)" : "";
            ElementPlus.ElMessage.error(`服务端 API 返回错误: ${res.message || 'Unknown error'}${extraMsg}`);
          }
        } catch (e) {
          console.error(e);
          ElementPlus.ElMessage.error('服务端 API 请求发生异常');
        } finally {
          routeLoading.value = false;
        }
        return;
      }

      // WebGL Mode
      if (!mapReady.value || !mapInstance) {
        routeLoading.value = false;
        return;
      }
      // 不再重复 clearOverlays，上方已为起终点添加了标记
      
      const calcTimer = window.setTimeout(() => {
        if (routeLoading.value) {
          routeLoading.value = false;
          ElementPlus.ElMessage.warning('前端路线规划请求超时');
        }
      }, 15000);

      let routeInstance;
      const opts = {
        renderOptions: {
          map: mapInstance,
          autoViewport: true
        },
        onSearchComplete: (result) => {
          window.clearTimeout(calcTimer);
          routeLoading.value = false;
          if (routeInstance && routeInstance.getStatus() !== window.BMAP_STATUS_SUCCESS) {
            ElementPlus.ElMessage.warning('前端路线规划失败：无可用路线或跨国不支持 (错误码: ' + routeInstance.getStatus() + ')');
          } else if (routeInstance && routeInstance.getStatus() === window.BMAP_STATUS_SUCCESS) {
            try {
              if (travelMode === 'transit') {
                const details = [];
                const numPlans = result.getNumPlans ? result.getNumPlans() : 0;
                for (let p = 0; p < numPlans && p < 5; p++) {
                  const plan = result.getPlan(p);
                  if (!plan) continue;
                  const planDetail = {
                    index: p + 1,
                    distance: plan.getDistance ? MapUtils.formatDistance(plan.getDistance(false)) : '未知',
                    duration: plan.getDuration ? MapUtils.formatDuration(plan.getDuration(false)) : '未知',
                    steps: []
                  };
                  const desc = plan.getDescription ? plan.getDescription() : '';
                  if (desc) {
                    planDetail.steps.push({
                      index: 1,
                      instruction: typeof desc === 'string' ? desc.replace(/<[^>]+>/g, '') : String(desc),
                      distance: '',
                      duration: ''
                    });
                  }
                  details.push(planDetail);
                }
                routeDetailInfo.value = details.length > 0 ? details : null;
              } else {
                const plan = result.getPlan(0);
                if (plan) {
                  const detail = {
                    index: 1,
                    distance: plan.getDistance ? MapUtils.formatDistance(plan.getDistance(false)) : '未知',
                    duration: plan.getDuration ? MapUtils.formatDuration(plan.getDuration(false)) : '未知',
                    steps: []
                  };
                  console.log('--- Plan Detail debug ---');
                  console.log(plan);
                  const numRoutes = plan.getNumRoutes ? plan.getNumRoutes() : 1;
                  console.log(`numRoutes: ${numRoutes}`);
                  for (let r = 0; r < numRoutes; r++) {
                    const routeObj = plan.getRoute ? plan.getRoute(r) : null;
                    console.log(`routeObj ${r}:`, routeObj);
                    if (routeObj && routeObj.getNumSteps) {
                      const numSteps = routeObj.getNumSteps();
                      console.log(`numSteps ${r}: ${numSteps}`);
                      for (let i = 0; i < numSteps; i++) {
                        const step = routeObj.getStep(i);
                        const desc = step.getDescription ? step.getDescription(true) : '';
                        const dist = step.getDistance ? step.getDistance(false) : 0;
                        detail.steps.push({
                          index: detail.steps.length + 1,
                          instruction: (typeof desc === 'string' ? desc : String(desc)).replace(/<[^>]+>/g, ''),
                          distance: dist ? MapUtils.formatDistance(dist) : '',
                          duration: ''
                        });
                      }
                    }
                  }
                  routeDetailInfo.value = [detail];
                }
              }
            } catch (ex) {
              console.warn('Extract webgl route detail failed:', ex);
            }
          }
        }
      };

      // 始终使用 mapInstance 作为路线搜索上下文，search() 已传入明确坐标，无需依赖城市名字符串
      const routeLocation = mapInstance;

      if (travelMode === 'driving') {
        routeInstance = new window.BMapGL.DrivingRoute(routeLocation, opts);
      } else if (travelMode === 'transit') {
        routeInstance = new window.BMapGL.TransitRoute(routeLocation, opts);
      } else if (travelMode === 'walking') {
        routeInstance = new window.BMapGL.WalkingRoute(routeLocation, opts);
      } else {
        ElementPlus.ElMessage.warning('前端 WebGL 模式暂不支持骑行路线规划，请切换到服务端模式');
        routeLoading.value = false;
        return;
      }
      
      if (routeInstance) {
        routeInstance.search(new window.BMapGL.Point(originPt.lng, originPt.lat), new window.BMapGL.Point(destPt.lng, destPt.lat));
      }
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
      regionList,
      globalRegion,
      mapReady,
      mapScope,
      mapLoading,
      loadBaiduMap,
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
