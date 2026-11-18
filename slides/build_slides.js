// 產生口頭報告簡報：report/MEV_最後通牒賽局_簡報.pptx
// 用法：cd slides && npm install && node build_slides.js
const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");

const SKILL_THEME = process.env.PPTX_APPLY_THEME; // 選用：套用佈景主題色的工具路徑
const OUT = path.join(__dirname, "..", "report", "MEV_最後通牒賽局_簡報.pptx");
const hist = JSON.parse(fs.readFileSync(path.join(__dirname, "hist.json"), "utf8"));

const FONT = "Microsoft JhengHei";
const THEME = {
  name: "MEV Ultimatum",
  headFontFace: FONT,
  bodyFontFace: FONT,
  colors: {
    dk1: "1E1633", lt1: "FFFFFF", dk2: "3B2A6B", lt2: "F1EEF9",
    accent1: "5B3FA8", // 紫：Builder／主色
    accent2: "E8912D", // 琥珀：競爭、第二名
    accent3: "14897A", // 青綠：Proposer
    accent4: "C7446A", // 玫瑰：警示、但是
    accent5: "7C8098", // 灰
    accent6: "2E6FBF", // 藍：Searcher
    hlink: "5B3FA8", folHlink: "7C8098",
  },
};
const H = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 吋
pres.theme = { headFontFace: FONT, bodyFontFace: FONT };
pres.title = "最後通牒賽局視角下的 MEV 分潤分析";
pres.author = "區塊鏈導論 第四組";
const C = pres.SchemeColor;
const FOOT = "最後通牒賽局視角下的 MEV 分潤分析｜第四組";

pres.defineSlideMaster({
  title: "TITLE_DARK",
  background: { color: H.dk1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 1.5, w: 8.8, h: 1.5, fontFace: FONT, fontSize: 38, bold: true, color: C.background1, align: "left", valign: "top", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.6, y: 3.2, w: 8.8, h: 0.9, fontFace: FONT, fontSize: 18, color: C.background2, align: "left", valign: "top", margin: 0 }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: H.lt1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.3, w: 9.0, h: 0.75, fontFace: FONT, fontSize: 28, bold: true, color: C.text1, align: "left", valign: "middle", margin: 0 }, text: "" } },
    { text: { text: FOOT, options: { x: 0.5, y: 5.2, w: 6, h: 0.3, fontFace: FONT, fontSize: 10, color: C.accent5, margin: 0, isTextBox: true } } },
  ],
  slideNumber: { x: 9.0, y: 5.2, w: 0.5, h: 0.3, fontFace: FONT, fontSize: 10, color: H.accent5, align: "right" },
});
pres.defineSlideMaster({
  title: "CLOSING_DARK",
  background: { color: H.dk1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.35, w: 9.0, h: 0.8, fontFace: FONT, fontSize: 28, bold: true, color: C.background1, align: "left", valign: "middle", margin: 0 }, text: "" } },
  ],
  slideNumber: { x: 9.0, y: 5.2, w: 0.5, h: 0.3, fontFace: FONT, fontSize: 10, color: H.accent5, align: "right" },
});

// ---------- 小工具 ----------
let _n = 0;
const nm = (p) => `${p}-${++_n}`;
function T(slide, text, o) {
  slide.addText(text, { fontFace: FONT, fontSize: 14, color: C.text1, margin: 0, valign: "top", isTextBox: true, objectName: nm("text"), ...o });
}
function card(slide, x, y, w, h, fill, o = {}) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { color: fill, width: 0 },
    shadow: o.shadow === false ? undefined : { type: "outer", color: "1E1633", opacity: 0.12, blur: 6, offset: 2, angle: 90 },
    objectName: nm("card"),
  });
}
function pill(slide, text, x, y, w, h, fill, o = {}) {
  slide.addText(text, {
    shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: h / 2, x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 },
    fontFace: FONT, fontSize: o.fontSize || 14, bold: true, color: o.color || C.background1, align: "center", valign: "middle", margin: 0,
    objectName: nm("pill"),
  });
}
function arrow(slide, x1, y, x2, color) {
  slide.addShape(pres.shapes.LINE, { x: x1, y, w: x2 - x1, h: 0, line: { color: color || H.accent5, width: 2, endArrowType: "triangle" }, objectName: nm("arrow") });
}
function num(slide, n, x, y, fill) {
  slide.addText(String(n), { shape: pres.shapes.OVAL, x, y, w: 0.42, h: 0.42, fill: { color: fill }, line: { color: fill, width: 0 }, fontFace: FONT, fontSize: 14, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, objectName: nm("num") });
}
const chartBase = () => ({
  catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", dataLabelFontFace: "+mn-lt", titleFontFace: "+mn-lt",
  catAxisLabelColor: H.dk1, valAxisLabelColor: H.accent5, dataLabelColor: H.dk1, titleColor: H.dk1,
  catAxisLabelFontSize: 11, valAxisLabelFontSize: 10, dataLabelFontSize: 11, titleFontSize: 13,
  valGridLine: { color: "E3E0EE", size: 0.75 }, catGridLine: { style: "none" },
  showLegend: false, showTitle: true,
});

// ---------- 講者分工 ----------
const SP = { A: "曾士育", B: "林玎揚", C: "鄧杰修", D: "周家釩" };
const note = (who, sec, script) => `【講者】${who}　【建議時間】${sec}\n\n${script}`;

