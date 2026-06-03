const fs = require('fs');
const content = fs.readFileSync('backend/public/demo/index.html', 'utf8');
const oldText = `                const res = await fetch('/api/v1/demo/simulate-mobile', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        rawData: mobileData,
                        confidence: 0.95
                    })
                });
                const out = await res.json();

                document.getElementById('mobile-result').textContent = 'Có ngã';
                document.getElementById('mobile-result').className = 'font-headline-sm text-headline-sm text-error';
                document.getElementById('mobile-conf').textContent = '95%';
                document.getElementById('mobile-status-dot').className = 'w-3 h-3 rounded-full bg-primary-fixed-dim';
                mobileDetected = true;
                addLog('Mobile: Phát hiện ngã (95%)');`;

const newText = `                const res = await fetch('/api/v1/demo/simulate-mobile', {
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

fs.writeFileSync('backend/public/demo/index.html', content.replace(oldText, newText));
