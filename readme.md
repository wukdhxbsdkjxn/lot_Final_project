## MQTT物联网数据传输演示系统

### 功能特点
1. 支持从TXT文件读取传感器数据
2. Web界面操作
3. 实时数据可视化
4. 支持局域网内不同主机部署
5. 数据实时展示和历史记录

### 使用步骤
1. 下载并安装 Mosquitto:
   https://mosquitto.org/download/

2. 配置 Mosquitto:
   修改配置文件 *安装路径*\mosquitto\mosquitto.conf
   ```
   listener 1883
   allow_anonymous true
   ```

3. 启动 Mosquitto 服务:
   ```
   net start mosquitto
   ```

4. 安装依赖:
   ```
   pip install -r requirements.txt
   ```

5. 准备数据文件:
   在data文件夹中创建TXT格式的数据文件，每行为一个JSON对象，包含多个时间点的数据：
   示例格式：
   {"2014-02-13T06:20:00": "93", "2014-02-13T13:50:00": "66", ...}
   {"2014-02-14T04:50:00": "87", "2014-02-14T09:50:00": "87", ...}

6. 运行程序:
   ```
   python run.py
   ```

7. 访问Web界面:
   - 打开浏览器访问 http://localhost:5000
   - 发布端：http://localhost:5000/publisher
   - 订阅端：http://localhost:5000/subscriber

### 网络部署说明
1. 确保所有设备在同一局域网内
2. 在Web界面中输入正确的Broker IP地址和端口
3. 确保防火墙允许MQTT通信（端口1883）和Web访问（端口5000）