// ================= 1. 封面 =================
pres.addSection({ title: "開場與模型主體" });
{
  const s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "開場與模型主體" });
  s.addText("最後通牒賽局視角下的\nMEV 分潤分析", { placeholder: "title" });
  s.addText("區塊鏈導論　第四組｜鄧杰修、曾士育、林玎揚、周家釩", { placeholder: "body" });
  pill(s, "Searcher", 0.6, 4.35, 1.5, 0.5, C.accent6);
  arrow(s, 2.2, 4.6, 2.9, H.lt2);
  pill(s, "Builder", 3.0, 4.35, 1.5, 0.5, C.accent1);
  arrow(s, 4.6, 4.6, 5.3, H.lt2);
  pill(s, "Proposer", 5.4, 4.35, 1.5, 0.5, C.accent3);
  T(s, "一個區塊賺到的錢，怎麼分？", { x: 7.1, y: 4.4, w: 2.6, h: 0.4, fontSize: 14, color: C.background2, valign: "middle" });
  s.addNotes(note(SP.A, "20 秒", "大家好，我們是第四組。我們的題目是用「最後通牒賽局」這個經典的談判模型，來看以太坊上一個區塊賺到的錢，是怎麼在 Searcher、Builder、Proposer 之間分的。"));
}

// ================= 2. 一句話 =================
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "開場與模型主體" });
  s.addText("一句話：Builder 付多少，看第二名有多強", { placeholder: "title" });
  card(s, 0.5, 1.25, 9.0, 0.85, C.background2, { shadow: false });
  T(s, [{ text: "問題　", options: { bold: true, color: C.accent1 } }, { text: "Builder 賺到一個區塊的錢，要分多少給決定用哪個區塊的 Proposer？" }], { x: 0.75, y: 1.25, w: 8.5, h: 0.85, fontSize: 16, valign: "middle" });
  const cards = [
    { tag: "理論", color: C.accent1, big: "第二名的價值", desc: "均衡得標價等於第二名的 Builder 願意出的價，不是看有幾家 Builder" },
    { tag: "資料", color: C.accent3, big: "0.9997", desc: "對手最高出價 ÷ 得標價的中位數。價格真的貼著第二名" },
    { tag: "但是", color: C.accent4, big: "64%", desc: "Proposer 分潤比例只有 64%。第一名有對手拿不到的獨家優勢" },
  ];
  cards.forEach((c, i) => {
    const x = 0.5 + i * 3.1;
    card(s, x, 2.4, 2.8, 2.5, C.background1);
    pill(s, c.tag, x + 0.25, 2.62, 0.9, 0.36, c.color, { fontSize: 12 });
    T(s, c.big, { x: x + 0.2, y: 3.12, w: 2.5, h: 0.7, fontSize: 25, bold: true, color: c.color, valign: "middle" });
    T(s, c.desc, { x: x + 0.25, y: 3.9, w: 2.3, h: 0.9, fontSize: 14 });
  });
  s.addNotes(note(SP.A, "40 秒", "先講結論。我們問的問題是：Builder 賺到一個區塊的錢，要分多少給 Proposer？\n理論的答案是：得標價等於第二名的 Builder 願意出的價。重點不是市場上有幾家 Builder，而是第二名有多強。\n資料上，我們看了 14 天的出價，得標價和對手最高出價的比值中位數是 0.9997，幾乎就是 1，理論成立。\n但是，Proposer 實際只拿到區塊價值的 64%，表示第一名的 Builder 有對手拿不到的獨家優勢。\n接下來四個人分別講模型、公平偏好、資料、合約。"));
}

// ================= 3. 最後通牒賽局 =================
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "開場與模型主體" });
  s.addText("最後通牒賽局：理論說全拿，人卻會分一半", { placeholder: "title" });
  pill(s, "提議者", 0.5, 1.45, 1.5, 0.6, C.accent1);
  arrow(s, 2.1, 1.75, 3.9, H.accent5);
  T(s, "「給你 s，我留 V − s」", { x: 2.0, y: 1.3, w: 2.0, h: 0.35, fontSize: 12, align: "center", color: C.accent5 });
  pill(s, "回應者", 4.0, 1.45, 1.5, 0.6, C.accent3);
  card(s, 0.5, 2.5, 2.35, 1.3, C.background2, { shadow: false });
  T(s, "接受", { x: 0.7, y: 2.62, w: 1.9, h: 0.35, fontSize: 14, bold: true, color: C.accent3 });
  T(s, "提議者拿 V − s\n回應者拿 s", { x: 0.7, y: 3.0, w: 1.9, h: 0.7, fontSize: 14 });
  card(s, 3.15, 2.5, 2.35, 1.3, C.background2, { shadow: false });
  T(s, "拒絕", { x: 3.35, y: 2.62, w: 1.9, h: 0.35, fontSize: 14, bold: true, color: C.accent4 });
  T(s, "兩個人都拿 0", { x: 3.35, y: 3.0, w: 1.9, h: 0.7, fontSize: 14 });
  T(s, "只玩一次、不能討價還價。回應者只能說好或不好。", { x: 0.5, y: 4.1, w: 5.0, h: 0.6, fontSize: 14, color: C.accent5 });
  card(s, 6.0, 1.3, 3.5, 1.6, C.background1);
  T(s, "理論預測回應者拿到", { x: 6.25, y: 1.42, w: 3.0, h: 0.35, fontSize: 14, color: C.accent5 });
  T(s, "≈ 0%", { x: 6.25, y: 1.8, w: 3.0, h: 0.95, fontSize: 44, bold: true, color: C.accent1, valign: "middle" });
  card(s, 6.0, 3.15, 3.5, 1.6, C.background1);
  T(s, "真人實驗中的提議", { x: 6.25, y: 3.27, w: 3.0, h: 0.35, fontSize: 14, color: C.accent5 });
  T(s, "40–50%", { x: 6.25, y: 3.65, w: 3.0, h: 0.95, fontSize: 44, bold: true, color: C.accent2, valign: "middle" });
  T(s, "低於 20% 的提議常被拒絕（Güth et al., 1982）", { x: 6.0, y: 4.85, w: 3.5, h: 0.3, fontSize: 10, color: C.accent5 });
  s.addNotes(note(SP.A, "50 秒", "先介紹最後通牒賽局。有一筆錢 V，提議者決定分多少 s 給回應者。回應者只能接受或拒絕：接受就照分，拒絕兩個人都拿 0。只玩一次，不能討價還價。\n理論上，回應者有拿總比沒有好，所以再少都該接受；提議者知道這點，就幾乎全拿。\n但真人實驗的結果是，提議多半落在四到五成，低於兩成的提議常常被拒絕。也就是人會在乎公平。\n這個落差是我們研究的出發點。"));
}

