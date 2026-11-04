import Foundation
import Vision
import AppKit
var output:[[String:Any]]=[]
for path in CommandLine.arguments.dropFirst() {
 guard let image=NSImage(contentsOfFile:path), let cg=image.cgImage(forProposedRect:nil,context:nil,hints:nil) else {exit(1)}
 let req=VNRecognizeTextRequest(); req.recognitionLanguages=["zh-Hans","en-US"]; req.recognitionLevel = .accurate
 do {try VNImageRequestHandler(cgImage:cg).perform([req])} catch {fputs("OCR failed\n",stderr);exit(2)}
 let rows=(req.results ?? []).compactMap {o -> [String:Any]? in
 guard let t=o.topCandidates(1).first else{return nil}; let b=o.boundingBox
 return ["text":t.string,"confidence":t.confidence,"x":b.minX*Double(cg.width),"y":(1-b.maxY)*Double(cg.height),"width":b.width*Double(cg.width),"heightPx":b.height*Double(cg.height)]
 }
 output.append(["path":path,"width":cg.width,"height":cg.height,"observations":rows])
}
let data=try JSONSerialization.data(withJSONObject:output,options:[.prettyPrinted,.sortedKeys]);print(String(data:data,encoding:.utf8)!)
