// 2D 可视化场景的差异化预设包：数据可视化 / 地图探索 / 时间线叙事。
//
// 约定：本目录下每个 .js 文件在被 import 时自注册一个或多个变体
// （见 presetRegistry.loadPresetVariants）。新增变体只需新增文件，便于多分支并行、互不冲突。
// 外链策略：仅可引用白名单 CDN 库与素材（见 server/config.js 的 ALLOWED_ASSET_DOMAINS）。

import { registerPresetVariant } from '../../presetRegistry.js';

// ① 纯 SVG 数据可视化：图表 / 网络关系 / 流程，结构清晰 + hover tooltip
registerPresetVariant({
  id: 'interactive_2d__svg_dataviz',
  sceneType: 'interactive_2d',
  name: '纯 SVG 数据可视化',
  skillSource: 'svg-dataviz',
  techStack: [
    '原生 SVG（坐标系/路径/分组）',
    '可选 d3-scale/d3 from https://cdn.jsdelivr.net 或 https://unpkg.com（仅用于比例尺/布局计算）',
    '内联 <style>/<script> 做 hover 高亮与 tooltip',
  ],
  keywords: [
    'svg', '图表', 'chart', '柱状', '折线', '散点', '饼图',
    '关系', '网络', 'network', '图谱', '节点', '连线', '流程', 'dataviz', '可视化',
  ],
  promptSection: [
    '产出自包含 HTML 片段，根元素为单个 <div>，可内联 <style> 与 <script>，不依赖外部 DOM',
    '用原生 SVG 绘制明确的二维结构：带刻度的 x/y 坐标系图表，或由节点+连线构成的关系/网络/流程图（拓扑关系必须可读）',
    '至少实现 hover tooltip：鼠标悬停数据点/节点时高亮该元素并在贴近位置显示数值或标签的浮层；离开时复原',
    '建议再支持点选钻取（点击节点/系列筛选或展开关联项）之一，强化“可探索”而非静态图',
    '允许从白名单 CDN（jsdelivr/unpkg/cdnjs）引入 d3 等轻量库仅做比例尺与布局计算，图标可用 api.iconify.design 或 cdn.simpleicons.org；外链失败时降级为内联手算坐标但保持交互',
    '避免退化成普通文字卡片：SVG 画布占据首屏主体，文字仅作坐标轴标签、图例与 tooltip',
    '所有脚本内联或来自白名单 CDN，禁止内联危险事件属性与越权脚本',
  ].join('；'),
  acceptance: [
    '存在带明确二维结构的 SVG（坐标系刻度或节点连线拓扑）',
    'hover 数据点/节点时有高亮 + tooltip 浮层',
    '至少一种点选钻取/筛选交互',
    '首屏以可视化画布为主体而非文字卡片',
  ],
  enabled: true,
  priority: 2,
});