// ================= 4. MEV 對應 =================
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "開場與模型主體" });
  s.addText("MEV 分潤就是鏈上版的最後通牒", { placeholder: "title" });
  const roles = [
    { name: "Searcher", color: C.accent6, desc: "找到賺錢機會\n（套利、清算）" },
    { name: "Builder", color: C.accent1, desc: "把交易組成區塊\n向 Proposer 出價" },
    { name: "Proposer", color: C.accent3, desc: "這 12 秒的出塊者\n選一個區塊上鏈" },
  ];
  roles.forEach((r, i) => {
    const x = 0.5 + i * 3.4;
    pill(s, r.name, x, 1.3, 2.2, 0.6, r.color, { fontSize: 16 });
    T(s, r.desc, { x, y: 2.0, w: 2.2, h: 0.7, fontSize: 14, align: "center" });
    if (i < 2) {
      arrow(s, x + 2.3, 1.6, x + 3.3, H.accent5);
      T(s, "分多少？", { x: x + 2.2, y: 1.2, w: 1.2, h: 0.3, fontSize: 12, align: "center", color: C.accent2, bold: true });
    }
  });
  T(s, "和教科書不一樣的三件事", { x: 0.5, y: 3.0, w: 9, h: 0.4, fontSize: 16, bold: true });
  const diffs = [
    { t: "很多提議者", d: "每個區塊有很多家 Builder 同時出價" },
    { t: "回應者有外部選項", d: "Proposer 可以不理 Builder，自己建塊，拿到 L" },
    { t: "公開且重複", d: "出價公開、可以一直加價，每 12 秒一次" },
  ];
  diffs.forEach((d, i) => {
    const x = 0.5 + i * 3.1;
    card(s, x, 3.5, 2.8, 1.4, C.background2, { shadow: false });
    num(s, i + 1, x + 0.2, 3.68, C.accent2);
    T(s, d.t, { x: x + 0.75, y: 3.68, w: 1.9, h: 0.42, fontSize: 15, bold: true, valign: "middle" });
    T(s, d.d, { x: x + 0.2, y: 4.2, w: 2.4, h: 0.6, fontSize: 13 });
  });
  s.addNotes(note(SP.A, "50 秒", "以太坊上，一個區塊的利潤會經過三個角色。Searcher 找到賺錢的機會，例如套利。Builder 把交易組成一個區塊，然後向 Proposer 出價：你用我的區塊，我付你這麼多。Proposer 是這 12 秒輪到出塊的驗證者，他選一個區塊上鏈。\nBuilder 出價、Proposer 只能接受或不接受，這就是最後通牒賽局。Searcher 對 Builder 也是同樣的結構。我們主要研究 Builder 對 Proposer 這一層。\n但鏈上和教科書有三個不同：第一，有很多家 Builder 同時出價；第二，Proposer 有外部選項，可以自己建塊；第三，出價是公開的，可以一直加價，而且每 12 秒重複一次。\n我們的模型就是把這三件事一個一個加進去。"));
}

