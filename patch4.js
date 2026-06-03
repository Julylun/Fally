const fs = require('fs');
const content = fs.readFileSync('backend/public/demo/index.html', 'utf8');
const oldFunc = `    function drawMobileGraph(data) {
        // Just a mock visualization based on the data length
        const accPath = document.getElementById('mobile-acc-path');
        const gyroPath = document.getElementById('mobile-gyro-path');
        accPath.setAttribute('d', 'M0,80 L20,75 L40,82 L60,40 L80,95 L100,20 L120,50 L140,85 L160,90 L180,88 L200,92 L220,10 L240,50 L260,90 L280,95 L300,92 L320,94 L340,90 L360,95 L380,92 L400,90');
        gyroPath.setAttribute('d', 'M0,50 L30,52 L60,48 L90,55 L120,10 L150,85 L180,50 L210,48 L240,52 L270,50 L300,15 L330,80 L360,50 L400,52');
        accPath.classList.add('sparkline');
        gyroPath.classList.add('sparkline');
    }`;

const newFunc = `    function drawMobileGraph(data) {
        if (!data || !data.sensors || data.sensors.length === 0) return;
        
        const accPath = document.getElementById('mobile-acc-path');
        const gyroPath = document.getElementById('mobile-gyro-path');
        
        const width = 400;
        const hAcc = 100;
        const hGyro = 100;
        const sensors = data.sensors;
        
        const step = Math.max(1, Math.floor(sensors.length / 200));
        
        let minAcc = Infinity, maxAcc = -Infinity;
        let minGyro = Infinity, maxGyro = -Infinity;
        
        for(let i = 0; i < sensors.length; i += step) {
             let acc = sensors[i].accelerometer || {x:0, y:0, z:0};
             let gyro = sensors[i].gyroscope || {x:0, y:0, z:0};
             let accSmv = Math.sqrt(acc.x*acc.x + acc.y*acc.y + acc.z*acc.z);
             let gyroSmv = Math.sqrt(gyro.x*gyro.x + gyro.y*gyro.y + gyro.z*gyro.z);
             if(accSmv < minAcc) minAcc = accSmv;
             if(accSmv > maxAcc) maxAcc = accSmv;
             if(gyroSmv < minGyro) minGyro = gyroSmv;
             if(gyroSmv > maxGyro) maxGyro = gyroSmv;
        }
        
        let pointIdx = 0;
        const totalPoints = Math.ceil(sensors.length / step);
        
        let accD = "";
        let gyroD = "";
        
        for(let i = 0; i < sensors.length; i += step) {
             let acc = sensors[i].accelerometer || {x:0, y:0, z:0};
             let gyro = sensors[i].gyroscope || {x:0, y:0, z:0};
             let accSmv = Math.sqrt(acc.x*acc.x + acc.y*acc.y + acc.z*acc.z);
             let gyroSmv = Math.sqrt(gyro.x*gyro.x + gyro.y*gyro.y + gyro.z*gyro.z);
             
             let x = (pointIdx / (totalPoints - 1)) * width;
             let accY = hAcc - ((accSmv - minAcc) / (maxAcc - minAcc || 1)) * (hAcc * 0.8) - (hAcc * 0.1);
             let gyroY = hGyro - ((gyroSmv - minGyro) / (maxGyro - minGyro || 1)) * (hGyro * 0.8) - (hGyro * 0.1);
             
             if(pointIdx === 0) {
                 accD += \`M\${x.toFixed(1)},\${accY.toFixed(1)}\`;
                 gyroD += \`M\${x.toFixed(1)},\${gyroY.toFixed(1)}\`;
             } else {
                 accD += \` L\${x.toFixed(1)},\${accY.toFixed(1)}\`;
                 gyroD += \` L\${x.toFixed(1)},\${gyroY.toFixed(1)}\`;
             }
             pointIdx++;
        }
        
        accPath.setAttribute('d', accD);
        gyroPath.setAttribute('d', gyroD);
        accPath.classList.add('sparkline');
        gyroPath.classList.add('sparkline');
    }`;

fs.writeFileSync('backend/public/demo/index.html', content.replace(oldFunc, newFunc));
