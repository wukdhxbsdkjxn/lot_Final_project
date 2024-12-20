// 全局变量
let socket = io();
let publishing = false;
let tempChart = null;
let humidChart = null;
let pressureChart = null;
const maxDataPoints = 50;
let collectedData = {
    temperature: [],
    humidity: [],
    pressure: []
};
let displayBuffer = [];
const bufferSize = 10;
let updateChartTimeout = null;
let receivedData = {
    temperature: [],
    humidity: [],
    pressure: []
};

// 初始化图表
function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                type: 'time',
                time: {
                    unit: 'hour',
                    displayFormats: {
                        hour: 'MM-dd HH:mm'
                    },
                    tooltipFormat: 'yyyy-MM-dd HH:mm',
                },
                title: {
                    display: true,
                    text: '时间'
                },
                ticks: {
                    maxRotation: 45,
                    minRotation: 45
                }
            },
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: '数值'
                }
            }
        },
        plugins: {
            tooltip: {
                mode: 'nearest',
                intersect: false,
                callbacks: {
                    label: function(context) {
                        return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}`;
                    }
                }
            }
        }
    };

    // 初始化温度图表
    if (document.getElementById('tempChart')) {
        tempChart = new Chart(document.getElementById('tempChart'), {
            type: 'scatter',
            data: {
                datasets: [{
                    label: '温度 (°C)',
                    backgroundColor: 'rgba(255, 99, 132, 0.5)',
                    borderColor: 'rgb(255, 99, 132)',
                    data: [],
                    pointRadius: 3,
                    pointHoverRadius: 5
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

    // 初始化湿度图表
    if (document.getElementById('humidChart')) {
        humidChart = new Chart(document.getElementById('humidChart'), {
            type: 'scatter',
            data: {
                datasets: [{
                    label: '湿度 (%)',
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderColor: 'rgb(54, 162, 235)',
                    data: [],
                    pointRadius: 3,
                    pointHoverRadius: 5
                }]
            },
            options: commonOptions
        });
    }

    // 初始化压力图表
    if (document.getElementById('pressureChart')) {
        pressureChart = new Chart(document.getElementById('pressureChart'), {
            type: 'scatter',
            data: {
                datasets: [{
                    label: '压力 (hPa)',
                    backgroundColor: 'rgba(75, 192, 192, 0.5)',
                    borderColor: 'rgb(75, 192, 192)',
                    data: [],
                    pointRadius: 3,
                    pointHoverRadius: 5
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

// 添加一个工具函数来转换主题名称为中文
function getTopicDisplayName(topic) {
    const topicName = topic.split('/').pop().toLowerCase(); // 获取主题最后一部分
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
    const batchSize = 10; // 每批处理10条数据
    let processedCount = 0;
    
    try {
        // 解析所有数据
        const allData = [];
        for (let line of lines) {
            try {
                const dataObj = JSON.parse(line.trim());
                for (const [timestamp, value] of Object.entries(dataObj)) {
                    if (timestamp && !isNaN(parseFloat(value))) {
                        allData.push({
                            temperature: parseFloat(value),
                            humidity: 0,
                            time: timestamp,
                            topic: topic
                        });
                    }
                }
            } catch (error) {
                console.warn('跳过无效数据行:', line);
                continue;
            }
        }

        const log = document.getElementById('statusLog');
        
        // 批量处理数据
        for (let i = 0; i < allData.length; i += batchSize) {
            if (!publishing) break;
            
            const batch = allData.slice(i, i + batchSize);
            const promises = batch.map(message => 
                fetch('/api/publish', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(message)
                })
            );

            await Promise.all(promises);
            processedCount += batch.length;

            // 更新状态日志
            log.innerHTML += `<div class="log-entry">已发布${processedCount}/${allData.length}条数据</div>`;
            log.scrollTop = log.scrollHeight;

            // 控制发送速率
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        if (publishing) {
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
    console.log('收到新数据:', data);

    // 检查消息主题是否在已订阅列表中
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

    // 存储数据
    const topicName = data.topic.split('/').pop().toLowerCase();
    console.log('Topic name:', topicName); // 添加调试日志
    
    // 确保数据被正确分类存储
    switch (topicName) {
        case 'temperature':
            receivedData.temperature.push({
                time: new Date(data.time),
                value: data.temperature
            });
            break;
        case 'humidity':
            receivedData.humidity.push({
                time: new Date(data.time),
                value: data.humidity
            });
            break;
        case 'pressure':
            receivedData.pressure.push({
                time: new Date(data.time),
                value: data.pressure
            });
            break;
        default:
            // 如果没有指定主题，默认存储为温度数据
            receivedData.temperature.push({
                time: new Date(data.time),
                value: data.temperature
            });
    }
    
    console.log('Received data length:', {
        temperature: receivedData.temperature.length,
        humidity: receivedData.humidity.length,
        pressure: receivedData.pressure.length
    });

    // 根据主题分类存储预测数据
    if (collectedData[topicName]) {
        collectedData[topicName].push({
            timestamp: data.time,
            value: data.temperature
        });
    }

    // 显示每个主题的数据量
    document.getElementById('dataCount').textContent = 
        `已收集数据：温度${collectedData.temperature.length}条, ` +
        `湿度${collectedData.humidity.length}条, ` +
        `压力${collectedData.pressure.length}条`;

    // 当任主题收集到足够数据时启用预测按钮
    const hasEnoughData = Object.values(collectedData).some(data => data.length >= 50);
    document.getElementById('predictBtn').disabled = !hasEnoughData;
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

// 修改预测按钮的处理逻辑
document.getElementById('predictBtn')?.addEventListener('click', async function() {
    // 添加主题选择下拉框
    const topicSelect = document.createElement('select');
    topicSelect.className = 'form-select mb-3';
    Object.entries(collectedData).forEach(([topic, data]) => {
        if (data.length >= 50) {
            const option = document.createElement('option');
            option.value = topic;
            option.textContent = `${topic} (${data.length}条数据)`;
            topicSelect.appendChild(option);
        }
    });

    // 创建确认对话框
    const dialog = document.createElement('div');
    dialog.className = 'modal fade show';
    dialog.style.display = 'block';
    dialog.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">选择要预测的数据</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <p>请选择要进行预测的数据类型：</p>
                    ${topicSelect.outerHTML}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                    <button type="button" class="btn btn-primary" id="confirmPredict">确定</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    // 处理预测确认
    document.getElementById('confirmPredict').onclick = async function() {
        const selectedTopic = topicSelect.value;
        dialog.remove();
        
        // 显示加载提示
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
            const response = await fetch('/api/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    data: collectedData[selectedTopic],
                    topic: selectedTopic
                })
            });

            if (response.ok) {
                // 在新标签页中打开预测结果
                window.open('/prediction_results', '_blank');
            } else {
                throw new Error('预测请求失败');
            }
        } catch (error) {
            alert('预测错误：' + error.message);
        } finally {
            document.body.removeChild(loadingDiv);
        }
    };

    // 处理取消按钮
    dialog.querySelector('.btn-close').onclick = function() {
        dialog.remove();
    };
    dialog.querySelector('.btn-secondary').onclick = function() {
        dialog.remove();
    };
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

// 添加辅助函数获取目标图表
function getTargetChart(topic) {
    const topicName = topic.split('/').pop().toLowerCase();
    switch (topicName) {
        case 'humidity':
            return humidChart;
        case 'pressure':
            return pressureChart;
        case 'temperature':
        default:
            return tempChart;
    }
}

// 添加绘制图表函数
function drawCharts() {
    console.log('Drawing charts...'); // 添加调试日志
    console.log('Current data:', receivedData); // 查看当前数据

    // 清空所有图表
    if (tempChart) {
        tempChart.data.datasets[0].data = [];
        console.log('Cleared temperature chart');
    }
    if (humidChart) {
        humidChart.data.datasets[0].data = [];
        console.log('Cleared humidity chart');
    }
    if (pressureChart) {
        pressureChart.data.datasets[0].data = [];
        console.log('Cleared pressure chart');
    }

    // 绘制温度数据
    if (tempChart && receivedData.temperature.length > 0) {
//        console.log('Drawing temperature data:', receivedData.temperature.length, 'points');
        const sortedData = [...receivedData.temperature].sort((a, b) => a.time - b.time);
        tempChart.data.datasets[0].data = sortedData.map(item => ({
            x: item.time,
            y: item.value
        }));
        tempChart.update();
    }

    // 绘制湿度数据
    if (humidChart && receivedData.humidity.length > 0) {
        const sortedData = [...receivedData.humidity].sort((a, b) => a.time - b.time);
        humidChart.data.datasets[0].data = sortedData.map(item => ({
            x: item.time,
            y: item.value
        }));
        humidChart.update();
    }

    // 绘制压力数据
    if (pressureChart && receivedData.pressure.length > 0) {
        const sortedData = [...receivedData.pressure].sort((a, b) => a.time - b.time);
        pressureChart.data.datasets[0].data = sortedData.map(item => ({
            x: item.time,
            y: item.value
        }));
        pressureChart.update();
    }
}

// 添加保存数据的函数
function saveDataToFile(data, filename) {
    const blob = new Blob([data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// 添加保存数据的事件处理
document.getElementById('saveDataBtn')?.addEventListener('click', function() {
    // 创建确认对话框
    const dialog = document.createElement('div');
    dialog.className = 'modal fade show';
    dialog.style.display = 'block';
    dialog.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">选择要保存的数据</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" value="temperature" id="tempCheck" checked>
                        <label class="form-check-label" for="tempCheck">
                            温度数据 (${receivedData.temperature.length}条)
                        </label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" value="humidity" id="humidCheck" checked>
                        <label class="form-check-label" for="humidCheck">
                            湿度数据 (${receivedData.humidity.length}条)
                        </label>
                    </div>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" value="pressure" id="pressureCheck" checked>
                        <label class="form-check-label" for="pressureCheck">
                            压力数据 (${receivedData.pressure.length}条)
                        </label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                    <button type="button" class="btn btn-primary" id="confirmSave">保存</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    // 处理保存确认
    document.getElementById('confirmSave').onclick = function() {
        const selectedTypes = {
            temperature: document.getElementById('tempCheck').checked,
            humidity: document.getElementById('humidCheck').checked,
            pressure: document.getElementById('pressureCheck').checked
        };

        // 为每个选中的数据类型创建CSV内容
        Object.entries(selectedTypes).forEach(([type, isSelected]) => {
            if (isSelected && receivedData[type].length > 0) {
                // 创建CSV内容
                const csvContent = [
                    'timestamp,value',  // CSV头部
                    ...receivedData[type].map(item => 
                        `${item.time.toISOString()},${item.value}`
                    )
                ].join('\n');

                // 生成文件名（包含时间戳）
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `${type}_data_${timestamp}.csv`;

                // 保存文件
                saveDataToFile(csvContent, filename);
            }
        });

        dialog.remove();
    };

    // 处理取消按钮
    dialog.querySelector('.btn-close').onclick = function() {
        dialog.remove();
    };
    dialog.querySelector('.btn-secondary').onclick = function() {
        dialog.remove();
    };
});

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded'); // 添加调试日志
    
    initCharts();
    
    const drawChartBtn = document.getElementById('drawChartBtn');
    if (drawChartBtn) {
        console.log('Found draw chart button');
        drawChartBtn.addEventListener('click', function() {
            console.log('Draw chart button clicked');
            drawCharts();
        });
    } else {
        console.log('Draw chart button not found');
    }
    
    // 绑定事件处理器
    document.getElementById('connectBtn')?.addEventListener('click', connectBroker);
    document.getElementById('subscribeBtn')?.addEventListener('click', subscribeTopic);
    document.getElementById('unsubscribeBtn')?.addEventListener('click', unsubscribeTopic);
    document.getElementById('startBtn')?.addEventListener('click', startPublishing);
    document.getElementById('stopBtn')?.addEventListener('click', stopPublishing);
    document.getElementById('drawChartBtn')?.addEventListener('click', drawCharts);
}); 