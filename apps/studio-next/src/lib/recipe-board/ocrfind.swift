// Where phrases sit in a picture (macOS Vision OCR, local): swift ocrfind.swift <img> <phrase> [<phrase> ...]
// Prints JSON: [{ "phrase", "found", "line", "box": [x, y, w, h] (0-1, origin top left), "parts": [[x, y, w, h], ...] }],
// the box of the phrase itself (not its whole line), so a highlight or a camera move lands on the words the narration
// says. Spaces and punctuation are ignored when matching. A phrase that runs on past the end of its line is followed
// onto the lines that start with its rest (parts: one box per line, in reading order; box: their union), as the
// reference's bars wrap with the sentence; without such a line it is reported on the line it starts on (partial).
// "cut": where the phrase begins or ends inside a word ("国产大|模型"; macOS word tokenizer over the lines it spans and
// the next), null when it begins and ends on words: a bar must not stop mid-word.
import Foundation
import NaturalLanguage
import Vision

let args = CommandLine.arguments
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.usesLanguageCorrection = false
let handler = VNImageRequestHandler(url: URL(fileURLWithPath: args[1]))
try? handler.perform([request])
let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first }
func norm(_ s: String) -> String { s.filter { !$0.isWhitespace && !"，,。.、：:；;“”\"'（）()".contains($0) } }
// the box of flat[a..<b] in a line (offsets into its normalised string)
// (word by word, then their union: Vision's box for a run of several Latin words ended after the first few, "Inside
// High-Flyer, the AI" of a whole headline, and cut "2021" off a sentence: cards-S5)
func boxOf(_ cand: VNRecognizedText, _ idx: [String.Index], _ a: Int, _ b: Int) -> CGRect? {
  let s = cand.string, lo = idx[a], hi = s.index(after: idx[b - 1])
  var out: CGRect? = nil, i = lo
  while i < hi {
    while i < hi && s[i].isWhitespace { i = s.index(after: i) }
    if i >= hi { break }
    var j = i
    while j < hi && !s[j].isWhitespace { j = s.index(after: j) }
    if let r = (try? cand.boundingBox(for: i..<j))??.boundingBox { out = out.map { $0.union(r) } ?? r }
    i = j
  }
  return out ?? (try? cand.boundingBox(for: lo..<hi))??.boundingBox
}
// (matched without case, and I and l as one letter: OCR reads a sans-serif "AI" as "Al", and a headline matched only up to
// "the A" was cropped there: cards-S5; one character for one, so the offsets hold)
func fold(_ c: Character) -> Character { guard c.isASCII, c.isLetter else { return c }; let l = Character(c.lowercased()); return l == "l" ? "i" : l }
func flatOf(_ s: String) -> ([String.Index], String) {
  var idx: [String.Index] = []; var flat = ""
  for i in s.indices where !norm(String(s[i])).isEmpty { idx.append(i); flat.append(fold(s[i])) }
  return (idx, flat)
}
func rect(_ b: CGRect) -> [Double] { [Double(b.minX), Double(1 - b.maxY), Double(b.width), Double(b.height)] }
// the rest of a phrase carried onto the lines after line li (each starts with it and runs to its end unless it finishes
// the phrase): their boxes, or nil when the rest is not there
func runOn(_ li: Int, _ rest: String) -> [(CGRect, Int, Int)]? {
  var rest = rest, boxes: [(CGRect, Int, Int)] = []
  for (ni, next) in lines.enumerated() where ni > li {
    let (nidx, nflat) = flatOf(next.string)
    var n = min(rest.count, nflat.count)
    while n > 0 && !nflat.hasPrefix(String(rest.prefix(n))) { n -= 1 }
    if n == 0 || (n < rest.count && n < nflat.count) { return nil }
    guard let nb = boxOf(next, nidx, 0, n) else { return nil }
    boxes.append((nb, ni, n)); rest = String(rest.dropFirst(n))
    if rest.isEmpty { return boxes }
  }
  return nil
}
var out: [[String: Any]] = []
for phrase in args.dropFirst(2) {
  let want = String(norm(phrase).map(fold))
  var hit: [String: Any] = ["phrase": phrase, "found": false]
  // li: the line it starts on, a: its first character there (normalised offset); last: the line it ends on and the
  // normalised length it takes there (the run-on's n, or a + the match on one line)
  func report(_ li: Int, _ a: Int, _ parts: [CGRect], _ last: (Int, Int), _ partial: Bool) {
    let cand = lines[li], s = cand.string, u = parts.dropFirst().reduce(parts[0]) { $0.union($1) }
    let lb = ((try? cand.boundingBox(for: s.startIndex..<s.endIndex)) ?? nil)?.boundingBox ?? parts[0]
    // word edges over the lines from the first to the one after the last, as one text
    var text = "", starts: [Int: Int] = [:]
    for i in li...min(lines.count - 1, last.0 + 1) { starts[i] = text.count; text += lines[i].string }
    let tok = NLTokenizer(unit: .word); tok.string = text
    var edges = Set<Int>([0, text.count]), single = Set<Int>()
    tok.enumerateTokens(in: text.startIndex..<text.endIndex) { r, _ in
      let lo = text.distance(from: text.startIndex, to: r.lowerBound), hi = text.distance(from: text.startIndex, to: r.upperBound)
      edges.insert(lo); edges.insert(hi); if hi - lo == 1 { single.insert(hi) }
      return true }
    let (idx0, _) = flatOf(s), (idxL, _) = flatOf(lines[last.0].string), sl = lines[last.0].string
    let from = starts[li]! + s.distance(from: s.startIndex, to: idx0[a])
    let to = starts[last.0]! + sl.distance(from: sl.startIndex, to: sl.index(after: idxL[last.1 - 1]))
    // a lone CJK character closing the phrase with more CJK straight after binds to it (国产大|模型: 大 belongs to 模型)
    // (across a line end only when the next line carries on the paragraph: the same size, straight below)
    let han = { (c: Character) -> Bool in let v = c.unicodeScalars.first!.value; return (0x3400...0x9FFF).contains(v) || (0xF900...0xFAFF).contains(v) || v >= 0x20000 }
    var carries = to < starts[last.0]! + sl.count
    if !carries, last.0 + 1 < lines.count, let b0 = boxOf(lines[last.0], idxL, 0, idxL.count), let (n1, _) = Optional(flatOf(lines[last.0 + 1].string)), !n1.isEmpty, let b1 = boxOf(lines[last.0 + 1], n1, 0, n1.count) {
      carries = abs(b1.height - b0.height) < b0.height * 0.2 && b0.minY - b1.maxY < b0.height * 1.2 && b0.minY > b1.maxY - b0.height * 0.3
    }
    let glued = single.contains(to) && carries && to < text.count && han(text[text.index(text.startIndex, offsetBy: to)])
    var cut: Any = NSNull()
    if !edges.contains(from) || !edges.contains(to) || glued {
      let at = edges.contains(from) ? to : from, ch = Array(text)
      cut = String(ch[max(0, at - 4)..<at]) + "|" + String(ch[at..<min(ch.count, at + 4)])
    }
    hit = ["phrase": phrase, "found": true, "line": s, "partial": partial, "lineBox": rect(lb), "box": rect(u), "parts": parts.map(rect), "cut": cut]
  }
  // the whole phrase: in one line, or begun at the end of a line and carried on (any length begun, even one character)
  whole: for (li, cand) in lines.enumerated() {
    let (idx, flat) = flatOf(cand.string)
    if let r = flat.range(of: want) {
      let a = flat.distance(from: flat.startIndex, to: r.lowerBound)
      if let box = boxOf(cand, idx, a, a + want.count) { report(li, a, [box], (li, a + want.count), false); break whole }
    }
    for len in stride(from: min(want.count - 1, flat.count), through: 1, by: -1) where flat.hasSuffix(String(want.prefix(len))) {
      guard let more = runOn(li, String(want.dropFirst(len))), let box = boxOf(cand, idx, flat.count - len, flat.count) else { continue }
      report(li, flat.count - len, [box] + more.map { $0.0 }, (more.last!.1, more.last!.2), false); break whole
    }
  }
  // otherwise the longest prefix (at least four characters) found in a line, reported as partial
  if hit["found"] as? Bool != true {
    var best = 0
    for (li, cand) in lines.enumerated() {
      let (idx, flat) = flatOf(cand.string)
      var len = want.count - 1
      while len >= min(4, want.count) && len > best {
        if let r = flat.range(of: String(want.prefix(len))) {
          let a = flat.distance(from: flat.startIndex, to: r.lowerBound)
          if let box = boxOf(cand, idx, a, a + len) { report(li, a, [box], (li, a + len), true); best = len }
          break
        }
        len -= 1
      }
    }
  }
  out.append(hit)
}
print(String(data: try JSONSerialization.data(withJSONObject: out), encoding: .utf8)!)