// ================= 5. 模型三步 =================
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "開場與模型主體" });
  s.addText("模型：每加一個條件，Proposer 就多拿一點", { placeholder: "title" });
  const steps = [
    { cond: "只有一家 Builder", pay: "0", why: "教科書版本：再少也得接受", y: 2.1, color: C.accent5 },
    { cond: "＋ 有外部選項 L", pay: "L", why: "至少要付到自己建塊能賺的錢", y: 1.75, color: C.accent3 },
    { cond: "＋ 多家 Builder 競爭", pay: "max(V₂, L)", why: "第二名最多出到 V₂，第一名只要比他高一點", y: 1.4, color: C.accent2 },
  ];
  steps.forEach((st, i) => {
    const x = 0.5 + i * 3.1;
    const h = 4.1 - st.y;
    card(s, x, st.y, 2.8, h, C.background1);
    num(s, i + 1, x + 0.2, st.y + 0.18, st.color);
    T(s, st.cond, { x: x + 0.75, y: st.y + 0.18, w: 1.95, h: 0.42, fontSize: 14, bold: true, valign: "middle" });
    T(s, "得標價 =", { x: x + 0.2, y: st.y + 0.68, w: 2.4, h: 0.3, fontSize: 13, color: C.accent5 });
    T(s, st.pay, { x: x + 0.2, y: st.y + 0.95, w: 2.4, h: 0.5, fontSize: 26, bold: true, color: st.color, valign: "middle" });
    T(s, st.why, { x: x + 0.2, y: st.y + 1.5, w: 2.4, h: 0.45, fontSize: 12, color: C.accent5 });
  });
  card(s, 0.5, 4.35, 9.0, 0.65, C.text1, { shadow: false });
  T(s, [{ text: "得標價 = 第二名的價值。", options: { bold: true, color: C.accent2 } }, { text: "重點不是 Builder 有幾家，而是第二名有多強。", options: { color: C.background1 } }], { x: 0.75, y: 4.35, w: 8.5, h: 0.65, fontSize: 15, valign: "middle" });
  s.addNotes(note(SP.A, "60 秒", "模型分三步。V 是區塊對 Builder 的價值，V1 是第一名的 Builder、V2 是第二名的。\n第一步，只有一家 Builder、Proposer 沒有外部選項：這就是教科書的最後通牒，得標價是 0。\n第二步，Proposer 可以自己建塊賺到 L：Builder 至少要付 L，不然 Proposer 就不理他。但 Builder 也只付剛好 L。\n第三步，加上多家 Builder 競爭：第二名的 Builder 最多願意出到他自己的價值 V2，所以第一名只要出得比 V2 高一點就贏了。得標價就是 V2 和 L 取大的。\n我們在報告裡有完整證明。這個結果不需要假設 Builder 知道彼此的價值，因為 MEV-Boost 的出價是公開、可以加價的，像公開喊價的拍賣。\n所以重點是：決定 Proposer 分多少的是第二名有多強。如果第二名跟第一名差不多，Proposer 幾乎全拿；如果第二名很弱，就退回最後通牒。\n接下來交給" + SP.B + "講公平偏好。"));
}

// ================= 6. 公平偏好 =================
pres.addSection({ title: "公平偏好與統整" });
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "公平偏好與統整" });
  s.addText("公平偏好：有競爭時就不重要了", { placeholder: "title" });
  T(s, "在乎公平的回應者，會拒絕太低的出價", { x: 0.5, y: 1.3, w: 4.2, h: 0.4, fontSize: 16, bold: true });
  T(s, "Fehr–Schmidt 模型：吃虧會不舒服，程度用 α 表示。接受的最低門檻是", { x: 0.5, y: 1.75, w: 4.2, h: 0.6, fontSize: 14 });
  card(s, 0.5, 2.45, 4.2, 0.75, C.background2, { shadow: false });
  T(s, "門檻 = α ÷ (1 + 2α) × V", { x: 0.5, y: 2.45, w: 4.2, h: 0.75, fontSize: 20, bold: true, color: C.accent1, align: "center", valign: "middle" });
  s.addTable(
    [
      [{ text: "在乎程度 α", options: { bold: true, color: H.lt1, fill: { color: H.accent1 } } }, { text: "0.5", options: { bold: true, color: H.lt1, fill: { color: H.accent1 } } }, { text: "1", options: { bold: true, color: H.lt1, fill: { color: H.accent1 } } }, { text: "4", options: { bold: true, color: H.lt1, fill: { color: H.accent1 } } }],
      ["最低要拿到", "25%", "33%", "44%"],
    ],
    { x: 0.5, y: 3.4, w: 4.2, colW: [1.8, 0.8, 0.8, 0.8], rowH: 0.4, fontFace: FONT, fontSize: 14, color: H.dk1, align: "center", valign: "middle", border: { type: "solid", color: "D9D4EA", pt: 0.75 }, objectName: nm("table") }
  );
  T(s, "門檻永遠不到一半。只要第二名的價值超過第一名的一半，公平偏好就沒有作用。", { x: 0.5, y: 4.35, w: 4.2, h: 0.65, fontSize: 14, color: C.accent5 });
  s.addChart(pres.charts.BAR, [{ name: "公平門檻有作用的機率", labels: ["1 家", "2 家", "3 家", "5 家", "10 家"], values: [100, 33.3, 11.2, 1.2, 0.0] }], {
    x: 5.1, y: 1.25, w: 4.4, h: 3.75, barDir: "col", chartColors: [H.accent1], ...chartBase(),
    title: "公平門檻真的有作用的機率（α = 1，%）", showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0.0", valAxisMinVal: 0, valAxisMaxVal: 110, valAxisHidden: true, barGapWidthPct: 60,
    objectName: nm("chart"),
  });
  s.addNotes(note(SP.B, "60 秒", "前面的模型假設大家只在乎錢。但實驗告訴我們人會在乎公平，所以我們把公平偏好加進來，用的是 Fehr 和 Schmidt 1999 年的模型。\n他們假設：拿得比對方少會不舒服，不舒服的程度用 alpha 表示。算出來，回應者能接受的最低門檻是 alpha 除以 1 加 2 alpha，再乘上總金額。alpha 是 0.5 時要拿到 25%，alpha 是 4 時要拿到 44%。這解釋了為什麼實驗裡低於兩成常被拒絕。\n重點是：這個門檻永遠不到一半。\n那加上競爭會怎樣？Builder 要得標，出價要同時贏過第二名、又高過公平門檻。只要第二名的價值超過第一名的一半，競爭的價格就已經比公平門檻高，公平偏好完全沒有作用。\n右邊的圖是模擬：只有一家 Builder 時公平門檻一定有作用；兩家時剩三分之一；五家時剩 1%；十家就是 0。"));
}

