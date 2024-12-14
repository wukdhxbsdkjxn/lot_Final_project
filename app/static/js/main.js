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
    
    // 根据页面类型确定客户端类型
    const client_type = window.location.pathname.includes('publisher') ? 'publisher' : 'subscriber';
    
    try {
        connectBtn.disabled = true;
        connectBtn.textContent = '连接中...';
        
        const response = await fetch('/api/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ broker, port, client_type })  // 添加 client_type
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

// 修改连接状态监听
const client_type = window.location.pathname.includes('publisher') ? 'publisher' : 'subscriber';
socket.on(`mqtt_connected_${client_type}`, function(data) {
    const connectBtn = document.getElementById('connectBtn');
    const startBtn = document.getElementById('startBtn');
    const subscribeBtn = document.getElementById('subscribeBtn');
    const unsubscribeBtn = document.getElementById('unsubscribeBtn');
    
    if (data.status) {
        alert('已成功连接到MQTT服务器！');
        connectBtn.disabled = true;
        connectBtn.textContent = '已连接';
        if (startBtn) {
            startBtn.disabled = false;
        }
        if (subscribeBtn) {
            subscribeBtn.disabled = false;
            unsubscribeBtn.disabled = false;
        }
    } else {
        alert('MQTT连接失败：' + (data.error || '未知错误'));
        connectBtn.disabled = false;
        connectBtn.textContent = '连接';
        if (startBtn) {
            startBtn.disabled = true;
        }
        if (subscribeBtn) {
            subscribeBtn.disabled = true;
            unsubscribeBtn.disabled = true;
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
    const topic = document.getElementById('topic').value || 'sensor/data';
    
    for (let line of lines) {
        if (!publishing) break;
        
        try {
            const dataObj = JSON.parse(line.trim());
            
            for (const [timestamp, value] of Object.entries(dataObj)) {
                if (!publishing) break;

                if (!timestamp || isNaN(parseFloat(value))) {
                    console.warn('跳过无效数据:', timestamp, value);
                    continue;
                }

                const message = {
                    temperature: parseFloat(value),
                    humidity: 0,
                    time: timestamp,
                    topic: topic  // 添加主题信息
                };

                const response = await fetch('/api/publish', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(message)
                });

                const log = document.getElementById('statusLog');
                log.innerHTML += `<div class="log-entry">${timestamp} - 已发布到 ${topic}: 温度=${value}°C</div>`;
                log.scrollTop = log.scrollHeight;

                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error('发布错误：', error);
            continue;
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
    console.log('收到新数据:', data);  // 添加调试日志
    
    // 检查消息主题是否在已订阅列表中
    const topicList = document.querySelector('.subscribed-topics');
    const topicItems = Array.from(topicList.getElementsByClassName('topic-item'));
    const isSubscribed = topicItems.some(item => item.textContent === data.topic);
    
    console.log('已订阅主题:', topicItems.map(item => item.textContent));  // 添加调试日志
    console.log('当前消息主题:', data.topic);  // 添加调试日志
    console.log('是否已订阅:', isSubscribed);  // 添加调试日志
    
    // 如果主题未订阅，则不处理该消息
    if (!isSubscribed) {
        console.log('主题未订阅，忽略消息');  // 添加调试日志
        return;
    }

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
        log.innerHTML += `<div class="log-entry">${time.toLocaleTimeString()} - [${data.topic}] 温度: ${data.temperature}°C, 湿度: ${data.humidity}%</div>`;
        log.scrollTop = log.scrollHeight;
    }
});

// 添加订阅相关函数
async function subscribeTopic() {
    const topic = document.getElementById('topic').value;
    if (!topic) {
        alert('请输入要订阅的主题！');
        return;
    }

    try {
        const response = await fetch('/api/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ topic })
        });

        const data = await response.json();
        if (data.success) {
            updateTopicList(topic);
            alert('订阅成功！');
        } else {
            alert('订阅失败：' + data.message);
        }
    } catch (error) {
        console.error('订阅错误：', error);
        alert('订阅错误：' + error.message);
    }
}

async function unsubscribeTopic() {
    const topic = document.getElementById('topic').value;
    if (!topic) {
        alert('请输入要取消订阅的主题！');
        return;
    }

    try {
        const response = await fetch('/api/unsubscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ topic })
        });

        const data = await response.json();
        if (data.success) {
            removeFromTopicList(topic);
            alert('取消订阅成功！');
        } else {
            alert('取消订阅失败：' + data.message);
        }
    } catch (error) {
        console.error('取消订阅错误：', error);
        alert('取消订阅错误：' + error.message);
    }
}

// 更新主题列表显示
function updateTopicList(topic) {
    const topicList = document.querySelector('.subscribed-topics');
    const topicElement = document.createElement('div');
    topicElement.className = 'topic-item';
    topicElement.textContent = topic;
    topicList.appendChild(topicElement);
}

function removeFromTopicList(topic) {
    const topicList = document.querySelector('.subscribed-topics');
    const topicItems = topicList.getElementsByClassName('topic-item');
    for (let item of topicItems) {
        if (item.textContent === topic) {
            item.remove();
            break;
        }
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initCharts();
    
    // 绑定事件处理器
    document.getElementById('connectBtn')?.addEventListener('click', connectBroker);
    document.getElementById('subscribeBtn')?.addEventListener('click', subscribeTopic);
    document.getElementById('unsubscribeBtn')?.addEventListener('click', unsubscribeTopic);
    document.getElementById('startBtn')?.addEventListener('click', startPublishing);
    document.getElementById('stopBtn')?.addEventListener('click', stopPublishing);
}); 