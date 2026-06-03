const fs = require('fs');
let html = fs.readFileSync('backend/public/demo/index.html', 'utf8');

// Find the fetch block for simulate-mobile
const regex = /const res = await fetch\('\/api\/v1\/demo\/simulate-mobile'[\s\S]*?addLog\('Mobile: Phát hiện ngã \(95%\)'\);/m;

const newBlock = `const res = await fetch('/api/v1/demo/simulate-mobile', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        rawData: mobileData
                    })
                });
                const out = await res.json();
                
                const isFallText = out.isFall ? 'Có ngã' : 'Không ngã';
                const isFallClass = out.isFall ? 'font-headline-sm text-headline-sm text-error' : 'font-headline-sm text-headline-sm text-primary-fixed-dim';
                document.getElementById('mobile-result').textContent = isFallText;
                document.getElementById('mobile-result').className = isFallClass;
                document.getElementById('mobile-conf').textContent = \`\${Math.round(out.confidence * 100)}%\`;
                document.getElementById('mobile-status-dot').className = 'w-3 h-3 rounded-full bg-primary-fixed-dim';
                mobileDetected = out.isFall;
                addLog(\`Mobile: \${isFallText} (\${Math.round(out.confidence * 100)}%)\`);`;

html = html.replace(regex, newBlock);
fs.writeFileSync('backend/public/demo/index.html', html);
