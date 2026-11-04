const assertBuffer = (buffer, expected, label) => {
  if (!Buffer.isBuffer(buffer) || buffer.length !== expected) throw new Error(`typography-pixel-balance-buffer-invalid:${label}:${buffer?.length}:${expected}`);
};

const centroidFromWeights = (weights, width, height) => {
  let total = 0;
  let momentX = 0;
  let momentY = 0;
  for (let index = 0; index < weights.length; index += 1) {
    const weight = weights[index];
    if (weight <= 0) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    total += weight;
    momentX += weight * ((x + 0.5) / width);
    momentY += weight * ((y + 0.5) / height);
  }
  return total > 0 ? {x: momentX / total, y: momentY / total, weight: total} : {x: null, y: null, weight: 0};
};

const moment = (centroid, opticalCenter) => ({
  horizontal: centroid.x === null ? null : centroid.x - opticalCenter.x,
  vertical: centroid.y === null ? null : centroid.y - opticalCenter.y,
});

export function measureTypographyPixelBalance({width, height, titleAlpha, subjectAlpha, microphoneAlpha, sourceRgb, candidateRgb, contactMasks = {}, opticalCenter = {x: 0.5, y: 0.46}}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("typography-pixel-balance-dimensions-invalid");
  const pixelCount = width * height;
  assertBuffer(titleAlpha, pixelCount, "title-alpha");
  assertBuffer(subjectAlpha, pixelCount, "subject-alpha");
  assertBuffer(microphoneAlpha, pixelCount, "microphone-alpha");
  assertBuffer(sourceRgb, pixelCount * 3, "source-rgb");
  assertBuffer(candidateRgb, pixelCount * 3, "candidate-rgb");
  for (const [role, mask] of Object.entries(contactMasks)) assertBuffer(mask, pixelCount, `contact-${role}`);

  const titleWeights = Float64Array.from(titleAlpha, (value) => value / 255);
  const subjectWeights = Float64Array.from(subjectAlpha, (value) => value / 255);
  const microphoneWeights = Float64Array.from(microphoneAlpha, (value) => value / 255);
  const combinedWeights = new Float64Array(pixelCount);
  const addedWeights = new Float64Array(pixelCount);
  const contrastWeights = new Float64Array(pixelCount);
  let candidateMeanLuma = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    combinedWeights[index] = titleWeights[index] + subjectWeights[index] + microphoneWeights[index];
    const rgbIndex = index * 3;
    addedWeights[index] = (Math.abs(candidateRgb[rgbIndex] - sourceRgb[rgbIndex]) + Math.abs(candidateRgb[rgbIndex + 1] - sourceRgb[rgbIndex + 1]) + Math.abs(candidateRgb[rgbIndex + 2] - sourceRgb[rgbIndex + 2])) / 765;
    candidateMeanLuma += 0.2126 * candidateRgb[rgbIndex] + 0.7152 * candidateRgb[rgbIndex + 1] + 0.0722 * candidateRgb[rgbIndex + 2];
  }
  candidateMeanLuma /= pixelCount;
  for (let index = 0; index < pixelCount; index += 1) {
    const rgbIndex = index * 3;
    const luma = 0.2126 * candidateRgb[rgbIndex] + 0.7152 * candidateRgb[rgbIndex + 1] + 0.0722 * candidateRgb[rgbIndex + 2];
    contrastWeights[index] = Math.abs(luma - candidateMeanLuma) / 255;
  }

  const centroids = {
    title: centroidFromWeights(titleWeights, width, height),
    subject: centroidFromWeights(subjectWeights, width, height),
    microphone: centroidFromWeights(microphoneWeights, width, height),
    combinedActors: centroidFromWeights(combinedWeights, width, height),
    addedPixels: centroidFromWeights(addedWeights, width, height),
    candidateContrast: centroidFromWeights(contrastWeights, width, height),
  };

  const quadrantKeys = ["topLeft", "topRight", "bottomLeft", "bottomRight"];
  const quadrantWeight = Object.fromEntries(quadrantKeys.map((key) => [key, 0]));
  const quadrantActorPixels = Object.fromEntries(quadrantKeys.map((key) => [key, 0]));
  const quadrantTotalPixels = Object.fromEntries(quadrantKeys.map((key) => [key, 0]));
  for (let index = 0; index < pixelCount; index += 1) {
    const x = index % width;
    const y = Math.floor(index / width);
    const key = `${y < height / 2 ? "top" : "bottom"}${x < width / 2 ? "Left" : "Right"}`;
    quadrantWeight[key] += combinedWeights[index];
    quadrantTotalPixels[key] += 1;
    if (combinedWeights[index] > 0) quadrantActorPixels[key] += 1;
  }
  const totalActorWeight = Object.values(quadrantWeight).reduce((sum, value) => sum + value, 0);
  const actorQuadrantWeights = Object.fromEntries(quadrantKeys.map((key) => [key, totalActorWeight ? quadrantWeight[key] / totalActorWeight : 0]));
  const negativeSpaceByQuadrant = Object.fromEntries(quadrantKeys.map((key) => [key, 1 - quadrantActorPixels[key] / quadrantTotalPixels[key]]));

  let titleRows = 0;
  let subjectCrossingRows = 0;
  let continuousCrossingRows = 0;
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * width;
    const subjectXs = [];
    let rowHasTitle = false;
    for (let x = 0; x < width; x += 1) {
      const index = rowStart + x;
      if (titleAlpha[index] > 8) rowHasTitle = true;
      if (subjectAlpha[index] > 8) subjectXs.push(x);
    }
    if (rowHasTitle) titleRows += 1;
    if (!rowHasTitle || !subjectXs.length) continue;
    const subjectLeft = subjectXs[0];
    const subjectRight = subjectXs.at(-1);
    let left = false;
    let right = false;
    let overlap = false;
    for (let x = 0; x < width; x += 1) {
      const index = rowStart + x;
      if (titleAlpha[index] <= 8) continue;
      if (x < subjectLeft) left = true;
      else if (x > subjectRight) right = true;
      else if (subjectAlpha[index] > 8) overlap = true;
    }
    if (overlap) subjectCrossingRows += 1;
    if (overlap && left && right) continuousCrossingRows += 1;
  }

  const contacts = Object.entries(contactMasks).map(([role, mask]) => {
    const overlapWeights = new Float64Array(pixelCount);
    let overlapPixels = 0;
    for (let index = 0; index < pixelCount; index += 1) {
      const weight = Math.min(titleAlpha[index], mask[index]) / 255;
      overlapWeights[index] = weight;
      if (weight > 0) overlapPixels += 1;
    }
    return {role, overlapPixels, centroid: centroidFromWeights(overlapWeights, width, height)};
  }).filter((contact) => contact.overlapPixels > 0);

  return {
    contract: "A1TypographyPixelBalanceAudit/v1",
    version: 1,
    status: "MEASURED_REVIEW_REQUIRED",
    opticalCenter,
    centroids,
    moments: {
      title: moment(centroids.title, opticalCenter),
      subject: moment(centroids.subject, opticalCenter),
      microphone: moment(centroids.microphone, opticalCenter),
      combinedActors: moment(centroids.combinedActors, opticalCenter),
      addedPixels: moment(centroids.addedPixels, opticalCenter),
      candidateContrast: moment(centroids.candidateContrast, opticalCenter),
    },
    actorQuadrantWeights,
    negativeSpaceByQuadrant,
    scanlineContinuation: {
      titleRows,
      subjectCrossingRows,
      continuousCrossingRows,
      ratio: subjectCrossingRows ? continuousCrossingRows / subjectCrossingRows : 0,
    },
    contacts,
    interpretation: "Signals locate imbalance and discontinuity; they never constitute aesthetic approval.",
    productionAdmission: false,
  };
}
