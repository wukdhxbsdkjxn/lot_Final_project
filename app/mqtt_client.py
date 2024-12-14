import paho.mqtt.client as mqtt
import json
from app import socketio
import time

class MQTTClient:
    def __init__(self):
        self.client = mqtt.Client()
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.client.on_publish = self.on_publish
        self.connected = False
        self.publish_queue = []
        self.batch_size = 50

    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            print("Connected to MQTT Broker!")
            self.connected = True
            # 订阅主题
            self.client.subscribe("sensor/data")
            socketio.emit('mqtt_connected', {'status': True})
        else:
            print(f"Failed to connect, return code {rc}")
            self.connected = False
            socketio.emit('mqtt_connected', {'status': False, 'error': f'连接失败，错误代码：{rc}'})

    def on_message(self, client, userdata, msg):
        try:
            data = json.loads(msg.payload.decode())
            socketio.emit('new_data', data)
        except Exception as e:
            print(f"Error processing message: {e}")

    def on_publish(self, client, userdata, mid):
        print(f"Message Published. Message ID: {mid}")

    def connect(self, broker="localhost", port=1883):
        try:
            print(f"Attempting to connect to {broker}:{port}")
            self.client.connect(broker, port, keepalive=60)
            self.client.loop_start()
            # 等待一小段时间确保连接完成
            time.sleep(0.5)
            return self.connected
        except Exception as e:
            print(f"Connection error: {e}")
            return False

    def disconnect(self):
        if self.connected:
            self.client.disconnect()
            self.client.loop_stop()
            self.connected = False

    def publish(self, message):
        try:
            if not self.connected:
                return False
                
            result = self.client.publish("sensor/data", json.dumps(message))
            return result[0] == 0
        except Exception as e:
            print(f"Publish error: {e}")
            return False
    
    def publish_batch(self, messages):
        # 删除这个方法
        pass

mqtt_client = MQTTClient() 