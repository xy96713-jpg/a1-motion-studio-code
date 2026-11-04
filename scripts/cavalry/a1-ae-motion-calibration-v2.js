// A1 AE Motion Kernel / Cavalry 2.7.2 calibration scene.
(function(){
  var receiptPath="/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/ae-motion-kernel-v2/cavalry-receipt.json";
  function jerk(t){t=Math.max(0,Math.min(1,t));return t*t*t*(10-15*t+6*t*t);}
  function rect(name,x,y,w,h,color){var id=api.primitive("rectangle",name);api.set(id,{"generator.dimensions":[w,h],"position.x":x,"position.y":y});api.setFill(id,true);api.setStroke(id,false);try{api.set(id,{"material.materialColor":color});}catch(e){}return id;}
  var group=api.create("group","A1 AE Motion Calibration v2");
  var center=rect("CAL 01 Center Push",-420,170,420,230,"#DFFF68");
  var offset=rect("CAL 02 Offset Anchor",180,170,420,230,"#79AAB0");
  var actor=rect("CAL 03 Coordinate Actor",0,-210,520,180,"#F4F0E8");
  var actorOutline=rect("CAL 03 Registered Outline",0,-210,560,220,"#087D8B");
  try{api.setFill(actorOutline,false);api.setStroke(actorOutline,true);api.set(actorOutline,{"stroke.width":4});}catch(e){}
  api.parent(center,group);api.parent(offset,group);api.parent(actor,group);api.parent(actorOutline,group);
  var samples=[];for(var frame=0;frame<=36;frame++){var t=frame/36,p=jerk(t),scale=Math.exp(Math.log(1.18)*p),offsetX=180+75*p;api.keyframe(center,frame,{"scale.x":scale,"scale.y":scale});api.keyframe(offset,frame,{"position.x":offsetX,"scale.x":scale,"scale.y":scale});api.keyframe(actorOutline,frame,{opacity:frame<8?0:frame<18?(frame-8)/10:1});samples.push({frame:frame,progress:p,scale:scale,offsetX:offsetX});}
  api.setFrame(18);
  var receipt={contract:"A1CavalryMotionCalibration/v2",status:"EXECUTED",cavalryVersion:"2.7.2",scene:"A1 AE Motion Calibration v2",curve:"MINIMUM_JERK_5",scaleInterpolation:"LOG",sampleCount:samples.length,samples:samples,actions:["CENTER_PUSH","OFFSET_ANCHOR","COORDINATE_ACTOR"],policy:{remotionPrimaryRenderer:true,cavalryCalibrationOnly:true}};
  api.writeToFile(receiptPath,JSON.stringify(receipt,null,2),true);
  console.log("A1 Cavalry calibration receipt: "+receiptPath);
})();
