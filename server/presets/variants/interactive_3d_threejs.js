// 变体模板与示例：three.js WebGL 真实感 3D 场景。
//
// 约定：本目录（server/presets/variants/）下的每个 .js 文件在被 import 时，
// 调用 registerPresetVariant 自注册一个或多个变体。新增场景变体只需新增一个独立文件，
// 便于多分支/多 subagent 并行开发，互不冲突。
//
// 外链策略：可引用白名单内的 CDN 库与素材（见 server/config.js 的 ALLOWED_ASSET_DOMAINS）。

import { registerPresetVariant } from '../../presetRegistry.js';

registerPresetVariant({
  id: 'interactive_3d__threejs_webgl',
  sceneType: 'interactive_3d',
  name: 'three.js WebGL 真实感 3D',
  skillSource: 'threejs-webgl',
  techStack: [
    'three.js ES module（裸说明符 import，宿主已注入 importmap）',
    'WebGL 渲染',
    '白名单外链贴图/HDR/3D 模型',
  ],
  keywords: [
    'webgl', 'threejs', 'three.js', '真实感', '写实', '光照', '材质', '粒子', '体积',
    // 真实几何体（球体/天体/真实模型）必须用真 3D，绝不能用平面 rotateY 冒充。
    '地球', '星球', '行星', '天体', '月球', '太阳', '卫星', '球体', '地球仪',
    '宇宙', '太阳系', '银河', '模型', '可旋转', '旋转',
  ],
  promptSection: [
    '使用 three.js 以 ES module 方式构建真实感 3D 场景；用裸说明符导入：import * as THREE from \'three\'，并从 import { OrbitControls } from \'three/addons/controls/OrbitControls.js\' 引入控制器（其它 examples/jsm 模块同理走 three/addons/ 前缀）。',
    '【关键约束】页面运行的宿主已固定注入 importmap，把 three 与 three/addons/ 映射到可用 CDN；因此禁止自行编写 <script type="importmap">，也禁止用完整 CDN URL（如 https://.../three.module.js）做 import，否则 OrbitControls 等子模块的内部裸导入会解析失败导致整页白屏。',
    '【效果优先】真实几何体（地球/星球/天体/球体/真实产品模型等）必须用真实 3D 几何（如 THREE.SphereGeometry + 贴图/材质）渲染，绝对禁止用一张平面图做 rotateY 冒充球体。',
    '【天体细节必须可见】当用户要求光环/环带（如土星光环）时，必须使用明显可见的 RingGeometry 或多层环带几何体，颜色/透明度/宽度要足够从球体左右伸出；当用户要求卫星/月亮时，必须使用 SphereGeometry 小球体、轨道线或环绕动画表现；当用户要求风暴/大红斑/云带时，必须把风暴做成行星表面的纹理、漩涡或斑点，而不是只放文字标签。',
    '热点、文字说明、描边圆圈只能作为辅助标注，不能替代光环、卫星、风暴、云带等主体视觉元素；如果某个元素只用文字加圈表达，应视为视觉未完成。',
    '强调相机、光照、材质与景深；主体对象需可用鼠标拖拽旋转或随设备方向视差。',
    '允许引用白名单外链的贴图、HDR 环境或 3D 模型；加载失败时降级到基础几何体并保持可交互，且该降级应视为待修复异常而非常态。',
    '避免大段说明文字，3D 主体与空间交互占据首屏主体。',
    '所有脚本内联或来自白名单 CDN，禁止内联危险事件属性与越权脚本。',
  ].join('；'),
  acceptance: [
    '使用 WebGL/three.js 渲染',
    '用裸说明符 import（from "three" / "three/addons/..."），不自带 importmap，不用完整 URL import',
    '真实几何体用真实 3D 几何渲染，而非平面图 rotateY 冒充',
    '光环用明显可见的 RingGeometry/环带几何体，卫星用小球体/轨道，风暴用表面纹理/漩涡/斑点',
    '热点圈和文字不能替代主体视觉元素',
    '至少一个可旋转或可视差的 3D 主体',
    '至少一个可探索热点',
    '首屏以 3D 场景为主体',
  ],
  enabled: true,
  priority: 4,
});
