// 全局变量
let socket = io();
let publishing = false;
let tempChart = null;
let humidChart = null;
const maxDataPoints = 50;
let collectedData = [];  // 保留这个用于预测功能

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
    try {
        for (let line of lines) {
            if (!publishing) break;
            
            try {
                const dataObj = JSON.parse(line.trim());
                for (const [timestamp, value] of Object.entries(dataObj)) {
                    if (!publishing) break;
                    
                    if (timestamp && !isNaN(parseFloat(value))) {
                        const data = {
                            temperature: parseFloat(value),
                            humidity: 0,
                            time: timestamp
                        };
                        
                        const response = await fetch('/api/publish', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(data)
                        });
                        
                        const log = document.getElementById('statusLog');
                        log.innerHTML += `<div class="log-entry">已发布数据：${JSON.stringify(data)}</div>`;
                        log.scrollTop = log.scrollHeight;
                        
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            } catch (error) {
                console.warn('跳过无效数据行:', line);
                continue;
            }
        }
        
        if (publishing) {
            const log = document.getElementById('statusLog');
            log.innerHTML += `<div class="log-entry">所有数据发布完成！</div>`;
        }
    } catch (error) {
        console.error('发布错误：', error);
        alert('发布数据时出错：' + error.message);
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
        // 收集数据用于预测
        collectedData.push({
            timestamp: data.time,
            value: data.temperature
        });
        
        // 更新数据计数
        document.getElementById('dataCount').textContent = `已收集${collectedData.length}条数据`;
        
        // 当收集到足够数据时启用预测按钮
        if (collectedData.length >= 50) {
            document.getElementById('predictBtn').disabled = false;
        }

        const time = new Date(data.time);
        
        // 更新温度图表
        tempChart.data.datasets[0].data.push({
            x: time,
            y: data.temperature
        });
        
        // 更新湿度图表
        humidChart.data.datasets[0].data.push({
            x: time,
            y: data.humidity
        });
        
        // 限制数据点数量
        while (tempChart.data.datasets[0].data.length > maxDataPoints) {
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

// 保留预测按钮的事件处理代码
document.getElementById('predictBtn')?.addEventListener('click', async function() {
    if (collectedData.length < 50) {
        alert('数据量不足，请至少收集50条数据');
        return;
    }
    
    // 创建加载提示
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'position-fixed top-50 start-50 translate-middle';
    loadingDiv.style.zIndex = '1000';
    loadingDiv.innerHTML = `
        <div class="card p-4 shadow">
            <div class="d-flex align-items-center">
                <div class="spinner-border text-primary me-3" role="status">
                    <span class="visually-hidden">加载中...</span>
                </div>
                <div>正在处理数据并训练模型，请稍候...</div>
            </div>
        </div>
    `;
    document.body.appendChild(loadingDiv);
    
    try {
        // 禁用预测按钮
        const predictBtn = document.getElementById('predictBtn');
        predictBtn.disabled = true;
        
        const response = await fetch('/api/predict', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: collectedData })
        });
        
        if (response.ok) {
            window.location.href = '/prediction_results';
        } else {
            throw new Error('预测请求失败');
        }
    } catch (error) {
        alert('预测错误：' + error.message);
    } finally {
        // 移除加载提示
        document.body.removeChild(loadingDiv);
        // 重新启用预测按钮
        document.getElementById('predictBtn').disabled = false;
    }
});

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

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initCharts();
    
    // 绑定事件处理器
    document.getElementById('connectBtn')?.addEventListener('click', connectBroker);
    document.getElementById('startBtn')?.addEventListener('click', startPublishing);
    document.getElementById('stopBtn')?.addEventListener('click', stopPublishing);
});