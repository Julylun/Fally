const fs = require('fs');
const content = fs.readFileSync('backend/src/demo/demo.controller.ts', 'utf8');

const oldText = `    const { features, confidence, overrideConfidence, rawData } = body;
    let finalConfidence = overrideConfidence ?? confidence ?? 0.95;
    let isFall = finalConfidence >= 0.5;

    // If rawData is provided, actually run the ONNX model
    if (rawData && Array.isArray(rawData.sensors)) {`;

const newText = `    const { features, confidence, overrideConfidence, rawData } = body;
    let finalConfidence = overrideConfidence ?? confidence ?? 0.05;
    let isFall = finalConfidence >= 0.5;

    // If rawData is provided, actually run the ONNX model
    if (rawData && Array.isArray(rawData.sensors)) {`;

fs.writeFileSync('backend/src/demo/demo.controller.ts', content.replace(oldText, newText));
