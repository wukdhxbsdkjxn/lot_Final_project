// 全局变量
let socket = io();
let publishing = false;
let tempChart = null;
let humidChart = null;
let pressureChart = null;
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
                mode: 'nearest',
                intersect: true
            }
        }
    };

    // 初始化温度图表
    if (document.getElementById('tempChart')) {
        tempChart = new Chart(document.getElementById('tempChart'), {
            type: 'scatter',  // 改为散点图
            data: {
                datasets: [{
                    label: '温度 (°C)',
                    backgroundColor: 'rgba(255, 99, 132, 0.5)',
                    borderColor: 'rgb(255, 99, 132)',
                    data: [],
                    pointRadius: 5,  // 设置点的大小
                    pointHoverRadius: 8  // 设置鼠标悬停时点的大小
                }]
            },
            options: commonOptions
        });
    }

    // 初始化湿度图表
    if (document.getElementById('humidChart')) {
        humidChart = new Chart(document.getElementById('humidChart'), {
            type: 'scatter',  // 改为散点图
            data: {
                datasets: [{
                    label: '湿度 (%)',
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderColor: 'rgb(54, 162, 235)',
                    data: [],
                    pointRadius: 5,
                    pointHoverRadius: 8
                }]
            },
            options: commonOptions
        });
    }

    // 初始化压力图表
    if (document.getElementById('pressureChart')) {
        pressureChart = new Chart(document.getElementById('pressureChart'), {
            type: 'scatter',  // 改为散点图
            data: {
                datasets: [{
                    label: '压力 (hPa)',
                    backgroundColor: 'rgba(75, 192, 192, 0.5)',
                    borderColor: 'rgb(75, 192, 192)',
                    data: [],
                    pointRadius: 5,
                    pointHoverRadius: 8
                }]
            },
            options: commonOptions
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

// 修改连接态监听
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
        alert('请��择数据文件！');
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

// 添加一个工具函数来转换主题名称为中文
function getTopicDisplayName(topic) {
    const topicName = topic.split('/').pop().toLowerCase(); // 获取主题的最后一部分
    switch (topicName) {
        case 'humidity':
            return '湿度';
        case 'pressure':
            return '压力';
        case 'temperature':
            return '温度';
        default:
            return '温度';
    }
}

// 修改发布数据的日志显示
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
                    topic: topic
                };

                const response = await fetch('/api/publish', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(message)
                });

                const log = document.getElementById('statusLog');
                const topicDisplayName = getTopicDisplayName(topic);
                log.innerHTML += `<div class="log-entry">${timestamp} - 已发布到 ${topic}: ${topicDisplayName}=${value}</div>`;
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
    console.log('收到新数据:', data);

    // 检查���息主题是否在已订阅列���中
    const topicList = document.querySelector('.subscribed-topics');
    const topicItems = Array.from(topicList.getElementsByClassName('topic-item'));
    const isSubscribed = topicItems.some(item => item.textContent === data.topic);

    if (!isSubscribed) {
        console.log('主题未订阅，忽略消息');
        return;
    }

    // 更新数据日志
    const log = document.getElementById('dataLog');
    if (log) {
        const time = new Date(data.time);
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.textContent = `${time.toLocaleTimeString()} - [${data.topic}] 数值: ${data.temperature}`;
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
    }

    // 根据主题选择要更新的图表
    const time = new Date(data.time);
    const value = data.temperature;
    const topicName = data.topic.split('/').pop().toLowerCase();
    let targetChart;

    switch (topicName) {
        case 'humidity':
            targetChart = humidChart;
            break;
        case 'pressure':
            targetChart = pressureChart;
            break;
        case 'temperature':
            targetChart = tempChart;
            break;
        default:
            targetChart = tempChart; // 默��使用温度图表
    }

    if (targetChart) {
        // 更新图表数据
        targetChart.data.datasets[0].data.push({
            x: time,
            y: value
        });

        // 限制数据点数量
        if (targetChart.data.datasets[0].data.length > maxDataPoints) {
            targetChart.data.datasets[0].data.shift();
        }

        // 更新图表显示
        targetChart.update();
    }

    // 收集数据用于预测
    collectedData.push({
        timestamp: data.time,
        value: value
    });

    // 更新数据计数
    document.getElementById('dataCount').textContent = `已收集${collectedData.length}条数据`;

    // 当收集到足够数据时启用预测按钮
    if (collectedData.length >= 50) {
        document.getElementById('predictBtn').disabled = false;
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
    document.getElementById('subscribeBtn')?.addEventListener('click', subscribeTopic);
    document.getElementById('unsubscribeBtn')?.addEventListener('click', unsubscribeTopic);
    document.getElementById('startBtn')?.addEventListener('click', startPublishing);
    document.getElementById('stopBtn')?.addEventListener('click', stopPublishing);
}); 