// ================= 7. 三股力量 =================
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "公平偏好與統整" });
  s.addText("三股力量，最強的那個決定得標價", { placeholder: "title" });
  T(s, "得標價 = max(", { x: 0.2, y: 1.3, w: 2.5, h: 0.6, fontSize: 21, bold: true, valign: "middle", align: "right" });
  pill(s, "競爭 V₂", 2.85, 1.3, 1.7, 0.6, C.accent2, { fontSize: 16 });
  pill(s, "外部選項 L", 4.75, 1.3, 1.7, 0.6, C.accent3, { fontSize: 16 });
  pill(s, "公平門檻", 6.65, 1.3, 1.7, 0.6, C.accent1, { fontSize: 16 });
  T(s, ")", { x: 8.45, y: 1.3, w: 0.4, h: 0.6, fontSize: 24, bold: true, valign: "middle" });
  const forces = [
    { t: "競爭", c: C.accent2, d: "第二名的 Builder 願意出多少\n鏈上通常是這個最大" },
    { t: "外部選項", c: C.accent3, d: "Proposer 自己建塊能賺多少\n競爭消失時的最後防線" },
    { t: "公平門檻", c: C.accent1, d: "回應者覺得太少就拒絕\n鏈上由程式自動選最高價" },
  ];
  forces.forEach((f, i) => {
    const x = 0.5 + i * 3.1;
    card(s, x, 2.2, 2.8, 1.25, C.background2, { shadow: false });
    T(s, f.t, { x: x + 0.2, y: 2.3, w: 2.4, h: 0.35, fontSize: 15, bold: true, color: f.c });
    T(s, f.d, { x: x + 0.2, y: 2.68, w: 2.4, h: 0.7, fontSize: 13 });
  });
  T(s, "要拿資料檢驗的四件事", { x: 0.5, y: 3.7, w: 9, h: 0.35, fontSize: 15, bold: true });
  const preds = ["得標價 ≈ 對手最高出價", "對手越強，Proposer 分得越多", "外部選項很少是決定得標價的因素", "鏈上看不到公平偏好的痕跡"];
  preds.forEach((p, i) => {
    const x = 0.5 + (i % 2) * 4.6;
    const y = 4.15 + Math.floor(i / 2) * 0.48;
    num(s, i + 1, x, y, C.text2);
    T(s, p, { x: x + 0.55, y, w: 3.9, h: 0.42, fontSize: 14, valign: "middle" });
  });
  s.addNotes(note(SP.B, "40 秒", "把前面整理成一條式子：得標價等於三個東西取最大——競爭、外部選項、公平門檻。三股力量都在把 Proposer 的分潤往上推，最強的那個決定價格。\n在 Builder 互相競爭的市場，競爭這一項最大，另外兩項通常用不到。所以我們預期鏈上的分潤會比實驗室的四到五成高，但原因不是 Builder 比較公平，而是他們在互相競價。\n反過來說，如果競爭消失，鏈上沒有公平偏好可以保護 Proposer，只剩外部選項。\n從模型得到四個可以用資料檢驗的預測，列在下面。接下來" + SP.C + "用真實資料來驗證。"));
}

// ================= 8. 資料 =================
pres.addSection({ title: "鏈上資料實證" });
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "鏈上資料實證" });
  s.addText("資料：14 天、92,587 個區塊的公開出價", { placeholder: "title" });
  const stats = [
    { big: "14 天", lab: "2026/11/4 – 11/18\n7 個 relay 的公開資料" },
    { big: "92,587", lab: "個經 MEV-Boost 成交的區塊" },
    { big: "1,000", lab: "個抽樣區塊看全部出價\n每個約 5,400 筆" },
    { big: "21 家", lab: "每個區塊出價的\nBuilder 數（中位數）" },
  ];
  stats.forEach((st, i) => {
    const x = 0.5 + (i % 2) * 2.3;
    const y = 1.3 + Math.floor(i / 2) * 1.85;
    card(s, x, y, 2.1, 1.65, C.background1);
    T(s, st.big, { x: x + 0.15, y: y + 0.15, w: 1.8, h: 0.6, fontSize: 26, bold: true, color: C.accent1, valign: "middle" });
    T(s, st.lab, { x: x + 0.15, y: y + 0.8, w: 1.8, h: 0.75, fontSize: 12, color: C.accent5 });
  });
  s.addChart(pres.charts.BAR, [{ name: "得標市占", labels: ["Titan", "Quasar", "BuilderNet", "Eureka", "bombora"], values: [53.0, 18.4, 12.7, 7.6, 3.3] }], {
    x: 5.3, y: 1.25, w: 4.2, h: 3.1, barDir: "col", chartColors: [H.accent1], ...chartBase(),
    title: "得標 Builder 的市占（%）", showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0.0", valAxisMinVal: 0, valAxisMaxVal: 60, valAxisHidden: true, barGapWidthPct: 60,
    objectName: nm("chart"),
  });
  T(s, "得標很集中（前三家 84%），但每個區塊都有很多家在搶。", { x: 5.3, y: 4.45, w: 4.2, h: 0.55, fontSize: 14, bold: true });
  s.addNotes(note(SP.C, "50 秒", "資料全部是公開的。MEV-Boost 的 relay 會公布每個區塊最後成交的出價，還有所有 Builder 送過的出價。\n我們抓了 11 月 4 號到 18 號共 14 天，7 個 relay，一共 92,587 個成交的區塊。再從裡面隨機抽 1,000 個，把每個區塊的所有出價都抓下來，一個區塊大約有 5,400 筆出價。另外從公開節點查 Builder 位址的餘額變化，來估計區塊的總價值。\n右邊是得標的市占：Titan 一家就 53%，前三家合計 84%，非常集中。\n但是注意左下角：每個區塊有出價的 Builder 中位數是 21 家。也就是得標很集中，可是每個區塊都有很多家在搶。這正好對應模型說的：要看第二名多強，不是看家數。"));
}