// ② 地图 / 地理分布探索：底图 + 标注点 + 缩放平移
registerPresetVariant({
  id: 'interactive_2d__map_explore',
  sceneType: 'interactive_2d',
  name: '地图地理分布探索',
  skillSource: 'map-explore',
  techStack: [
    'SVG 世界/区域地图或网格底图（viewBox 坐标系）',
    '标注点/热力气泡 + 经纬度→平面坐标投影',
    '内联 <script> 实现 wheel 缩放、拖拽平移、点选钻取（可选 d3-zoom from https://cdn.jsdelivr.net）',
  ],
  keywords: [
    '地图', 'map', '地理', '分布', '区域', '城市', '国家', '路线', 'route',
    '热力', 'heatmap', '坐标', '经纬', '定位', '网格',
  ],
  promptSection: [
    '产出自包含 HTML 片段，根元素为单个 <div>，可内联 <style> 与 <script>',
    '构建明确的平面地理结构：SVG 世界/区域矢量地图或等距网格底图作为坐标平面，按数据在其上叠加标注点/气泡/连线',
    '必须支持缩放与平移：鼠标滚轮缩放、按住拖拽平移（可用 SVG viewBox 变换或 d3-zoom）；移动端支持手势更佳',
    '至少实现 hover tooltip（悬停标注点显示地名/数值）与点选钻取（点击区域或点高亮并展示详情）之一以上',
    '允许从白名单 CDN（jsdelivr/unpkg/cdnjs）引入 d3-geo/d3-zoom 或轻量地图 GeoJSON，图标用 api.iconify.design；外链失败时降级为内联网格底图但保持缩放平移与标注交互',
    '避免退化成普通文字卡片：地图画布占据首屏主体，文字仅作标注、图例与 tooltip',
    '所有脚本内联或来自白名单 CDN，禁止内联危险事件属性与越权脚本',
  ].join('；'),
  acceptance: [
    '存在地图/网格底图构成的二维平面坐标',
    '支持滚轮缩放与拖拽平移',
    '标注点 hover tooltip 或点选钻取至少其一',
    '首屏以地图画布为主体而非文字卡片',
  ],
  enabled: true,
  priority: 2,
});

// ③ 时间线 / 叙事流：GSAP ScrollTrigger 滚动驱动
registerPresetVariant({
  id: 'interactive_2d__timeline_story',
  sceneType: 'interactive_2d',
  name: '时间线叙事流（滚动驱动）',
  skillSource: 'gsap-scrolltrigger@3',
  techStack: [
    'GSAP core + ScrollTrigger（from https://cdn.jsdelivr.net/npm/gsap@3.15/dist/）',
    'SVG/DOM 时间轴节点 + 进度条/连线',
    '内联 <script>：gsap.registerPlugin(ScrollTrigger) + scrub/pin 时间线',
  ],
  keywords: [
    '时间线', 'timeline', '时间轴', '历程', '叙事', 'story', '滚动',
    'scroll', 'gsap', '进度', '步骤', '阶段', '编年', '里程碑',
  ],
  promptSection: [
    '产出自包含 HTML 片段，根元素为单个 <div>，可内联 <style> 与 <script>',
    '构建明确的二维时间轴结构：一条横向或纵向时间线串联多个时间节点（含时间戳与连线/进度刻度）',
    '用 GSAP + ScrollTrigger 做滚动驱动：通过 https://cdn.jsdelivr.net/npm/gsap@3.15/dist/gsap.min.js 与 ScrollTrigger.min.js 引入，先 gsap.registerPlugin(ScrollTrigger)，再用 scrub 把节点进入/高亮绑定到滚动进度，可配合 pin 固定时间轴',
    '因片段常嵌入受限容器，须将 ScrollTrigger 的 scroller 指向片段内部可滚动容器（而非默认 window），并在内容就绪后调用 ScrollTrigger.refresh()',
    '至少实现 hover tooltip（悬停节点显示事件详情）与点选钻取（点击节点展开/定位）之一，使其在不滚动时也可交互',
    '允许从白名单 CDN（jsdelivr/unpkg/cdnjs）引入 GSAP 与图标（api.iconify.design）；GSAP 加载失败时降级为 IntersectionObserver 触发的 CSS 过渡，但时间轴结构与节点交互必须保留，且该降级应被标记为待修复异常而非常态',
    '避免退化成普通文字卡片：时间轴与滚动联动的视觉变化为主体，文字承载事件内容但不堆叠成长段落卡片',
    '所有脚本内联或来自白名单 CDN，禁止内联危险事件属性与越权脚本',
  ].join('；'),
  acceptance: [
    '存在沿时间轴排布的二维结构（节点+连线/进度刻度）',
    '滚动进度驱动节点高亮/动画（GSAP ScrollTrigger 或降级 IntersectionObserver）',
    '节点 hover tooltip 或点选钻取至少其一',
    '首屏以时间轴叙事为主体而非文字卡片',
  ],
  enabled: true,
  priority: 2,
});
