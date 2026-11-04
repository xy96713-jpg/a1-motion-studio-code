#!/usr/bin/env python3
import json,sys,cv2,numpy as np
source,target=sys.argv[1],sys.argv[2]
geometry=json.loads(sys.argv[3])
src=cv2.imread(source);dst=cv2.imread(target)
if src is None or dst is None: raise SystemExit("screen-canvas-transform-image-missing")
sift=cv2.SIFT_create();k1,d1=sift.detectAndCompute(cv2.cvtColor(src,cv2.COLOR_BGR2GRAY),None);k2,d2=sift.detectAndCompute(cv2.cvtColor(dst,cv2.COLOR_BGR2GRAY),None)
matches=cv2.BFMatcher().knnMatch(d1,d2,k=2);good=[m for m,n in matches if m.distance<.72*n.distance]
if len(good)<24: raise SystemExit(f"screen-canvas-transform-insufficient-matches:{len(good)}")
p1=np.float32([k1[m.queryIdx].pt for m in good]);p2=np.float32([k2[m.trainIdx].pt for m in good]);H,mask=cv2.findHomography(p1,p2,cv2.RANSAC,3)
if H is None: raise SystemExit("screen-canvas-transform-homography-failed")
inliers=int(mask.sum());ratio=inliers/len(good)
if inliers<20 or ratio<.6: raise SystemExit(f"screen-canvas-transform-low-confidence:{inliers}:{ratio}")
sw,sh=src.shape[1],src.shape[0];dw,dh=dst.shape[1],dst.shape[0]
if geometry.get("kind")=="point":
 pts=np.float32([[[geometry["x"]*sw,geometry["y"]*sh]]]);mapped=cv2.perspectiveTransform(pts,H)[0][0];render={"kind":"point","x":float(mapped[0]/dw),"y":float(mapped[1]/dh)}
else:
 x,y,w,h=[geometry[k] for k in ("x","y","width","height")];pts=np.float32([[[x*sw,y*sh],[(x+w)*sw,y*sh],[(x+w)*sw,(y+h)*sh],[x*sw,(y+h)*sh]]]);mapped=cv2.perspectiveTransform(pts,H)[0];left,top=mapped.min(axis=0);right,bottom=mapped.max(axis=0);render={"kind":"rect","x":float(left/dw),"y":float(top/dh),"width":float((right-left)/dw),"height":float((bottom-top)/dh)}
projected=cv2.perspectiveTransform(p1.reshape(-1,1,2),H).reshape(-1,2);errors=np.linalg.norm(projected-p2,axis=1);error=float(np.median(errors[mask.ravel()==1]))
print(json.dumps({"contract":"A1ScreenCanvasTransform/v1","status":"PASS","sourceSize":{"width":sw,"height":sh},"canvasSize":{"width":dw,"height":dh},"homography":H.tolist(),"matches":len(good),"inliers":inliers,"inlierRatio":ratio,"medianReprojectionErrorPx":error,"renderGeometry":render}))