// ================= 9. 發現一 =================
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "鏈上資料實證" });
  s.addText("發現一：得標價幾乎等於對手最高出價", { placeholder: "title" });
  T(s, "對手最高出價 ÷ 得標價（中位數）", { x: 0.5, y: 1.3, w: 3.6, h: 0.35, fontSize: 14, color: C.accent5 });
  T(s, "0.9997", { x: 0.5, y: 1.65, w: 3.6, h: 1.0, fontSize: 54, bold: true, color: C.accent2, valign: "middle" });
  const rows = [
    { v: "73%", d: "的區塊，兩者差距在 5% 以內" },
    { v: "0.4%", d: "的區塊，對手不到得標價一半（接近最後通牒）" },
  ];
  rows.forEach((r, i) => {
    const y = 2.9 + i * 0.95;
    card(s, 0.5, y, 3.6, 0.8, C.background2, { shadow: false });
    T(s, r.v, { x: 0.65, y, w: 1.05, h: 0.8, fontSize: 20, bold: true, color: C.accent1, valign: "middle" });
    T(s, r.d, { x: 1.75, y, w: 2.25, h: 0.8, fontSize: 13, valign: "middle" });
  });
  s.addChart(pres.charts.BAR, [{ name: "區塊數", labels: hist.labels.map((l) => (/^[0-9.]+$/.test(l) ? `${l}–${(parseFloat(l) + 0.02).toFixed(2)}` : l)), values: hist.counts }], {
    x: 4.4, y: 1.25, w: 5.1, h: 3.4, barDir: "col", chartColors: [H.accent2], ...chartBase(),
    title: `對手最高出價 ÷ 得標價的分布（${hist.n} 個區塊）`, showValue: false, valAxisHidden: false, barGapWidthPct: 20, valAxisMinVal: 0, catAxisLabelFontSize: 9, catAxisLabelRotate: 315,
    objectName: nm("chart"),
  });
  T(s, "模型預測比值 = 1。大於 1 的部分來自出價資料不完整。", { x: 4.4, y: 4.7, w: 5.1, h: 0.3, fontSize: 11, color: C.accent5 });
  s.addNotes(note(SP.C, "60 秒", "第一個預測：得標價應該貼近對手的最高出價。\n我們對每個區塊算「得標當下，其他 Builder 還有效的最高出價」除以「得標價」。模型預測這個比值是 1。\n結果中位數是 0.9997。73% 的區塊兩者差距在 5% 以內。對手不到得標價一半、也就是接近最後通牒的區塊，只有 0.4%。\n右邊的分布圖可以看到，絕大多數都擠在 1 附近。\n所以第一個預測成立：價格是競爭決定的，得標價幾乎就是第二名願意出的價。\n要說明一個限制：圖上有一些比值大於 1，照理說不該發生。原因是有兩個 relay 每個區塊最多只給 500 筆出價，資料被截斷。我們另外只用資料完整的 relay 重算，中位數是 0.993，結論一樣。"));
}

