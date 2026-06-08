// 结构化体验范式：把 UX 风格准则、素材策略和验收标准集中管理。

export const EXPERIENCE_PRESETS = [
  {
    id: 'immersive_media',
    name: '沉浸多媒体阅读',
    aesthetic: '电影化、叙事化、强氛围、强镜头感',
    whenToUse: [
      '场景体验',
      '看到的画面',
      '第一视角',
      '故事化展示',
      '纪录片感',
      '氛围化阅读',
    ],
    visualGoals: [
      '首屏由单一强视觉焦点主导',
      '大画面、大纵深、强光影、少文字',
      '滚动或轻交互形成分镜式体验',
    ],
    layoutRules: [
      '首屏视觉面积至少 75%',
      '说明文字不超过首屏 15%',
      '允许少量短标题、镜头标注、热点标签',
      '禁止退化成百科式文字卡片页',
    ],
    interactionRules: [
      '优先鼠标视差、重力感应、缓慢漂浮、热点探索',
      '交互反馈要轻，不要破坏沉浸感',
    ],
    mediaStrategy: [
      '主视觉优先使用 text_to_image 生成稳定图片',
      '可使用 canvas 粒子、光晕、遮罩、动态背景增强氛围',
      '若插入真实链接，链接只作为附加资料，不应抢主视觉',
    ],
    acceptance: [
      '至少 1 个强视觉焦点',
      '至少 1 种沉浸式轻交互',
      '页面整体以视觉而非说明文字驱动',
    ],
  },
  {
    id: 'card_browser',
    name: '卡片浏览',
    aesthetic: '编辑感、收藏板、策展式浏览、可快速扫读',
    whenToUse: [
      '攻略推荐',
      '清单合集',
      '对比浏览',
      '路线灵感',
      '人物或景点集合',
    ],
    visualGoals: [
      '卡片应有封面图、标签和摘要',
      '布局应利于快速扫读与横向比较',
      '卡片之间要有层级和差异感',
    ],
    layoutRules: [
      '至少 6 个可区分内容单元',
      '优先网格、滑轨或堆叠卡组',
      '禁止退化成纯文字列表',
    ],
    interactionRules: [
      '卡片应可点击、悬停、筛选或展开',
      '可探索元素优先直接落在卡片层',
    ],
    mediaStrategy: [
      '每组卡片尽量带视觉封面',
      '可插入外部资料链接作为延伸卡片',
      '图片和标题要一起形成辨识度',
    ],
    acceptance: [
      '至少 6 张卡片或等价内容单元',
      '至少 1 种浏览交互',
      '用户能一眼区分不同类别或主题',
    ],
  },
  {
    id: 'interactive_2d',
    name: '2D 可视化交互',
    aesthetic: '信息设计、地图感、系统图、探索式平面交互',
    whenToUse: [
      '地图',
      '时间线',
      '流程图',
      '关系网络',
      '路线图',
      '平面结构分布',
    ],
    visualGoals: [
      '二维结构清晰可读',
      '节点、坐标、连线、分布关系明确',
      '支持局部探索和 hover 反馈',
    ],
    layoutRules: [
      '必须体现坐标、时间轴、平面拓扑或连线关系中的至少一种',
      '优先使用 svg、canvas 或结构化 DOM',
      '避免伪装成普通卡片页',
    ],
    interactionRules: [
      '优先缩放、平移、hover tooltip、点选钻取、框选',
      '重要节点应可探索进入子页面',
    ],
    mediaStrategy: [
      '背景应辅助理解结构，不要喧宾夺主',
      '必要时使用图例、tooltip 或局部标签',
    ],
    acceptance: [
      '存在明确二维结构',
      '至少 1 种可视化交互反馈',
      '用户能看出节点和关系，而不是只看到说明文字',
    ],
  },
  {
    id: 'interactive_3d',
    name: '3D 可视化交互',
    aesthetic: '空间感、未来感、装置感、立体展示',
    whenToUse: [
      '地球',
      '空间站',
      '天体',
      '建筑',
      '空间结构',
      '可旋转模型',
    ],
    visualGoals: [
      '有明确前中后景和空间层次',
      '有景深、旋转、视差或伪 3D 体积感',
      '热点和注释要贴合空间对象',
    ],
    layoutRules: [
      '必须有立体感，不可退化成普通平面页面',
      '优先使用 CSS 3D、canvas、SVG 伪 3D 或空间化 DOM',
      '减少大段说明文字占比',
    ],
    interactionRules: [
      '优先旋转、拖拽、视差、热点、重力感应',
      '空间交互应围绕主体对象展开',
    ],
    mediaStrategy: [
      '主对象可用纹理图、渐变、阴影和光晕营造立体感',
      '可插入与模型相关的资料链接或局部说明',
    ],
    acceptance: [
      '至少 1 种空间交互',
      '至少 1 个可探索热点',
      '用户能明确感知空间层级或旋转关系',
    ],
  },
];

