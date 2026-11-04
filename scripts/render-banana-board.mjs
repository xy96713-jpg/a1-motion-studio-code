import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { fontCss } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';
const cfg=boardConfig(process.env); const dir=path.join(cfg.dataDir,'style-lab','banana-3d-proof'); const css=await fontCss(cfg,'banana-design');
const S=[
['B01','0:00–0:05','5s','同一棵香蕉','C1','3D 克隆场 + 2D 标题','黑场一根香蕉被顶光打出；1→2→4→8 以 45ms stagger 复制成排；镜头沿排推','clone cascade → B02'],
['B02','0:05–0:16','11s','卡文迪什','C2','3D 克隆场 + 2D 字','克隆排横向延展；Kokka 128 压在排上；CAVENDISH ghost；镜头沿排侧移','dolly through peel'],
['B03','0:16–0:22','6s','47%','C2','2D 数据环 + 3D 曲线','香蕉弧线变成 0→47 圆环；FAO 来源 20px；数字从 0 计到 47','ring→root cut'],
['B04','0:22–0:33','11s','吸芽繁殖','C2','2.5D 真实根 + 3D 节点','真实根部照片做 2.5D 平面；吸芽节点逐个连出；镜头绕节点','node zoom-through'],
['B05','0:33–0:38','5s','一样的弱点','C2','3D 克隆场 + 2D 字','整片克隆同时失去光；只留一根还亮；字从画面外压入','hard cut → 时间卡'],
['B06','0:38–0:42','4s','发生过一次','C3','2D 时间卡 + 3D 尘','黑场时间卡 1900s–1960s；3D 尘/颗粒；字 300px','push into archive'],
['B07','0:42–0:51','9s','大麦克','C3','2.5D 档案照 + 3D 景深','Gros Michel 档案照做多层视差；黄褐褪色；Kokka 128','match cut 果形'],
['B08','0:51–0:59','8s','巴拿马病','C3','2.5D 土壤/真菌图 + 3D 线','土壤剖面/菌丝线稿；病株从绿到褐 mask wipe；不虚构路径','halftone spread'],
['B09','0:59–1:08','9s','3 万公顷','C3','3D 田块网格 + 2D 数字','航拍田块网格逐格变褐；3 万公顷 300px 计数；来源微字','grid wipe'],
['B10','1:08–1:13','5s','4 亿美元','C3','2D 数字 + 2.5D 地图','$400m 等宽数字 0→4 亿；单位同基线；地图退后','number shrink → iris'],
['B11','1:13–1:26','13s','换品种','C3','3D 田块 morph + 2D 字','Gros Michel 田块逐行替换成 Cavendish；镜头横移；代价字 32px','map wipe'],
['B12','1:26–1:29','3s','同样是克隆','C4','3D 克隆场 + 2D 字','克隆场重新亮起；300px 大字；红/橙只在一根','clone cascade'],
['B13','1:29–1:41','12s','TR4','C4','3D 地图平面 + 2D 字','真实地图上苏门答腊/马来西亚红点；TR4 300px；点阵扩散','dot field zoom'],
['B14','1:41–1:46','5s','不堪一击','C4','3D 双克隆场','大麦克/卡文迪什两片场同时倒；黑场硬切','hard cut'],
['B15','1:46–1:58','12s','拉瓜希拉','C4','2.5D 真实地图 + 证据页','地图推到 La Guajira；2019-08-08 时间戳；报道页 scan；不裁 headline','evidence scan'],
['B16','1:58–2:04','6s','175/168.5 公顷','C4','3D 田块条 + 2D 数字','175 与 168.5 两条 bar；数字计数；受影响/已毁标签','bar collapse'],
['B17','2:04–2:08','4s','国家紧急状态','C4','2D 红场/iris','黑底红字或红底黑字，只一处大面积红；2019-08-08 微字','iris → C5'],
['B18','2:08–2:18','10s','隔离与育种','C5','2.5D 地图边界 + 3D 场','病田边界线封住；隔离带；育种苗节点','line draw'],
['B19','2:18–2:26','8s','再换一次','C5','3D 田块 morph','整片田逐行替换；镜头拉远；300px 再换一次','collapse'],
['B20','2:26–2:31','5s','單一','C5','3D 克隆坍缩 + 2D 字','所有克隆收成一根；單一 300px；最后一行 32px 逐字；黑场','end']
];
const cards=S.map(s=>'<div class="c"><div class="top"><span class="id">'+s[0]+'</span><span class="tc">'+s[1]+'</span><span class="ch">'+s[4]+'</span></div><div class="h">'+s[3]+'</div><div class="meta">'+s[2]+' · '+s[5]+'</div><div class="vis">'+s[6]+'</div><div class="tr">→ '+s[7]+'</div></div>').join('');
const html='<!doctype html><html><head><meta charset="utf-8"><style>'+css+'*{margin:0;box-sizing:border-box}html,body{background:#0b0c0e;color:#f2efe8}.w{padding:28px}.h{font:22px GBLatin;color:#f2c230;letter-spacing:.1em}.s{font:40px GBDisplay;margin:8px 0 20px}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.c{background:#111;border:1px solid #2a2a2a;padding:12px;min-height:195px;display:flex;flex-direction:column;gap:6px}.top{display:flex;justify-content:space-between;font:14px GBLatin;color:#b9b3a6}.id{color:#f2c230}.h{font:24px GBDisplay;line-height:1.15}.meta{font:13px GBLatin;color:#b5532a}.vis{font:15px GBSmall;line-height:1.35;color:#e6e0d4;flex:1}.tr{font:12px GBLatin;color:#8f9d1f;border-top:1px solid #262626;padding-top:6px}</style></head><body><div class="w"><div class="h">BANANA / CLONE FIELD / FULL FILM DESIGN / 151s / 20 SHOTS</div><div class="s">一镜一镜：3D 克隆场 + 2D house 字 + 参数 HUD</div><div class="g">'+cards+'</div></div></body></html>';
const f=path.join(dir,'design-board.html'); fs.writeFileSync(f,html);
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:2200,height:1600}});
await p.goto(pathToFileURL(f).href,{waitUntil:'load'}); await p.evaluate(()=>document.fonts.ready);
await p.screenshot({path:path.join(dir,'design-board.png'), fullPage:true}); await b.close(); console.log('board ok');