// ================= 10. 發現二 =================
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "鏈上資料實證" });
  s.addText("發現二：但 Proposer 只拿到 64%", { placeholder: "title" });
  s.addChart(pres.charts.BAR, [{ name: "Proposer 分潤比例（中位數）", labels: ["Titan", "BuilderNet", "Eureka", "Quasar", "bombora", "Builder+"], values: [57.8, 61.9, 65.9, 76.7, 90.1, 108.2] }], {
    x: 0.5, y: 1.25, w: 5.3, h: 3.4, barDir: "col", chartColors: [H.accent3], ...chartBase(),
    title: "各 Builder 得標時的 Proposer 分潤比例（%）", showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0.0", valAxisMinVal: 0, valAxisMaxVal: 125, valAxisHidden: true, barGapWidthPct: 60,
    objectName: nm("chart"),
  });
  T(s, "市占最大的 Titan 留下最多；小 Builder 幾乎全交出，甚至倒貼。", { x: 0.5, y: 4.7, w: 5.3, h: 0.3, fontSize: 11, color: C.accent5 });
  T(s, "Proposer 分潤比例（中位數）", { x: 6.2, y: 1.3, w: 3.3, h: 0.35, fontSize: 14, color: C.accent5 });
  T(s, "64%", { x: 6.2, y: 1.65, w: 3.3, h: 1.0, fontSize: 54, bold: true, color: C.accent3, valign: "middle" });
  T(s, [
    { text: "比實驗室的四到五成高，但離 100% 還很遠。", options: { breakLine: true } },
    { text: "原因：第一名的區塊比第二名願意出的價值高一截，來自對手拿不到的獨家訂單流。" },
  ], { x: 6.2, y: 2.8, w: 3.3, h: 1.3, fontSize: 14, paraSpaceAfter: 6 });
  card(s, 6.2, 4.2, 3.3, 0.8, C.background2, { shadow: false });
  T(s, "注意：Builder 留下的是毛額，事後退給訂單流提供者的部分量不到。", { x: 6.35, y: 4.2, w: 3.0, h: 0.8, fontSize: 12, valign: "middle", color: C.accent4 });
  s.addNotes(note(SP.C, "60 秒", "第二個發現比較意外。既然價格貼著第二名，Proposer 應該拿很多才對。但我們算出來，Proposer 分潤比例，也就是得標價除以區塊價值，中位數只有 64%。\n這比實驗室的四到五成高，但離完全競爭的 100% 還很遠。\n這和第一個發現不矛盾：價格確實等於第二名願意出的價，但第一名的區塊本身就比第二名值錢。用模型的話說，V2 大約只有 V1 的六成多。合理的解釋是，得標的 Builder 有對手拿不到的獨家訂單流。\n左邊的圖是不同 Builder 的差別：市占最大的 Titan，Proposer 只拿到 58%；小的 Builder 像 bombora 交出 90%；Builder+ 甚至超過 100%，是在倒貼搶市占。\n迴歸也顯示：Builder 家數和集中度指標都不顯著，有解釋力的是對手的出價強度，還有得標的是不是前兩大。\n要提醒：Builder 留下的三成多是毛額，他們事後還會退錢給提供訂單的人，那部分我們量不到。所以不能說 Builder 賺三成。\n另外兩個預測：外部選項只在大約 4% 的區塊可能是決定因素；分潤低於 20% 的區塊照樣被採用，看不到公平偏好。接下來交給" + SP.D + "。"));
}

// ================= 11. 合約 =================
pres.addSection({ title: "智能合約與結論" });
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "智能合約與結論" });
  s.addText("合約：在鏈上重現沒有競爭的最後通牒", { placeholder: "title" });
  const flow = [
    { t: "開局", d: "實驗者出獎金，指定兩位玩家" },
    { t: "承諾", d: "雙方各交一個「密封的數字」和押金" },
    { t: "揭露", d: "公開數字，合約驗證沒有偷改" },
    { t: "結算", d: "出價 ≥ 接受門檻就成交，否則都拿 0" },
  ];
  flow.forEach((f, i) => {
    const x = 0.5 + i * 2.3;
    card(s, x, 1.3, 2.0, 1.35, C.background1);
    num(s, i + 1, x + 0.15, 1.42, C.accent1);
    T(s, f.t, { x: x + 0.65, y: 1.42, w: 1.25, h: 0.42, fontSize: 15, bold: true, valign: "middle" });
    T(s, f.d, { x: x + 0.15, y: 1.92, w: 1.7, h: 0.65, fontSize: 12 });
    if (i < 3) arrow(s, x + 2.04, 1.97, x + 2.26, H.accent5);
  });
  T(s, "為什麼要「密封」？", { x: 0.5, y: 2.95, w: 4.0, h: 0.35, fontSize: 15, bold: true });
  T(s, [
    { text: "沒有人能先偷看對方再決定", options: { bullet: true, breakLine: true } },
    { text: "回應者直接交出「接受門檻」，一局就知道完整策略", options: { bullet: true, breakLine: true } },
    { text: "賴著不揭露，押金就被沒收", options: { bullet: true } },
  ], { x: 0.5, y: 3.35, w: 4.0, h: 1.6, fontSize: 13, paraSpaceAfter: 6 });
  const hd = (t) => ({ text: t, options: { bold: true, color: H.lt1, fill: { color: H.accent1 } } });
  s.addTable(
    [
      [hd("模擬玩家（各 200 局）"), hd("平均出價"), hd("接受率")],
      ["自利 對 自利", "0.1%", "100%"],
      ["自利 對 公平", "0.1%", "30.7%"],
      ["公平 對 公平", "43.8%", "96.6%"],
    ],
    { x: 4.9, y: 2.95, w: 4.6, colW: [2.4, 1.1, 1.1], rowH: 0.4, fontFace: FONT, fontSize: 13, color: H.dk1, align: "center", valign: "middle", border: { type: "solid", color: "D9D4EA", pt: 0.75 }, objectName: nm("table") }
  );
  T(s, "27 項測試全過。以上是模擬，不是真人實驗。", { x: 4.9, y: 4.65, w: 4.6, h: 0.35, fontSize: 12, color: C.accent5 });
  s.addNotes(note(SP.D, "70 秒", "鏈上資料只看得到「有競爭」的結果。如果想知道沒有競爭、純粹的最後通牒下人會怎麼做，需要做實驗。所以我們寫了一個可以在鏈上玩最後通牒賽局的智能合約。\n流程四步：實驗者出獎金並指定兩位玩家；雙方各交一個密封的數字和押金，提議者交的是出價，回應者交的是接受門檻，也就是「最低可以接受多少」；兩邊都交了才公開；公開之後合約自動結算，出價大於等於接受門檻就成交，否則兩個人都拿 0。\n為什麼要密封？因為鏈上的東西大家都看得到，如果不密封，後交的人可以先偷看。密封的做法是先交雜湊值，之後再公開原本的數字讓合約核對。回應者直接交門檻，是實驗經濟學的 strategy method，一局就能知道他完整的策略。如果有人看到結果不利就賴著不揭露，押金會被沒收。\n我們寫了 27 項測試，全部通過。然後用模擬玩家在本機測試鏈上跑了 600 局。結果：兩邊都自利時，出價 0.1%、全部接受，就是教科書的均衡。自利的提議者遇到有公平偏好的回應者，七成被拒絕。兩邊都有公平偏好時，平均出價 43.8%、接受率 96.6%，和我們理論算的 43.3% 和 97% 吻合。\n要強調這是模擬，還沒有做真人實驗，也還沒部署到測試網。"));
}

