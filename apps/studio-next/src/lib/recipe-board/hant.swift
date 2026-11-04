// Simplified Chinese to Traditional with the system's own transform (ICU Hans-Hant), one JSON array of strings in on
// stdin, the same array converted out. House rule (the user, 2026-10-21): text set on screen is Traditional.
import Foundation
let data = FileHandle.standardInput.readDataToEndOfFile()
let input = (try? JSONSerialization.jsonObject(with: data)) as? [String] ?? []
let out = input.map { ($0 as NSString).applyingTransform(StringTransform("Hans-Hant"), reverse: false) ?? $0 }
let json = try! JSONSerialization.data(withJSONObject: out)
FileHandle.standardOutput.write(json)
