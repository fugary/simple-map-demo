/* global AMap */
/**
 * Amap Route Drawer
 * 用于将服务端（纯数据API）返回的高德路线数据在 AMap 地图上绘制出来
 * 支持解析 driving, walking, riding, transit 等不同出行方式的路径集合
 */
window.AmapRouteDrawer = (() => {
  let currentOverlays = [];
  let nearbyOverlays = [];

  const clearRoute = (map, isNearby = false) => {
    if (!map) return;
    const overlays = isNearby ? nearbyOverlays : currentOverlays;
    overlays.forEach(overlay => {
       if (map.remove) map.remove(overlay);
    });
    if (isNearby) nearbyOverlays = [];
    else currentOverlays = [];
  };

  /**
   * 获取带文字的地图 Pin SVG Html 内容
   * @param {string} color 图标主色调
   * @param {string} text 图标中心文字，默认单字
   */
  const getPinIconContent = (color, text) => {
    const fontSize = text.length > 1 ? "10" : "12";
    const svg = `<div style="width:24px;height:32px;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="24" height="32"><path d="M16 0C7.163 0 0 7.163 0 16c0 10.5 14.5 24.5 15.2 25.2.4.4 1.2.4 1.6 0C17.5 40.5 32 26.5 32 16 32 7.163 24.837 0 16 0z" fill="${color}"/><circle cx="16" cy="15" r="10" fill="white"/><text x="16" y="19" font-family="sans-serif" font-size="${fontSize}" font-weight="bold" fill="${color}" text-anchor="middle">${text}</text></svg></div>`;
    return svg;
  };

  /**
   * 获取公交/地铁换乘节点图标
   */
  const getTransferIconContent = () => {
    const svg = `<div style="width:20px;height:20px;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
      <circle cx="12" cy="12" r="11.5" fill="#2878FF" stroke="white" stroke-width="1.5"/>
      <path d="M7 8.5C7 7.12 8.12 6 9.5 6h5c1.38 0 2.5 1.12 2.5 2.5v6c0 .83-.67 1.5-1.5 1.5H8.5C7.67 16 7 15.33 7 14.5v-6z" fill="none" stroke="white" stroke-width="1.5"/>
      <path d="M7 10h10M9 13v1M15 13v1" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M8.5 16v1.5M15.5 16v1.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    </svg></div>`;
    return svg;
  };

  const drawRouteEndpoints = (map, startPt, endPt, startName = '起', endName = '终', isNearby = false) => {
    const sp = [startPt.lng, startPt.lat];
    const ep = [endPt.lng, endPt.lat];

    const startMarker = new AMap.Marker({
        position: sp,
        content: getPinIconContent('#14C83F', startName),
        offset: new AMap.Pixel(-12, -32),
        zIndex: 100
    });
    const endMarker = new AMap.Marker({
        position: ep,
        content: getPinIconContent('#F55353', endName),
        offset: new AMap.Pixel(-12, -32),
        zIndex: 100
    });

    map.add(startMarker);
    map.add(endMarker);
    if (isNearby) nearbyOverlays.push(startMarker, endMarker);
    else currentOverlays.push(startMarker, endMarker);
    
    return [sp, ep];
  };

  const drawServerRoute = (map, res, travelMode, options = {}, isNearby = false) => {
    const {
      startName = '起',
      endName = '终',
      showRouteEndpoints = true
    } = options;

    if (!map || !res || res.status !== '1' || !res.route) {
      return;
    }

    clearRoute(map, isNearby);

    const paths = res.route.paths || res.route.transits || [];
    if (paths.length === 0) return;

    const route = paths[0]; // first scheme
    const allPoints = [];
    const routePoints = [];

    const drawPolyline = (polylineStr, isWalking = false) => {
        if (!polylineStr) return;
        const points = [];
        polylineStr.split(';').forEach(p => {
           if (!p) return;
           const coords = p.split(',');
           if (coords.length >= 2) {
               const pt = [parseFloat(coords[0]), parseFloat(coords[1])];
               points.push(pt);
               allPoints.push(pt);
               routePoints.push({lng: pt[0], lat: pt[1]});
           }
        });
        
        if (points.length === 0) return points;

        const color = isWalking ? '#14C83F' : (travelMode === 'transit' ? '#2878FF' : '#14C83F');
        
        const polyline = new AMap.Polyline({
            path: points,
            strokeColor: color,
            strokeWeight: 6,
            strokeOpacity: 0.8,
            strokeStyle: isWalking ? 'dashed' : 'solid',
            lineJoin: 'round',
            lineCap: 'round',
            zIndex: 50
        });
        
        map.add(polyline);
        if (isNearby) nearbyOverlays.push(polyline);
        else currentOverlays.push(polyline);
        return points;
    };

    if (travelMode === 'transit' && route.segments) {
      route.segments.forEach(seg => {
         // Walk
         if (seg.walking && seg.walking.steps) {
             seg.walking.steps.forEach(step => {
                 drawPolyline(step.polyline, true);
             });
         }
         // Bus/Subway
         if (seg.bus && seg.bus.buslines && seg.bus.buslines.length > 0) {
             const busline = seg.bus.buslines[0];
             const pts = drawPolyline(busline.polyline, false);
             
             if (pts && pts.length > 0) {
                 // Add transfer node marker
                 const nodeMarker = new AMap.Marker({
                     position: pts[0],
                     content: getTransferIconContent(),
                     offset: new AMap.Pixel(-10, -10),
                     zIndex: 60
                 });
                 // Click popup
                 const instruction = `乘坐 ${busline.name} (共${busline.via_num || 0}站)`;
                 nodeMarker.on('click', () => {
                     const infoWindow = new AMap.InfoWindow({
                         content: `<div style="font-size:14px;padding:5px;">${instruction}</div>`,
                         offset: new AMap.Pixel(0, -10)
                     });
                     infoWindow.open(map, pts[0]);
                 });
                 map.add(nodeMarker);
                 if (isNearby) nearbyOverlays.push(nodeMarker);
                 else currentOverlays.push(nodeMarker);
                 
                 // End station transfer marker
                 if (pts.length > 1) {
                     const endMarker = new AMap.Marker({
                         position: pts[pts.length - 1],
                         content: getTransferIconContent(),
                         offset: new AMap.Pixel(-10, -10),
                         zIndex: 60
                     });
                     map.add(endMarker);
                     if (isNearby) nearbyOverlays.push(endMarker);
                     else currentOverlays.push(endMarker);
                 }
             }
         }
      });
    } else if (route.steps) {
      // driving, walking, riding
      route.steps.forEach(step => {
          drawPolyline(step.polyline, travelMode === 'walking');
      });
    }

    if (showRouteEndpoints && routePoints.length > 0) {
      const actualStart = routePoints[0];
      const actualEnd = routePoints[routePoints.length - 1];
      drawRouteEndpoints(map, actualStart, actualEnd, startName, endName, isNearby);
    }

    if (allPoints.length > 0) {
      // Fit view to route bounds
      map.setFitView(isNearby ? nearbyOverlays : currentOverlays, true, [50, 50, 50, 50]);
    }
  };

  return {
    drawServerRoute,
    drawRouteEndpoints,
    clearRoute
  };
})();
