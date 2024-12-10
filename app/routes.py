from flask import render_template, request, jsonify
from app import app, socketio
from app.mqtt_client import mqtt_client
import json

@app.route('/')
def index():
    return render_template('base.html')

@app.route('/publisher')
def publisher():
    return render_template('publisher.html')

@app.route('/subscriber')
def subscriber():
    return render_template('subscriber.html')

@app.route('/api/connect', methods=['POST'])
def connect():
    try:
        data = request.json
        broker = data.get('broker', 'localhost')
        port = int(data.get('port', 1883))
        
        print(f"Connecting to MQTT broker: {broker}:{port}")
        success = mqtt_client.connect(broker, port)
        
        return jsonify({
            'success': success,
            'message': '连接请求已发送' if success else '连接请求失败'
        })
    except Exception as e:
        print(f"Connection error in route: {e}")
        return jsonify({
            'success': False,
            'message': f'连接错误: {str(e)}'
        }), 500

@app.route('/api/publish', methods=['POST'])
def publish():
    data = request.json
    success = mqtt_client.publish(data)
    return jsonify({'success': success})

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected') 