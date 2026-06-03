const fs = require('fs');
const content = fs.readFileSync('backend/src/incidents/incidents.service.ts', 'utf8');

const oldText = `  private windowBounds(detectedAt: Date) {
    const t = detectedAt.getTime();
    const w = this.correlationWindowMs;
    return { start: new Date(t - w), end: new Date(t + w) };
  }`;

const newText = `  private windowBounds(detectedAt: Date) {
    const t = detectedAt.getTime();
    // Parse the string into number
    const w = parseInt(String(this.correlationWindowMs), 10) || 10000;
    return { start: new Date(t - w), end: new Date(t + w) };
  }`;

fs.writeFileSync('backend/src/incidents/incidents.service.ts', content.replace(oldText, newText));
