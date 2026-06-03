const fs = require('fs');
let code = fs.readFileSync('backend/src/demo/demo.controller.ts', 'utf8');

const regex = /catch \(e\) \{\s*console\.error\("ONNX Inference failed:", e\);\s*\}/m;
const newBlock = `catch (e) {
            console.error("ONNX Inference failed:", e);
            throw new Error("ONNX Inference failed: " + e.message);
        }`;

code = code.replace(regex, newBlock);
fs.writeFileSync('backend/src/demo/demo.controller.ts', code);
