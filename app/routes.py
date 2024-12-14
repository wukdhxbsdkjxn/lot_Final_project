from flask import render_template, request, jsonify
from app import app, socketio
from app.mqtt_client import publisher_client, subscriber_client
from app.mqtt_client import mqtt_client
from app.prediction import WeatherPredictor
import json
import pandas as pd
import numpy as np

# 全局变量存储预测结果
prediction_results = None

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

@app.route('/prediction_results')
def prediction_results():
    return render_template('prediction_results.html')

@app.route('/api/predict', methods=['POST'])
def predict():
    global prediction_results
    try:
        # 获取收集的数据
        data = request.json['data']

        # 转换数据格式
        df = pd.DataFrame(data)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df.set_index('timestamp', inplace=True)

        # 初始化预测器
        predictor = WeatherPredictor()

        # 训练模型并获取结果
        results = predictor.train_lstm(df['value'])

        # 存储结果（确保时间戳和数据对应）
        prediction_results = {
            'timestamps': results['test_timestamps'].astype('datetime64[s]').tolist(),
            'actual_values': results['y_test'].flatten().tolist(),
            'predicted_values': results['test_pred'].flatten().tolist()
        }

        # 按时间排序
        sorted_indices = np.argsort(prediction_results['timestamps'])
        prediction_results['timestamps'] = [prediction_results['timestamps'][i] for i in sorted_indices]
        prediction_results['actual_values'] = [prediction_results['actual_values'][i] for i in sorted_indices]
        prediction_results['predicted_values'] = [prediction_results['predicted_values'][i] for i in sorted_indices]

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/prediction_results')
def get_prediction_results():
    if prediction_results is None:
        return jsonify({'error': '没有可用的预测结果'}), 404
    return jsonify(prediction_results)