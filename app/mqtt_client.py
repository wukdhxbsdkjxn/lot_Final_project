import paho.mqtt.client as mqtt
import json
from app import socketio

class MQTTClient:
    def __init__(self, client_id):
        self.client = mqtt.Client(client_id=client_id, clean_session=False)
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.connected = False
        self.subscribed_topics = set()
        self.client_id = client_id

    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            print(f"Client {self.client_id} Connected to MQTT Broker!")
            self.connected = True
            # 重新订阅之前的主题
            for topic in self.subscribed_topics:
                self.client.subscribe(topic)
            socketio.emit(f'mqtt_connected_{self.client_id}', {'status': True})
        else:
            print(f"Client {self.client_id} Failed to connect, return code {rc}")
            self.connected = False
            socketio.emit(f'mqtt_connected_{self.client_id}', 
                        {'status': False, 'error': f'连接失败，错误代码：{rc}'})

    def on_message(self, client, userdata, msg):
        try:
            print(f"收到消息: topic={msg.topic}, payload={msg.payload}")
            data = json.loads(msg.payload.decode())
            data['topic'] = msg.topic
            print(f"处理后的数据: {data}")
            socketio.emit('new_data', data)
        except Exception as e:
            print(f"Error processing message: {e}")

    def connect(self, broker="localhost", port=1883):
        try:
            print(f"Attempting to connect to {broker}:{port}")
            self.client.connect(broker, port, keepalive=60)
            self.client.loop_start()
            return True
        except Exception as e:
            print(f"Connection error: {e}")
            return False

    def subscribe(self, topic, qos=1):
        if not self.connected:
            return False
        try:
            result = self.client.subscribe(topic, qos=qos)
            if result[0] == 0:
                self.subscribed_topics.add(topic)
                return True
            return False
        except Exception as e:
            print(f"Subscribe error: {e}")
            return False

    def unsubscribe(self, topic):
        if not self.connected:
            return False
        try:
            result = self.client.unsubscribe(topic)
            if result[0] == 0:
                self.subscribed_topics.discard(topic)
                return True
            return False
        except Exception as e:
            print(f"Unsubscribe error: {e}")
            return False

    def publish(self, topic, message, retain=True, qos=1):
        if not self.connected:
            return False
        try:
            result = self.client.publish(topic, json.dumps(message), qos=qos, retain=retain)
            return result[0] == 0
        except Exception as e:
            print(f"Publish error: {e}")
            return False

# 创建两个独立的客户端实例
publisher_client = MQTTClient('publisher')
subscriber_client = MQTTClient('subscriber') 