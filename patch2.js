const fs = require('fs');
const content = fs.readFileSync('backend/src/demo/demo.controller.ts', 'utf8');
const oldText = `            if (probOutput && probOutput.data) {
                 const probs = Array.from(probOutput.data);
                 if (probs.length > 1) {
                     finalConfidence = probs[1];
                 } else {
                     finalConfidence = probs[0];
                 }
            } else {
                 const labelOutput = results[session.outputNames[0]];
                 finalConfidence = labelOutput.data[0];
            }`;

const newText = `            if (probOutput && probOutput.data) {
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

fs.writeFileSync('backend/src/demo/demo.controller.ts', content.replace(oldText, newText));
