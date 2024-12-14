from flask import render_template, request, jsonify
from app import app, socketio
from app.mqtt_client import publisher_client, subscriber_client
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
        client_type = data.get('client_type')
        
        print(f"Connecting {client_type} to MQTT broker: {broker}:{port}")
        
        mqtt_client = publisher_client if client_type == 'publisher' else subscriber_client
        
        success = mqtt_client.connect(broker, port)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/subscribe', methods=['POST'])
def subscribe():
    try:
        data = request.json
        topic = data.get('topic')
        if not topic:
            return jsonify({'success': False, 'message': '主题不能为空'})
        
        success = subscriber_client.subscribe(topic)
        return jsonify({
            'success': success,
            'message': '订阅成功' if success else '订阅失败'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'订阅错误: {str(e)}'
        }), 500

@app.route('/api/unsubscribe', methods=['POST'])
def unsubscribe():
    try:
        data = request.json
        topic = data.get('topic')
        if not topic:
            return jsonify({'success': False, 'message': '主题不能为空'})
        
        success = subscriber_client.unsubscribe(topic)
        return jsonify({
            'success': success,
            'message': '取消订阅成功' if success else '取消订阅失败'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'取消订阅错误: {str(e)}'
        }), 500

@app.route('/api/publish', methods=['POST'])
def publish():
    data = request.json
    topic = data.get('topic', 'sensor/data')
    message = {
        'temperature': data.get('temperature'),
        'humidity': data.get('humidity'),
        'time': data.get('time')
    }
    success = publisher_client.publish(topic, message)
    return jsonify({'success': success})

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected') 