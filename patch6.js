const fs = require('fs');
const content = fs.readFileSync('backend/src/demo/demo.controller.ts', 'utf8');

const oldText = `            if (probOutput && probOutput.data) {
                 const probs = Array.from(probOutput.data as Float32Array);
                 // If the labels are 0: ADL, 1: Fall, then probs[1] is the Fall probability
                 // If the labels are 0: Fall, 1: ADL, then probs[0] is the Fall probability
                 // In python train script: label = 1 if 'fall' in folder else 0
                 // So probs[1] is fall probability.
                 if (probs.length > 1) {
                     finalConfidence = Number(probs[1]);
                 } else {
                     finalConfidence = Number(probs[0]);
                 }
            } else {
                 const labelOutput = results[session.outputNames[0]];
                 finalConfidence = Number((labelOutput.data as Float32Array)[0]);
            }`;

const newText = `            if (probOutput && probOutput.data) {
                 const probs = Array.from(probOutput.data as Float32Array);
                 // In XGBoost ONNX output, often Output[1] is a list of maps (in JS it comes out as a flattened array).
                 // For binary classification, probOutput.data will be [prob_class0, prob_class1].
                 if (probs.length > 1) {
                     finalConfidence = Number(probs[1]);
                 } else {
                     finalConfidence = Number(probs[0]);
                 }
            } else {
                 const labelOutput = results[session.outputNames[0]];
                 finalConfidence = Number((labelOutput.data as Float32Array)[0]);
            }`;

fs.writeFileSync('backend/src/demo/demo.controller.ts', content.replace(oldText, newText));
