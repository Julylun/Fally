const fs = require('fs');
const content = fs.readFileSync('backend/src/demo/demo.controller.ts', 'utf8');
const oldText = `            // Create window (take first 32 samples for simplicity)
            const windowData = rows.slice(0, 32);
            while (windowData.length < 32) {
                windowData.push(windowData[windowData.length - 1] || [0,0,0,0,0,0]);
            }`;

const newText = `            // In training we took overlapping windows. Here we'll take the window with the max SMV
            // or just take the center window to get the most action. 
            // The JSON typically captures 8-10 seconds of data at high freq. 
            // We need exactly 32 samples (~0.6-1s of data).
            // Let's find the peak SMV and extract a window around it.
            const smvs = rows.map(r => Math.sqrt(r[0]*r[0] + r[1]*r[1] + r[2]*r[2]));
            const maxSmvIdx = smvs.indexOf(Math.max(...smvs));
            let startIdx = maxSmvIdx - 16;
            if (startIdx < 0) startIdx = 0;
            if (startIdx + 32 > rows.length) startIdx = Math.max(0, rows.length - 32);
            
            const windowData = rows.slice(startIdx, startIdx + 32);
            while (windowData.length < 32) {
                windowData.push(windowData[windowData.length - 1] || [0,0,0,0,0,0]);
            }`;

fs.writeFileSync('backend/src/demo/demo.controller.ts', content.replace(oldText, newText));
