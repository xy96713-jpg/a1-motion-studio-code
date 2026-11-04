// A1 screen-motion maturity masters authored and executed in Cavalry 2.7.2.
(function () {
  var receiptPath = "/Users/a1/Documents/ChatGPT/a1-motion-studio-system-line/work/screen-motion-master-v2/cavalry-master-receipt.json";
  function jerk(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * t * (10 - 15 * t + 6 * t * t);
  }
  function rect(name, x, y, width, height, color) {
    var id = api.primitive("rectangle", name);
    api.set(id, {
      "generator.dimensions": [width, height],
      "position.x": x,
      "position.y": y,
    });
    api.setFill(id, true);
    api.setStroke(id, false);
    try {
      api.set(id, {"material.materialColor": color});
    } catch (error) {}
    return id;
  }

  var root = api.create("group", "A1 Screen Motion Masters v1");

  var cleanGroup = api.create("group", "MASTER 01 CLEAN_STATE");
  var cleanSource = rect("Clean Source Pixels", -500, 260, 620, 310, "#F4F0E8");
  api.parent(cleanSource, cleanGroup);
  api.parent(cleanGroup, root);

  var pushGroup = api.create("group", "MASTER 02 SEMANTIC_PUSH");
  var pushSource = rect("Semantic Push Source", 260, 260, 620, 310, "#DDE7E5");
  var pushTarget = rect("Semantic Push Target", 330, 245, 210, 86, "#79AAB0");
  api.parent(pushSource, pushGroup);
  api.parent(pushTarget, pushGroup);
  api.parent(pushGroup, root);

  var annotationGroup = api.create("group", "MASTER 03 SOURCE_ANNOTATION");
  var annotationSource = rect("Annotation Source", -120, -250, 760, 300, "#F4F0E8");
  var underline = rect("Source Bound Underline", -120, -315, 360, 8, "#087D8B");
  api.parent(annotationSource, annotationGroup);
  api.parent(underline, annotationGroup);
  api.parent(annotationGroup, root);

  var pushSamples = [];
  for (var frame = 0; frame <= 67; frame += 1) {
    var progress = jerk(frame / 67);
    var scale = Math.exp(Math.log(1.14) * progress);
    api.keyframe(pushGroup, frame, {"scale.x": scale, "scale.y": scale});
    pushSamples.push({frame: frame, progress: progress, scale: scale});
  }
  api.keyframe(pushGroup, 163, {"scale.x": 1.14, "scale.y": 1.14});

  var annotationSamples = [];
  for (var annotationFrame = 0; annotationFrame <= 43; annotationFrame += 1) {
    var annotationProgress = jerk(Math.max(0, (annotationFrame - 12) / 31));
    api.keyframe(underline, annotationFrame, {
      "scale.x": Math.max(0.02, annotationProgress),
      opacity: annotationProgress,
    });
    annotationSamples.push({
      frame: annotationFrame,
      progress: annotationProgress,
      opacity: annotationProgress,
    });
  }
  api.keyframe(underline, 133, {"scale.x": 1, opacity: 1});
  api.setFrame(67);

  var receipt = {
    contract: "A1CavalryScreenMotionMasters/v1",
    status: "EXECUTED",
    cavalryVersion: "2.7.2",
    scene: "A1 Screen Motion Masters v2",
    masters: [
      {
        id: "CLEAN_STATE",
        motionActors: 0,
        cameraMoves: 0,
        sourcePixelsUncovered: true,
      },
      {
        id: "SEMANTIC_PUSH",
        curve: "MINIMUM_JERK_5",
        maximumScale: 1.14,
        moveFrames: 67,
        stableHoldFrames: 96,
        samples: pushSamples,
      },
      {
        id: "SOURCE_ANNOTATION",
        curve: "MINIMUM_JERK_5",
        enterStartFrame: 12,
        enterEndFrame: 43,
        stableHoldEndFrame: 133,
        samples: annotationSamples,
        sourcePixelsUncovered: true,
      },
    ],
    policy: {
      cavalryOwnsMotionDesign: true,
      remotionOwnsVerifiedSourcePixelBinding: true,
      whiteFocusWindowForbidden: true,
      maximumConcurrentActors: 1,
      userVisualApproval: "NOT_APPROVED",
      productionAdmission: false,
    },
  };
  api.writeToFile(receiptPath, JSON.stringify(receipt, null, 2), true);
  console.log("A1 Cavalry screen-motion master receipt: " + receiptPath);
})();
