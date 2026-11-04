// The one production flow of a new film, as data (the user 2026-10-27: 梳理 sop … 让系统走唯一 最优的流程). Every step:
// what it does, who does it, the stage of `run` that does it, the prompt its agent follows, the checks that hold it and
// the gate it waits on. SOP.md's flow section is generated from this table (`node scripts/recipe-board.mjs sop --write`)
// and a test fails when the two differ, or when a step names a stage, prompt or check the line does not have — so the
// SOP cannot drift from the code again (the audit of 2026-10-27 found it missing two steps and describing a look the
// user had turned down).
export const FLOW = [
  { id: 'script', name: '文案和事实', what: '文章拆拍、导演简报、分镜；每个数字、人名、日期找到出处（正式媒体或官网，页面截存）', who: '系统＋导演', stages: ['plan', 'voice', 'brief', 'storyboard', 'write', 'facts'], prompts: ['brief.md', 'storyboard.md'], checks: [] },
  { id: 'materials', name: '素材', what: '按需求找真实素材、按眼挑、下载；可信来源和点名对得上的自动放行，泛泛和弱匹配等你确认，找不到换说法再搜', who: '系统＋导演', stages: ['screen', 'materials', 'fetch'], prompts: ['matpick.md'], checks: [] },
  { id: 'film-design', name: '整片设计', what: '每拍在整片里演什么、配色、介质、为什么（合适才用）；由它推出色彩脚本', who: '导演', stages: ['chapter'], prompts: ['world.md', 'filmdesign.md'], checks: ['filmDesignErrors'] },
  { id: 'greybox', name: '灰盒动态粗稿', what: '整片一分钟出：快的照成片做（底、介质、字和版式、库里的模型、真素材），慢的占位（新模型、生图、重 3D）；字的位置由求解器排、时间跟台词；镜头、入场、衔接按成片标准；过代码检查（含切点不空、版式不连三拍重复），再过一位新审片人盲审', who: '导演＋盲审', stages: ['chapter'], prompts: ['greybox.md', 'greybox-review.md'], checks: ['greyboxErrors', 'greyboxReviewErrors'] },
  { id: 'style-frames', name: '风格帧', what: '重头画面做成成片质量的样张（成品模板、大字手法、做好的模型和真素材），过代码检查和两位新评审盲审；出整片设计板', who: '导演＋盲审', stages: ['chapter'], prompts: ['stills.md', 'taste.md'], checks: ['tasteErrors'] },
  { id: 'design', name: '定设计', what: '灰盒粗稿、风格帧、整片设计板一次看完一起批：走向和节奏、每拍讲什么、版式和字、配色和介质、衔接和动效、重头画面', who: '你', gate: 'design', stages: [], prompts: [], checks: [] },
  { id: 'chapters', name: '逐章制作', what: '每章一个会话（session-brief 出任务书），按批过的设计并行精做：写模块、过代码检查，章节盲审和口味盲审同时发出、一轮过线就交；模型先验收，一群东西用编队零件；总导演收各章、守整片统一', who: '各章会话＋总导演', stages: ['chapter'], prompts: ['beatdesign.md', 'morph.md', 'morph-review.md', 'taste.md'], checks: ['briefErrors', 'reviewErrors'] },
  { id: 'polish', name: '整片评审', what: '整片白模、整片量尺和整片盲审（严重度 3 以上先改）；精渲前的预检（每章首中尾帧按精渲画）由系统自己过', who: '系统＋盲审', stages: ['chapter', 'reel'], prompts: ['film-review.md', 'film-taste.md'], checks: ['filmTasteErrors'] },
  { id: 'final', name: '成片预览', what: '打磨好的整片给你看；批了才精渲，之后哪一块再改只有它再等你', who: '你', gate: 'final', stages: [], prompts: [], checks: [] },
  { id: 'render', name: '精渲和复盘', what: '精渲成片（只重渲改过的）；你的每条意见变成共用代码的修改、一项检查、一条测试和一条教训；记流程指标', who: '系统', stages: ['medium', 'reel'], prompts: [], checks: [] },
];

// (pure, tested) the SOP's flow section from the table
export const SOP_BEGIN = '<!-- flow: generated from apps/studio-next/src/lib/recipe-board/flow.mjs (node scripts/recipe-board.mjs sop --write); edit the table, not this -->';
export const SOP_END = '<!-- /flow -->';
export function sopSection(flow = FLOW) {
  const rows = flow.map((s, i) => `| ${i + 1} | ${s.gate ? `**${s.name}**` : s.name} | ${s.what} | ${s.gate ? `**${s.who}**：\`gate --approve ${s.gate} --by "你的话"\`` : s.who} | ${[...s.prompts.map((p) => `\`prompts/${p}\``), ...s.checks.map((c) => `\`${c}\``)].join('、') || '—'} |`);
  return [SOP_BEGIN, '', '| # | 步骤 | 做什么 | 谁 | 规则和检查 |', '|---|---|---|---|---|', ...rows, '', SOP_END].join('\n');
}
// (pure) the SOP with its flow section put in (or replaced)
export function withFlow(text, section = sopSection()) {
  const i = text.indexOf(SOP_BEGIN), j = text.indexOf(SOP_END);
  return i >= 0 && j > i ? text.slice(0, i) + section + text.slice(j + SOP_END.length) : null;
}
