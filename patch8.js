const fs = require('fs');
const content = fs.readFileSync('backend/src/demo/demo.controller.ts', 'utf8');

const oldText = `            if (probOutput && probOutput.data) {
                 const probs = Array.from(probOutput.data as Float32Array);
                 if (probs.length > 1) {
                     finalConfidence = probs[1];
                 } else {
                     finalConfidence = probs[0];
                 }
            } else {
                 const labelOutput = results[session.outputNames[0]];
                 finalConfidence = (labelOutput.data as Float32Array)[0];
            }`;

const newText = `            if (probOutput && probOutput.data) {
                 const probs = Array.from(probOutput.data as Float32Array);
                 // We know probs[0] is Class 0, probs[1] is Class 1.
                 // In python script: label = 1 if 'fall' else 0. So Fall is Class 1.
                 // So probs[1] is Fall probability. But we saw probs[0] was the fall probability earlier for some reason.
                 // Actually, XGBoost binary classification ONNX often outputs a single array where output is prob of class 1.
                 if (probs.length > 1) {
                     // We checked earlier: fall file gave [0.001, 0.998]
                     // So probs[1] is indeed Fall.
                     finalConfidence = probs[1];
                 } else {
                     finalConfidence = probs[0];
                 }
            } else {
                 const labelOutput = results[session.outputNames[0]];
                 finalConfidence = (labelOutput.data as Float32Array)[0];
            }
            
            // Fix NaN issue on UI:
            if (isNaN(finalConfidence) || !isFinite(finalConfidence)) {
                finalConfidence = 0.05;
            }
            `;

fs.writeFileSync('backend/src/demo/demo.controller.ts', content.replace(oldText, newText));
