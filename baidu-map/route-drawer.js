/**
 * BaiduMap Route Drawer
 * 用于将服务端（纯数据API）返回的路线数据在 BMapGL 地图上绘制出来
 * 支持解析 driving, walking, riding, transit 等不同出行方式的路径集合
 * 尽量还原百度地图 WebGL 默认路径绘制样式
 */
window.BaiduRouteDrawer = (() => {
  // 记录绘制的业务覆盖物，不干扰外部
  let currentOverlays = [];

  const clearRoute = (map) => {
    if (!map) return;
    currentOverlays.forEach(overlay => map.removeOverlay(overlay));
    currentOverlays = [];
  };

  /**
   * 获取原生的带文字的地图 Pin SVG 图标
   * @param {string} color 图标主色调
   * @param {string} text 图标中心文字，默认单字
   */
  const getPinIcon = (color, text) => {
    // 动态计算文字长度，如果多于一个字稍微缩小字体保证能放下
    const fontSize = text.length > 1 ? "10" : "12";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="24" height="32"><path d="M16 0C7.163 0 0 7.163 0 16c0 10.5 14.5 24.5 15.2 25.2.4.4 1.2.4 1.6 0C17.5 40.5 32 26.5 32 16 32 7.163 24.837 0 16 0z" fill="${color}"/><circle cx="16" cy="15" r="10" fill="white"/><text x="16" y="19" font-family="sans-serif" font-size="${fontSize}" font-weight="bold" fill="${color}" text-anchor="middle">${text}</text></svg>`;
    return new window.BMapGL.Icon(
      'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
      new window.BMapGL.Size(24, 32),
      { anchor: new window.BMapGL.Size(12, 32) }
    );
  };

  /**
   * 获取公交/地铁换乘节点图标
   */
  const getTransferIcon = () => {
    // 仿百度 WebGL 的公交/地铁小图标，内部小车图形的方形轮廓，蓝色实心底、白色车厢外框
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
      <circle cx="12" cy="12" r="11.5" fill="#2878FF" stroke="white" stroke-width="1.5"/>
      <path d="M7 8.5C7 7.12 8.12 6 9.5 6h5c1.38 0 2.5 1.12 2.5 2.5v6c0 .83-.67 1.5-1.5 1.5H8.5C7.67 16 7 15.33 7 14.5v-6z" fill="none" stroke="white" stroke-width="1.5"/>
      <path d="M7 10h10M9 13v1M15 13v1" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M8.5 16v1.5M15.5 16v1.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;
    return new window.BMapGL.Icon(
      'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
      new window.BMapGL.Size(20, 20),
      { anchor: new window.BMapGL.Size(10, 10) }
    );
  };

  /**
   * 绘制起终点坐标
   * 支持传入自定义的文字
   */
  const drawRouteEndpoints = (map, startPt, endPt, startName = '起', endName = '终') => {
    const sp = new window.BMapGL.Point(startPt.lng, startPt.lat);
    const ep = new window.BMapGL.Point(endPt.lng, endPt.lat);

    // 起点绿起，终点红终
    const startMarker = new window.BMapGL.Marker(sp, { icon: getPinIcon('#14C83F', startName) });
    const endMarker = new window.BMapGL.Marker(ep, { icon: getPinIcon('#F55353', endName) });

    map.addOverlay(startMarker);
    map.addOverlay(endMarker);
    currentOverlays.push(startMarker, endMarker);
    
    return [sp, ep];
  };

  /**
   * 绘制服务端路线数据
   * @param {BMapGL.Map} map - 百度地图实例
   * @param {Object} res - 服务端完整的响应JSON
   * @param {string} travelMode - 出现方式: driving, transit, walking, riding
   * @param {Object} options - 配置对象，支持 startName, endName, showRouteEndpoints 等
   */
  const drawServerRoute = (map, res, travelMode, options = {}) => {
    const {
      startName = '起',
      endName = '终',
      showRouteEndpoints = true
    } = options;

    if (!map || !res || res.status !== 0 || !res.result || !res.result.routes || res.result.routes.length === 0) {
      return;
    }

    clearRoute(map);

    const route = res.result.routes[0]; // 取第一个方案绘制
    const allPoints = [];
    const routePoints = []; // 保存路线真实的每一个节点

    // 解析路径坐标
    if (travelMode === 'transit' && route.steps) {
      route.steps.forEach(stepGroup => {
        const segments = Array.isArray(stepGroup) ? stepGroup : [stepGroup];
        segments.forEach(seg => {
          if (seg.path) {
            const points = [];
            const pathArr = seg.path.split(';');
            pathArr.forEach(p => {
              if (!p) return;
              const coords = p.split(',');
              if (coords.length >= 2) {
                const pt = new window.BMapGL.Point(parseFloat(coords[0]), parseFloat(coords[1]));
                points.push(pt);
                allPoints.push(pt);
                routePoints.push(pt);
              }
            });
            
            // 判断是否是步行段
            // 百度公交服务端API中，seg.type 的含义： 1:火车, 2:飞机, 3:公交/地铁, 4:驾车, 5:步行, 6:大巴
            let isWalking = false;
            if (seg.type !== undefined) {
               isWalking = String(seg.type) === '5';
            } else if (seg.instruction) {
               isWalking = seg.instruction.includes('步行') && !seg.instruction.includes('乘坐');
            }
            
            // 百度公交前端：步行是绿色 (例如 #14C83F)，公交是实线蓝色 (#2878FF) 
            const color = isWalking ? '#14C83F' : '#2878FF';
            const weight = 6;
            const style = 'solid'; // 全部改为实线以贴合截图

            const polyline = new window.BMapGL.Polyline(points, {
              strokeColor: color, 
              strokeWeight: weight, 
              strokeOpacity: 0.8,
              strokeStyle: style
            });
            map.addOverlay(polyline);
            currentOverlays.push(polyline);

            // 如果是公交/地铁段，在其起点增加一个换乘/上车小标
            if (!isWalking && points.length > 0) {
              const attachMarker = (pt) => {
                const nodeMarker = new window.BMapGL.Marker(pt, { icon: getTransferIcon() });
                // 绑定点击弹出信息窗口
                if (seg.instruction) {
                  nodeMarker.addEventListener('click', () => {
                    const infoWindow = new window.BMapGL.InfoWindow(
                      `<div style="font-size:14px;padding:5px;">${seg.instruction}</div>`, 
                      { width: 250, offset: new window.BMapGL.Size(0, -10) }
                    );
                    map.openInfoWindow(infoWindow, pt);
                  });
                }
                map.addOverlay(nodeMarker);
                currentOverlays.push(nodeMarker);
              };
              
              // 起点（上车站）
              attachMarker(points[0]);
              // 终点（下车站），如果和起点不是同一个点
              if (points.length > 1) {
                attachMarker(points[points.length - 1]);
              }
            }
          }
        });
      });
    } else if (route.steps) {
      // driving, walking, riding
      route.steps.forEach(step => {
        if (step.path) {
          const points = [];
          const pathArr = step.path.split(';');
          pathArr.forEach(p => {
            if (!p) return;
            const coords = p.split(',');
            if (coords.length >= 2) {
              const pt = new window.BMapGL.Point(parseFloat(coords[0]), parseFloat(coords[1]));
              points.push(pt);
              allPoints.push(pt);
              routePoints.push(pt);
            }
          });
          
          let defaultColor = '#14C83F';
          let weight = 6;
          let style = 'solid';

          if (travelMode === 'transit') {
             // 容错处理
             defaultColor = '#2878FF';
          }

          const polyline = new window.BMapGL.Polyline(points, {
            strokeColor: defaultColor, 
            strokeWeight: weight, 
            strokeOpacity: 0.8,
            strokeStyle: style
          });
          map.addOverlay(polyline);
          currentOverlays.push(polyline);
        }
      });
    }

    // 在路线实际起点和终点绘制自定义图标
    if (showRouteEndpoints && routePoints.length > 0) {
      const actualStart = routePoints[0];
      const actualEnd = routePoints[routePoints.length - 1];
      const eps = drawRouteEndpoints(map, actualStart, actualEnd, startName, endName);
      allPoints.push(...eps);
    }

    // 自动调整视野包含起终点及所有途径点
    if (allPoints.length > 0) {
      map.setViewport(allPoints, { margins: [50, 50, 50, 50] });
    }
  };

  return {
    drawServerRoute,
    drawRouteEndpoints,
    clearRoute
  };
})();
