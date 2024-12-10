// 全局变量
let socket = io();
let publishing = false;
let tempChart = null;
let humidChart = null;
const maxDataPoints = 50;

// 初始化图表
function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                type: 'time',
                time: {
                    unit: 'second',
                    displayFormats: {
                        second: 'HH:mm:ss'
                    },
                    tooltipFormat: 'yyyy-MM-dd HH:mm:ss'
                },
                title: {
                    display: true,
                    text: '时间'
                }
            },
            y: {
                beginAtZero: true
            }
        },
        plugins: {
            tooltip: {
                mode: 'index',
                intersect: false
            }
        }
    };

    if (document.getElementById('tempChart')) {
        tempChart = new Chart(document.getElementById('tempChart'), {
            type: 'line',
            data: {
                datasets: [{
                    label: '温度 (°C)',
                    borderColor: 'rgb(255, 99, 132)',
                    data: [],
                    tension: 0.4
                }]
            },
            options: {
                ...commonOptions,
                scales: {
                    ...commonOptions.scales,
                    y: {
                        ...commonOptions.scales.y,
                        title: {
                            display: true,
                            text: '温度 (°C)'
                        }
                    }
                }
            }
        });
    }

    if (document.getElementById('humidChart')) {
        humidChart = new Chart(document.getElementById('humidChart'), {
            type: 'line',
            data: {
                datasets: [{
                    label: '湿度 (%)',
                    borderColor: 'rgb(54, 162, 235)',
                    data: [],
                    tension: 0.4
                }]
            },
            options: {
                ...commonOptions,
                scales: {
                    ...commonOptions.scales,
                    y: {
                        ...commonOptions.scales.y,
                        title: {
                            display: true,
                            text: '湿度 (%)'
                        }
                    }
                }
            }
        });
    }
}

// 连接MQTT Broker
async function connectBroker() {
    const broker = document.getElementById('broker').value;
    const port = document.getElementById('port').value;
    const connectBtn = document.getElementById('connectBtn');
    
    try {
        connectBtn.disabled = true;
        connectBtn.textContent = '连接中...';
        
        const response = await fetch('/api/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ broker, port })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('MQTT连接请求已发送');
        } else {
            throw new Error('连接请求失败');
        }
    } catch (error) {
        console.error('连接错误：', error);
        alert('连接错误：' + error.message);
        connectBtn.disabled = false;
        connectBtn.textContent = '连接';
    }
}

// 添加MQTT连接状态监听
socket.on('mqtt_connected', function(data) {
    const connectBtn = document.getElementById('connectBtn');
    const startBtn = document.getElementById('startBtn');
    
    if (data.status) {
        alert('已成功连接到MQTT服务器！');
        connectBtn.disabled = true;
        connectBtn.textContent = '已连接';
        if (startBtn) {
            startBtn.disabled = false;
        }
    } else {
        alert('MQTT连接失败：' + (data.error || '未知错误'));
        connectBtn.disabled = false;
        connectBtn.textContent = '连接';
        if (startBtn) {
            startBtn.disabled = true;
        }
    }
});

// 发布者相关函数
function startPublishing() {
    const fileInput = document.getElementById('dataFile');
    const file = fileInput.files[0];
    if (!file) {
        alert('请选择数据文件！');
        return;
    }

    publishing = true;
    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const lines = e.target.result.split('\n');
        publishData(lines);
    };
    reader.readAsText(file);
}

async function publishData(lines) {
    for (let line of lines) {
        if (!publishing) break;
        
        try {
            // 解析JSON格式的数据行
            const dataObj = JSON.parse(line.trim());
            
            // 遍历每个时间点的数据
            for (const [timestamp, value] of Object.entries(dataObj)) {
                if (!publishing) break;

                // 验证数据格式
                if (!timestamp || isNaN(parseFloat(value))) {
                    console.warn('跳过无效数据:', timestamp, value);
                    continue;
                }

                const message = {
                    temperature: parseFloat(value),  // 温度值
                    humidity: 0,  // 由于数据中只有一个值，我们可以只展示温度
                    time: timestamp
                };

                const response = await fetch('/api/publish', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(message)
                });

                const log = document.getElementById('statusLog');
                log.innerHTML += `<div class="log-entry">${timestamp} - 已发布: 温度=${value}°C</div>`;
                log.scrollTop = log.scrollHeight;

                await new Promise(resolve => setTimeout(resolve, 1000)); // 每秒发送一个数据点
            }
        } catch (error) {
            console.error('发布错误：', error);
            continue; // 跳过错误的行，继续处理下一行
        }
    }
}

function stopPublishing() {
    publishing = false;
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
}

// 订阅者相关函数
socket.on('new_data', function(data) {
    if (tempChart && humidChart) {
        // 更新图表
        const time = new Date(data.time);
        
        tempChart.data.datasets[0].data.push({
            x: time,
            y: data.temperature
        });
        
        humidChart.data.datasets[0].data.push({
            x: time,
            y: data.humidity
        });

        // 限制数据点数量
        if (tempChart.data.datasets[0].data.length > maxDataPoints) {
            tempChart.data.datasets[0].data.shift();
            humidChart.data.datasets[0].data.shift();
        }

        tempChart.update();
        humidChart.update();

        // 更新数据日志
        const log = document.getElementById('dataLog');
        log.innerHTML += `<div class="log-entry">${time.toLocaleTimeString()} - 温度: ${data.temperature}°C, 湿度: ${data.humidity}%</div>`;
        log.scrollTop = log.scrollHeight;
    }
});

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initCharts();
    
    // 绑定事件处理器
    document.getElementById('connectBtn')?.addEventListener('click', connectBroker);
    document.getElementById('startBtn')?.addEventListener('click', startPublishing);
    document.getElementById('stopBtn')?.addEventListener('click', stopPublishing);
}); 