function keywordScore(text, keywords) {
  let score = 0;
  for (const keyword of keywords) {
    if (text.includes(keyword)) score += 1;
  }
  return score;
}

export function suggestPresetCandidates(interaction) {
  const raw = [
    interaction?.text,
    interaction?.gesture,
    interaction?.targetLabel,
    interaction?.type,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const scores = [
    {
      id: 'immersive_media',
      score: keywordScore(raw, ['画面', '场景', '视角', '回望', '第一视角', '沉浸', '电影', '海报', '地出', 'earthrise']),
    },
    {
      id: 'card_browser',
      score: keywordScore(raw, ['攻略', '清单', '合集', '列表', '筛选', '推荐', '卡片', '灵感']),
    },
    {
      id: 'interactive_2d',
      score: keywordScore(raw, ['地图', '时间线', '关系', '流程', '路线', '分布', '网络', '图谱', '2d']),
    },
    {
      id: 'interactive_3d',
      score: keywordScore(raw, ['地球', '空间站', '天体', '建筑', '旋转', '3d', '重力感应', '空间结构']),
    },
  ]
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scores.map((item) => item.id).slice(0, 2);
}

function formatPresetBlock(preset) {
  return [
    `- ${preset.id} | ${preset.name}`,
    `  适用场景: ${preset.whenToUse.join('、')}`,
    `  审美方向: ${preset.aesthetic}`,
    `  视觉目标: ${preset.visualGoals.join('；')}`,
    `  布局规则: ${preset.layoutRules.join('；')}`,
    `  交互规则: ${preset.interactionRules.join('；')}`,
    `  素材策略: ${preset.mediaStrategy.join('；')}`,
    `  验收标准: ${preset.acceptance.join('；')}`,
  ].join('\n');
}

export const PRESET_PROMPT_SECTION = [
  '【结构化体验范式库】',
  '你必须优先从下列预置体验范式中选择最适合的一套或一主一辅组合，再生成页面。',
  ...EXPERIENCE_PRESETS.map(formatPresetBlock),
  '【范式执行要求】',
  '- 优先保持单一主范式，不要混成折中页面。',
  '- 若主范式不足以表达请求，可选择一主一辅，但视觉和结构仍必须围绕主范式展开。',
  '- reasoning 中必须说明你选择该范式的原因，但不要额外输出范式字段。',
].join('\n');

export function buildPresetContextText(interaction) {
  const suggestedIds = suggestPresetCandidates(interaction);
  const suggestedNames = suggestedIds
    .map((id) => EXPERIENCE_PRESETS.find((preset) => preset.id === id))
    .filter(Boolean)
    .map((preset) => `${preset.id}(${preset.name})`);

  const shortGuide = EXPERIENCE_PRESETS.map(
    (preset) =>
      `- ${preset.id}: 适合 ${preset.whenToUse.slice(0, 4).join('、')}；重点 ${preset.visualGoals[0]}；交互 ${preset.interactionRules[0]}`
  ).join('\n');

  return [
    '【可用体验范式摘要】',
    shortGuide,
    suggestedNames.length
      ? `【建议优先范式】${suggestedNames.join(' -> ')}`
      : '【建议优先范式】若用户强调画面/场景/沉浸感，优先 immersive_media 或 interactive_3d。',
    '【执行提醒】先选范式，再决定页面结构、素材和交互；不要让卡片页冒充沉浸场景，也不要让 3D 主题退化成平面说明页。',
  ].join('\n');
}