// ================= 12. 結論 =================
{
  const s = pres.addSlide({ masterName: "CLOSING_DARK", sectionTitle: "智能合約與結論" });
  s.addText("結論：得標價由競爭決定，但第一名有獨家優勢", { placeholder: "title" });
  const pts = [
    { h: "理論", d: "得標價 = 競爭、外部選項、公平門檻三者取最大。有競爭時就是第二名的價值。" },
    { h: "資料", d: "得標價貼著第二名的出價（比值 0.9997），但 Proposer 只拿到 64%，最大的 Builder 留下最多。" },
    { h: "含意", d: "該監測的是第一名和第二名的差距，不是 Builder 家數。競爭消失時，Proposer 只剩外部選項（自己建塊）。" },
  ];
  pts.forEach((p, i) => {
    const y = 1.4 + i * 1.05;
    num(s, i + 1, 0.5, y + 0.05, C.accent2);
    T(s, p.h, { x: 1.1, y, w: 1.0, h: 0.5, fontSize: 18, bold: true, color: C.accent2, valign: "middle" });
    T(s, p.d, { x: 2.1, y, w: 7.4, h: 0.9, fontSize: 15, color: C.background1, valign: "top" });
  });
  T(s, "限制：只有 14 天；Builder 留下的是毛額；部分 relay 出價資料不完整；合約尚未做真人實驗。", { x: 0.5, y: 4.65, w: 8.4, h: 0.4, fontSize: 12, color: C.accent5 });
  s.addNotes(note(SP.D, "40 秒", "總結三點。\n第一，理論上得標價是競爭、外部選項、公平門檻三者中最大的。有競爭時就是第二名的價值。\n第二，資料顯示價格確實貼著第二名的出價，但 Proposer 只拿到 64%，而且最大的 Builder 留下最多。所以 MEV-Boost 是一個價格由競爭決定、但第一名有獨家優勢的市場。\n第三，對機制設計的含意：該監測的不是有幾家 Builder，而是第一名和第二名差多少。如果競爭消失，鏈上沒有公平偏好可以保護 Proposer，只剩自己建塊這個外部選項。\n我們的限制是資料只有 14 天、Builder 的利潤是毛額、部分資料不完整，合約也還沒做真人實驗，這些是未來可以繼續的方向。謝謝大家。"));
}

// ================= 13. 名詞小抄 =================
pres.addSection({ title: "附錄" });
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "附錄" });
  s.addText("附錄：名詞小抄", { placeholder: "title" });
  const hd = (t) => ({ text: t, options: { bold: true, color: H.lt1, fill: { color: H.accent1 } } });
  const L = (t) => ({ text: t, options: { bold: true, align: "left" } });
  const D = (t) => ({ text: t, options: { align: "left" } });
  s.addTable(
    [
      [hd("名詞"), hd("白話解釋")],
      [L("MEV"), D("靠決定交易的排列順序多賺到的錢（例如套利）")],
      [L("Searcher"), D("寫程式找 MEV 機會的人，把交易包好交給 Builder")],
      [L("Builder"), D("專門組區塊的人，向 Proposer 出價買「這個區塊用我的」")],
      [L("Proposer"), D("這 12 秒輪到出塊的驗證者，選一個區塊上鏈")],
      [L("MEV-Boost／relay"), D("Builder 和 Proposer 之間的拍賣場與中間人，出價資料公開")],
      [L("區塊價值 V"), D("Builder 從這個區塊能賺到的錢；第一名、第二名的 Builder 分別是 V₁、V₂")],
      [L("得標價"), D("得標的 Builder 付給 Proposer 的金額")],
      [L("Proposer 分潤比例"), D("得標價 ÷ 區塊價值")],
      [L("對手最高出價"), D("得標當下，其他 Builder 仍有效的最高出價（用來估計 V₂）")],
      [L("外部選項 L"), D("Proposer 不理 Builder、自己建塊能賺到的錢")],
      [L("公平門檻"), D("有公平偏好的回應者願意接受的最低金額")],
      [L("commit-reveal"), D("先交密封的答案（雜湊值），之後再公開，防止偷看")],
    ],
    { x: 0.5, y: 1.15, w: 9.0, colW: [2.3, 6.7], rowH: 0.3, fontFace: FONT, fontSize: 12, color: H.dk1, valign: "middle", border: { type: "solid", color: "D9D4EA", pt: 0.75 }, objectName: nm("table") }
  );
  s.addNotes("備用頁：有人問名詞時翻到這頁。組員準備時也先看這一頁。");
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  if (SKILL_THEME && fs.existsSync(SKILL_THEME)) {
    const { applyTheme } = require(SKILL_THEME);
    await applyTheme(OUT, THEME);
    console.log("已套用佈景主題色");
  }
  console.log("已輸出", OUT);
})();
