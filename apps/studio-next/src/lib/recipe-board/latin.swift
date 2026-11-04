// Chinese names to plain Latin (pinyin without tones), one per argument, one per line: materials.mjs matches a
// candidate's English title against a need's Chinese name (高承勇 -> gao cheng yong).
import Foundation
for a in CommandLine.arguments.dropFirst() {
  print((a.applyingTransform(.toLatin, reverse: false) ?? a).folding(options: .diacriticInsensitive, locale: nil))
}
